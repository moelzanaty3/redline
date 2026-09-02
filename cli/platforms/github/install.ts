import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import type { GitHubClient } from './client.ts';
import { isNonNullObject, isSuccess } from '../shape.ts';

export const RULESET_NAME = 'Redline';
export const REQUIRED_CHECK = 'redline-gate / gate';

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const GATE_LABELS = [
  { name: 'no-adr', color: 'ededed', description: 'PR intentionally ships without an ADR' },
  {
    name: 'redline-exempt',
    color: 'fbca04',
    description: 'Gate process checks soft-failed with reviewer sign-off',
  },
  {
    name: 'redline-sync',
    color: '0e8a16',
    description: 'Automated standards sync from the Redline source repo',
  },
];

// GitHub response bodies are untrusted external input: the transport (http.ts)
// only guarantees valid JSON, never a particular shape. Bodies read here are
// typed `unknown` and narrowed by an explicit parse function, in the house
// style of cli/render/manifest.ts and cli/platforms/github/verify.ts.

interface RulesetSummary {
  id: number;
  name: string;
}

function parseRulesetSummaries(body: unknown): RulesetSummary[] | null {
  if (!Array.isArray(body)) return null;
  const summaries: RulesetSummary[] = [];
  for (const item of body) {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number' || typeof item['name'] !== 'string') {
      return null;
    }
    summaries.push({ id: item['id'], name: item['name'] });
  }
  return summaries;
}

function parseCreatedPullRequest(body: unknown): PullRequestRef | null {
  if (!isNonNullObject(body) || typeof body['number'] !== 'number' || typeof body['html_url'] !== 'string') {
    return null;
  }
  return { number: body['number'], url: body['html_url'] };
}

function outcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (isSuccess(status)) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  if (status === 404 || status === 422) {
    return { capability, status: 'unsupported', detail: `${detail} (not available on this repository)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

// GitHub answers 404, not 403, on these admin write endpoints when a
// fine-grained token lacks the administration scope on a repository it can
// otherwise read — so on a write, 404 is a permission denial that must reach
// pendingAdmin, not a missing feature. Read endpoints keep 404 = unsupported.
function writeOutcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (status === 404) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  return outcome(capability, status, detail);
}

// Combines several outcomes for one logical capability (e.g. GitHub reports
// dependency-alerts as two separate calls, and labels are created one at a
// time) into a single outcome. Ranked by how actionable/notable the status is
// so a real permission denial on one sub-call is never masked by a merely
// larger HTTP status number on another (a 404 "unsupported" must not hide a
// 403 "denied", and an "already exists" 422 must not hide a 403 "denied").
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

function buildRules(policy: MergePolicy): unknown[] {
  const rules: unknown[] = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: policy.requiredApprovals,
        dismiss_stale_reviews_on_push: policy.dismissStaleReviews,
        require_code_owner_review: policy.requireCodeOwnerReview,
        require_last_push_approval: true,
        required_review_thread_resolution: policy.requireThreadResolution,
        automatic_copilot_code_review_enabled: true,
        allowed_merge_methods: ['squash', 'merge'],
      },
    },
  ];
  if (policy.blocking) {
    // The check name is this adapter's own, exactly as Azure's status policy
    // uses AZURE_STATUS_NAME/GENRE. It previously came from
    // policy.requiredChecks, which cli/commands/init.ts passes empty — so
    // `redline init --blocking` published a blocking ruleset that required
    // nothing at all.
    rules.push({
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        do_not_enforce_on_create: false,
        required_status_checks: [{ context: REQUIRED_CHECK }],
      },
    });
  }
  return rules;
}

export function createGitHubInstall(
  client: GitHubClient,
  gitFor: (cwd: string) => Git
): PlatformInstall {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  return {
    async enableSecurityFloor(ref: RepoRef): Promise<SecurityResult> {
      const scanning = await client.rest('PATCH', repoPath(ref), {
        security_and_analysis: {
          secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'enabled' },
        },
      });
      const alerts = await client.rest('PUT', `${repoPath(ref)}/vulnerability-alerts`);
      const fixes = await client.rest('PUT', `${repoPath(ref)}/automated-security-fixes`);

      // Two independent host calls fold into one "dependency-alerts" capability.
      // Combine by outcome severity, not by comparing raw status numbers — see
      // worstOutcome.
      const dependencyAlerts = worstOutcome([
        writeOutcome('dependency-alerts', alerts.status, 'dependabot alerts (vulnerability alerts)'),
        writeOutcome('dependency-alerts', fixes.status, 'dependabot alerts (automated security fixes)'),
      ]);

      return {
        outcomes: [
          writeOutcome('secret-scanning', scanning.status, 'secret scanning'),
          writeOutcome('push-protection', scanning.status, 'secret scanning push protection'),
          dependencyAlerts,
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const existing = await client.rest<unknown>('GET', `${repoPath(ref)}/rulesets`);

      const payload = {
        name: RULESET_NAME,
        target: 'branch',
        enforcement: 'active',
        bypass_actors: [],
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: buildRules(policy),
      };

      let mergePolicy: CapabilityOutcome;
      let policyApplied = false;

      if (!isSuccess(existing.status)) {
        // Denied (401/403) or unsupported (404/422) — never guess whether a
        // Redline ruleset already exists, and never crash on it. Skip the
        // write entirely; onboarding still continues below.
        mergePolicy = outcome('merge-policy', existing.status, 'branch ruleset');
      } else {
        const summaries = parseRulesetSummaries(existing.body);
        if (summaries === null) {
          throw new RedlineError('host', 'GitHub returned an unexpected shape for the rulesets list');
        }
        const mine = summaries.find((r) => r.name === RULESET_NAME);
        const method = mine ? 'PUT' : 'POST';
        const path = mine
          ? `${repoPath(ref)}/rulesets/${mine.id}`
          : `${repoPath(ref)}/rulesets`;
        const applied = await client.rest(method, path, payload);
        if (applied.status === 422) {
          // A rejected ruleset payload is a Redline bug or a repo-settings
          // conflict — surfacing it as "unsupported" would leave the repo
          // silently policy-less with exit 0.
          throw new RedlineError(
            'host',
            `GitHub rejected the Redline ruleset payload (HTTP 422 on ${method} ${path})`
          );
        }
        mergePolicy = writeOutcome('merge-policy', applied.status, 'branch ruleset');
        policyApplied = isSuccess(applied.status);
      }

      const property = await client.rest('PATCH', `${repoPath(ref)}/properties/values`, {
        properties: [{ property_name: 'redline', value: 'onboarded' }],
      });

      return {
        outcomes: [
          mergePolicy,
          outcome('repo-property', property.status, 'repository property "redline=onboarded"'),
        ],
        policy: policyApplied ? policy : null,
      };
    },

    async installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult> {
      const caller = readFileSync(join(PACKAGE_ROOT, 'templates/redline.yml'), 'utf8')
        .replaceAll('<org>', ref.org)
        .replace(/adr-diff-threshold: \d+/, `adr-diff-threshold: ${opts.adrDiffThreshold}`)
        .replace(
          /fail-on-dependency-severity: \w+/,
          `fail-on-dependency-severity: ${opts.failOnDependencySeverity}`
        )
        .replace(/soft-fail-labels: .+/, `soft-fail-labels: ${opts.softFailLabels.join(',')}`);
      writeFile(cwd, '.github/workflows/redline.yml', caller);

      // Read from templates/, never from this repository's own .github/:
      // .github/ is deliberately outside package.json "files" (shipping it
      // would push Redline's own CI workflows into every consumer), so a
      // template read from there is absent in the published tarball and the
      // throw lands after the workflow above has already been written.
      const template = readFileSync(
        join(PACKAGE_ROOT, 'templates/github/pull_request_template.md'),
        'utf8'
      );
      writeFile(cwd, '.github/pull_request_template.md', template);

      const labelOutcomes: CapabilityOutcome[] = [];
      for (const label of GATE_LABELS) {
        const res = await client.rest('POST', `${repoPath(ref)}/labels`, label);
        labelOutcomes.push(
          res.status === 422
            ? { capability: 'labels', status: 'already', detail: `label "${label.name}" already exists` }
            : outcome('labels', res.status, `label "${label.name}"`)
        );
      }

      return {
        files: ['.github/workflows/redline.yml', '.github/pull_request_template.md'],
        outcomes: [worstOutcome(labelOutcomes)],
      };
    },

    async ensureReviewOwnership(
      ref: RepoRef,
      cwd: string,
      rules: OwnershipRule[]
    ): Promise<InstallResult> {
      const candidates = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
      if (candidates.some((p) => existsSync(join(cwd, p)))) {
        return {
          files: [],
          outcomes: [
            {
              capability: 'review-ownership',
              status: 'already',
              detail: 'this repository already has a CODEOWNERS file — left untouched',
            },
          ],
        };
      }
      const body = rules.map((r) => `${r.pattern} ${r.owners.join(' ')}`).join('\n');
      writeFile(cwd, '.github/CODEOWNERS', `# Managed by Redline.\n\n${body}\n`);
      return {
        files: ['.github/CODEOWNERS'],
        outcomes: [
          { capability: 'review-ownership', status: 'applied', detail: 'seeded .github/CODEOWNERS' },
        ],
      };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef> {
      const git = gitFor(cwd);
      git.checkoutNewBranch(change.branch);
      // Stage only what Redline itself wrote — never sweep in pre-existing
      // dirty or untracked state from the working tree (decision 6: no
      // customer secret is ever committed by this tool).
      git.stagePaths(change.files);
      if (!git.hasStagedChanges()) {
        throw new RedlineError('failed', 'nothing to commit — this repository is already onboarded');
      }
      git.commit(change.title);
      git.push(change.branch);

      const created = await client.rest<unknown>(
        'POST',
        `${repoPath(ref)}/pulls`,
        { title: change.title, body: change.body, head: change.branch, base: ref.defaultBranch }
      );
      const pr = isSuccess(created.status) ? parseCreatedPullRequest(created.body) : null;
      if (!pr) {
        throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      }
      if (change.labels.length > 0) {
        await client.rest('POST', `${repoPath(ref)}/issues/${pr.number}/labels`, {
          labels: change.labels,
        });
      }
      return pr;
    },
  };
}
