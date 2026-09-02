import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RedlineError } from '../../core/errors.ts';
import type { Git } from '../../core/git.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  PlatformInstall,
  PolicyResult,
  PullRequestRef,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { AzureClient } from './client.ts';
import {
  AZURE_STATUS_GENRE,
  AZURE_STATUS_NAME,
  POLICY_TYPE_NAMES,
  resolvePolicyTypeIds,
} from './policy-types.ts';
import { isNonNullObject, isSuccess } from '../shape.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Advanced Security is a separately licensed feature: a tenant without it
// returns 404 on the enablement endpoint. That is `unsupported`, never
// `denied` — the repository is not half-onboarded, the feature was never
// purchased. See enableSecurityFloor.
const ADVSEC = { host: 'advsec', apiVersion: '7.2-preview.1' } as const;

// Azure response bodies are untrusted external input, same house style as
// cli/platforms/github/install.ts: typed `unknown`, narrowed by an explicit
// parse function, and never read before `isSuccess(status)` is checked. An
// Azure error body is a truthy object (e.g. `{ message: "Forbidden" }`), not
// an array — `?? []` never fires on it, so shape is verified with
// `Array.isArray`/`isNonNullObject`, not coercion.

interface PolicyConfiguration {
  id: number;
  type: { id: string };
  settings: Record<string, unknown>;
}

function parsePolicyConfigurations(body: unknown): PolicyConfiguration[] | null {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) return null;
  const configs: PolicyConfiguration[] = [];
  for (const item of body['value']) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number') return null;
    const type = item['type'];
    if (!isNonNullObject(type) || typeof type['id'] !== 'string') return null;
    const settings = item['settings'];
    if (!isNonNullObject(settings)) return null;
    configs.push({ id: item['id'], type: { id: type['id'] }, settings });
  }
  return configs;
}

function parseCreatedPullRequestId(body: unknown): number | null {
  if (!isNonNullObject(body) || typeof body['pullRequestId'] !== 'number') return null;
  return body['pullRequestId'];
}

// resolvePolicyTypeIds always seeds its result from POLICY_TYPE_FALLBACK, so
// every POLICY_TYPE_NAMES value is guaranteed present — but its return type
// is the plain `Record<string, string>` (cli/platforms/azure/verify.ts also
// consumes it and indexes it with a plain string, so narrowing the exported
// type here would break that file), and noUncheckedIndexedAccess therefore
// still sees `string | undefined` at this call site. This proves the
// invariant with a real check instead of a `!` assertion.
function requiredTypeId(types: Record<string, string>, name: string): string {
  const id = types[name];
  if (id === undefined) {
    throw new RedlineError('host', `Azure policy type "${name}" could not be resolved`);
  }
  return id;
}

function outcome(capability: AdminCapability, status: number, detail: string): CapabilityOutcome {
  if (isSuccess(status)) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs project administrator)` };
  }
  if (status === 404) {
    return { capability, status: 'unsupported', detail: `${detail} (not available on this project)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

// Combines several outcomes for one logical capability (three policy
// configuration writes fold into one "merge-policy" result) into a single
// outcome, ranked by how actionable the status is rather than by comparing
// raw HTTP status numbers — a 404 "unsupported" on one call must never mask
// a 403 "denied" on another just because 404 > 403.
const OUTCOME_RANK: Record<CapabilityOutcome['status'], number> = {
  denied: 3,
  unsupported: 2,
  already: 1,
  applied: 0,
};

function worstOutcome(outcomes: CapabilityOutcome[]): CapabilityOutcome {
  const [first, ...rest] = outcomes;
  if (!first) throw new Error('worstOutcome requires at least one outcome');
  return rest.reduce(
    (worst, next) => (OUTCOME_RANK[next.status] > OUTCOME_RANK[worst.status] ? next : worst),
    first
  );
}

function writeFile(cwd: string, relPath: string, contents: string): void {
  const target = join(cwd, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function createAzureInstall(
  client: AzureClient,
  gitFor: (cwd: string) => Git
): PlatformInstall {
  const project = (ref: RepoRef): string => {
    if (!ref.project) throw new RedlineError('usage', 'an Azure DevOps repository needs a project');
    return ref.project;
  };
  const repoId = (ref: RepoRef): string => {
    if (!ref.repoId) throw new RedlineError('usage', 'an Azure DevOps repository needs its id');
    return ref.repoId;
  };

  return {
    async enableSecurityFloor(ref: RepoRef): Promise<SecurityResult> {
      const res = await client.request(
        'PATCH',
        `/${project(ref)}/_apis/management/repositories/${repoId(ref)}/enablement`,
        { advSecEnabled: true, blockPushes: true },
        ADVSEC
      );
      return {
        outcomes: [
          outcome('secret-scanning', res.status, 'advanced security secret scanning'),
          outcome('push-protection', res.status, 'advanced security push protection'),
          outcome('dependency-alerts', res.status, 'advanced security dependency scanning'),
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const proj = project(ref);
      const repo = repoId(ref);
      const types = await resolvePolicyTypeIds(client, proj);
      const scope = [
        { repositoryId: repo, refName: `refs/heads/${ref.defaultBranch}`, matchKind: 'exact' },
      ];

      // types is guaranteed to carry every POLICY_TYPE_NAMES entry:
      // resolvePolicyTypeIds always seeds it from POLICY_TYPE_FALLBACK first.
      const wanted = [
        {
          type: { id: requiredTypeId(types, POLICY_TYPE_NAMES.minimumReviewers) },
          isEnabled: true,
          isBlocking: true,
          settings: {
            minimumApproverCount: policy.requiredApprovals,
            creatorVoteCounts: false,
            resetOnSourcePush: policy.dismissStaleReviews,
            blockLastPusherVote: true,
            scope,
          },
        },
        {
          type: { id: requiredTypeId(types, POLICY_TYPE_NAMES.comments) },
          isEnabled: policy.requireThreadResolution,
          isBlocking: policy.requireThreadResolution,
          settings: { scope },
        },
        {
          type: { id: requiredTypeId(types, POLICY_TYPE_NAMES.status) },
          isEnabled: true,
          // Advisory is native on Azure: isBlocking mirrors policy.blocking
          // directly, no rule needs omitting the way GitHub's does.
          isBlocking: policy.blocking,
          settings: {
            statusName: AZURE_STATUS_NAME,
            statusGenre: AZURE_STATUS_GENRE,
            authorId: null,
            invalidateOnSourceUpdate: true,
            scope,
          },
        },
      ];

      const existing = await client.request<unknown>('GET', `/${proj}/_apis/policy/configurations`);

      let mergePolicy: CapabilityOutcome;
      let policyApplied = false;

      if (!isSuccess(existing.status)) {
        // Denied or unsupported — never guess whether a Redline policy
        // already exists, and never crash on it. Skip the write entirely;
        // onboarding still continues below.
        mergePolicy = outcome('merge-policy', existing.status, 'branch policies');
      } else {
        const configs = parsePolicyConfigurations(existing.body);
        if (configs === null) {
          throw new RedlineError('host', 'Azure DevOps returned an unexpected shape for policy configurations');
        }
        const mine = configs.filter((c) => {
          const configScope = c.settings['scope'];
          return (
            Array.isArray(configScope) &&
            configScope.some((s) => isNonNullObject(s) && s['repositoryId'] === repo)
          );
        });

        const results: CapabilityOutcome[] = [];
        for (const config of wanted) {
          const match = mine.find((c) => c.type.id === config.type.id);
          const res = match
            ? await client.request('PUT', `/${proj}/_apis/policy/configurations/${match.id}`, config)
            : await client.request('POST', `/${proj}/_apis/policy/configurations`, config);
          results.push(outcome('merge-policy', res.status, 'branch policies'));
        }
        mergePolicy = worstOutcome(results);
        policyApplied = mergePolicy.status === 'applied';
      }

      return {
        outcomes: [
          mergePolicy,
          {
            capability: 'repo-property',
            status: 'unsupported',
            detail: 'Azure DevOps has no repository properties — the central registry tracks this repo instead',
          },
        ],
        policy: policyApplied ? policy : null,
      };
    },

    async installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult> {
      const pipeline = readFileSync(join(PACKAGE_ROOT, 'platforms/azure/gate-template.yml'), 'utf8')
        .replace(/ADR_DIFF_THRESHOLD: \d+/, `ADR_DIFF_THRESHOLD: ${opts.adrDiffThreshold}`)
        .replace(
          /FAIL_ON_DEPENDENCY_SEVERITY: \w+/,
          `FAIL_ON_DEPENDENCY_SEVERITY: ${opts.failOnDependencySeverity}`
        )
        .replace(/SOFT_FAIL_LABELS: .*/, `SOFT_FAIL_LABELS: ${opts.softFailLabels.join(',')}`);
      writeFile(cwd, '.azuredevops/redline-gate.yml', pipeline);

      const template = readFileSync(
        join(PACKAGE_ROOT, 'templates/azure/pull_request_template.md'),
        'utf8'
      );
      writeFile(cwd, '.azuredevops/pull_request_template.md', template);

      return {
        files: ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md'],
        outcomes: [
          {
            capability: 'labels',
            status: 'unsupported',
            detail: 'Azure DevOps pull request labels are created on use, not pre-declared',
          },
        ],
      };
    },

    // Phase 1 boundary: GitHub takes team *slugs* in a CODEOWNERS file; Azure
    // takes reviewer *identity GUIDs* in a policy. Resolving a team name to
    // an Azure identity GUID is out of scope here (Task 17) — rule.owners is
    // trusted to already carry whatever identity ids the operator supplied.
    async ensureReviewOwnership(
      ref: RepoRef,
      _cwd: string,
      rules: OwnershipRule[]
    ): Promise<InstallResult> {
      if (rules.length === 0) return { files: [], outcomes: [] };

      const proj = project(ref);
      const repo = repoId(ref);
      const types = await resolvePolicyTypeIds(client, proj);
      const results: CapabilityOutcome[] = [];
      for (const rule of rules) {
        const res = await client.request('POST', `/${proj}/_apis/policy/configurations`, {
          type: { id: requiredTypeId(types, POLICY_TYPE_NAMES.requiredReviewers) },
          isEnabled: true,
          isBlocking: true,
          settings: {
            requiredReviewerIds: rule.owners,
            filenamePatterns: [rule.pattern],
            scope: [
              { repositoryId: repo, refName: `refs/heads/${ref.defaultBranch}`, matchKind: 'exact' },
            ],
          },
        });
        results.push(outcome('review-ownership', res.status, `required reviewer policy for "${rule.pattern}"`));
      }
      return { files: [], outcomes: [worstOutcome(results)] };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef> {
      const git = gitFor(cwd);
      git.checkoutNewBranch(change.branch);
      // Stage only what Redline itself wrote — never sweep in pre-existing
      // dirty or untracked state from the working tree.
      git.stagePaths(change.files);
      if (!git.hasStagedChanges()) {
        throw new RedlineError('failed', 'nothing to commit — this repository is already onboarded');
      }
      git.commit(change.title);
      git.push(change.branch);

      const created = await client.request<unknown>(
        'POST',
        `/${project(ref)}/_apis/git/repositories/${repoId(ref)}/pullrequests`,
        {
          sourceRefName: `refs/heads/${change.branch}`,
          targetRefName: `refs/heads/${ref.defaultBranch}`,
          title: change.title,
          description: change.body,
        }
      );
      const id = isSuccess(created.status) ? parseCreatedPullRequestId(created.body) : null;
      if (id === null) {
        throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      }
      return {
        number: id,
        url: `https://dev.azure.com/${ref.org}/${project(ref)}/_git/${ref.repo}/pullrequest/${id}`,
      };
    },
  };
}
