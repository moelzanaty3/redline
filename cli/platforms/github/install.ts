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

function outcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (status >= 200 && status < 300) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  if (status === 404 || status === 422) {
    return { capability, status: 'unsupported', detail: `${detail} (not available on this repository)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
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
    rules.push({
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        do_not_enforce_on_create: false,
        required_status_checks: policy.requiredChecks.map((context) => ({ context })),
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

      return {
        outcomes: [
          outcome('secret-scanning', scanning.status, 'secret scanning'),
          outcome('push-protection', scanning.status, 'secret scanning push protection'),
          outcome('dependency-alerts', Math.max(alerts.status, fixes.status), 'dependabot alerts'),
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const existing = await client.rest<{ id: number; name: string }[]>(
        'GET',
        `${repoPath(ref)}/rulesets`
      );
      const mine = (existing.body ?? []).find((r) => r.name === RULESET_NAME);
      const payload = {
        name: RULESET_NAME,
        target: 'branch',
        enforcement: 'active',
        bypass_actors: [],
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: buildRules(policy),
      };

      const applied = mine
        ? await client.rest('PUT', `${repoPath(ref)}/rulesets/${mine.id}`, payload)
        : await client.rest('POST', `${repoPath(ref)}/rulesets`, payload);

      const property = await client.rest('PATCH', `${repoPath(ref)}/properties/values`, {
        properties: [{ property_name: 'redline', value: 'onboarded' }],
      });

      return {
        outcomes: [
          outcome('merge-policy', applied.status, 'branch ruleset'),
          outcome('repo-property', property.status, 'repository property "redline=onboarded"'),
        ],
        policy: applied.status < 300 ? policy : null,
      };
    },

    async installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult> {
      const caller = readFileSync(join(PACKAGE_ROOT, 'templates/redline.yml'), 'utf8')
        .replaceAll('<org>', ref.org)
        .replace(/adr-diff-threshold: \d+/, `adr-diff-threshold: ${opts.adrDiffThreshold}`)
        .replace(
          /fail-on-dependency-severity: \w+/,
          `fail-on-dependency-severity: ${opts.failOnDependencySeverity}`
        );
      writeFile(cwd, '.github/workflows/redline.yml', caller);

      const template = readFileSync(
        join(PACKAGE_ROOT, '.github/pull_request_template.md'),
        'utf8'
      );
      writeFile(cwd, '.github/pull_request_template.md', template);

      let worst = 200;
      for (const label of GATE_LABELS) {
        const res = await client.rest('POST', `${repoPath(ref)}/labels`, label);
        if (res.status !== 201 && res.status !== 200) worst = Math.max(worst, res.status);
      }
      const labels: CapabilityOutcome =
        worst === 422
          ? { capability: 'labels', status: 'already', detail: 'gate labels already exist' }
          : outcome('labels', worst, 'gate labels');

      return {
        files: ['.github/workflows/redline.yml', '.github/pull_request_template.md'],
        outcomes: [labels],
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
      git.stageAll();
      if (!git.hasStagedChanges()) {
        throw new RedlineError('failed', 'nothing to commit — this repository is already onboarded');
      }
      git.commit(change.title);
      git.push(change.branch);

      const created = await client.rest<{ number: number; html_url: string }>(
        'POST',
        `${repoPath(ref)}/pulls`,
        { title: change.title, body: change.body, head: change.branch, base: ref.defaultBranch }
      );
      if (!created.body) {
        throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      }
      if (change.labels.length > 0) {
        await client.rest('POST', `${repoPath(ref)}/issues/${created.body.number}/labels`, {
          labels: change.labels,
        });
      }
      return { number: created.body.number, url: created.body.html_url };
    },
  };
}
