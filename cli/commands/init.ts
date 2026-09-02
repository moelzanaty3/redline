import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_VERSION } from '../core/version.ts';
import { CONFIG_FILE, readConfig, writeConfig, type MenuSelections } from '../config/redline-json.ts';
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

export function sensitivePathRules(org: string): OwnershipRule[] {
  return SENSITIVE_PATHS.map((pattern) => ({ pattern, owners: [`@${org}/${OWNING_TEAM}`] }));
}

const ONBOARD_BRANCH = 'redline/onboard';

export interface InitOptions {
  cwd: string;
  root: string;
  profile?: string;
  vendors?: string[];
  menu?: Partial<MenuSelections>;
  now?: () => Date;
}

export interface InitReport {
  profile: string;
  files: string[];
  outcomes: CapabilityOutcome[];
  pendingAdmin: AdminCapability[];
  pullRequest: PullRequestRef | null;
  migratedFrom: string | null;
  alreadyOnboarded: boolean;
}

export async function init(platform: Platform, opts: InitOptions): Promise<InitReport> {
  const { cwd, root } = opts;
  const manifest = loadManifest(root);
  const menu = { ...DEFAULT_MENU, ...opts.menu };
  const now = opts.now ?? (() => new Date());

  // Profile resolution happens before any host call or write: a bad --profile
  // flag must fail clean, with nothing on disk and nothing sent to the host.
  const detected = opts.profile ?? proposeProfile(scanRepo(cwd)).profile;
  const { profile } = resolveProfile(manifest, detected);

  const existing = readConfig(cwd);
  const migratedFrom =
    existing === null && existsSync(join(cwd, '.github/workflows/redline.yml')) ? '2.1' : null;

  const ref = await platform.repoRef(cwd);
  const vendors =
    opts.vendors ??
    Object.entries(manifest.vendors)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);

  // Files first, host settings after: a denied host call must never cost the
  // file-level work that already succeeded.
  const rendered = render({ root, profile, out: cwd, vendors });
  const commandFiles = renderCommands({
    root,
    out: cwd,
    hosts: vendors.flatMap((v) => (v in COMMAND_HOSTS ? [v] : [])),
  });

  const gate = await platform.installGate(ref, cwd, {
    ...FLOOR_GATE,
    ...(menu.adrForLargeDiffs ? {} : { adrDiffThreshold: Number.MAX_SAFE_INTEGER }),
  });

  const ownership = menu.sensitivePathReviewers
    ? await platform.ensureReviewOwnership(ref, cwd, sensitivePathRules(ref.org))
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
  // render() prunes stale vendor files with rmSync; those deletions must ride
  // along in the same file list as the writes, or the PR never reflects them.
  const files = [
    ...rendered.written,
    ...rendered.removed,
    ...commandFiles,
    ...gate.files,
    ...ownership.files,
    CONFIG_FILE,
  ];

  // Determined before writeConfig, and covering prunes and command files too:
  // a no-op re-run (nothing rendered, nothing pruned, no command body
  // changed, already onboarded) must not dirty the working tree with a fresh
  // onboardedAt/pendingAdmin it will then have nothing to commit. Command
  // sources ship with the CLI and version independently of
  // standards/manifest.json, so a content change there must open a PR on its
  // own even when nothing under standards/ moved.
  const alreadyOnboarded =
    existing !== null &&
    rendered.written.length === 0 &&
    rendered.removed.length === 0 &&
    commandFiles.length === 0;

  if (!alreadyOnboarded) {
    writeConfig(cwd, {
      standardsVersion: manifest.version,
      cliVersion: CLI_VERSION,
      host: platform.host,
      profile,
      vendors,
      menu,
      pendingAdmin,
      onboardedAt: now().toISOString(),
    });
  }

  // Re-running on an already-onboarded repository with nothing new to render
  // is a no-op report, not a second pull request: never push an empty diff.
  const pullRequest = alreadyOnboarded
    ? null
    : await platform.openPullRequest(ref, cwd, {
        branch: ONBOARD_BRANCH,
        title: `chore(redline): onboard to standards v${manifest.version}`,
        body: onboardBody(profile, manifest.version, pendingAdmin),
        labels: ['redline-sync'],
        files,
      });
  // Work that only exists once the pull request does — labelling it. It is
  // reported, but it cannot reach pendingAdmin: .redline.json records that
  // list and is itself part of the pull request, so it was written above.
  if (pullRequest?.outcomes) outcomes.push(...pullRequest.outcomes);

  return { profile, files, outcomes, pendingAdmin, pullRequest, migratedFrom, alreadyOnboarded };
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
