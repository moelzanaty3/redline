import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { verifyRemote, type RemoteVerifyHost } from '../remote.ts';
import { RedlineError } from '../../core/errors.ts';
import type { RepoRef } from '../../platforms/types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web-app', defaultBranch: 'main' };

const config = {
  standardsVersion: '0.0.1',
  cliVersion: '0.0.1',
  host: 'github' as const,
  profile: 'web',
  vendors: ['agents'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: false,
    speckit: false,
    tmf: false,
    sensitivePathReviewers: false,
  },
  pendingAdmin: [],
  onboardedAt: '2026-09-01T00:00:00.000Z',
  lastRunAt: '2026-09-02T00:00:00.000Z',
  rung: 'observe' as const,
  localRules: false,
  capabilities: { gate: true, mergePolicy: true, labels: true },
  commandFiles: {},
};

const host = (over: Partial<RemoteVerifyHost> = {}): RemoteVerifyHost => ({
  async resolveRef() {
    return ref;
  },
  async readRemoteConfig() {
    return { config };
  },
  async readRemoteFile() {
    return null;
  },
  machineryFromBody(body) {
    return {
      path: '.github/workflows/redline.yml',
      expected: 'redline-gate / gate',
      present: body !== null,
      publishes: body === null ? null : 'redline-gate / gate',
    };
  },
  async readPolicy() {
    return {
      requiredApprovals: 1,
      dismissStaleReviews: true,
      requireCodeOwnerReview: true,
      requireThreadResolution: true,
      requiredChecks: ['redline-gate / gate'],
      blocking: false,
    };
  },
  async readSecurityState() {
    return {
      outcomes: [{ capability: 'secret-scanning' as const, status: 'already' as const, detail: 'on' }],
    };
  },
  async latestPullRequestNumber() {
    return null;
  },
  async readReportedCheckNames() {
    return [];
  },
  ...over,
});

const opts = { root: ROOT, standardsVersion: '0.0.1' };
import type { VerifyReport } from '../../commands/verify.ts';

const find = (r: VerifyReport, check: string) => r.findings.find((f) => f.check === check);

test('a repository with no .redline.json is reported as not onboarded, once', async () => {
  const report = await verifyRemote(host({ async readRemoteConfig() { return { config: null }; } }), ref, opts);

  assert.equal(report.ok, false);
  assert.equal(report.findings.length, 1);
  assert.match(report.findings[0]?.detail ?? '', /not onboarded/);
});

test('a malformed remote config is that repository’s finding, not a failed sweep', async () => {
  // One hand-edited file must not stop the weekly run for the whole estate.
  const report = await verifyRemote(
    host({
      async readRemoteConfig() {
        throw new RedlineError('failed', 'acme/web-app: .redline.json is invalid');
      },
    }),
    ref,
    opts
  );

  assert.equal(report.ok, false);
  assert.match(report.findings[0]?.detail ?? '', /is invalid/);
});

test('a missing gate caller is drift, and says nothing can publish the check', async () => {
  const report = await verifyRemote(host(), ref, opts);

  const gate = find(report, 'gate-machinery');
  assert.equal(gate?.ok, false);
  assert.match(gate?.detail ?? '', /nothing here can publish redline-gate \/ gate/);
});

test('a caller whose job id was renamed is drift, and names both sides', async () => {
  const report = await verifyRemote(
    host({
      async readRemoteFile(_r, path) {
        return path.endsWith('redline.yml') ? { content: 'on: pull_request\njobs:\n  other:\n' } : null;
      },
      machineryFromBody(body) {
        return {
          path: '.github/workflows/redline.yml',
          expected: 'redline-gate / gate',
          present: body !== null,
          publishes: body === null ? null : 'other / gate',
        };
      },
    }),
    ref,
    opts
  );

  const gate = find(report, 'gate-machinery');
  assert.equal(gate?.ok, false);
  assert.match(gate?.detail ?? '', /publishes other \/ gate.*requires redline-gate \/ gate/);
});

test('a policy that exists but is not in force is drift, not a pass', async () => {
  // The cheapest loosening on GitHub, and invisible to a boolean comparison.
  const report = await verifyRemote(
    host({
      async readPolicy() {
        return {
          requiredApprovals: 1,
          dismissStaleReviews: true,
          requireCodeOwnerReview: true,
          requireThreadResolution: true,
          requiredChecks: [],
          blocking: true,
          notEnforcedReason: 'ruleset enforcement is set to evaluate',
        };
      },
    }),
    ref,
    opts
  );

  const policy = find(report, 'merge-policy');
  assert.equal(policy?.ok, false);
  assert.match(policy?.detail ?? '', /not in force/);
});

test('zero required approvals is drift', async () => {
  const report = await verifyRemote(
    host({
      async readPolicy() {
        return {
          requiredApprovals: 0,
          dismissStaleReviews: true,
          requireCodeOwnerReview: true,
          requireThreadResolution: true,
          requiredChecks: [],
          blocking: false,
        };
      },
    }),
    ref,
    opts
  );

  assert.equal(find(report, 'merge-policy')?.ok, false);
});

test('a security floor this token cannot read is unknown, never a pass or a failure', async () => {
  // Reporting it off files false work against an administrator; reporting it on
  // is a false all-clear. An indeterminate read is not an answer.
  const report = await verifyRemote(
    host({
      async readSecurityState() {
        return {
          outcomes: [
            { capability: 'secret-scanning' as const, status: 'unknown' as const, detail: '403' },
          ],
        };
      },
    }),
    ref,
    opts
  );

  const floor = find(report, 'security-floor');
  assert.equal(floor?.unknown, true);
  assert.match(floor?.detail ?? '', /cannot read/);
});

test('a denied security floor is a real failure', async () => {
  const report = await verifyRemote(
    host({
      async readSecurityState() {
        return {
          outcomes: [
            { capability: 'secret-scanning' as const, status: 'denied' as const, detail: 'off' },
          ],
        };
      },
    }),
    ref,
    opts
  );

  assert.equal(find(report, 'security-floor')?.ok, false);
});

test('an unknown never fails the report on its own', async () => {
  // Failing on the absence of evidence trains an operator to ignore the weekly
  // issue, which costs more than the check is worth.
  const report = await verifyRemote(
    host({
      async readRemoteFile(_r, path) {
        return path.endsWith('redline.yml') ? { content: 'on: pull_request\njobs:\n  redline-gate:\n' } : null;
      },
      async readSecurityState() {
        return {
          outcomes: [
            { capability: 'secret-scanning' as const, status: 'unknown' as const, detail: '403' },
          ],
        };
      },
    }),
    ref,
    opts
  );

  const floor = report.findings.find((f) => f.check === 'security-floor');
  assert.equal(floor?.unknown, true);
  // The claim: an unknown contributes nothing to the verdict. Whatever else this
  // repository is failing, it is not failing because of a read that never
  // returned an answer.
  assert.equal(floor?.ok, true);
  const realFailures = report.findings.filter((f) => !f.ok && f.unknown !== true);
  assert.equal(realFailures.some((f) => f.check === 'security-floor'), false);
});

test('a recorded pendingAdmin entry is reported as work waiting on an administrator', async () => {
  const report = await verifyRemote(
    host({
      async readRemoteConfig() {
        return { config: { ...config, pendingAdmin: ['merge-policy' as const] } };
      },
    }),
    ref,
    opts
  );

  const pending = find(report, 'pending-admin');
  assert.equal(pending?.ok, false);
  assert.match(pending?.detail ?? '', /merge-policy/);
});

test('the required check not reported on a real pull request is drift', async () => {
  const report = await verifyRemote(
    host({
      async readRemoteFile(_r, path) {
        return path.endsWith('redline.yml') ? { content: 'on: pull_request\njobs:\n  redline-gate:\n' } : null;
      },
      async latestPullRequestNumber() {
        return 9;
      },
      async readReportedCheckNames() {
        return ['build', 'test'];
      },
    }),
    ref,
    opts
  );

  const reported = find(report, 'check-name-reported');
  assert.equal(reported?.ok, false);
  assert.match(reported?.detail ?? '', /was not reported on PR #9/);
});

test('stale artifacts are named, so an ignored sync pull request is visible', async () => {
  const report = await verifyRemote(host(), ref, opts);

  const artifacts = find(report, 'artifacts');
  assert.equal(artifacts?.ok, false);
  assert.match(artifacts?.detail ?? '', /stale against standards/);
});

test('a partly unreadable security floor is unknown, not a clean pass', async () => {
  // The combination this check exists to catch: something genuinely off, plus a
  // token that cannot see it. Reporting the readable half as plain ok verified
  // that repository as healthy.
  const report = await verifyRemote(
    host({
      async readSecurityState() {
        return {
          outcomes: [
            { capability: 'push-protection' as const, status: 'already' as const, detail: 'on' },
            { capability: 'secret-scanning' as const, status: 'unknown' as const, detail: '403' },
          ],
        };
      },
    }),
    ref,
    opts
  );

  const floor = find(report, 'security-floor');
  assert.equal(floor?.unknown, true);
  assert.match(floor?.detail ?? '', /cannot read/);
});
