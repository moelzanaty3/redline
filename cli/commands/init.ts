import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { isRedlineError } from '../core/errors.ts';
import { CLI_VERSION } from '../core/version.ts';
import {
  CONFIG_FILE,
  MENU_KEYS,
  readConfig,
  writeConfig,
  type MenuSelections,
} from '../config/redline-json.ts';
import { proposeProfile } from '../detect/stack.ts';
import { scanRepo } from '../detect/scan.ts';
import { loadManifest } from '../render/manifest.ts';
import { resolveProfile } from '../render/profile.ts';
import { render } from '../render/standards.ts';
import { renderCommands, COMMAND_HOSTS } from '../render/commands.ts';
import { isPending } from '../platforms/types.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  GateOptions,
  OwnershipRule,
  Platform,
  PullRequestRef,
} from '../platforms/types.ts';

export const DEFAULT_MENU: MenuSelections = {
  blockingGate: false,
  adrForLargeDiffs: true,
  accessibility: true,
  speckit: false,
  sensitivePathReviewers: true,
};

export const FLOOR_GATE: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt', 'redline-sync'],
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

export interface InitOptions {
  cwd: string;
  root: string;
  profile?: string;
  vendors?: string[];
  // Only the selections the caller actually asked for. Anything absent falls
  // back to what the repository already chose — see the menu precedence below.
  menu?: Partial<MenuSelections>;
  dryRun?: boolean;
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
  hostPlan: string[];
}

// What the recorded pending-admin list looks like against a live read. Only
// the capabilities the read actually answers for are refreshed — `merge-policy`
// is settled separately, and nothing reads back `labels`, `review-ownership`,
// `repo-property` or `gate`, so those stay exactly as recorded.
function refreshPendingAdmin(
  recorded: AdminCapability[],
  security: CapabilityOutcome[]
): AdminCapability[] {
  const answered = new Set<AdminCapability>([...security.map((o) => o.capability), 'merge-policy']);
  const denied = security.filter(isPending).map((o) => o.capability);
  return [
    ...recorded.filter((capability) => !answered.has(capability) || denied.includes(capability)),
    ...denied.filter((capability) => !recorded.includes(capability)),
  ];
}

export async function init(platform: Platform, opts: InitOptions): Promise<InitReport> {
  const { cwd, root } = opts;
  const dryRun = opts.dryRun === true;
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

  // A dry run must work offline and with an unscoped token: repoRef() is a
  // live GET, so the plan is built from what the local clone already knows.
  const ref = dryRun ? platform.localRef(cwd) : await platform.repoRef(cwd);
  const vendors =
    opts.vendors ??
    Object.entries(manifest.vendors)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);

  // Files first, host settings after: a denied host call must never cost the
  // file-level work that already succeeded.
  const rendered = render({ root, profile, out: cwd, vendors, check: dryRun });
  const commandFiles = renderCommands({
    root,
    out: cwd,
    hosts: vendors.flatMap((v) => (v in COMMAND_HOSTS ? [v] : [])),
    check: dryRun,
  });
  const legacyRemovals = migratedFrom === '2.1' ? removeLegacyArtifacts(cwd, dryRun) : [];

  const gateOptions: GateOptions = {
    ...FLOOR_GATE,
    ...(menu.adrForLargeDiffs ? {} : { adrDiffThreshold: Number.MAX_SAFE_INTEGER }),
  };
  const ownershipRules = sensitivePathRules(ref.org);

  // The gate and ownership file diffs are computed in check mode FIRST, before
  // a single host setting is touched. Without it there was no way to know a
  // re-run had nothing to do until four host objects had already been
  // rewritten — and the answer itself was wrong, because alreadyOnboarded read
  // only the rendered files and never these two.
  const gatePlan = await platform.installGate(ref, cwd, gateOptions, true);
  const ownershipPlan = menu.sensitivePathReviewers
    ? await platform.ensureReviewOwnership(ref, cwd, ownershipRules, true)
    : { files: [], outcomes: [] };

  // render() prunes stale vendor files with rmSync; those deletions must ride
  // along in the same file list as the writes, or the PR never reflects them.
  const removals = [...(dryRun ? rendered.staleRemovals : rendered.removed), ...legacyRemovals];
  const changedFiles = [
    ...(dryRun ? rendered.staleWritten : rendered.written),
    ...removals,
    ...commandFiles,
    ...gatePlan.files,
    ...ownershipPlan.files,
  ];
  // A menu change moves no file of its own (the gate template already diffs
  // adrForLargeDiffs), but it is exactly what `redline init --blocking` on a
  // settled repository is for: swallowing it as "nothing to change" would drop
  // the promotion silently.
  const menuChanged = existing !== null && MENU_KEYS.some((key) => existing.menu[key] !== menu[key]);

  // "Zero host calls on a settled repository" means zero host *mutations*.
  // Reading is how the run finds out whether the repository is settled at all:
  // without it, an operator who loosened the ruleset by hand got "already
  // onboarded — nothing to change" from `redline init` AND from
  // `redline init --blocking` (the config already said blocking, so nothing
  // looked changed), and the only recovery was deleting .redline.json — which
  // destroys onboardedAt, the recorded menu, and makes this run look like a
  // 2.1 migration. Two GETs, no writes.
  const live =
    existing === null || dryRun
      ? null
      : {
          policy: await platform.readPolicy(ref),
          // `redline verify` prints "<capability> now granted — rerun redline
          // init to clear it from .redline.json". A short-circuited re-run
          // would never clear it, so a recorded list the host now contradicts
          // is itself work to do.
          pendingAdmin: refreshPendingAdmin(
            existing.pendingAdmin,
            (await platform.readSecurityState(ref)).outcomes
          ),
        };
  const policySettled = live === null || (live.policy !== null && live.policy.blocking === menu.blockingGate);
  const pendingChanged =
    live !== null &&
    existing !== null &&
    (live.pendingAdmin.length !== existing.pendingAdmin.length ||
      live.pendingAdmin.some((capability, i) => capability !== existing.pendingAdmin[i]));

  const alreadyOnboarded =
    existing !== null && changedFiles.length === 0 && !menuChanged && policySettled && !pendingChanged;

  const hostPlan = [
    `merge gate machinery on ${platform.host}`,
    ...(menu.sensitivePathReviewers ? ['review ownership for the sensitive paths'] : []),
    'security floor: secret scanning, push protection, dependency alerts',
    `branch policy: 1 approval, gate ${menu.blockingGate ? 'blocking' : 'advisory'}`,
    `pull request on ${ONBOARD_BRANCH}`,
  ];

  if (alreadyOnboarded) {
    return {
      profile,
      files: [],
      removals: [],
      outcomes: [],
      // Refreshed for the capabilities a read can answer (secret scanning,
      // push protection, the merge policy) and equal to what .redline.json
      // records for the rest — if it were not equal, this would not be the
      // settled path. `bin` still marks it as recorded rather than measured.
      pendingAdmin: live?.pendingAdmin ?? existing.pendingAdmin,
      pullRequest: null,
      pullRequestError: null,
      migratedFrom,
      alreadyOnboarded: true,
      dryRun,
      menu,
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
      hostPlan,
    };
  }

  const gate = await platform.installGate(ref, cwd, gateOptions);

  const ownership = menu.sensitivePathReviewers
    ? await platform.ensureReviewOwnership(ref, cwd, ownershipRules)
    : { files: [], outcomes: [] };

  const security = await platform.enableSecurityFloor(ref);

  const policy = await platform.applyPolicy(ref, {
    requiredApprovals: 1,
    dismissStaleReviews: true,
    requireCodeOwnerReview: menu.sensitivePathReviewers,
    requireThreadResolution: true,
    // Empty by design: the required check is the host's own gate check name,
    // and each adapter supplies it (GitHub's REQUIRED_CHECK, Azure's
    // AZURE_STATUS_NAME/GENRE). requiredChecks is the read side of
    // MergePolicy — what verify reports back off the host.
    requiredChecks: [],
    blocking: menu.blockingGate,
  });

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
    pendingAdmin,
    // When the repository joined, not when it was last touched: overwriting
    // this on every run erased the only record of when the standard landed.
    onboardedAt: existing?.onboardedAt ?? now().toISOString(),
    lastRunAt: now().toISOString(),
  });

  let pullRequest: PullRequestRef | null = null;
  let pullRequestError: string | null = null;
  try {
    pullRequest = await platform.openPullRequest(ref, cwd, {
      branch: ONBOARD_BRANCH,
      title: `chore(redline): onboard to standards v${manifest.version}`,
      body: onboardBody(profile, manifest.version, pendingAdmin),
      labels: ['redline-sync'],
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
    hostPlan,
  };
}

function onboardBody(profile: string, version: string, pendingAdmin: AdminCapability[]): string {
  const pending =
    pendingAdmin.length === 0
      ? 'Everything that needed repository settings was applied.'
      : `A repository administrator still needs to enable: ${pendingAdmin.join(', ')}. ` +
        `Until then this repository shows as partially onboarded.`;

  return [
    `Onboards this repository to Redline standards \`v${version}\` (profile: \`${profile}\`).`,
    '',
    'The merge gate runs **advisory** — it reports, it does not block. Promotion to blocking is a',
    'deliberate second step after a soak period.',
    '',
    'Generated content sits inside `<!-- REDLINE:BEGIN -->` markers; anything outside them is yours',
    'and was preserved. If a rule is wrong for this repository, raise it in the Redline source repo',
    'rather than editing it here, so every repository benefits.',
    '',
    pending,
  ].join('\n');
}
