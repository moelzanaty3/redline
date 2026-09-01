import { RedlineError } from '../../core/errors.ts';
import type {
  CapabilityOutcome,
  MergePolicy,
  PlatformVerify,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { GitHubClient } from './client.ts';
import { RULESET_NAME } from './install.ts';

// GitHub response bodies are untrusted external input: the transport (http.ts)
// only guarantees valid JSON, never a particular shape. Every body is typed
// `unknown` here and narrowed by an explicit parse function below, in the
// house style of cli/render/manifest.ts — never a bare `as` onto a concrete
// GitHub type.

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hostShapeError(what: string): RedlineError {
  return new RedlineError('host', `GitHub returned an unexpected shape for ${what}`);
}

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

function parseSecurityAnalysisStatuses(body: unknown): Record<string, string> {
  if (!isNonNullObject(body)) throw hostShapeError('a repository');
  const analysis = body['security_and_analysis'];
  if (analysis === undefined) return {};
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

export function createGitHubVerify(client: GitHubClient): PlatformVerify {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  return {
    async readPolicy(ref: RepoRef): Promise<MergePolicy | null> {
      const list = await client.rest<unknown>('GET', `${repoPath(ref)}/rulesets`);
      const mine = parseRulesetList(list.body).find((r) => r.name === RULESET_NAME);
      if (!mine) return null;

      const detail = await client.rest<unknown>('GET', `${repoPath(ref)}/rulesets/${mine.id}`);
      const rules = parseRulesetRules(detail.body);
      const prParams = parsePullRequestParams(rules.find((r) => r.type === 'pull_request')?.parameters);
      const checksRule = rules.find((r) => r.type === 'required_status_checks');

      return {
        requiredApprovals: prParams.requiredApprovingReviewCount,
        dismissStaleReviews: prParams.dismissStaleReviewsOnPush,
        requireCodeOwnerReview: prParams.requireCodeOwnerReview,
        requireThreadResolution: prParams.requiredReviewThreadResolution,
        requiredChecks: parseRequiredCheckContexts(checksRule?.parameters),
        blocking: checksRule !== undefined,
      };
    },

    async readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]> {
      const detail = await client.rest<unknown>('GET', `${repoPath(ref)}/pulls/${pr}`);
      const sha = parsePullRequestHeadSha(detail.body);
      const runs = await client.rest<unknown>(
        'GET',
        `${repoPath(ref)}/commits/${sha}/check-runs?per_page=100`
      );
      return parseCheckRunNames(runs.body);
    },

    async readSecurityState(ref: RepoRef): Promise<SecurityResult> {
      const path = repoPath(ref);
      const repo = await client.rest<unknown>('GET', path);
      assertOk(repo.status, path);
      const statuses = parseSecurityAnalysisStatuses(repo.body);
      const stateFor = (key: string): CapabilityOutcome['status'] =>
        statuses[key] === 'enabled' ? 'applied' : 'denied';

      return {
        outcomes: [
          { capability: 'secret-scanning', status: stateFor('secret_scanning'), detail: 'secret scanning' },
          {
            capability: 'push-protection',
            status: stateFor('secret_scanning_push_protection'),
            detail: 'secret scanning push protection',
          },
        ],
      };
    },

    async latestPullRequestNumber(ref: RepoRef): Promise<number | null> {
      const list = await client.rest<unknown>('GET', `${repoPath(ref)}/pulls?state=all&per_page=1`);
      return parsePullRequestNumbers(list.body)[0] ?? null;
    },
  };
}
