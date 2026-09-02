import { isRedlineError } from '../core/errors.ts';
import { readConfig, type RedlineConfig } from '../config/redline-json.ts';
import { loadManifest } from '../render/manifest.ts';
import { render } from '../render/standards.ts';
import type { Platform } from '../platforms/types.ts';

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

  add(
    'merge-policy',
    policy !== null && policy.blocking === config.menu.blockingGate,
    policy === null
      ? 'no Redline merge policy found on the host'
      : `policy is ${policy.blocking ? 'blocking' : 'advisory'}, config says ${
          config.menu.blockingGate ? 'blocking' : 'advisory'
        }${policy.advisoryReason ? ` — ${policy.advisoryReason}` : ''}`
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
    if (required.length > 0 && missing.length > 0) {
      add(
        'check-name-reported',
        false,
        `expected ${missing.join(', ')} but PR #${pr} only reported: ${
          reported.length > 0 ? reported.join(', ') : '(nothing)'
        } — ${missing.join(', ')} was never reported, so the policy will block every pull request in this repository`
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

  // unsupported (e.g. Advanced Security unlicensed on this Azure repository)
  // is never a failure — only an outright denial counts against the floor.
  const security = await platform.readSecurityState(ref);
  const off = security.outcomes.filter((o) => o.status === 'denied').map((o) => o.capability);
  add(
    'security-floor',
    off.length === 0,
    off.length === 0 ? 'security floor enabled' : `disabled: ${off.join(', ')}`
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
  add(
    'artifacts-current',
    stale.length === 0,
    stale.length === 0
      ? `rendered artifacts match standards v${manifest.version}`
      : `stale: ${stale.join(', ')}`
  );

  // pendingAdmin is a known, recorded state — not drift — so it gets its own
  // check rather than folding into artifacts-current or security-floor. A
  // capability that has since been granted is called out in the detail (so
  // the operator knows to re-run `redline init` and clear it), but the
  // finding still reports not-fully-onboarded while the record is stale.
  const grantedSince = config.pendingAdmin.filter((capability) => {
    const current = security.outcomes.find((o) => o.capability === capability);
    return current !== undefined && (current.status === 'applied' || current.status === 'already');
  });
  const stillPending = config.pendingAdmin.filter((capability) => !grantedSince.includes(capability));
  add(
    'pending-admin',
    config.pendingAdmin.length === 0,
    config.pendingAdmin.length === 0
      ? 'nothing awaiting an administrator'
      : [
          stillPending.length > 0
            ? `partially onboarded — an administrator must still enable: ${stillPending.join(', ')}`
            : 'partially onboarded — nothing left outstanding',
          grantedSince.length > 0
            ? `${grantedSince.join(', ')} now granted — rerun redline init to clear it from .redline.json`
            : null,
        ]
          .filter((s): s is string => s !== null)
          .join('. ')
  );

  return { findings, ok: findings.every((f) => f.ok) };
}
