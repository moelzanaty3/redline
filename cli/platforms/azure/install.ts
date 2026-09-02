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
  AZURE_BUILD_POLICY_DISPLAY_NAME,
  AZURE_STATUS_GENRE,
  AZURE_STATUS_NAME,
  POLICY_TYPE_NAMES,
  REDLINE_POLICY_MARKER,
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

// CONTRACT with platforms/azure/gate-template.yml: Azure Repos ignores YAML
// `pr:` triggers (a GitHub-only feature), so the gate pipeline only ever runs
// through a Build Validation branch policy pointing at a registered build
// definition. This name and yaml path are what installGate registers and what
// the Build Validation policy in applyPolicy queues.
const GATE_DEFINITION_NAME = 'redline-gate';
const GATE_YAML_FILENAME = '.azuredevops/redline-gate.yml';
// Definition names are unique per folder, and the `name=` list filter is
// project-wide. Registering Redline's definitions in their own folder is what
// keeps two repositories in the same project from colliding on the name
// `redline-gate` — and adopting each other's definitions, which would point a
// repository's Build Validation policy at a pipeline that checks out a
// sibling repository and publishes redline/gate against the sibling's id.
const GATE_DEFINITION_FOLDER = '\\Redline';

interface BuildDefinition {
  id: number;
  name: string;
  path: string | null;
  repositoryId: string | null;
  yamlFilename: string | null;
}

function parseBuildDefinitions(body: unknown): BuildDefinition[] | null {
  if (!isNonNullObject(body) || !Array.isArray(body['value'])) return null;
  const defs: BuildDefinition[] = [];
  for (const item of body['value']) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number' || typeof item['name'] !== 'string') {
      return null;
    }
    const process = item['process'];
    const yamlFilename =
      isNonNullObject(process) && typeof process['yamlFilename'] === 'string'
        ? process['yamlFilename']
        : null;
    const repository = item['repository'];
    const repositoryId =
      isNonNullObject(repository) && typeof repository['id'] === 'string' ? repository['id'] : null;
    defs.push({
      id: item['id'],
      name: item['name'],
      path: typeof item['path'] === 'string' ? item['path'] : null,
      repositoryId,
      yamlFilename,
    });
  }
  return defs;
}

function parseCreatedBuildDefinitionId(body: unknown): number | null {
  if (!isNonNullObject(body) || typeof body['id'] !== 'number') return null;
  return body['id'];
}

// Same degradation contract as outcome(), but registering a build definition
// needs Build Administrator, not project administrator, and a 404 here means
// Azure Pipelines is not available on the project.
function gateOutcome(status: number, detail: string): CapabilityOutcome {
  if (isSuccess(status)) return { capability: 'gate', status: 'applied', detail };
  if (status === 401 || status === 403) {
    return {
      capability: 'gate',
      status: 'denied',
      detail: `${detail} (needs build administrator) — the merge gate stays advisory until it is registered`,
    };
  }
  if (status === 404) {
    return {
      capability: 'gate',
      status: 'unsupported',
      detail: `${detail} (Azure Pipelines is not available on this project)`,
    };
  }
  return { capability: 'gate', status: 'denied', detail: `${detail} (HTTP ${status})` };
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

  // What installGate learned about the gate build definition, read later by
  // applyPolicy in the same run: init.ts calls installGate first. null means
  // installGate has not run in this process (applyPolicy called standalone),
  // in which case applyPolicy neither writes a Build Validation policy nor
  // second-guesses the caller's blocking choice.
  type GateBuildState = { registered: true; definitionId: number } | { registered: false };
  let gateBuild: GateBuildState | null = null;

  async function ensureGateBuildDefinition(ref: RepoRef): Promise<CapabilityOutcome> {
    const proj = project(ref);
    const repo = repoId(ref);
    const listed = await client.request<unknown>(
      'GET',
      `/${proj}/_apis/build/definitions?name=${GATE_DEFINITION_NAME}` +
        `&path=${encodeURIComponent(GATE_DEFINITION_FOLDER)}&includeAllProperties=true`
    );
    if (!isSuccess(listed.status)) {
      gateBuild = { registered: false };
      return gateOutcome(listed.status, 'gate pipeline definition');
    }
    const defs = parseBuildDefinitions(listed.body);
    if (defs === null) {
      throw new RedlineError('host', 'Azure DevOps returned an unexpected shape for build definitions');
    }

    // The `path` filter is re-applied locally: the list endpoint's own
    // filtering is not something to trust a repository's merge gate to.
    const named = defs.filter(
      (d) => d.name === GATE_DEFINITION_NAME && d.path === GATE_DEFINITION_FOLDER
    );
    const forThisRepo = named.filter((d) => d.repositoryId === repo);
    const mine = forThisRepo.find((d) => d.yamlFilename === GATE_YAML_FILENAME);
    if (mine) {
      gateBuild = { registered: true, definitionId: mine.id };
      return {
        capability: 'gate',
        status: 'already',
        detail: `gate pipeline definition "${GATE_DEFINITION_NAME}" (id ${mine.id}) already registered`,
      };
    }
    const foreign = forThisRepo[0];
    if (foreign) {
      // Brownfield: a definition Redline did not create is human-owned and is
      // never updated — and a second definition with the same name cannot be
      // created. Pending admin work, not an error: an administrator must
      // rename it or point it at the gate yaml before the gate can block.
      gateBuild = { registered: false };
      return {
        capability: 'gate',
        status: 'denied',
        detail:
          `a build definition named "${GATE_DEFINITION_NAME}" (id ${foreign.id}) already exists but runs ` +
          `${foreign.yamlFilename === null ? 'a designer pipeline' : `"${foreign.yamlFilename}"`}, not ` +
          `${GATE_YAML_FILENAME} — it is human-owned and was left untouched; the merge gate stays advisory ` +
          `until an administrator points it at ${GATE_YAML_FILENAME} or renames it`,
      };
    }
    const otherRepo = named[0];
    if (otherRepo) {
      // Same name, same folder, a different repository — reusing it would
      // point this repository's Build Validation policy at a pipeline that
      // builds the other repository and publishes redline/gate against the
      // other repository's id, blocking every pull request here. The name is
      // also taken, so a POST cannot succeed either.
      gateBuild = { registered: false };
      return {
        capability: 'gate',
        status: 'denied',
        detail:
          `build definition "${GATE_DEFINITION_FOLDER}\\${GATE_DEFINITION_NAME}" (id ${otherRepo.id}) is ` +
          `bound to repository ${otherRepo.repositoryId ?? 'unknown'}, not ${repo} — it was left untouched ` +
          `and the name is unavailable, so the merge gate stays advisory until an administrator renames it`,
      };
    }

    const created = await client.request<unknown>('POST', `/${proj}/_apis/build/definitions`, {
      name: GATE_DEFINITION_NAME,
      path: GATE_DEFINITION_FOLDER,
      process: { type: 2, yamlFilename: GATE_YAML_FILENAME },
      repository: { id: repo, type: 'TfsGit' },
    });
    if (!isSuccess(created.status)) {
      gateBuild = { registered: false };
      return gateOutcome(created.status, 'gate pipeline definition');
    }
    const id = parseCreatedBuildDefinitionId(created.body);
    if (id === null) {
      throw new RedlineError(
        'host',
        'Azure DevOps returned an unexpected shape for a created build definition'
      );
    }
    gateBuild = { registered: true, definitionId: id };
    return {
      capability: 'gate',
      status: 'applied',
      detail: `gate pipeline definition "${GATE_DEFINITION_NAME}" registered`,
    };
  }

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

      const buildTypeId = requiredTypeId(types, POLICY_TYPE_NAMES.build);
      // Build policies are matched by the Redline: displayName marker, not by
      // type alone: a repository routinely carries human-owned build policies
      // of the same type, and those are never written to.
      const isRedlineBuildPolicy = (config: PolicyConfiguration): boolean => {
        const displayName = config.settings['displayName'];
        return (
          config.type.id === buildTypeId &&
          typeof displayName === 'string' &&
          displayName.startsWith(REDLINE_POLICY_MARKER)
        );
      };

      const repoPropertyOutcome: CapabilityOutcome = {
        capability: 'repo-property',
        status: 'unsupported',
        detail: 'Azure DevOps has no repository properties — the central registry tracks this repo instead',
      };

      const existing = await client.request<unknown>('GET', `/${proj}/_apis/policy/configurations`);
      if (!isSuccess(existing.status)) {
        // Denied or unsupported — never guess whether a Redline policy
        // already exists, and never crash on it. Skip the write entirely;
        // onboarding still continues below.
        return {
          outcomes: [outcome('merge-policy', existing.status, 'branch policies'), repoPropertyOutcome],
          policy: null,
        };
      }
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

      const gate = gateBuild;
      const registeredGate = gate !== null && gate.registered ? gate : null;
      // Security property: a blocking redline/gate Status policy with no
      // pipeline able to publish that status blocks every pull request
      // forever, so blocking survives only when something can actually queue
      // the gate. Three ways it can: installGate has not run in this process
      // (applyPolicy called standalone — the caller's choice stands), this
      // run registered or confirmed the definition, or the repository already
      // carries a Redline Build Validation policy from an earlier run. That
      // last case is what keeps a token which cannot read build definitions
      // from silently downgrading a working, enforcing gate to advisory.
      const gateAlreadyEnforcing = mine.some(isRedlineBuildPolicy);
      const blocking =
        policy.blocking && (gate === null || registeredGate !== null || gateAlreadyEnforcing);

      interface PolicyBody {
        type: { id: string };
        isEnabled: boolean;
        isBlocking: boolean;
        settings: Record<string, unknown>;
      }
      interface WantedPolicy {
        matches: (config: PolicyConfiguration) => boolean;
        // Read at write time, not up front: a rejected Build Validation write
        // has to reach the Status policy that is written after it.
        config: (blocking: boolean) => PolicyBody;
        // True for the write the blocking gate depends on: if it fails,
        // everything written after it drops to advisory.
        runsTheGate?: boolean;
      }
      const ofType =
        (id: string) =>
        (config: PolicyConfiguration): boolean =>
          config.type.id === id;

      // types is guaranteed to carry every POLICY_TYPE_NAMES entry:
      // resolvePolicyTypeIds always seeds it from POLICY_TYPE_FALLBACK first.
      const wanted: WantedPolicy[] = [
        {
          matches: ofType(requiredTypeId(types, POLICY_TYPE_NAMES.minimumReviewers)),
          config: () => ({
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
          }),
        },
        {
          matches: ofType(requiredTypeId(types, POLICY_TYPE_NAMES.comments)),
          config: () => ({
            type: { id: requiredTypeId(types, POLICY_TYPE_NAMES.comments) },
            isEnabled: policy.requireThreadResolution,
            isBlocking: policy.requireThreadResolution,
            settings: { scope },
          }),
        },
        // The Build Validation policy is what actually queues the gate
        // pipeline on a pull request (Azure Repos ignores YAML `pr:`
        // triggers) — written only against a definition installGate confirmed
        // or registered, never against a guess, and written BEFORE the Status
        // policy so that a rejected write can still hold the gate advisory.
        ...(registeredGate === null
          ? []
          : [
              {
                matches: isRedlineBuildPolicy,
                runsTheGate: true,
                config: (blocking: boolean): PolicyBody => ({
                  type: { id: buildTypeId },
                  isEnabled: true,
                  isBlocking: blocking,
                  settings: {
                    buildDefinitionId: registeredGate.definitionId,
                    displayName: AZURE_BUILD_POLICY_DISPLAY_NAME,
                    validDuration: 0,
                    queueOnSourceUpdateOnly: true,
                    scope,
                  },
                }),
              },
            ]),
        {
          matches: ofType(requiredTypeId(types, POLICY_TYPE_NAMES.status)),
          config: (blocking: boolean) => ({
            type: { id: requiredTypeId(types, POLICY_TYPE_NAMES.status) },
            isEnabled: true,
            // Advisory is native on Azure: isBlocking mirrors the (possibly
            // degraded) blocking choice directly, no rule needs omitting the
            // way GitHub's does.
            isBlocking: blocking,
            settings: {
              statusName: AZURE_STATUS_NAME,
              statusGenre: AZURE_STATUS_GENRE,
              authorId: null,
              invalidateOnSourceUpdate: true,
              scope,
            },
          }),
        },
      ];

      let effectiveBlocking = blocking;
      const results: CapabilityOutcome[] = [];
      for (const wantedPolicy of wanted) {
        const match = mine.find(wantedPolicy.matches);
        const config = wantedPolicy.config(effectiveBlocking);
        const res = match
          ? await client.request('PUT', `/${proj}/_apis/policy/configurations/${match.id}`, config)
          : await client.request('POST', `/${proj}/_apis/policy/configurations`, config);
        results.push(outcome('merge-policy', res.status, 'branch policies'));
        if (wantedPolicy.runsTheGate === true && !isSuccess(res.status)) effectiveBlocking = false;
      }
      const mergePolicy = worstOutcome(results);

      return {
        outcomes: [mergePolicy, repoPropertyOutcome],
        // The applied policy reports what was actually written: when nothing
        // could queue the gate, blocking was degraded to advisory.
        policy:
          mergePolicy.status === 'applied' ? { ...policy, blocking: effectiveBlocking } : null,
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

      // Azure Repos ignores the YAML `pr:` trigger, so writing the pipeline
      // file alone runs nothing: the definition must be registered so the
      // Build Validation policy (applyPolicy) can queue it on pull requests.
      const gate = await ensureGateBuildDefinition(ref);

      return {
        files: ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md'],
        outcomes: [
          gate,
          {
            capability: 'labels',
            status: 'unsupported',
            detail: 'Azure DevOps pull request labels are created on use, not pre-declared',
          },
        ],
      };
    },

    // Phase 1 boundary, reported honestly instead of half-done. GitHub takes
    // team *slugs* in a CODEOWNERS file; Azure takes reviewer *identity
    // GUIDs* in a policy. cli/commands/init.ts has only slugs, so every
    // policy this used to POST named a reviewer id that does not exist on
    // Azure — and it POSTed unconditionally, with no filter on the existing
    // configurations, so each re-run of `redline init` added another blocking
    // required-reviewer policy per rule. Until an identity lookup exists
    // (Task 17) this reports `unsupported`: the capability does not exist on
    // this host yet, which is not pending administrator work.
    async ensureReviewOwnership(
      _ref: RepoRef,
      _cwd: string,
      rules: OwnershipRule[]
    ): Promise<InstallResult> {
      if (rules.length === 0) return { files: [], outcomes: [] };
      return {
        files: [],
        outcomes: [
          {
            capability: 'review-ownership',
            status: 'unsupported',
            detail:
              'Azure DevOps required-reviewer policies take identity GUIDs, not team slugs — ' +
              'set them by hand under Project settings > Repositories > Policies',
          },
        ],
      };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef | null> {
      const git = gitFor(cwd);
      // `git commit -m` commits the WHOLE index, so anything the user staged
      // before running redline would be swept into the onboarding PR.
      // Refusing beats `commit -- <paths>`: a partial-index commit surprises
      // in the opposite direction.
      if (git.hasStagedChanges()) {
        throw new RedlineError(
          'usage',
          'this repository already has staged changes',
          'commit or unstage them first, then re-run — redline will not sweep them into its onboarding pull request'
        );
      }
      const originalBranch = git.currentBranch();
      git.checkoutNewBranch(change.branch);
      let gitFailed = false;
      try {
        // Stage only what Redline itself wrote — never sweep in pre-existing
        // dirty or untracked state from the working tree.
        git.stagePaths(change.files);
        if (!git.hasStagedChanges()) {
          // Already onboarded and nothing changed: a legitimate no-op, not
          // an error — the caller reports it instead of a pull request.
          return null;
        }
        git.commit(change.title);
        git.push(change.branch);
      } catch (error) {
        gitFailed = true;
        throw error;
      } finally {
        // Leave the operator on their own branch, never on redline/onboard.
        // When a git step failed its error already says where the work sits,
        // and a failed restore must not mask it.
        try {
          git.checkoutBranch(originalBranch);
        } catch (restoreError) {
          if (!gitFailed) throw restoreError;
        }
      }

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
