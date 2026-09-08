import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRedlineError } from '../core/errors.ts';
import { createGit } from '../core/git.ts';
import {
  deselectedCapabilities,
  labelsCarriedByGate,
  readConfig,
  type RedlineConfig,
} from '../config/redline-json.ts';
import { loadManifest } from '../render/manifest.ts';
import { render } from '../render/standards.ts';
import { COMMAND_HOSTS, renderCommands } from '../render/commands.ts';
import { CONTEXTS } from '../render/contexts.ts';
import { LOCAL_HEADING, LOCAL_RULES_FILE, localSection, readLocalRules } from '../render/vendors.ts';
import {
  observePullRequestTemplates,
  type TemplateObservation,
} from '../platforms/pull-request-templates.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Platform,
  PolicySetting,
} from '../platforms/types.ts';

// Which way the two standards versions run. Neither direction is local drift —
// the repository is in the state its own `redline init` left it in — but the
// operator's next move differs, so the finding must not tell someone running a
// pinned older CLI to re-run init and render the repository backwards.
//
// Deliberately forgiving: `standardsVersion` is whatever some earlier CLI
// wrote, so a segment that will not parse compares as 0 rather than throwing,
// and versions that differ only outside the numbers (a prerelease or build
// suffix) are reported as the upstream direction — different, and still not
// local drift.
function versionOrder(installed: string, recorded: string): 'same' | 'newer' | 'older' {
  if (installed === recorded) return 'same';
  const parts = (version: string): number[] =>
    version.split('.').map((segment) => {
      const value = Number.parseInt(segment, 10);
      return Number.isNaN(value) ? 0 : value;
    });
  const left = parts(installed);
  const right = parts(recorded);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a > b ? 'newer' : 'older';
  }
  return 'newer';
}

// What `redline verify` says instead of a failure about a capability this
// repository declined at onboarding. It is neither a pass it did not earn nor
// the silence that would leave a reader unable to tell "off because we chose
// to" from "off because it broke".
const OFF_BY_CHOICE = 'off by choice';

export interface VerifyFinding {
  check: string;
  ok: boolean;
  detail: string;
  // A check that could not run at all, as opposed to one that ran and passed.
  // Only a remote verify produces these — some assertions genuinely need a
  // working tree — and the distinction is the whole reason the remote mode is
  // safe to schedule: a check reported as passing when it never executed is a
  // false all-clear across the estate, which is worse than no check.
  unknown?: boolean;
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
    add('onboarded', false, `no ${opts.cwd}/.redline.json — run: npx redlinegate init`);
    return { findings, ok: false };
  }
  add('onboarded', true, `profile ${config.profile}, standards v${config.standardsVersion}`);

  // Every remaining check reads from the host or the filesystem. A thrown
  // RedlineError('host', ...) from any platform call below is deliberately
  // left uncaught here: it must propagate out of verify() as a genuine host
  // failure (exit 4), never get reinterpreted as a capability finding. A
  // previous task's bug reported a host 404 as two "denied" capabilities,
  // filing false work against an administrator — that must not repeat here.

  // One finding for the whole selection, so the report describes the entire
  // surface rather than falling silent about the parts that were never
  // installed. Each finding a deselection governs says so again in its own
  // words below, where a reader looking for that capability will be.
  const optedOut = deselectedCapabilities(config.menu, config.capabilities);
  add(
    'capabilities',
    true,
    optedOut.length === 0
      ? 'every capability selected'
      : `${OFF_BY_CHOICE} at onboarding, so Redline neither installs nor checks them: ${optedOut.join(
          ', '
        )}${
          labelsCarriedByGate(config.capabilities)
            ? '. labels was not deselected: the gate install is what creates them, so a deselected ' +
              'gate takes them with it'
            : ''
        }`
  );

  const platform = await platformFor();
  const ref = await platform.repoRef(opts.cwd);

  // Read before the policy, because whether anything in this repository can
  // publish the Redline check is what decides whether a blocking policy is a
  // working gate or a repository-wide deadlock. Local: no host call.
  const machinery = platform.readGateMachinery(opts.cwd);
  const gateOwned = config.capabilities.gate;
  // A fact about the repository, not about who owns it: a gate file a
  // deselection stopped maintaining still fires on every pull request until
  // someone deletes it. Tying this to `gateOwned` made verify say the check was
  // published and unpublishable in two findings of the same report.
  const publishesExpected = machinery.present && machinery.publishes === machinery.expected;

  // Normally not read at all when the repository declined it: whatever policy
  // is on the host then belongs to a human, and every comparison below would
  // report their own configuration as Redline's drift. The exception is a
  // repository Redline itself gave a blocking policy to before the deselection
  // — that ruleset is still live, still requires the Redline check, and this is
  // the last place anyone finds out before a pull request hangs forever.
  const leftBlocking =
    !config.capabilities.mergePolicy &&
    config.menu.blockingGate &&
    !config.pendingAdmin.includes('merge-policy');
  const policy =
    config.capabilities.mergePolicy || leftBlocking ? await platform.readPolicy(ref) : null;
  // Redline applied it, Redline no longer maintains it, and it still requires
  // the Redline check. Two states, and they are not the same sentence: while
  // something still publishes that check nothing is blocked and this is a
  // hazard to name, and once nothing does, every pull request in the repository
  // is blocked forever and it is a failure.
  const leftBlockingPolicy = leftBlocking && policy !== null && policy.blocking;
  const orphanedBlocking = leftBlockingPolicy && !publishesExpected;

  // Every setting `redline init` applies, not just the blocking flag: an
  // administrator who turns off code-owner review or approvals leaves the gate
  // reporting green while the review requirements it was installed for are
  // gone. CONTRACT with cli/commands/init.ts's applyPolicy call: it applies
  // requiredApprovals 1, dismissStaleReviews true, requireCodeOwnerReview from
  // the menu and requireThreadResolution true. Those are literals there and
  // cannot be imported, so raising init's approval count without raising
  // MINIMUM_APPROVALS here would leave a repository sitting at the old count
  // reporting clean. Compared as a floor, not for equality: a team that
  // requires three approvals is stricter than the standard, and failing them
  // would fail their own gate on every pull request.
  const MINIMUM_APPROVALS = 1;
  const weakened: string[] = [];
  // Settings the host says it cannot attribute to Redline are reported and
  // never compared — see MergePolicy.unownedSettings.
  const unowned = policy?.unownedSettings ?? [];
  const owned = (setting: PolicySetting): boolean => !unowned.includes(setting);
  if (policy !== null) {
    // First, because they make every comparison below moot: a policy the host
    // says is not applying is a policy whose settings are readable and inert,
    // and a policy the host says nothing can satisfy is an outage whoever
    // configured what. `advisoryReason` was printed inside the detail of a
    // PASSING finding whose own words were "every pull request will sit
    // blocked" — Azure sets it in exactly one state (a blocking Status policy
    // with no Build Validation policy to queue the pipeline) and GitHub never
    // sets it, so failing on it cannot produce a false positive anywhere.
    if (policy.notEnforcedReason !== undefined) weakened.push(policy.notEnforcedReason);
    if (policy.advisoryReason !== undefined) weakened.push(policy.advisoryReason);
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
    if (owned('dismissStaleReviews') && !policy.dismissStaleReviews) {
      weakened.push(
        'approvals are no longer dismissed when new commits are pushed, so a review of code that is ' +
          'no longer in the pull request can carry the merge'
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
    config.capabilities.mergePolicy ? policy !== null && weakened.length === 0 : !orphanedBlocking,
    !config.capabilities.mergePolicy
      ? orphanedBlocking
        ? 'the merge policy Redline applied here is still blocking and still requires ' +
          `${machinery.expected}, which nothing in this repository publishes — every pull request ` +
          'is blocked until you relax or delete it on the host, or re-select the gate'
        : leftBlockingPolicy
          ? `${OFF_BY_CHOICE}, but the merge policy Redline applied here is still blocking and ` +
            `still requires ${machinery.expected} — only ${machinery.path} publishes that, and ` +
            'Redline no longer maintains it, so deleting it blocks every pull request'
          : `${OFF_BY_CHOICE} — this repository manages its own branch policy, so Redline applies none ` +
            'and compares none'
      : policy === null
        ? 'no Redline merge policy found on the host — if this is a repository that was refused ' +
          'admin rights at onboarding, a plain redline init treats that as settled and will not ' +
          'retry it: after an administrator grants the rights, run redline init --repair'
        : `${
          weakened.length === 0
              ? `policy is ${policy.blocking ? 'blocking' : 'advisory'} as configured, ${
                  policy.requiredApprovals
                } approval(s), code-owner review ${policy.requireCodeOwnerReview ? 'on' : 'off'}`
              : weakened.join('; ')
          }${unowned.length > 0 ? `; not compared here: ${unowned.join(', ')}` : ''}`
  );

  // The check-name comparison is the highest-value check in the product: an
  // unsatisfiable required-check name silently blocks every pull request.
  // It runs whenever the host has any pull request to inspect, independent
  // of whether the live policy currently lists required checks — an
  // advisory (non-blocking) gate has no required checks by design, but the
  // check name still needs confirming before anyone promotes it to blocking.
  // Read from the local checkout, not the host: the file `init` wrote is the
  // only evidence that separates "the gate has not run on this pull request
  // yet" — which is not drift, and used to fail healthy repositories daily —
  // from "the gate is gone or renamed", which is an outage nothing else in
  // this command observes. render() covers rendered standards artifacts only,
  // so before this the deletion was invisible.
  const requiredChecks = policy?.requiredChecks ?? [];
  // Three separate failures, and they need three different sentences. The
  // renamed case is not "the policy requires something else": telling an
  // operator whose job id is already correct to rename it back points them at
  // a fiction, and it was reachable — an advisory repository requires no
  // checks, so a rename there used to pass entirely.
  const renamed = machinery.publishes !== null && machinery.publishes !== machinery.expected;
  const policyMoved =
    machinery.publishes !== null &&
    !renamed &&
    requiredChecks.length > 0 &&
    !requiredChecks.includes(machinery.publishes);
  const machineryHealthy = machinery.present && machinery.publishes !== null && !renamed && !policyMoved;
  add(
    'gate-machinery',
    !gateOwned || machineryHealthy,
    !gateOwned
      ? machinery.present
        ? // The file is not deleted by a deselection — deleting a repository's
          // files is not Redline's to do — so saying Redline installs none here
          // would describe a state this repository is not in, and would invite
          // the operator to delete a workflow that is still running. Where a
          // blocking policy Redline left behind still needs it, this must not
          // invite that deletion at all: the merge-policy finding above says
          // the same deletion blocks every pull request.
          `${OFF_BY_CHOICE} — Redline no longer maintains a gate here, but ${machinery.path} from ` +
          `an earlier run is still present and still publishes ${machinery.publishes ?? machinery.expected}` +
          `${
            leftBlockingPolicy
              ? ', which the still-blocking merge policy needs — see the merge-policy finding'
              : '; it is yours to keep or delete'
          }`
        : `${OFF_BY_CHOICE} — this repository publishes its own merge gate, so Redline installs none ` +
          `at ${machinery.path}`
      : !machinery.present
        ? `${machinery.path} is not in this repository, so nothing will ever publish ${machinery.expected}` +
          `${requiredChecks.includes(machinery.expected) ? ' — which the policy requires' : ''}` +
          '; re-run redline init'
        : machinery.publishes === null
          ? `${machinery.path} no longer publishes ${machinery.expected} — the gate is not triggered by ` +
            'pull requests, or the part of the file that reports it has been edited; re-run redline init'
          : renamed
            ? `${machinery.path} publishes ${machinery.publishes} rather than ${machinery.expected}, so no ` +
              'policy requiring the Redline gate can ever be satisfied; rename it back or re-run redline init'
            : policyMoved
              ? `${machinery.path} publishes ${machinery.expected} as installed, but the policy requires ` +
                `${requiredChecks.join(', ')} — the policy no longer requires the Redline gate, so fix the ` +
                'policy rather than the workflow'
              : `${machinery.path} publishes ${machinery.publishes}`
  );

  // A mature repository reports twenty-five checks on a pull request, and
  // printing all of them put a single unreadable line in the middle of the
  // report — burying the findings either side of it. What the reader needs from
  // this list is the count and whether anything Redline-shaped is in it; the
  // rest is noise that a `gh pr checks` away.
  const CHECK_SAMPLE = 3;
  const summariseChecks = (names: readonly string[]): string => {
    if (names.length === 0) return '(nothing)';
    if (names.length <= CHECK_SAMPLE + 1) return names.join(', ');
    // Redline's own checks lead, because their presence or absence is the
    // question this finding exists to answer.
    const ordered = [
      ...names.filter((n) => n.toLowerCase().startsWith('redline')),
      ...names.filter((n) => !n.toLowerCase().startsWith('redline')),
    ];
    const shown = ordered.slice(0, CHECK_SAMPLE);
    return `${names.length} checks (${shown.join(', ')} and ${names.length - shown.length} more)`;
  };

  const pr = await platform.latestPullRequestNumber(ref);
  if (pr === null) {
    add('check-name-reported', true, 'no pull request yet — open one to confirm the check reports');
  } else {
    const reported = await platform.readReportedCheckNames(ref, pr);
    const required = requiredChecks;
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
    //
    // This path is only safe because the gate-machinery finding below fails
    // when nothing in the repository can publish the check at all. Soften one
    // without the other and a deleted or renamed gate reports green while
    // every pull request in the repository is blocked forever.
    const gateRan = reported.some((name) => name.toLowerCase().startsWith('redline'));
    if (required.length > 0 && missing.length > 0 && !gateRan) {
      add(
        'check-name-reported',
        true,
        machineryHealthy
          ? `no gate run observed yet on PR #${pr} — open or update a pull request to see the gate report ` +
            `(the policy requires ${required.join(', ')})`
          : `no Redline gate run has published anything on PR #${pr}'s head commit — see the ` +
            'gate-machinery finding for why'
      );
    } else if (required.length > 0 && missing.length > 0) {
      add(
        'check-name-reported',
        false,
        `expected ${missing.join(', ')} but PR #${pr} only reported: ${
          summariseChecks(reported)
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
        `${
          gateOwned && config.capabilities.mergePolicy
            ? 'no required check configured yet (advisory gate)'
            : // Only the two that decide whether a required check of Redline's
              // could exist at all. Naming the rest of the selection here would
              // point the reader at capabilities that have nothing to do with it.
              `no required check of Redline's — ${[
                ...(gateOwned ? [] : ['gate']),
                ...(config.capabilities.mergePolicy ? [] : ['merge-policy']),
              ].join(', ')} ${OFF_BY_CHOICE}`
        } — PR #${pr} reported: ${summariseChecks(reported)}`
      );
    }
  }

  // Four states, not two — `applied`/`already` are positive answers and
  // `denied` is a negative one; all three are definite. `unsupported` and
  // `unknown` are the two ways nothing was answered, and they are not the
  // same thing (Task 17). `unsupported` is ALSO definite — Advanced Security
  // is unlicensed on this Azure repository, so no administrator action ever
  // makes it appear, and it must never fail a plain `redline verify` the way
  // a real gap does. `unknown` is the indeterminate one — GitHub omits
  // security_and_analysis for a token without admin permission, and Azure's
  // enablement endpoint cannot tell "you cannot see this" apart from a
  // well-formed refusal — so "security floor enabled" must never be printed
  // on the strength of it either. `--gate` has exactly one caller:
  // platforms/azure/gate-template.yml, whose "Redline gate" step runs as
  // `$(System.AccessToken)` — the build service identity, which is not a
  // repository administrator and so is routinely refused the Advanced
  // Security enablement endpoint. Failing there for what that identity
  // structurally cannot see would block every pull request in the
  // repository, and a gate that always fails is a gate nobody keeps, so the
  // gate run is told what could not be checked without being failed for it.
  // (workflows/verify-onboarding.yml, the fleet re-verification job, is
  // `if: false` and still shells out to a deleted script — it invokes this
  // CLI nowhere.) A `denied` capability fails in both modes; an `unsupported`
  // one never fails either.
  const security = await platform.readSecurityState(ref);
  const off = security.outcomes.filter((o) => o.status === 'denied').map((o) => o.capability);
  const unlicensed = security.outcomes
    .filter((o) => o.status === 'unsupported')
    .map((o) => o.capability);
  const unobserved = security.outcomes
    .filter((o) => o.status === 'unknown')
    .map((o) => o.capability);
  const unlicensedDetail = `not available on this repository: ${unlicensed.join(', ')}`;
  const unobservedDetail = `not confirmed: ${unobserved.join(', ')} — not visible to this token`;
  add(
    'security-floor',
    off.length === 0 && (unobserved.length === 0 || opts.gate === true),
    [
      off.length > 0 ? `disabled: ${off.join(', ')}` : null,
      unobserved.length > 0 ? unobservedDetail : null,
      unlicensed.length > 0 ? unlicensedDetail : null,
    ]
      .filter((s): s is string => s !== null)
      .join('. ') || 'security floor enabled'
  );

  // Read-only: render() runs in check mode, which reports staleness without
  // writing or touching the working tree.
  const manifest = loadManifest(opts.root);
  const rendered = render({
    root: opts.root,
    profile: config.profile,
    out: opts.cwd,
    vendors: config.vendors,
    // The same context selection init rendered with. Without it every
    // repository that selected one read as stale against a render that had
    // dropped its section.
    contexts: CONTEXTS.filter((context) => config.menu[context.key]).map((context) => context.key),
    check: true,
  });
  const stale = rendered.stale;
  // A repository's own rules file is not something the repository can be
  // failing at: the artifacts trail it until the next render, which is work to
  // do. The excuse is bounded three ways, because an unbounded one is a drift
  // bypass in the oversight product itself — the local section is rendered into
  // four artifacts, and every other managed file (each
  // `.github/instructions/redline-*.instructions.md`, each per-stack
  // `.cursor/rules/redline-*.mdc`) can never carry it, so "some stale artifact
  // lacks the section" excused hand edits the local file had nothing to do
  // with. It has to be per-path, it has to cover the WHOLE stale set, and a
  // removal is never explained by a rules file at all.
  const local = readLocalRules(opts.cwd);
  const section = local === null ? null : localSection(local);
  const explainedByLocalRules = (relPath: string): boolean => {
    if (!rendered.localRuleFiles.includes(relPath)) return false;
    const path = join(opts.cwd, relPath);
    if (!existsSync(path)) return false; // a missing artifact is stale for its own reason
    const body = readFileSync(path, 'utf8');
    // With a rules file present: the artifact does not yet carry the section
    // this render would give it. With none: it still carries a section this
    // render would take away — and only when the last run recorded one, which
    // is what tells "had one and it went away" from a heading a human typed.
    return section === null ? config.localRules && body.includes(LOCAL_HEADING) : !body.includes(section);
  };
  const localStale =
    stale.length > 0 &&
    rendered.staleRemovals.length === 0 &&
    rendered.staleWritten.every(explainedByLocalRules);
  // Two different things look identical to render(): a repository someone
  // edited by hand, and a repository the org has moved past. `render()` uses
  // the *installed* CLI's standards, so every publish of standards/** made
  // every onboarded repository stale at once — exit 1 everywhere, and a failed
  // Azure gate on every open pull request, for work only `redline init` can
  // do. The recorded standardsVersion is what tells them apart.
  // Direction matters to the operator even though neither direction is drift:
  // a newer version is a release to adopt, an older one is a pinned CLI
  // rendering rules this repository has already moved past, and telling the
  // second operator to re-run init would render the repository backwards.
  const drift = versionOrder(manifest.version, config.standardsVersion);
  add(
    'artifacts-current',
    stale.length === 0 || drift !== 'same' || localStale,
    stale.length === 0
      ? `rendered artifacts match standards v${manifest.version}`
      : drift === 'newer'
        ? `standards updated upstream (v${config.standardsVersion} → v${manifest.version}) — re-run redline init to adopt: ${stale.join(', ')}`
        : drift === 'older'
          ? `this CLI renders standards v${manifest.version}, older than the v${config.standardsVersion} this repository recorded — update the CLI rather than re-running init here: ${stale.join(', ')}`
          : localStale
            ? `this repository's own ${LOCAL_RULES_FILE} has changed since the last render — re-run redline init to fold it in: ${stale.join(', ')}`
            : `stale: ${stale.join(', ')}`
  );

  // `redline init` writes CODEOWNERS and turns on code-owner review in the same
  // run, and until now nothing ever asked the host whether the owners it wrote
  // resolve. They do not on a personal account, which has no teams at all: the
  // seeded `@<owner>/platform-engineering` is an unknown owner on every line,
  // GitHub reports ten errors, and code-owner review becomes a requirement that
  // cannot be satisfied — on `.github/workflows/`, `.github/CODEOWNERS`,
  // `AGENTS.md` and `CLAUDE.md`, which is Redline's own enforcement surface.
  // The install reported `applied`, the host rejected it, and `verify` said ok.
  //
  // Only asserted while code-owner review is actually required. A repository
  // that deselected review-ownership, or turned the setting off deliberately,
  // is not failing at owners nothing consults.
  // The branch in hand, not the default one: on the onboarding pull request the
  // file exists only here, and this is the last moment the owners can be fixed
  // before the requirement they feed goes live.
  const codeownersProblems = await platform.readCodeownersProblems(ref, createGit(opts.cwd).currentBranch());
  const ownersEnforced = config.menu.sensitivePathReviewers && policy?.requireCodeOwnerReview === true;
  add(
    'review-ownership',
    !ownersEnforced || codeownersProblems === null || codeownersProblems.length === 0,
    codeownersProblems === null
      ? 'no CODEOWNERS on this host'
      : codeownersProblems.length === 0
        ? 'every owner in CODEOWNERS resolves'
        : `code-owner review is required but ${codeownersProblems.length} owner problem(s) make it unsatisfiable: ${codeownersProblems.join('; ')}`
  );

  // Slash-command files were the other thing `verify` could not see. `render()`
  // enumerates vendor artifacts only, so `.claude/commands/redline-*.md` and its
  // siblings sat outside the stale set entirely: an edit INSIDE their REDLINE
  // block — the block that says "do not edit inside this block" — left every
  // check reporting ok. These files are prompts an assistant executes on
  // request, which makes them the worst artifact class to leave unwatched.
  //
  // Compared by re-rendering, not against the `commandFiles` hash in
  // `.redline.json`. The hash answers a different question — it is `remove`'s
  // proof that a file with no block is still Redline's to delete — and it
  // covers whole-file bytes, so on a file Redline only merged into it would
  // fail the repository for the human content the merge exists to permit.
  // Re-rendering asks the question that matters at each path: a file Redline
  // owns whole is compared whole, because the next init rewrites it whole; a
  // file it merged into is compared on its block alone.
  const orgVendors = Object.entries(manifest.vendors)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k);
  const commandDrift = renderCommands({
    root: opts.root,
    out: opts.cwd,
    hosts: config.vendors.flatMap((v) => (orgVendors.includes(v) && v in COMMAND_HOSTS ? [v] : [])),
    check: true,
    known: config.commandFiles,
  });
  const commandStale = [...commandDrift.written, ...commandDrift.removed];
  add(
    'commands-current',
    commandStale.length === 0 || drift !== 'same',
    commandStale.length === 0
      ? 'slash commands match what this CLI renders'
      : drift === 'same'
        ? `edited since Redline wrote them — re-run redline init to restore: ${commandStale.join(', ')}`
        : `standards v${config.standardsVersion} recorded against a CLI rendering v${manifest.version} — re-run redline init: ${commandStale.join(', ')}`
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
    !gateOwned || (templates.length > 0 && mangled.length === 0 && incomplete.length === 0),
    !gateOwned
      ? `${OFF_BY_CHOICE} — the pull request template is part of the merge gate this repository declined`
      : templates.length === 0
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
  // check rather than folding into artifacts-current or security-floor. Every
  // entry records one thing: `redline init` attempted a write and the host
  // refused it. Nothing read here can clear that, so every clause below points
  // at `redline init --repair`, the only run that retries a write a settled
  // repository would otherwise never attempt again.
  //
  // Only a read that answered can produce work for an administrator, and the
  // same rule the security-floor finding runs on applies here — but the two
  // unanswered statuses need different advice, not just different wording.
  // `unsupported` is definite: Advanced Security is not licensed here, so no
  // administrator action would ever clear it. `unknown` is indeterminate: the
  // token could not see the setting, and an administrator enabling it is
  // exactly what clears it. Giving `unknown` the `unsupported` advice had this
  // finding telling the operator nothing would help while security-floor, on
  // the same repository, told them to retry with a token that can see it.
  const statusOf = (capability: AdminCapability): CapabilityOutcome['status'] | null =>
    security.outcomes.find((o) => o.capability === capability)?.status ?? null;
  const withStatus = (...statuses: CapabilityOutcome['status'][]): AdminCapability[] =>
    config.pendingAdmin.filter((capability) => {
      const status = statusOf(capability);
      return status !== null && statuses.includes(status);
    });
  const grantedSince = withStatus('applied', 'already');
  const stillPending = withStatus('denied');
  // Observed, and the answer was definite: "not here to enable".
  const unavailable = withStatus('unsupported');
  // Observed, and nothing was learned.
  const invisible = withStatus('unknown');
  // Never read back at all: labels, review-ownership, repo-property, gate and
  // merge-policy have no read side, so a record of one is exactly as true as
  // the day it was written and no verify run will ever clear it.
  const unverifiable = config.pendingAdmin.filter((capability) => statusOf(capability) === null);
  const clauses = [
    stillPending.length > 0 ? `an administrator must still enable: ${stillPending.join(', ')}` : null,
    unavailable.length > 0
      ? `recorded as pending, but not available on this repository, so no administrator action ` +
        `would clear it: ${unavailable.join(', ')}`
      : null,
    invisible.length > 0
      ? `recorded as pending and not visible to this token: ${invisible.join(', ')} — an ` +
        `administrator enabling it is what clears this, so re-read with a token that can see the ` +
        `setting, then run redline init --repair`
      : null,
    unverifiable.length > 0
      ? `recorded as pending; not verifiable with this token: ${unverifiable.join(', ')} — after an ` +
        `administrator grants access, a plain redline init will not recheck these; run redline init --repair`
      : null,
    grantedSince.length > 0
      ? `${grantedSince.join(', ')} now granted on the host, but the record is of a refused write and ` +
        `no read clears it — run redline init --repair to retry the write`
      : null,
  ].filter((s): s is string => s !== null);
  add(
    'pending-admin',
    // The security-floor shape, for the same reason: `--gate` has one caller,
    // the Azure gate template, running as a build service identity that cannot
    // enable anything. Failing every pull request forever over a record only
    // `redline init` can clear is a gate nobody keeps. An operator who asks
    // whether onboarding finished is still told no, in both directions.
    opts.gate === true ? stillPending.length === 0 : config.pendingAdmin.length === 0,
    config.pendingAdmin.length === 0
      ? 'nothing awaiting an administrator'
      : `partially onboarded — ${clauses.length > 0 ? clauses.join('. ') : 'nothing left outstanding'}`
  );

  return { findings, ok: findings.every((f) => f.ok) };
}
