import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RedlineError } from '../../core/errors.ts';
import type {
  CapabilityOutcome,
  GateMachinery,
  MergePolicy,
  PlatformVerify,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { GitHubClient } from './client.ts';
import { REQUIRED_CHECK, RULESET_NAME } from './install.ts';
import { createHostShapeError, isNonNullObject } from '../shape.ts';

const hostShapeError = createHostShapeError('GitHub');

function assertOk(status: number, path: string): void {
  if (status < 200 || status >= 300) {
    throw new RedlineError('host', `GitHub returned HTTP ${status} reading ${path}`);
  }
}

interface RulesetSummary {
  id: number;
  name: string;
}

function parseRulesetList(body: unknown): RulesetSummary[] {
  if (!Array.isArray(body)) throw hostShapeError('the rulesets list');
  return body.map((item) => {
    if (!isNonNullObject(item) || typeof item['id'] !== 'number' || typeof item['name'] !== 'string') {
      throw hostShapeError('a ruleset summary');
    }
    return { id: item['id'], name: item['name'] };
  });
}

interface RulesetRule {
  type: string;
  parameters?: Record<string, unknown>;
}

// `active`, `evaluate` or `disabled`. Anything but `active` means the ruleset
// is readable and not applying — the rules come back unchanged, so nothing
// else in this file can tell the difference. Absent is read as active: the
// field has always been present on a real ruleset, and guessing "not in force"
// from a shape surprise would fail a healthy repository.
function parseRulesetEnforcement(body: unknown): string {
  if (!isNonNullObject(body)) throw hostShapeError('a ruleset detail');
  const enforcement = body['enforcement'];
  return typeof enforcement === 'string' ? enforcement : 'active';
}

function parseRulesetRules(body: unknown): RulesetRule[] {
  if (!isNonNullObject(body) || !Array.isArray(body['rules'])) {
    throw hostShapeError('a ruleset detail');
  }
  return body['rules'].map((rule) => {
    if (!isNonNullObject(rule) || typeof rule['type'] !== 'string') {
      throw hostShapeError('a ruleset rule');
    }
    const parameters = rule['parameters'];
    return {
      type: rule['type'],
      ...(isNonNullObject(parameters) ? { parameters } : {}),
    };
  });
}

interface PullRequestRuleParams {
  requiredApprovingReviewCount: number;
  dismissStaleReviewsOnPush: boolean;
  requireCodeOwnerReview: boolean;
  requiredReviewThreadResolution: boolean;
}

function parsePullRequestParams(parameters: Record<string, unknown> | undefined): PullRequestRuleParams {
  const p = parameters ?? {};
  return {
    requiredApprovingReviewCount:
      typeof p['required_approving_review_count'] === 'number'
        ? p['required_approving_review_count']
        : 0,
    dismissStaleReviewsOnPush: p['dismiss_stale_reviews_on_push'] === true,
    requireCodeOwnerReview: p['require_code_owner_review'] === true,
    requiredReviewThreadResolution: p['required_review_thread_resolution'] === true,
  };
}

function parseRequiredCheckContexts(parameters: Record<string, unknown> | undefined): string[] {
  const checks = parameters?.['required_status_checks'];
  if (checks === undefined) return [];
  if (!Array.isArray(checks)) throw hostShapeError('required status checks');
  return checks.map((c) => {
    if (!isNonNullObject(c) || typeof c['context'] !== 'string') {
      throw hostShapeError('a required status check');
    }
    return c['context'];
  });
}

function parsePullRequestHeadSha(body: unknown): string {
  const head = isNonNullObject(body) ? body['head'] : undefined;
  if (!isNonNullObject(head) || typeof head['sha'] !== 'string') {
    throw hostShapeError('a pull request');
  }
  return head['sha'];
}

function parseCheckRunNames(body: unknown): string[] {
  if (!isNonNullObject(body) || !Array.isArray(body['check_runs'])) {
    throw hostShapeError('a check-runs list');
  }
  return body['check_runs'].map((run) => {
    if (!isNonNullObject(run) || typeof run['name'] !== 'string') {
      throw hostShapeError('a check run');
    }
    return run['name'];
  });
}

// null means GitHub did not report the block at all, which is not the same
// thing as reporting it empty — see readSecurityState.
function parseSecurityAnalysisStatuses(body: unknown): Record<string, string> | null {
  if (!isNonNullObject(body)) throw hostShapeError('a repository');
  const analysis = body['security_and_analysis'];
  if (analysis === undefined) return null;
  if (!isNonNullObject(analysis)) throw hostShapeError('security_and_analysis');

  const statuses: Record<string, string> = {};
  for (const [key, value] of Object.entries(analysis)) {
    if (isNonNullObject(value) && typeof value['status'] === 'string') {
      statuses[key] = value['status'];
    }
  }
  return statuses;
}

function parsePullRequestNumbers(body: unknown): number[] {
  if (!Array.isArray(body)) throw hostShapeError('the pull request list');
  return body.map((item) => {
    if (!isNonNullObject(item) || typeof item['number'] !== 'number') {
      throw hostShapeError('a pull request summary');
    }
    return item['number'];
  });
}

// The caller workflow `installGate` writes. Its job id is half of the required
// check name — templates/redline.yml carries a DO NOT RENAME THE JOB warning
// for exactly this reason — so reading it back is what separates "the gate has
// not run on this pull request yet" from "nothing here can ever publish that
// check".
const CALLER_WORKFLOW = '.github/workflows/redline.yml';

// The other half: whatever REQUIRED_CHECK puts after the separator, which is
// the aggregate job id inside workflows/redline-gate.yml. Derived rather than
// re-typed, so a change to the exported constant carries through.
const CHECK_SEPARATOR = ' / ';
const AGGREGATE_JOB = REQUIRED_CHECK.slice(REQUIRED_CHECK.indexOf(CHECK_SEPARATOR) + CHECK_SEPARATOR.length);

// Deliberately not a YAML parse: this file is Redline's own, the question is
// one line deep, and a dependency-free CLI does not gain a YAML parser for it.
// The job id is the last `  <id>:` seen above the `uses:` line that names the
// reusable gate workflow, which is how a rename is caught whatever else the
// file grew around it.
function callerJobId(body: string): string | null {
  let jobId: string | null = null;
  for (const line of body.split('\n')) {
    const declaration = /^ {2}([\w.-]+):\s*$/.exec(line);
    if (declaration?.[1] !== undefined) {
      jobId = declaration[1];
      continue;
    }
    if (/^\s+uses:\s*\S*redline-gate\.yml@/.test(line)) return jobId;
  }
  return null;
}

export function createGitHubVerify(client: GitHubClient): PlatformVerify {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  return {
    async readPolicy(ref: RepoRef): Promise<MergePolicy | null> {
      // Status is checked before the body is parsed, as azure/verify.ts does
      // in all four of its methods. Without it a 403 error body ({"message":
      // "Forbidden"}) fails the shape check instead, and the operator is sent
      // after a host bug when the real problem is a token scope.
      const listPath = `${repoPath(ref)}/rulesets`;
      const list = await client.rest<unknown>('GET', listPath);
      assertOk(list.status, listPath);
      const mine = parseRulesetList(list.body).find((r) => r.name === RULESET_NAME);
      if (!mine) return null;

      const detailPath = `${repoPath(ref)}/rulesets/${mine.id}`;
      const detail = await client.rest<unknown>('GET', detailPath);
      assertOk(detail.status, detailPath);
      const rules = parseRulesetRules(detail.body);
      const prParams = parsePullRequestParams(rules.find((r) => r.type === 'pull_request')?.parameters);
      const checksRule = rules.find((r) => r.type === 'required_status_checks');

      const enforcement = parseRulesetEnforcement(detail.body);

      return {
        requiredApprovals: prParams.requiredApprovingReviewCount,
        dismissStaleReviews: prParams.dismissStaleReviewsOnPush,
        requireCodeOwnerReview: prParams.requireCodeOwnerReview,
        requireThreadResolution: prParams.requiredReviewThreadResolution,
        requiredChecks: parseRequiredCheckContexts(checksRule?.parameters),
        blocking: checksRule !== undefined,
        ...(enforcement === 'active'
          ? {}
          : {
              notEnforcedReason:
                `the ${RULESET_NAME} ruleset is set to "${enforcement}" rather than "active", so none of ` +
                'its rules apply and every setting below is readable but inert',
            }),
        // No unownedSettings: the ruleset read here is the one named `Redline`
        // and `applyPolicy` writes every field above into it, so each one is
        // Redline's own and `verify` may hold the repository to all of them.
      };
    },

    readGateMachinery(cwd: string): GateMachinery {
      const abs = join(cwd, CALLER_WORKFLOW);
      if (!existsSync(abs)) return { path: CALLER_WORKFLOW, present: false, publishes: null };
      const jobId = callerJobId(readFileSync(abs, 'utf8'));
      return {
        path: CALLER_WORKFLOW,
        present: true,
        publishes: jobId === null ? null : `${jobId}${CHECK_SEPARATOR}${AGGREGATE_JOB}`,
      };
    },

    async readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]> {
      const prPath = `${repoPath(ref)}/pulls/${pr}`;
      const detail = await client.rest<unknown>('GET', prPath);
      assertOk(detail.status, prPath);
      const sha = parsePullRequestHeadSha(detail.body);
      const runsPath = `${repoPath(ref)}/commits/${sha}/check-runs?per_page=100`;
      const runs = await client.rest<unknown>('GET', runsPath);
      assertOk(runs.status, runsPath);
      return parseCheckRunNames(runs.body);
    },

    async readSecurityState(ref: RepoRef): Promise<SecurityResult> {
      const path = repoPath(ref);
      const repo = await client.rest<unknown>('GET', path);
      assertOk(repo.status, path);
      // GitHub omits security_and_analysis entirely for a requester without
      // admin permission. "This token cannot see it" is not "it is off", and
      // the difference matters: `denied` is the status that files pending-admin
      // work and rewrites .redline.json, so reading an invisible setting as a
      // refusal let a write-but-not-admin re-run overwrite a correct record
      // with a false one. Absent block -> unsupported, which isPending
      // excludes; present but not enabled -> denied, as before.
      const statuses = parseSecurityAnalysisStatuses(repo.body);
      const invisible = statuses === null;
      const stateFor = (key: string): CapabilityOutcome['status'] =>
        invisible ? 'unsupported' : statuses[key] === 'enabled' ? 'applied' : 'denied';
      const note = invisible ? ' (not visible to this token)' : '';

      // Dependabot alerts live on their own endpoint, and it answers with a
      // status rather than a body: 204 enabled, 404 disabled (the repository
      // read above already proved the repository itself resolves, so a 404
      // here is about the feature, not the path). 403 is the one case where
      // nothing was learned — an indeterminate read is not an answer, and
      // `denied` is the status that files work against an administrator. Any
      // other non-2xx is a host failure, same as everywhere else in this file.
      const alertsPath = `${path}/vulnerability-alerts`;
      const alerts = await client.rest<unknown>('GET', alertsPath);
      if (alerts.status !== 404 && alerts.status !== 403) assertOk(alerts.status, alertsPath);
      const alertsStatus: CapabilityOutcome['status'] =
        alerts.status === 403 ? 'unsupported' : alerts.status === 404 ? 'denied' : 'applied';

      return {
        outcomes: [
          {
            capability: 'secret-scanning',
            status: stateFor('secret_scanning'),
            detail: `secret scanning${note}`,
          },
          {
            capability: 'push-protection',
            status: stateFor('secret_scanning_push_protection'),
            detail: `secret scanning push protection${note}`,
          },
          {
            capability: 'dependency-alerts',
            status: alertsStatus,
            detail: `dependabot alerts (vulnerability alerts)${
              alertsStatus === 'unsupported' ? ' (not visible to this token)' : ''
            }`,
          },
        ],
      };
    },

    async latestPullRequestNumber(ref: RepoRef): Promise<number | null> {
      const path = `${repoPath(ref)}/pulls?state=all&per_page=1`;
      const list = await client.rest<unknown>('GET', path);
      assertOk(list.status, path);
      return parsePullRequestNumbers(list.body)[0] ?? null;
    },
  };
}
