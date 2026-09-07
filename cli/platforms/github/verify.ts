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

// Distinct names. GitHub returns one check run per ATTEMPT on the head SHA, so
// a re-run or a re-trigger adds another entry under the same name — three gate
// re-triggers reported 21 entries for 9 checks. On the default advisory install
// nothing is required yet and this list is the whole assertion: a human reads it
// to see whether the gate reported at all. A list that repeats itself is the one
// thing that stops being read.
function parseCheckRunNames(body: unknown): string[] {
  if (!isNonNullObject(body) || !Array.isArray(body['check_runs'])) {
    throw hostShapeError('a check-runs list');
  }
  const names = body['check_runs'].map((run) => {
    if (!isNonNullObject(run) || typeof run['name'] !== 'string') {
      throw hostShapeError('a check run');
    }
    return run['name'];
  });
  return [...new Set(names)];
}

// null means GitHub did not report the block at all, which is not the same
// thing as reporting it empty — see readSecurityState.
// One line per distinct problem, not per offending line: a CODEOWNERS naming
// one unknown team across ten paths is one thing wrong, and printing it ten
// times buries it. GitHub's own `suggestion` is the remedy, so it is kept.
function parseCodeownersProblems(body: unknown): string[] {
  if (!isNonNullObject(body) || !Array.isArray(body['errors'])) {
    throw hostShapeError('a CODEOWNERS errors list');
  }
  const seen = new Set<string>();
  for (const error of body['errors']) {
    if (!isNonNullObject(error)) throw hostShapeError('a CODEOWNERS error');
    const kind = typeof error['kind'] === 'string' ? error['kind'] : 'problem';
    const suggestion = typeof error['suggestion'] === 'string' ? error['suggestion'] : null;
    seen.add(suggestion === null ? kind : `${kind} — ${suggestion}`);
  }
  return [...seen];
}

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
export const CALLER_WORKFLOW = '.github/workflows/redline.yml';

// The other half: whatever REQUIRED_CHECK puts after the separator, which is
// the aggregate job id inside workflows/redline-gate.yml. Derived rather than
// re-typed, so a change to the exported constant carries through.
const CHECK_SEPARATOR = ' / ';
const AGGREGATE_JOB = REQUIRED_CHECK.slice(REQUIRED_CHECK.indexOf(CHECK_SEPARATOR) + CHECK_SEPARATOR.length);

// Still not a YAML parse — this file is Redline's own, `init` rewrites it
// wholesale, and a zero-runtime-dependency CLI does not gain a YAML parser for
// one question. It is structural rather than shape-matched, which is a
// different thing: the scan finds the `jobs:` mapping and reads job ids from
// inside it and nowhere else.
//
// The version that pattern-matched a two-space key anywhere in the file took
// the last one it had seen before the `uses:` line, which in the shipped
// template is `  pull_request:` from the `on:` block. An inline comment on the
// job-id line — a plausible edit, given the DO NOT RENAME THE JOB banner four
// lines above it — was enough to fail the gate with "publishes pull_request /
// gate ... rename the job back", naming a job that exists nowhere about a job
// id that was already correct. Where this scan cannot attribute a name it
// returns null, whose message says the file could not be read for one; a
// message that admits it could not tell is honest, a fabricated job name is
// not.
const KEY = /^\s*(?:(["'])([\w.-]+)\1|([\w.-]+))\s*:(.*)$/;
const USES_THE_GATE = /^\s*uses:\s*["']?\S*redline-gate\.yml@/;

const indentOf = (line: string): number => line.length - line.trimStart().length;
const skippable = (line: string): boolean => line.trim() === '' || line.trimStart().startsWith('#');
const keyName = (line: string): string | null => {
  const match = KEY.exec(line);
  return match?.[2] ?? match?.[3] ?? null;
};

function lines(body: string): string[] {
  return body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

// A workflow nothing triggers on a pull request publishes nothing, however
// correctly its job is named — and the ruleset still requires the check it
// will never send. `on:` is quoted in some hand-edited workflows because bare
// `on` is a YAML boolean, and the trigger may be inline (`on: [pull_request]`)
// or a key in the block below it.
export function triggersOnPullRequest(body: string): boolean {
  const all = lines(body);
  for (let i = 0; i < all.length; i += 1) {
    const line = all[i] ?? '';
    if (skippable(line) || indentOf(line) !== 0 || keyName(line) !== 'on') continue;
    const inline = KEY.exec(line)?.[4] ?? '';
    if (inline.trim() !== '') return inline.includes('pull_request');
    for (const rest of all.slice(i + 1)) {
      if (skippable(rest)) continue;
      if (indentOf(rest) === 0) break;
      if (rest.includes('pull_request')) return true;
    }
    return false;
  }
  return false;
}

export function callerJobId(body: string): string | null {
  const all = lines(body);
  let jobsIndent: number | null = null;
  let jobIdIndent: number | null = null;
  let jobId: string | null = null;

  for (const line of all) {
    if (skippable(line)) continue;
    const indent = indentOf(line);

    if (jobsIndent === null) {
      // Flow style (`jobs: {redline-gate: …}`) leaves content after the colon
      // and is deliberately not attributed: `init` does not write it, and a
      // truthful "could not read a job" beats a guess.
      if (keyName(line) === 'jobs' && (KEY.exec(line)?.[4] ?? '').trim() === '') jobsIndent = indent;
      continue;
    }

    // Back out to the level of `jobs:` or above and the block is over, so no
    // later key can be mistaken for a job id.
    if (indent <= jobsIndent) break;

    if (USES_THE_GATE.test(line) && jobId !== null) return jobId;

    const name = keyName(line);
    if (name === null) continue;
    // The first key inside the block fixes the job-id column; only keys at
    // exactly that column are job ids, so `uses:` and `with:` below one are
    // never mistaken for another job.
    if (jobIdIndent === null) jobIdIndent = indent;
    if (indent === jobIdIndent) jobId = name;
  }
  return null;
}

// The same parse for a local file and a remote read. Sharing it is the point:
// a remote verify that re-derived "what does this file publish" independently
// would eventually disagree with the local one, and the two answers are the
// difference between a repository being reported healthy and being reported
// broken.
export function machineryFromBody(body: string | null): GateMachinery {
  const base = { path: CALLER_WORKFLOW, expected: REQUIRED_CHECK };
  if (body === null) return { ...base, present: false, publishes: null };
  const jobId = triggersOnPullRequest(body) ? callerJobId(body) : null;
  return {
    ...base,
    present: true,
    publishes: jobId === null ? null : `${jobId}${CHECK_SEPARATOR}${AGGREGATE_JOB}`,
  };
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
      if (!existsSync(abs)) return machineryFromBody(null);
      // A local read that cannot be completed — a directory at the path, a
      // file the process cannot open — is a finding about this repository, not
      // an internal defect. Unguarded it escaped verify() as "redline failed
      // unexpectedly" with the host exit code, for a read that never left the
      // machine.
      let body: string;
      try {
        body = readFileSync(abs, 'utf8');
      } catch (error) {
        throw new RedlineError(
          'failed',
          `cannot read ${CALLER_WORKFLOW}: ${error instanceof Error ? error.message : String(error)}`,
          'restore it from redline init, or make it readable'
        );
      }
      return machineryFromBody(body);
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

    async readCodeownersProblems(ref: RepoRef, at?: string): Promise<string[] | null> {
      const path =
        at === undefined
          ? `${repoPath(ref)}/codeowners/errors`
          : `${repoPath(ref)}/codeowners/errors?ref=${encodeURIComponent(at)}`;
      const res = await client.rest<unknown>('GET', path);
      // 404 is "no CODEOWNERS file here", which is a real answer and not a
      // failure — a repository that deselected review-ownership has none.
      if (res.status === 404) return null;
      assertOk(res.status, path);
      return parseCodeownersProblems(res.body);
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
      // with a false one. This is an INDETERMINATE read, not a definite one —
      // GitHub does not say the feature is absent, only that this token
      // cannot see it — so it degrades to `unknown`, not `unsupported`.
      // `unsupported` is reserved for a definite "this does not exist here"
      // answer (Azure's Advanced Security-unlicensed 404 is the one adapter
      // that has one); conflating the two would let a plain `redline verify`
      // pass a repository nobody has actually confirmed, since `unsupported`
      // no longer fails it on its own (see cli/commands/verify.ts). Absent
      // block -> unknown, which isPending excludes exactly like unsupported;
      // present but not enabled -> denied, as before.
      const statuses = parseSecurityAnalysisStatuses(repo.body);
      const invisible = statuses === null;
      const stateFor = (key: string): CapabilityOutcome['status'] =>
        invisible ? 'unknown' : statuses[key] === 'enabled' ? 'applied' : 'denied';
      const note = invisible ? ' (not visible to this token)' : '';

      // Dependabot alerts live on their own endpoint, and it answers with a
      // status rather than a body: 204 enabled, 404 disabled (the repository
      // read above already proved the repository itself resolves, so a 404
      // here is about the feature, not the path). 403 is the one case where
      // nothing was learned — an indeterminate read is not an answer, and
      // `denied` is the status that files work against an administrator. Same
      // reasoning as the block above: this is indeterminate, not a definite
      // "not available here", so it degrades to `unknown`. Any other non-2xx
      // is a host failure, same as everywhere else in this file.
      const alertsPath = `${path}/vulnerability-alerts`;
      const alerts = await client.rest<unknown>('GET', alertsPath);
      if (alerts.status !== 404 && alerts.status !== 403) assertOk(alerts.status, alertsPath);
      const alertsStatus: CapabilityOutcome['status'] =
        alerts.status === 403 ? 'unknown' : alerts.status === 404 ? 'denied' : 'applied';

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
              alertsStatus === 'unknown' ? ' (not visible to this token)' : ''
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
