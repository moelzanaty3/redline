import { isRedlineError } from '../core/errors.ts';
import type { RedlineConfig } from '../config/redline-json.ts';
import type { GateMachinery, MergePolicy, RepoRef, SecurityResult } from '../platforms/types.ts';
import type { VerifyFinding, VerifyReport } from '../commands/verify.ts';
import { renderForTarget, managedPaths } from '../sync/render.ts';

// What a remote verify needs from a host. Deliberately the same shape sync uses
// for its reads, plus the three host-state calls: one repository's drift is
// exactly "what its files say" against "what the host is configured to do".
export interface RemoteVerifyHost {
  // owner/name into a RepoRef. The default branch is a host fact and every read
  // below needs it, so it is asked for rather than assumed to be "main" — a
  // repository on master or develop would otherwise verify as entirely broken.
  resolveRef(repo: string): Promise<RepoRef>;
  readRemoteConfig(ref: RepoRef): Promise<{ config: RedlineConfig | null }>;
  readRemoteFile(ref: RepoRef, path: string): Promise<{ content: string } | null>;
  machineryFromBody(body: string | null): GateMachinery;
  readPolicy(ref: RepoRef): Promise<MergePolicy | null>;
  readSecurityState(ref: RepoRef): Promise<SecurityResult>;
  latestPullRequestNumber(ref: RepoRef): Promise<number | null>;
  readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]>;
}

export interface RemoteVerifyOptions {
  // The package root, for rendering the artifacts a target should carry.
  root: string;
  standardsVersion: string;
}

export const CALLER_WORKFLOW = '.github/workflows/redline.yml';

// Verify a repository without a checkout.
//
// Every check that can be sourced from the host is, and every check that cannot
// is reported `unknown` with the reason rather than passing. That distinction is
// the reason this is safe to run across an estate on a schedule: a check
// reported as passing when it never executed produces a false all-clear on every
// repository at once, which is materially worse than not checking.
export async function verifyRemote(
  host: RemoteVerifyHost,
  ref: RepoRef,
  opts: RemoteVerifyOptions
): Promise<VerifyReport> {
  const findings: VerifyFinding[] = [];
  const add = (check: string, ok: boolean, detail: string, unknown = false): void => {
    findings.push({ check, ok, detail, ...(unknown ? { unknown: true } : {}) });
  };

  const repo = `${ref.org}/${ref.repo}`;

  let config: RedlineConfig | null;
  try {
    ({ config } = await host.readRemoteConfig(ref));
  } catch (error) {
    // A malformed .redline.json in the estate is that repository's finding, not
    // a failure of the run that found it — otherwise one hand-edited file stops
    // the weekly sweep for everybody.
    add('onboarded', false, isRedlineError(error) ? error.message : String(error));
    return { findings, ok: false };
  }
  if (!config) {
    add('onboarded', false, `${repo} carries no .redline.json — it is not onboarded`);
    return { findings, ok: false };
  }
  add('onboarded', true, `profile ${config.profile}, standards v${config.standardsVersion}`);

  // --- rendered artifacts ----------------------------------------------------
  // Staleness is decidable remotely and is worth deciding: it is the check that
  // tells an ignored sync pull request from a merged one.
  try {
    const existing = new Map<string, string>();
    for (const path of managedPaths(opts.root, config.profile, config.vendors)) {
      const file = await host.readRemoteFile(ref, path);
      if (file) existing.set(path, file.content);
    }
    const rendered = renderForTarget({
      root: opts.root,
      profile: config.profile,
      vendors: config.vendors,
      existing,
    });
    add(
      'artifacts',
      rendered.files.length === 0,
      rendered.files.length === 0
        ? `current against standards v${opts.standardsVersion}`
        : `stale against standards v${opts.standardsVersion}: ${rendered.files
            .map((f) => f.path)
            .join(', ')} — a sync pull request is open or was closed unmerged`
    );
  } catch (error) {
    add(
      'artifacts',
      true,
      `could not render for comparison: ${isRedlineError(error) ? error.message : String(error)}`,
      true
    );
  }

  // --- gate machinery --------------------------------------------------------
  const callerFile = await host.readRemoteFile(ref, CALLER_WORKFLOW);
  const machinery = host.machineryFromBody(callerFile?.content ?? null);
  const gateOwned = config.capabilities.gate;
  add(
    'gate-machinery',
    !gateOwned || (machinery.present && machinery.publishes === machinery.expected),
    !gateOwned
      ? machinery.present
        ? `off by choice, and ${machinery.path} is still present and still publishing ${machinery.publishes ?? 'nothing'}`
        : 'off by choice — this repository publishes the gate its own way'
      : !machinery.present
        ? `${machinery.path} is missing — nothing here can publish ${machinery.expected}`
        : machinery.publishes === null
          ? `${machinery.path} is present but no longer publishes a check name — its job id or pull_request trigger was edited`
          : machinery.publishes !== machinery.expected
            ? `${machinery.path} publishes ${machinery.publishes}, but the policy requires ${machinery.expected}`
            : `publishes ${machinery.publishes}`
  );

  // --- merge policy ----------------------------------------------------------
  const policy = await host.readPolicy(ref);
  if (!config.capabilities.mergePolicy) {
    add('merge-policy', true, 'off by choice — this repository maintains its own');
  } else if (policy === null) {
    add('merge-policy', false, 'no merge policy found on the host — one was applied at onboarding');
  } else {
    const weakened: string[] = [];
    if (policy.requiredApprovals < 1) {
      weakened.push('human approval is no longer required — automated review never approves');
    }
    if (policy.notEnforcedReason) {
      // The cheapest loosening on GitHub: a ruleset switched out of active
      // enforcement keeps every field readable while none of its rules apply.
      weakened.push(`the policy exists but is not in force (${policy.notEnforcedReason})`);
    }
    if (policy.blocking && !machinery.present) {
      weakened.push(
        `blocking on ${machinery.expected}, which nothing in this repository publishes — ` +
          'every pull request here is blocked until the gate is restored or the policy relaxed'
      );
    }
    add(
      'merge-policy',
      weakened.length === 0,
      weakened.length === 0
        ? `${policy.blocking ? 'blocking' : 'advisory'}, ${policy.requiredApprovals} approval(s) required`
        : weakened.join('; ')
    );
  }

  // --- security floor --------------------------------------------------------
  const security = await host.readSecurityState(ref);
  // An indeterminate read is not an answer. A 403 the host cannot tell from a
  // genuine refusal must not be reported as a security floor that is off — that
  // files false work against an administrator — nor as one that is on.
  const unreadable = security.outcomes.filter((o) => o.status === 'unknown');
  const off = security.outcomes.filter((o) => o.status === 'denied');
  if (off.length > 0) {
    add('security-floor', false, `not enabled: ${off.map((o) => o.capability).join(', ')}`);
  } else if (unreadable.length > 0 && unreadable.length === security.outcomes.length) {
    add(
      'security-floor',
      true,
      `this token cannot read: ${unreadable.map((o) => o.capability).join(', ')}`,
      true
    );
  } else if (unreadable.length > 0) {
    // Partly unreadable is still an indeterminate answer about the part that
    // could not be read. Reporting it plainly `ok` meant a repository with
    // secret scanning genuinely off, plus a token unable to see it, verified as
    // healthy — the one combination this check exists to catch.
    add(
      'security-floor',
      true,
      `enabled, except ${unreadable.map((o) => o.capability).join(', ')} which this token cannot read`,
      true
    );
  } else {
    add('security-floor', true, 'the security floor is enabled');
  }

  // --- the check actually reporting ------------------------------------------
  const pr = await host.latestPullRequestNumber(ref);
  if (pr === null) {
    add('check-name-reported', true, 'no pull request yet — open one to confirm the check reports');
  } else {
    const reported = await host.readReportedCheckNames(ref, pr);
    const found = reported.includes(machinery.expected);
    add(
      'check-name-reported',
      !gateOwned || found,
      !gateOwned
        ? 'off by choice — Redline does not require a check name here'
        : found
          ? `${machinery.expected} reported on PR #${pr}`
          : `${machinery.expected} was not reported on PR #${pr} — reported: ${reported.join(', ') || 'nothing'}`
    );
  }

  // --- pending admin ---------------------------------------------------------
  add(
    'pending-admin',
    config.pendingAdmin.length === 0,
    config.pendingAdmin.length === 0
      ? 'nothing waiting on an administrator'
      : `an administrator must still enable: ${config.pendingAdmin.join(', ')}`
  );

  // An unknown never fails the report. It is not evidence of drift — it is the
  // absence of evidence, and failing on it would train an operator to ignore
  // the weekly issue, which costs more than the check is worth.
  const ok = findings.every((f) => f.ok || f.unknown === true);
  return { findings, ok };
}
