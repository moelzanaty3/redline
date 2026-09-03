import { isRedlineError } from '../core/errors.ts';
import { readConfig, type RedlineConfig } from '../config/redline-json.ts';
import { loadManifest } from '../render/manifest.ts';
import { render } from '../render/standards.ts';
import {
  observePullRequestTemplates,
  type TemplateObservation,
} from '../platforms/pull-request-templates.ts';
import type { Platform, PolicySetting } from '../platforms/types.ts';

export interface VerifyFinding {
  check: string;
  ok: boolean;
  detail: string;
}

export interface VerifyReport {
  findings: VerifyFinding[];
  ok: boolean;
}

export interface VerifyOptions {
  cwd: string;
  root: string;
  // `redline verify --gate`, the run that publishes the merge-gate status.
  // It changes exactly one verdict — see the security-floor finding.
  gate?: boolean;
}

// The platform arrives as a thunk, not a value: resolving one builds a host
// client, which resolves a credential and throws `permission` (exit 3) when
// there is none. A repository whose only problem is that nobody ran
// `redline init` must not be told it lacks credentials, so the .redline.json
// short-circuit below runs before the platform is ever resolved.
export async function verify(
  platformFor: () => Platform | Promise<Platform>,
  opts: VerifyOptions
): Promise<VerifyReport> {
  const findings: VerifyFinding[] = [];
  const add = (check: string, ok: boolean, detail: string): void => {
    findings.push({ check, ok, detail });
  };

  // A missing or corrupt .redline.json is a usage problem, not drift: there is
  // nothing else worth checking, so this short-circuits to a single finding.
  // The caller (redline verify's exit-code mapping) uses that single-finding
  // shape to distinguish "not onboarded" (exit 2) from "onboarded but wrong"
  // (exit 1) without verify() itself owning process exit codes.
  let config: RedlineConfig | null;
  try {
    config = readConfig(opts.cwd);
  } catch (error) {
    const message = isRedlineError(error) ? error.message : String(error);
    add('onboarded', false, message);
    return { findings, ok: false };
  }
  if (!config) {
    add('onboarded', false, `no ${opts.cwd}/.redline.json — run: npx --package=redline-cli@latest redline init`);
    return { findings, ok: false };
  }
  add('onboarded', true, `profile ${config.profile}, standards v${config.standardsVersion}`);

  // Every remaining check reads from the host or the filesystem. A thrown
  // RedlineError('host', ...) from any platform call below is deliberately
  // left uncaught here: it must propagate out of verify() as a genuine host
  // failure (exit 4), never get reinterpreted as a capability finding. A
  // previous task's bug reported a host 404 as two "denied" capabilities,
  // filing false work against an administrator — that must not repeat here.
  const platform = await platformFor();
  const ref = await platform.repoRef(opts.cwd);
  const policy = await platform.readPolicy(ref);

  // Every setting `redline init` applies, not just the blocking flag: an
  // administrator who turns off code-owner review or approvals leaves the gate
  // reporting green while the review requirements it was installed for are
  // gone. Compared against what init applies (cli/commands/init.ts:
  // requiredApprovals 1, requireCodeOwnerReview from the menu,
  // requireThreadResolution true), and compared as a floor, not for equality:
  // a team that requires three approvals is stricter than the standard, and
  // failing them would fail their own gate on every pull request.
  const MINIMUM_APPROVALS = 1;
  const weakened: string[] = [];
  // Settings the host says it cannot attribute to Redline are reported and
  // never compared — see MergePolicy.unownedSettings.
  const unowned = policy?.unownedSettings ?? [];
  const owned = (setting: PolicySetting): boolean => !unowned.includes(setting);
  if (policy !== null) {
    if (policy.blocking !== config.menu.blockingGate) {
      weakened.push(
        `policy is ${policy.blocking ? 'blocking' : 'advisory'}, config says ${
          config.menu.blockingGate ? 'blocking' : 'advisory'
        }`
      );
    }
    if (owned('requiredApprovals') && policy.requiredApprovals < MINIMUM_APPROVALS) {
      weakened.push(
        `it requires ${policy.requiredApprovals} approval(s), below the ${MINIMUM_APPROVALS} redline init applied`
      );
    }
    if (
      owned('requireCodeOwnerReview') &&
      config.menu.sensitivePathReviewers &&
      !policy.requireCodeOwnerReview
    ) {
      weakened.push(
        'code-owner review is off, so the sensitive paths in CODEOWNERS no longer require their owner'
      );
    }
    if (owned('requireThreadResolution') && !policy.requireThreadResolution) {
      weakened.push('unresolved review threads no longer block a merge');
    }
  }
  add(
    'merge-policy',
    policy !== null && weakened.length === 0,
    policy === null
      ? 'no Redline merge policy found on the host'
      : `${
          weakened.length === 0
            ? `policy is ${policy.blocking ? 'blocking' : 'advisory'} as configured, ${
                policy.requiredApprovals
              } approval(s), code-owner review ${policy.requireCodeOwnerReview ? 'on' : 'off'}`
            : weakened.join('; ')
        }${unowned.length > 0 ? `; not compared here: ${unowned.join(', ')}` : ''}${
          policy.advisoryReason ? ` — ${policy.advisoryReason}` : ''
        }`
  );

  // The check-name comparison is the highest-value check in the product: an
  // unsatisfiable required-check name silently blocks every pull request.
  // It runs whenever the host has any pull request to inspect, independent
  // of whether the live policy currently lists required checks — an
  // advisory (non-blocking) gate has no required checks by design, but the
  // check name still needs confirming before anyone promotes it to blocking.
  const pr = await platform.latestPullRequestNumber(ref);
  if (pr === null) {
    add('check-name-reported', true, 'no pull request yet — open one to confirm the check reports');
  } else {
    const reported = await platform.readReportedCheckNames(ref, pr);
    const required = policy?.requiredChecks ?? [];
    const missing = required.filter((name) => !reported.includes(name));
    // The host is asked about the newest pull request of any state, which on a
    // healthy repository is routinely one that predates the gate — merged
    // before onboarding, or never updated since. Nothing Redline-shaped ran on
    // that head SHA, so the required check being absent from it is evidence of
    // nothing at all, and reporting a broken contract from it failed healthy
    // repositories and, through the Azure gate, every pull request in them.
    // The gate publishes `redline-gate / gate` on GitHub and `redline/gate` on
    // Azure (github/install.ts REQUIRED_CHECK, azure/policy-types.ts
    // AZURE_STATUS_GENRE), so a reported name under that prefix is a gate run
    // — including one published under a name the policy does not require,
    // which is exactly the misconfiguration worth failing for.
    const gateRan = reported.some((name) => name.toLowerCase().startsWith('redline'));
    if (required.length > 0 && missing.length > 0 && !gateRan) {
      add(
        'check-name-reported',
        true,
        `no gate run observed yet on PR #${pr} — open or update a pull request to see the gate report ` +
          `(the policy requires ${required.join(', ')})`
      );
    } else if (required.length > 0 && missing.length > 0) {
      add(
        'check-name-reported',
        false,
        `expected ${missing.join(', ')} but PR #${pr} only reported: ${
          reported.length > 0 ? reported.join(', ') : '(nothing)'
        } — ${missing.join(', ')} was never reported${
          // Only a blocking policy blocks. Azure reports required checks off a
          // Status policy that nothing queues a build for, and telling that
          // operator every pull request is blocked sends them after the wrong
          // half of the problem.
          policy?.blocking === true ? ', so the policy will block every pull request in this repository' : ''
        }`
      );
    } else if (required.length > 0) {
      add('check-name-reported', true, `required checks reported on PR #${pr}: ${required.join(', ')}`);
    } else {
      add(
        'check-name-reported',
        true,
        `no required check configured yet (advisory gate) — PR #${pr} reported: ${
          reported.length > 0 ? reported.join(', ') : '(nothing)'
        }`
      );
    }
  }

  // Three states, not two. `unsupported` is what both adapters report when
  // nothing was observed at all — GitHub omits security_and_analysis entirely
  // for a token without admin permission, and Azure returns 404 where Advanced
  // Security is unlicensed — so it is neither "enabled" nor "disabled", and
  // "security floor enabled" must never be printed on the strength of it. An
  // operator who asks whether the floor is on is told no when nothing was
  // observed. `--gate` has exactly one caller: platforms/azure/gate-template.yml,
  // whose "Redline gate" step runs as `$(System.AccessToken)` — the build
  // service identity, which is not a repository administrator and so is
  // routinely refused the Advanced Security enablement endpoint. Failing there
  // for what that identity structurally cannot see would block every pull
  // request in the repository, and a gate that always fails is a gate nobody
  // keeps, so the gate run is told what could not be checked without being
  // failed for it. (workflows/verify-onboarding.yml, the fleet re-verification
  // job, is `if: false` and still shells out to a deleted script — it invokes
  // this CLI nowhere.) A `denied` capability fails in both modes.
  const security = await platform.readSecurityState(ref);
  const off = security.outcomes.filter((o) => o.status === 'denied').map((o) => o.capability);
  const unobserved = security.outcomes
    .filter((o) => o.status === 'unsupported')
    .map((o) => o.capability);
  const unobservedDetail = `not confirmed: ${unobserved.join(
    ', '
  )} — not visible to this token, or not available on this repository`;
  add(
    'security-floor',
    off.length === 0 && (unobserved.length === 0 || opts.gate === true),
    off.length > 0
      ? `disabled: ${off.join(', ')}${unobserved.length > 0 ? `. ${unobservedDetail}` : ''}`
      : unobserved.length > 0
        ? unobservedDetail
        : 'security floor enabled'
  );

  // Read-only: render() runs in check mode, which reports staleness without
  // writing or touching the working tree.
  const manifest = loadManifest(opts.root);
  const stale = render({
    root: opts.root,
    profile: config.profile,
    out: opts.cwd,
    vendors: config.vendors,
    check: true,
  }).stale;
  // Two different things look identical to render(): a repository someone
  // edited by hand, and a repository the org has moved past. `render()` uses
  // the *installed* CLI's standards, so every publish of standards/** made
  // every onboarded repository stale at once — exit 1 everywhere, and a failed
  // Azure gate on every open pull request, for work only `redline init` can
  // do. The recorded standardsVersion is what tells them apart.
  const upstream = manifest.version !== config.standardsVersion;
  add(
    'artifacts-current',
    stale.length === 0 || upstream,
    stale.length === 0
      ? `rendered artifacts match standards v${manifest.version}`
      : upstream
        ? `standards updated upstream (v${config.standardsVersion} → v${manifest.version}) — re-run redline init to adopt: ${stale.join(', ')}`
        : `stale: ${stale.join(', ')}`
  );

  // The pull request template is the one thing `redline init` writes that
  // `verify` could not see, so a repository whose template was deleted, or
  // whose markers a human half-edited, or which grew an Azure branch template
  // after onboarding, all looked healthy right up until the next init.
  const templates = observePullRequestTemplates(platform.host, opts.cwd);
  const mangled = templates.filter((t) => t.state === 'mangled');
  const incomplete = templates.filter((t) => t.state === 'incomplete');
  const describe = (t: TemplateObservation): string => `${t.path}${t.branch ? ' (branch template)' : ''}`;
  add(
    'pull-request-template',
    templates.length > 0 && mangled.length === 0 && incomplete.length === 0,
    templates.length === 0
      ? 'no pull request template — every pull request opens with an empty body, which the gate ' +
          'fails for having no "## Launch readiness" section; run redline init to restore it'
      : mangled.length > 0
        ? `${mangled.map(describe).join(', ')} has a broken REDLINE:BEGIN/END marker pair — redline init ` +
          'refuses to write to it until a single pair is restored, so nothing here is being maintained'
        : incomplete.length > 0
          ? `${incomplete
              .map((t) => `${describe(t)} does not answer ${t.missing.join(' or ')}`)
              .join('; ')} — the gate fails a pull request opened from it; run redline init`
          : templates
              .map(
                (t) =>
                  `${describe(t)} — ${
                    t.state === 'managed'
                      ? 'maintained inside REDLINE markers'
                      : "answers the gate on its own, so it stays the repository's own file"
                  }`
              )
              .join('; ')
  );

  // pendingAdmin is a known, recorded state — not drift — so it gets its own
  // check rather than folding into artifacts-current or security-floor. A
  // capability that has since been granted is called out in the detail (so
  // the operator knows to re-run `redline init` and clear it), but the
  // finding still reports not-fully-onboarded while the record is stale.
  const observable = new Set(security.outcomes.map((o) => o.capability));
  const grantedSince = config.pendingAdmin.filter((capability) => {
    const current = security.outcomes.find((o) => o.capability === capability);
    return current !== undefined && (current.status === 'applied' || current.status === 'already');
  });
  // Only what a read can answer is work an administrator can be chased for.
  // Nothing reads back labels, review-ownership, repo-property, gate or
  // merge-policy, so a record of one is exactly as true as the day it was
  // written and no verify run will ever clear it — naming those in the same
  // breath as a capability observed to be off sent operators to check settings
  // that were already correct.
  const stillPending = config.pendingAdmin.filter(
    (capability) => observable.has(capability) && !grantedSince.includes(capability)
  );
  const unverifiable = config.pendingAdmin.filter((capability) => !observable.has(capability));
  const clauses = [
    stillPending.length > 0 ? `an administrator must still enable: ${stillPending.join(', ')}` : null,
    unverifiable.length > 0
      ? `recorded as pending; not verifiable with this token: ${unverifiable.join(', ')}`
      : null,
    grantedSince.length > 0
      ? `${grantedSince.join(', ')} now granted — rerun redline init to clear it from .redline.json`
      : null,
  ].filter((s): s is string => s !== null);
  add(
    'pending-admin',
    config.pendingAdmin.length === 0,
    config.pendingAdmin.length === 0
      ? 'nothing awaiting an administrator'
      : `partially onboarded — ${clauses.length > 0 ? clauses.join('. ') : 'nothing left outstanding'}`
  );

  return { findings, ok: findings.every((f) => f.ok) };
}
