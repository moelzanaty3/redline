import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isRedlineError, RedlineError } from '../core/errors.ts';
import { CLI_VERSION } from '../core/version.ts';
import { canPromote, type Evidence, type Rung } from '../enforce/ladder.ts';
import {
  CAPABILITY_KEYS,
  MENU_DEFAULTS,
  CONFIG_FILE,
  MENU_KEYS,
  deselectedCapabilities,
  labelsCarriedByGate,
  readConfig,
  writeConfig,
  type CapabilitySelections,
  type MenuSelections,
} from '../config/redline-json.ts';
import { proposeProfile } from '../detect/stack.ts';
import { scanRepo } from '../detect/scan.ts';
import { loadManifest } from '../render/manifest.ts';
import { resolveProfile } from '../render/profile.ts';
import { render } from '../render/standards.ts';
import { renderCommands, COMMAND_HOSTS } from '../render/commands.ts';
import { CONTEXTS, detectSpecKit } from '../render/contexts.ts';
import { LOCAL_RULES_FILE } from '../render/vendors.ts';
import { isPending } from '../platforms/types.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  GateMachinery,
  GateOptions,
  OwnershipRule,
  Platform,
  PullRequestRef,
} from '../platforms/types.ts';

// What a repository gets when it says nothing. Every default here has to be
// safe on a repository nobody has looked at, because that is the one the
// command is usually run on.
// Re-exported from the config module, which owns them so the parser can fill a
// key a repository was onboarded before. See MENU_DEFAULTS there for what each
// default is and why.
export const DEFAULT_MENU: MenuSelections = MENU_DEFAULTS;

// Named once so the label FLOOR_GATE soft-fails on and the label
// openPullRequest applies below share one literal instead of two that could
// drift apart, and so web/components/journey.tsx's hardcoded SYNC_LABEL can
// be pinned against the real source (cli/render/__tests__/vendors.test.ts).
export const SYNC_LABEL = 'redline-sync';

export const DEFAULT_CAPABILITIES: CapabilitySelections = {
  gate: true,
  mergePolicy: true,
  labels: true,
};

export const FLOOR_GATE: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt', SYNC_LABEL],
};

// Mirrors templates/CODEOWNERS. Two things are load-bearing here.
//
// The owner is org-scoped: GitHub reads a bare `@platform-engineering` as a
// *user*, and a user that does not exist makes GitHub mark the whole
// CODEOWNERS file erroneous — at which point `require_code_owner_review`
// degrades to the silent no-op this file exists to prevent. A team must be
// written `@org/team`.
//
// The rendered standards are owned too. Without them a contributor can edit
// AGENTS.md, CLAUDE.md or the Copilot instructions — the rules their own pull
// request is reviewed against — and self-merge the weakening.
//
// There is deliberately no `*` default-owner line, which templates/CODEOWNERS
// carries as an `@<org>/<owning-team>` placeholder: the CLI cannot know a
// repository's owning team, and naming the platform team there would make it
// a required reviewer on every file in every onboarded repository. The
// ruleset already requires one approval on every pull request.
export const SENSITIVE_PATHS = [
  '/.github/workflows/',
  '/.github/CODEOWNERS',
  '/.github/copilot-instructions.md',
  '/.github/instructions/',
  '/.github/dependabot.yml',
  '/AGENTS.md',
  '/CLAUDE.md',
  '/infra/',
  '/terraform/',
  'Dockerfile',
] as const;

export const OWNING_TEAM = 'platform-engineering';

// Accessibility rules only exist for the stacks that render a user interface,
// so recording `accessibility: true` on a Terraform or Go repository files a
// commitment against rules that will never be rendered there.
const ACCESSIBILITY_STACKS = ['react', 'react-native', 'kotlin', 'swift'];

// The 2.1 artifact that identifies a repository onboarded by the previous
// generation. It is NOT in the removal list below: v3's GitHub adapter writes
// the same path, so removing it would delete the gate this run just installed
// — and for the same reason its presence alone does not prove a 2.1
// repository. A v3 repository whose .redline.json was deleted has this file
// too, and mistaking it for 2.1 would run the removals below against it.
const LEGACY_MARKER = '.github/workflows/redline.yml';
// What v3's own caller workflow contains and 2.1's shell rollout could not:
// the reusable-workflow reference that templates/redline.yml installs.
const V3_CALLER = /\.github\/workflows\/redline-gate\.yml@/;

// Everything 2.1 left behind that v3 does not write. Rendered vendor artifacts
// (`.github/instructions/redline-*.instructions.md`, `.cursor/rules/redline-*.mdc`)
// are not here: render() already prunes those as stale.
const LEGACY_PATHS = ['.github/workflows/redline-sync.yml'];
const LEGACY_SCRIPT = /^redline-.*\.sh$/;
// `scripts/redline-*.sh` is a glob, not a path, and a repository that adopted
// Redline is exactly the kind that has a hand-written `scripts/redline-deploy.sh`.
// The brownfield rule applies to files as much as to host objects: what carries
// no Redline marker belongs to a human and is never deleted.
const REDLINE_OWNED = /(?:managed|generated|installed) by redline|REDLINE:BEGIN/i;

export function sensitivePathRules(org: string): OwnershipRule[] {
  return SENSITIVE_PATHS.map((pattern) => ({ pattern, owners: [`@${org}/${OWNING_TEAM}`] }));
}

export const ONBOARD_BRANCH = 'redline/onboard';

// Local and free — both adapters read the checkout and nothing else — but the
// path it reads is whatever is on disk by now, and with the gate deselected
// `installGate` no longer runs first to meet an unreadable one. Everything it
// feeds here is advisory output, so a path that cannot be read costs the notes
// and never the run.
function observeGateMachinery(platform: Platform, cwd: string): GateMachinery | null {
  try {
    return platform.readGateMachinery(cwd);
  } catch {
    return null;
  }
}

// Every other pipeline definition sitting where this host keeps them. Cheap
// (one readdir) and unambiguous as a statement — it says what is there and
// nothing about what it does, which is the operator's to know.
function otherPipelines(cwd: string, machineryPath: string): string[] {
  const slash = machineryPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : machineryPath.slice(0, slash);
  const abs = join(cwd, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => (dir === '' ? file : `${dir}/${file}`))
    .filter((relPath) => relPath !== machineryPath);
}

// Deleted, not just unwritten: a 2.1 sync workflow left in place keeps running
// against a repository that has moved to v3. The deletions ride out in the
// same pull request as the rest of the migration.
function removeLegacyArtifacts(cwd: string, dryRun: boolean): string[] {
  const removed: string[] = [];
  const remove = (relPath: string): void => {
    if (!existsSync(join(cwd, relPath))) return;
    if (!dryRun) rmSync(join(cwd, relPath));
    removed.push(relPath);
  };
  // Exact paths only: `.github/workflows/redline-sync.yml` is a Redline-named
  // workflow at a Redline-owned path, not something a human names by accident.
  for (const relPath of LEGACY_PATHS) remove(relPath);
  if (existsSync(join(cwd, 'scripts'))) {
    for (const file of readdirSync(join(cwd, 'scripts'))) {
      if (!LEGACY_SCRIPT.test(file)) continue;
      if (!REDLINE_OWNED.test(readFileSync(join(cwd, 'scripts', file), 'utf8'))) continue;
      remove(`scripts/${file}`);
    }
  }
  return removed;
}

// A 2.1 repository has the caller workflow and no .redline.json. A v3
// repository whose config was deleted has the caller workflow too — telling
// them apart is what stops the removals above running on a repository that
// never saw 2.1.
function detectMigration(cwd: string, onboarded: boolean): string | null {
  if (onboarded) return null;
  const caller = join(cwd, LEGACY_MARKER);
  if (!existsSync(caller)) return null;
  return V3_CALLER.test(readFileSync(caller, 'utf8')) ? null : '2.1';
}

// Detect-before-ask: a repository's existing tooling files pick the default
// vendor selection, so a Copilot-only team is not handed AGENTS.md and
// CLAUDE.md on day one. Only used when nothing else has decided already — see
// the precedence comment on `vendors` in init() below.
const VENDOR_MARKERS: { vendor: string; paths: string[] }[] = [
  { vendor: 'copilot', paths: ['.github/copilot-instructions.md', '.github/instructions'] },
  { vendor: 'claude', paths: ['CLAUDE.md', '.claude'] },
  { vendor: 'agents', paths: ['AGENTS.md'] },
  { vendor: 'cursor', paths: ['.cursor/rules'] },
];

// A repository with none of these markers gets `orgDefault` (every
// org-enabled vendor) rather than an empty selection — that is the greenfield
// case the standard is written for, not a repository that opted out of all of
// them.
function detectVendors(cwd: string, orgDefault: string[]): string[] {
  const found = VENDOR_MARKERS.filter((marker) =>
    marker.paths.some((relPath) => existsSync(join(cwd, relPath)))
  ).map((marker) => marker.vendor);
  return found.length > 0 ? found : orgDefault;
}

export interface InitOptions {
  cwd: string;
  root: string;
  profile?: string;
  vendors?: string[];
  // Only the selections the caller actually asked for. Anything absent falls
  // back to what the repository already chose — see the menu precedence below.
  menu?: Partial<MenuSelections>;
  // Same precedence, same reason: a capability the caller did not name keeps
  // whatever `.redline.json` recorded for it.
  capabilities?: Partial<CapabilitySelections>;
  dryRun?: boolean;
  // Bypasses the alreadyOnboarded short-circuit so every capability is
  // re-applied and pendingAdmin is recomputed from the fresh outcomes,
  // instead of carried over from .redline.json. It exists for the
  // capabilities nothing reads back — labels, review-ownership,
  // repo-property, gate and merge-policy's own null branch — whose recorded
  // pendingAdmin entry a plain re-run can otherwise never clear even after an
  // administrator grants the rights. It is NOT `rm .redline.json`: onboardedAt,
  // the recorded menu and migratedFrom are untouched (see their own fields
  // below), because this still reads the existing config rather than starting
  // from nothing.
  repair?: boolean;
  // `--adopt-caller`. Hands the host's gate machinery path to Redline when the
  // file already there carries nothing that attributes it to Redline — a 2.1
  // caller, in practice. It is a flag rather than a guess because guessing is
  // what overwrote a repository's own workflow.
  adoptCaller?: boolean;
  // `--rung <name>`. Same precedence as the menu: absent keeps whatever the
  // repository already recorded. A promotion is refused unless the evidence
  // supports it; a demotion is always allowed, because the safe direction must
  // never need permission.
  rung?: Rung;
  // Evidence for a promotion, read from collected telemetry by the caller. Absent
  // means none was supplied, which is not the same as evidence that failed — a
  // promotion asked for without it is refused and says so.
  evidence?: Evidence;
  // A market may raise a repository's minimum rung. It may not push one below
  // the rung it has already reached.
  marketFloor?: Rung;
  now?: () => Date;
}

export interface InitReport {
  profile: string;
  // Everything the pull request has to stage, writes and deletions together.
  files: string[];
  // The subset of `files` that are deletions — pruned vendor artifacts and 2.1
  // leftovers. Printing a deletion as a write is how the dry-run plan lied.
  removals: string[];
  outcomes: CapabilityOutcome[];
  pendingAdmin: AdminCapability[];
  pullRequest: PullRequestRef | null;
  // Set when the host mutations succeeded but the pull request could not be
  // opened. The work is real and recorded; only the review vehicle is missing,
  // which is a `failed` (exit 1), not a host outage.
  pullRequestError: string | null;
  migratedFrom: string | null;
  alreadyOnboarded: boolean;
  dryRun: boolean;
  // The menu this run resolved, and the host settings it would change. Both
  // exist so `--dry-run` can print a plan the operator can act on.
  menu: MenuSelections;
  capabilities: CapabilitySelections;
  // Operator-facing names of what this repository declined. Reported on every
  // path, including the settled one, so the output describes the whole surface
  // rather than falling silent about the parts that were never attempted.
  optedOut: string[];
  // What the run observed and thought the operator should know, without acting
  // on it. Detection informs; it does not decide.
  notes: string[];
  hostPlan: string[];
}

// `pendingAdmin` records one fact and one only: a WRITE this run attempted was
// refused. Every entry is produced by `outcomes.filter(isPending)` further
// down, off what the four install calls returned. No read revises it, in either
// direction, for any capability — not `labels`, `review-ownership`,
// `repo-property` or `gate` (which have no read side at all), not
// `merge-policy` (whose `readPolicy` answers "a ruleset with Redline's name
// exists", never "this token may write one" — on GitHub those split exactly
// along GET /rulesets versus PUT /rulesets/{id}), and not the three security
// capabilities either.
//
// The security three look reconcilable and are not. `readSecurityState`
// answers "is the setting on?"; the record answers "was this token allowed to
// set it?". A fine-grained GitHub token with `administration: read` reads
// GET /vulnerability-alerts as 204 while PUT /automated-security-fixes answers
// 403; an Azure PAT with `vso.advsec` but no Project Administrator role reads
// `advSecEnabled: true` while the PATCH is refused, for all three at once.
// Letting the read clear or create an entry made the settled path disagree
// with what the apply path would record, so the two answers chased each other:
// the read cleared the entry, the refused write re-recorded it, and every run
// re-applied four host mutations and pushed another commit onto the onboarding
// pull request, exiting 0 throughout.
//
// The accepted cost of the uniform rule: a recorded entry survives even after
// an administrator grants the rights, because nothing re-applies and nothing
// reads write-permission back. `redline init --repair` is the sanctioned way
// out — it is what `redline verify`'s pending-admin finding points at — and
// the already-onboarded output qualifies the list as recorded at the last run.

export async function init(platform: Platform, opts: InitOptions): Promise<InitReport> {
  const { cwd, root } = opts;
  const dryRun = opts.dryRun === true;
  const repair = opts.repair === true;
  const manifest = loadManifest(root);
  const now = opts.now ?? (() => new Date());

  // Profile resolution happens before any host call or write: a bad --profile
  // flag must fail clean, with nothing on disk and nothing sent to the host.
  const detected = opts.profile ?? proposeProfile(scanRepo(cwd)).profile;
  const { profile, stacks } = resolveProfile(manifest, detected);

  const existing = readConfig(cwd);
  const migratedFrom = detectMigration(cwd, existing !== null);

  // DEFAULT_MENU <- what this repository already chose <- the flags the caller
  // actually typed. Rebuilding the menu from flag defaults alone demoted a
  // `--blocking` repository back to advisory on the next plain `redline init`
  // — and did it before the no-op check, so even a run with nothing to commit
  // rewrote the live ruleset while .redline.json still claimed blocking.
  const menu: MenuSelections = {
    ...DEFAULT_MENU,
    accessibility: stacks.some((stack) => ACCESSIBILITY_STACKS.includes(stack)),
    ...existing?.menu,
    ...opts.menu,
  };

  // DEFAULT_CAPABILITIES <- what this repository already chose <- what the
  // caller typed, the same precedence the menu resolves under.
  const capabilities: CapabilitySelections = {
    ...DEFAULT_CAPABILITIES,
    ...existing?.capabilities,
    ...opts.capabilities,
  };

  // The rung, resolved before anything is written. A run that says nothing about
  // enforcement keeps what the repository already had: a re-run for an unrelated
  // reason silently promoting a repository is how a ladder loses the trust it
  // exists to build.
  const currentRung: Rung = existing?.rung ?? 'observe';
  const rungNotes: string[] = [];
  let rung = currentRung;
  if (opts.rung !== undefined && opts.rung !== currentRung) {
    const check = canPromote(
      currentRung,
      opts.rung,
      opts.evidence ?? { seedRecall: null, actedOnRate: null, sampleSize: 0, falsePositives: null },
      opts.marketFloor ?? 'observe'
    );
    if (check.eligible) {
      rung = opts.rung;
      rungNotes.push(`enforcement: ${currentRung} -> ${rung}`);
    } else {
      // Refused, and the run continues. Everything else this command does is
      // still worth doing, and failing the whole onboarding over a rung the
      // repository cannot reach yet would teach people to stop asking.
      rungNotes.push(`enforcement stays at ${currentRung} — cannot move to ${opts.rung}:`);
      for (const blocker of check.blockers) rungNotes.push(`  ${blocker}`);
    }
  }

  // Refused before a host is contacted or a byte is written, because the state
  // it describes cannot be recovered from by re-running: with no gate
  // machinery nothing in the repository publishes the required check, and a
  // blocking policy that requires a check nothing publishes blocks every pull
  // request in the repository forever. A repository that runs its own gate
  // wants its own branch policy too — `--skip gate --skip merge-policy` — or
  // an advisory Redline policy alongside it.
  if (!capabilities.gate && capabilities.mergePolicy && menu.blockingGate) {
    throw new RedlineError(
      'usage',
      'the merge gate is deselected, so nothing in this repository publishes the check a blocking ' +
        'policy would require — every pull request would be blocked',
      'either keep the gate, or add --skip merge-policy so this repository keeps its own branch policy'
    );
  }

  // A dry run must work offline and with an unscoped token: repoRef() is a
  // live GET, so the plan is built from what the local clone already knows.
  const ref = dryRun ? platform.localRef(cwd) : await platform.repoRef(cwd);
  // detected <- what this repository already recorded <- what the caller
  // typed, the same precedence the menu resolves under. The org ceiling is
  // deliberately not applied to the RECORD: render() enforces it on every call
  // it makes (including verify's), so a recorded selection can outlive an
  // org-side disablement without this function needing to track that.
  const orgVendors = Object.entries(manifest.vendors)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k);
  const vendors = opts.vendors ?? existing?.vendors ?? detectVendors(cwd, orgVendors);

  const gateOptions: GateOptions = {
    ...FLOOR_GATE,
    ...(menu.adrForLargeDiffs ? {} : { adrDiffThreshold: Number.MAX_SAFE_INTEGER }),
    ...(opts.adoptCaller === true ? { adoptCaller: true } : {}),
    ...(capabilities.labels ? {} : { manageLabels: false }),
    // Written into the caller workflow, so the gate blocks or reports according
    // to the rung recorded here rather than needing a second source of truth.
    rung,
  };
  const ownershipRules = sensitivePathRules(ref.org);

  // The gate and ownership file diffs are computed in check mode FIRST, before
  // a single host setting is touched. Without it there was no way to know a
  // re-run had nothing to do until four host objects had already been
  // rewritten — and the answer itself was wrong, because alreadyOnboarded read
  // only the rendered files and never these two.
  //
  // It also runs before the first byte reaches the working tree. `installGate`
  // refuses rather than clobber a gate machinery file it cannot attribute to
  // Redline, and its message says nothing was written; planning after the
  // render made that untrue, leaving every vendor artifact and command file on
  // disk with no .redline.json, no branch and no pull request to carry them.
  const gatePlan = capabilities.gate
    ? await platform.installGate(ref, cwd, gateOptions, true)
    : { files: [], outcomes: [] };

  const ownershipPlan = menu.sensitivePathReviewers
    ? await platform.ensureReviewOwnership(ref, cwd, ownershipRules, true)
    : { files: [], outcomes: [] };

  // Everything this run observed and thinks the operator should know, without
  // acting on any of it. Detection informs; it does not decide.
  const machinery = observeGateMachinery(platform, cwd);
  const notes: string[] = [...rungNotes];

  // Detection, not a decision. `readGateMachinery` is local and free, and what
  // it gives that nothing else here has is the path this host runs its gate
  // from — so the only claim made is what else is already sitting in that
  // directory. It is offered while Redline's own gate is still absent and
  // never after, because a repository that already has it has answered the
  // question.
  const alreadyWired =
    capabilities.gate && machinery !== null && !machinery.present
      ? otherPipelines(cwd, machinery.path)
      : [];
  if (alreadyWired.length > 0) {
    notes.push(
      `this repository already has ${alreadyWired.join(', ')} — if one of them is already your ` +
        'merge gate, re-run with --skip gate and Redline will leave it in charge rather than ' +
        'writing a second one beside it'
    );
  }

  // Deselecting the gate does not delete the workflow an earlier run installed
  // — deleting a repository's files is not Redline's to do — so it is still
  // there and still firing on every pull request. Saying only "opted out: gate"
  // beside a running gate describes a state this repository is not in, and
  // invites the operator to go and delete it by hand.
  if (!capabilities.gate && machinery !== null && machinery.present) {
    notes.push(
      `${machinery.path} from an earlier run is still in this repository and still publishes ` +
        `${machinery.expected} — Redline no longer maintains it; it is yours to keep or delete`
    );
  }

  // The other half of the deadlock guard, and the half a refusal cannot cover:
  // the guard only sees a blocking policy this run would apply, so deselecting
  // the merge policy walks straight past it and leaves a Redline ruleset
  // blocking on a check that, with the gate deselected too, nothing will ever
  // publish. The policy is the repository's now, so this is not a refusal — but
  // it is the last place anyone hears about it before a pull request hangs.
  if (
    !capabilities.mergePolicy &&
    menu.blockingGate &&
    existing !== null &&
    !existing.pendingAdmin.includes('merge-policy')
  ) {
    notes.push(
      'the merge policy Redline applied here is blocking and is no longer maintained by Redline — ' +
        'it still requires the Redline gate check, so relax or delete it on the host unless ' +
        'something in this repository still publishes that check'
    );
  }

  if (labelsCarriedByGate(capabilities)) {
    notes.push(
      "labels are created by the gate install, so a deselected gate takes Redline's labels with " +
        'it — the selection recorded in .redline.json is unchanged, and re-selecting the gate ' +
        'brings them back'
    );
  }

  // Spec Kit is a separate tool that scaffolds its own files and carries its own
  // account of how the repository works. Where it is already installed, Redline
  // drops its section rather than adding a second one beside it — and says so,
  // because a context silently missing from the artifacts is indistinguishable
  // from one that was never asked for.
  const specKitAt = detectSpecKit(cwd);
  if (specKitAt !== null && menu.speckit) {
    menu.speckit = false;
    notes.push(
      `this repository already runs Spec Kit (${specKitAt}), so Redline left the spec-driven ` +
        'development context out rather than writing a second account of it beside the one Spec ' +
        'Kit maintains — pass --speckit to include it anyway'
    );
  }

  const contexts = CONTEXTS.filter((context) => menu[context.key]).map((context) => context.key);

  // Files next, host settings after: a denied host call must never cost the
  // file-level work that already succeeded.
  const rendered = render({ root, profile, out: cwd, vendors, contexts, check: dryRun });
  // The ceiling render() applies internally, applied here too. renderCommands
  // cannot enforce it for itself: COMMAND_HOSTS carries hosts the vendor
  // manifest has no entry for at all (opencode), which is not the same thing
  // as a vendor the org switched off. Without this, `redline init --vendors
  // copilot,cursor` skipped .cursor/rules/ and still wrote .cursor/commands/,
  // delivering half of a vendor the org had disabled.
  const commands = renderCommands({
    root,
    out: cwd,
    hosts: vendors.flatMap((v) => (orgVendors.includes(v) && v in COMMAND_HOSTS ? [v] : [])),
    check: dryRun,
    known: existing?.commandFiles ?? {},
  });
  const legacyRemovals = migratedFrom === '2.1' ? removeLegacyArtifacts(cwd, dryRun) : [];

  // render() prunes stale vendor files with rmSync; those deletions must ride
  // along in the same file list as the writes, or the PR never reflects them.
  const removals = [
    ...(dryRun ? rendered.staleRemovals : rendered.removed),
    ...commands.removed,
    ...legacyRemovals,
  ];
  const changedFiles = [
    ...(dryRun ? rendered.staleWritten : rendered.written),
    ...removals,
    ...commands.written,
    ...gatePlan.files,
    ...ownershipPlan.files,
  ];
  // A menu change moves no file of its own (the gate template already diffs
  // adrForLargeDiffs), but it is exactly what `redline init --blocking` on a
  // settled repository is for: swallowing it as "nothing to change" would drop
  // the promotion silently.
  const menuChanged = existing !== null && MENU_KEYS.some((key) => existing.menu[key] !== menu[key]);
  // Same shape as menuChanged: a vendor deselect that has nothing left on
  // disk to remove (the file was already gone) moves no file of its own, and
  // swallowing it as "nothing to change" would leave .redline.json recording
  // a selection this run was explicitly told to drop.
  const vendorsChanged =
    existing !== null &&
    (existing.vendors.length !== vendors.length ||
      // `\0` as the escape, never a literal NUL byte. The byte itself made this
      // file read as binary to grep and ripgrep, which then skipped it silently:
      // a repository-wide search for any symbol in the largest command module
      // returned nothing and reported no error.
      [...existing.vendors].sort().join('\0') !== [...vendors].sort().join('\0'));

  // Same shape again: deselecting a capability moves no file of its own, and
  // swallowing it as "nothing to change" would leave .redline.json recording a
  // capability the operator just switched off — with Redline still maintaining it.
  const capabilitiesChanged =
    existing !== null &&
    CAPABILITY_KEYS.some((key) => existing.capabilities[key] !== capabilities[key]);

  // "Zero host calls on a settled repository" means zero host *mutations*.
  // Reading is how the run finds out whether the repository is settled at all:
  // without it, an operator who loosened the ruleset by hand got "already
  // onboarded — nothing to change" from `redline init` AND from
  // `redline init --blocking` (the config already said blocking, so nothing
  // looked changed), and the only recovery was deleting .redline.json — which
  // destroys onboardedAt, the recorded menu, and makes this run look like a
  // 2.1 migration.
  //
  // The read happens only when nothing else has already settled the question.
  // It exists to decide whether a run with no other work to do is genuinely
  // finished, so a run that already has work does not need it — and must not
  // be aborted by it: a 502 on GET /rulesets, or a token that can write but
  // cannot list rulesets, would otherwise exit 4 on a run that had real work
  // and had already written the rendered files.
  // `--repair` exists precisely to bypass the settled verdict below, so
  // computing it here would spend a host GET whose answer nothing then reads:
  // `alreadyOnboarded` is forced false for a repair run further down, never
  // mind what the read would have said.
  const settledOnFiles =
    existing !== null &&
    changedFiles.length === 0 &&
    !menuChanged &&
    !vendorsChanged &&
    !capabilitiesChanged;
  let settledOnHost = true;
  if (existing !== null && settledOnFiles && !dryRun && !repair) {
    // Not read at all when the repository manages its own merge policy: what
    // is on the host then is a human's, and comparing Redline's menu against
    // it would report the repository's own deliberate configuration as drift.
    const policy = capabilities.mergePolicy ? await platform.readPolicy(ref) : null;
    // A null policy read is not by itself drift. A repository onboarded
    // without admin rights never got a ruleset — that refusal is exactly what
    // `merge-policy` in pendingAdmin records — so null is its settled state.
    // Where the record says the ruleset was applied, null means it vanished.
    settledOnHost = !capabilities.mergePolicy
      ? true
      : policy === null
        ? existing.pendingAdmin.includes('merge-policy')
        : policy.blocking === menu.blockingGate;
  }

  // `--repair` skips the short-circuit outright: it exists for exactly the
  // capabilities this settled verdict would otherwise call done forever —
  // labels, review-ownership, repo-property, gate, and merge-policy's own
  // null branch above — none of which a plain re-run can ever re-check.
  // A rung change is work, so it must not be swallowed by the settled verdict.
  // Without this an operator promoting an already-onboarded repository gets
  // "nothing to change" and a rung that never moved — the flag silently doing
  // nothing, which is worse than refusing.
  const rungRequested = rung !== currentRung || rungNotes.length > 0;
  const alreadyOnboarded = !repair && !rungRequested && settledOnFiles && settledOnHost;

  const optedOut = deselectedCapabilities(menu, capabilities);
  const hostPlan = [
    ...(capabilities.gate ? [`merge gate machinery on ${platform.host}`] : []),
    ...(menu.sensitivePathReviewers ? ['review ownership for the sensitive paths'] : []),
    'security floor: secret scanning, push protection, dependency alerts',
    ...(capabilities.mergePolicy
      ? [`branch policy: 1 approval, gate ${menu.blockingGate ? 'blocking' : 'advisory'}`]
      : []),
    `pull request on ${ONBOARD_BRANCH}`,
  ];

  if (alreadyOnboarded) {
    return {
      profile,
      files: [],
      removals: [],
      outcomes: [],
      // Exactly what .redline.json records, because this run attempted no
      // write and only a write answers the question the record asks. `bin`
      // marks it as recorded rather than measured.
      pendingAdmin: existing.pendingAdmin,
      pullRequest: null,
      pullRequestError: null,
      migratedFrom,
      alreadyOnboarded: true,
      dryRun,
      menu,
      capabilities,
      optedOut,
      notes,
      hostPlan,
    };
  }

  const files = [...changedFiles, CONFIG_FILE];

  if (dryRun) {
    return {
      profile,
      files,
      removals,
      // installGate's plan reports no outcome (it made no host call);
      // ensureReviewOwnership's are decided locally and worth printing.
      outcomes: [...gatePlan.outcomes, ...ownershipPlan.outcomes],
      pendingAdmin: [],
      pullRequest: null,
      pullRequestError: null,
      migratedFrom,
      alreadyOnboarded: false,
      dryRun: true,
      menu,
      capabilities,
      optedOut,
      notes,
      hostPlan,
    };
  }

  const gate = capabilities.gate
    ? await platform.installGate(ref, cwd, gateOptions)
    : { files: [], outcomes: [] };

  const ownership = menu.sensitivePathReviewers
    ? await platform.ensureReviewOwnership(ref, cwd, ownershipRules)
    : { files: [], outcomes: [] };

  const security = await platform.enableSecurityFloor(ref);

  const policy = capabilities.mergePolicy
    ? await platform.applyPolicy(ref, {
        requiredApprovals: 1,
        dismissStaleReviews: true,
        requireCodeOwnerReview: menu.sensitivePathReviewers,
        requireThreadResolution: true,
        // Empty by design: the required check is the host's own gate check
        // name, and each adapter supplies it (GitHub's REQUIRED_CHECK, Azure's
        // AZURE_STATUS_NAME/GENRE). requiredChecks is the read side of
        // MergePolicy — what verify reports back off the host.
        requiredChecks: [],
        blocking: menu.blockingGate,
      })
    : { outcomes: [], policy: null };

  // denied -> pendingAdmin work for an administrator; unsupported -> the
  // capability doesn't exist on this repository (e.g. Advanced Security is
  // unlicensed) and must never be reported as permanently half-onboarded.
  const outcomes = [...gate.outcomes, ...ownership.outcomes, ...security.outcomes, ...policy.outcomes];
  const pendingAdmin = outcomes.filter(isPending).map((o) => o.capability);

  writeConfig(cwd, {
    standardsVersion: manifest.version,
    cliVersion: CLI_VERSION,
    host: platform.host,
    profile,
    vendors,
    menu,
    capabilities,
    pendingAdmin,
    // When the repository joined, not when it was last touched: overwriting
    // this on every run erased the only record of when the standard landed.
    onboardedAt: existing?.onboardedAt ?? now().toISOString(),
    lastRunAt: now().toISOString(),
    localRules: existsSync(join(cwd, LOCAL_RULES_FILE)),
    commandFiles: commands.contentIds,
    // The rung the repository asked for, or the one it already had, or the
    // bottom. A run that says nothing about enforcement must never change it:
    // a re-run for an unrelated reason silently promoting a repository is how a
    // ladder loses the trust it exists to build.
    rung,
  });

  let pullRequest: PullRequestRef | null = null;
  let pullRequestError: string | null = null;
  try {
    pullRequest = await platform.openPullRequest(ref, cwd, {
      branch: ONBOARD_BRANCH,
      title: `chore(redline): onboard to standards v${manifest.version}`,
      body: onboardBody(profile, manifest.version, pendingAdmin, files, hostPlan, menu, notes),
      labels: capabilities.labels ? [SYNC_LABEL] : [],
      files,
    });
  } catch (error) {
    // A usage refusal — a dirty git index — happens before any branch exists
    // and before anything is pushed. That stays the caller's input error, not
    // a half-finished onboarding.
    if (isRedlineError(error) && error.kind === 'usage') throw error;
    // Everything else: the host mutations and .redline.json above are real and
    // must not be thrown away. The operator is told where the work sits.
    pullRequestError = error instanceof Error ? error.message : String(error);
  }
  // Work that only exists once the pull request does — labelling it. It is
  // reported, but it cannot reach pendingAdmin: .redline.json records that
  // list and is itself part of the pull request, so it was written above.
  if (pullRequest?.outcomes) outcomes.push(...pullRequest.outcomes);

  return {
    profile,
    files,
    removals,
    outcomes,
    pendingAdmin,
    pullRequest,
    pullRequestError,
    migratedFrom,
    alreadyOnboarded: false,
    dryRun: false,
    menu,
    capabilities,
    optedOut,
    notes,
    hostPlan,
  };
}

// The pull request a team sees first, and usually the only thing they read
// before deciding whether this tool is worth having. It used to open with
// "Onboards this repository to Redline standards v0.0.3" — a sentence that
// means nothing to a reviewer who has not heard of Redline, followed by three
// paragraphs of Redline's own vocabulary and no statement of what changed in
// THEIR repository or what happens next. So: what it does, what it changed
// here, what the reviewer will notice, and how to switch any of it off.
function onboardBody(
  profile: string,
  version: string,
  pendingAdmin: AdminCapability[],
  files: string[],
  hostPlan: string[],
  menu: MenuSelections,
  notes: string[]
): string {
  const bullets = (items: string[]): string[] => items.map((item) => `- \`${item}\``);

  const gate = menu.blockingGate
    ? 'The gate **blocks** a merge that fails it.'
    : 'The gate is **advisory**: it reports and does not block. Making it blocking is a separate, ' +
      'deliberate step once you have watched it for a while.';

  const pending =
    pendingAdmin.length === 0
      ? []
      : [
          '',
          '## Needs an administrator',
          '',
          `These could not be applied with the permissions this run had: ${pendingAdmin.join(', ')}.`,
          'Everything else is in place; re-run `redline init --repair` once they are granted.',
        ];

  return [
    'This adds an automated review standard to the repository: one versioned set of rules, rendered',
    'into the files your coding assistants already read, plus a pull request check that applies them',
    'to the diff.',
    '',
    `Detected stack: \`${profile}\`. Rules version: \`v${version}\`.`,
    '',
    '## What changed here',
    '',
    ...(files.length === 0 ? ['No files changed.'] : bullets(files)),
    ...(hostPlan.length === 0 ? [] : ['', 'Repository settings:', '', ...hostPlan.map((h) => `- ${h}`)]),
    '',
    '## What you will notice',
    '',
    `- ${gate}`,
    '- Your next pull request runs the Redline check and comments findings on the diff.',
    '- Nothing outside the `<!-- REDLINE:BEGIN -->` markers was touched. Files you already had —',
    '  a pull request template, a CODEOWNERS — were left exactly as they are.',
    '',
    '## Turning it down',
    '',
    '- A capability you already have your own version of: `redline init --skip <name>`.',
    '- A rule that is wrong for this repository: raise it in the Redline repository rather than',
    '  editing the generated block here, so every repository gets the fix.',
    '- All of it: `redline remove` takes back only what Redline can prove it wrote, as a pull request.',
    '',
    '`.redline.json` records every choice above and explains each one in its own `//` key.',
    ...(notes.length === 0 ? [] : ['', '## Worth knowing', '', ...notes.map((n) => `- ${n}`)]),
    ...pending,
  ].join('\n');
}
