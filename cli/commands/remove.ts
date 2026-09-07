import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRedlineError, RedlineError } from '../core/errors.ts';
import { CONFIG_FILE, readConfig } from '../config/redline-json.ts';
import { loadManifest } from '../render/manifest.ts';
import { resolveProfile } from '../render/profile.ts';
import { stripBlock } from '../render/standards.ts';
import { COMMAND_HOSTS, contentId, loadCommands } from '../render/commands.ts';
import {
  LOCAL_RULES_FILE,
  VENDORS,
  readLocalRules,
  type PruneRule,
  type RenderContext,
} from '../render/vendors.ts';
import { observePullRequestTemplates } from '../platforms/pull-request-templates.ts';
import { isPending } from '../platforms/types.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Host,
  Platform,
  PullRequestRef,
} from '../platforms/types.ts';
import type { HostWithdrawal } from '../remove/host.ts';

export const REMOVE_BRANCH = 'redline/remove';

// The whole command in one sentence: nothing is deleted that Redline cannot
// prove it wrote. Proof comes from the artifacts themselves — the `redline-`
// prefix at a path a vendor's own prune rule owns, a REDLINE marker block, an
// attribution line, or a content identifier `.redline.json` recorded when
// Redline last wrote the bytes. A file that fails every one of those tests is a
// human's, and a human's file is reported, never removed. The failure direction
// this is chosen for: leaving one file behind costs an operator a `rm`; taking
// one away costs them work they cannot get back from a tool that promised to
// undo its own changes and undid theirs.
export type FileAction =
  // Redline wrote the whole thing, so the whole thing goes. `directory` is set
  // for the skill folders, which Redline owns as directories rather than files.
  | { kind: 'delete'; path: string; reason: string; directory: boolean }
  // A file Redline only merged a block into. The block goes; every byte outside
  // it survives exactly as it is.
  | { kind: 'unmerge'; path: string; reason: string; keep: string }
  // Left exactly as found, and said out loud. A removal report that falls
  // silent about what it did not touch cannot be told from one that missed it.
  | { kind: 'kept'; path: string; reason: string };

export interface RemoveOptions {
  cwd: string;
  root: string;
  dryRun?: boolean;
}

export interface RemoveReport {
  host: Host;
  dryRun: boolean;
  // Every path this run looked at, in the order it acted on them. `.redline.json`
  // is always last — see the comment on `plan` below.
  actions: FileAction[];
  // What the pull request has to carry: every deletion and every unmerge.
  files: string[];
  outcomes: CapabilityOutcome[];
  pendingAdmin: AdminCapability[];
  pullRequest: PullRequestRef | null;
  // Set when the host state was withdrawn but the pull request could not be
  // opened. Same shape and same reasoning as `redline init`: the work is real,
  // only the review vehicle is missing.
  pullRequestError: string | null;
  // What a dry run prints instead of contacting the host.
  hostPlan: string[];
  notes: string[];
}

// CONTRACT with cli/render/commands.ts's MANAGED_BY / MANAGED_HEADER: the
// attribution line Redline writes into the frontmatter of every command file it
// renders, and the only thing that tells its frontmatter apart from a team's own
// — nothing about the SHAPE of a lone `description:` key does.
const MANAGED_HEADER = /^# Managed by Redline\b/m;

// CONTRACT with MANAGED_BY_REDLINE in cli/platforms/github/install.ts and
// cli/platforms/azure/install.ts. Those two accept exactly two proofs that the
// gate machinery file is Redline's and may be overwritten: this ownership line,
// or the reusable-workflow reference that `readGateMachinery` reads back as the
// check the file publishes. What init is allowed to overwrite is precisely what
// remove is allowed to delete, so both signals are honoured here too.
const MANAGED_BY_REDLINE = /^#[ \t]*Managed by Redline\b/m;

// The CODEOWNERS header `ensureReviewOwnership` writes, and the only way to
// tell a seeded file from one this repository already had. That adapter seeds
// `.github/CODEOWNERS` only when NONE of its candidate paths exists, so a
// repository with its own file never got one — but the run that seeded it
// records nothing about having done so, and `already` versus `applied` is not
// in `.redline.json`. The header is: a file carrying it was written by Redline,
// and a file that does not is left alone whatever its path.
const CODEOWNERS_HEADER = /^#[ \t]*Managed by Redline\b/;
const CODEOWNERS_PATH = '.github/CODEOWNERS';

const read = (cwd: string, relPath: string): string | null => {
  const abs = join(cwd, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
};

// `stripBlock` throws rather than guess on an unpaired, duplicated or
// out-of-order marker pair — see cli/render/markers.ts. Here that refusal is a
// finding about one file, not a reason to abandon the removal: every other
// artifact in the repository is still Redline's to take away, and a command
// that aborts on the first mangled file leaves the repository half-onboarded
// with no way forward. So the file is kept, named, and the reason the renderer
// gave is passed straight through.
type BlockRead =
  | { kind: 'none' }
  | { kind: 'whole' }
  | { kind: 'partial'; keep: string }
  | { kind: 'mangled'; why: string };

function readBlock(body: string, label: string): BlockRead {
  let stripped: string | null;
  try {
    stripped = stripBlock(body, label);
  } catch (error) {
    if (!isRedlineError(error)) throw error;
    return { kind: 'mangled', why: error.message };
  }
  if (stripped === body) return { kind: 'none' };
  if (stripped === null) return { kind: 'whole' };
  return { kind: 'partial', keep: stripped };
}

// The removal surface, taken from the renderers themselves rather than restated
// here. Every artifact `redline init` renders has one of two shapes: a file
// Redline owns whole, which its vendor's own PruneRule already knows how to
// recognise (the `redline-` prefix, at a path that vendor owns), or a shared
// file Redline merged a block into. A second list of those paths here would
// drift from what init writes, and the entry that drifted out of it is the
// artifact nobody ever removes.
interface RenderedSurface {
  merged: string[];
  prunes: PruneRule[];
}

function renderedSurface(root: string, cwd: string, profile: string): RenderedSurface {
  const manifest = loadManifest(root);
  // The stacks decide only WHICH per-stack artifacts a render would produce,
  // and every one of them is recognised below by its vendor's prune rule rather
  // than by name — so an empty stack list costs nothing here. That matters,
  // because resolveProfile throws on a profile the org has since dropped, and a
  // repository whose profile no longer exists is exactly the one that most
  // needs a way to back out.
  let stacks: string[] = [];
  try {
    stacks = resolveProfile(manifest, profile).stacks;
  } catch (error) {
    if (!isRedlineError(error)) throw error;
  }
  // No contexts: `remove` strips the block whole, so what it rendered into it
  // does not change which bytes come out.
  const ctx: RenderContext = { manifest, root, profile, stacks, contexts: [], local: readLocalRules(cwd) };
  const merged: string[] = [];
  const prunes: PruneRule[] = [];
  for (const renderer of Object.values(VENDORS)) {
    const output = renderer(ctx);
    prunes.push(...output.prune);
    for (const [path, file] of output.files) {
      if (file.merge === true) merged.push(path);
    }
  }
  return { merged, prunes };
}

// A shared file: strip the block, keep everything else byte for byte, and
// delete the file only when nothing but the block was ever in it — which is
// what a `CLAUDE.md` that `redline init` created on a greenfield repository is.
function planMergedFile(cwd: string, relPath: string, actions: FileAction[]): void {
  const body = read(cwd, relPath);
  if (body === null) return;
  const block = readBlock(body, relPath);
  if (block.kind === 'mangled') {
    actions.push({ kind: 'kept', path: relPath, reason: block.why });
    return;
  }
  if (block.kind === 'none') {
    actions.push({
      kind: 'kept',
      path: relPath,
      reason: 'carries no REDLINE block, so nothing in it is Redline\'s',
    });
    return;
  }
  if (block.kind === 'whole') {
    actions.push({
      kind: 'delete',
      path: relPath,
      directory: false,
      reason: 'nothing but the Redline block was in it',
    });
    return;
  }
  actions.push({
    kind: 'unmerge',
    path: relPath,
    reason: 'the Redline block only — every byte outside it is kept as it is',
    keep: block.keep,
  });
}

// Mirrors the deselect path in cli/render/commands.ts, which is where Redline
// already takes its own half of a command file back out again. Three proofs of
// ownership, in the order that one is asked: the file is nothing but the block;
// what sits outside the block carries the attribution line; or the file predates
// the block entirely and is byte-for-byte what `.redline.json` recorded Redline
// writing there. A file with a block and none of the three keeps its own bytes
// and loses only the block.
function planCommandFiles(
  cwd: string,
  root: string,
  known: Record<string, string>,
  actions: FileAction[]
): void {
  const commands = loadCommands(root);
  for (const renderer of Object.values(COMMAND_HOSTS)) {
    for (const command of commands) {
      const { path } = renderer(command);
      const body = read(cwd, path);
      if (body === null) continue;
      const recorded = known[path];
      const block = readBlock(body, path);
      if (block.kind === 'mangled') {
        actions.push({ kind: 'kept', path, reason: block.why });
        continue;
      }
      if (block.kind === 'none') {
        // No block, so the only thing that can still make it Redline's is the
        // record of the exact bytes Redline last wrote there. A file onboarded
        // before the marker block existed is that case, and it is the one
        // ownership proof a later edit to `commands/<name>.md` cannot move.
        if (recorded !== undefined && recorded === contentId(body)) {
          actions.push({
            kind: 'delete',
            path,
            directory: false,
            reason: `still byte-for-byte the content ${CONFIG_FILE} recorded Redline writing here`,
          });
        }
        continue;
      }
      if (block.kind === 'whole') {
        actions.push({
          kind: 'delete',
          path,
          directory: false,
          reason: 'nothing but the Redline block was in it',
        });
        continue;
      }
      if (MANAGED_HEADER.test(block.keep)) {
        actions.push({
          kind: 'delete',
          path,
          directory: false,
          reason: 'its frontmatter carries the Redline ownership line',
        });
        continue;
      }
      actions.push({
        kind: 'unmerge',
        path,
        reason: "the Redline block only — this repository's own prompt is kept",
        keep: block.keep,
      });
    }
  }
}

function planGateMachinery(platform: Platform, cwd: string, actions: FileAction[]): void {
  const machinery = platform.readGateMachinery(cwd);
  if (!machinery.present) return;
  const body = read(cwd, machinery.path);
  if (body === null) return;
  // YAML takes no marker block — a second `name:`/`on:` key stops the workflow
  // running at all — so the file is either Redline's whole or nobody's to
  // touch, which is the same pair of answers `installGate` allows itself.
  if (machinery.publishes !== null || MANAGED_BY_REDLINE.test(body)) {
    actions.push({
      kind: 'delete',
      path: machinery.path,
      directory: false,
      reason:
        machinery.publishes !== null
          ? `it references Redline's reusable gate and publishes ${machinery.publishes}`
          : 'it carries the Redline ownership line',
    });
    return;
  }
  actions.push({
    kind: 'kept',
    path: machinery.path,
    reason:
      'it carries nothing that attributes it to Redline, so it is this repository\'s own file ' +
      'sitting at a Redline-shaped path',
  });
}

function planPullRequestTemplates(platform: Platform, cwd: string, actions: FileAction[]): void {
  for (const template of observePullRequestTemplates(platform.host, cwd)) {
    if (template.state === 'mangled') {
      actions.push({
        kind: 'kept',
        path: template.path,
        reason: 'its REDLINE:BEGIN/END pair is broken, so which part is Redline\'s cannot be told',
      });
      continue;
    }
    if (template.state !== 'managed') {
      actions.push({
        kind: 'kept',
        path: template.path,
        reason: 'carries no REDLINE block — it answers the gate on its own and is this repository\'s',
      });
      continue;
    }
    planMergedFile(cwd, template.path, actions);
  }
}

function planCodeowners(cwd: string, actions: FileAction[]): void {
  const body = read(cwd, CODEOWNERS_PATH);
  if (body === null) return;
  if (CODEOWNERS_HEADER.test(body)) {
    actions.push({
      kind: 'delete',
      path: CODEOWNERS_PATH,
      directory: false,
      reason: 'seeded by Redline on a repository that had no CODEOWNERS, and still carries its header',
    });
    return;
  }
  actions.push({
    kind: 'kept',
    path: CODEOWNERS_PATH,
    reason:
      'it does not carry the header Redline seeds, so this repository either wrote it or has since ' +
      'made it its own — review the sensitive-path rules in it by hand',
  });
}

/**
 * Everything `redline init` put in the working tree, in the order it is acted
 * on. `.redline.json` is deliberately last: while it is there, `redline verify`
 * can still describe the repository, and a run that failed halfway through
 * leaves a repository that still knows what it was rather than one that has
 * forgotten and cannot be verified or repaired.
 */
function plan(
  platform: Platform,
  opts: RemoveOptions,
  profile: string,
  commandFiles: Record<string, string>
): FileAction[] {
  const { cwd, root } = opts;
  const actions: FileAction[] = [];
  const surface = renderedSurface(root, cwd, profile);

  // Artifacts Redline owns whole, recognised by the prune rule of the vendor
  // that renders them. `matches` is the `redline-` prefix test, so a file a
  // human put in the same directory without the prefix is never a candidate.
  for (const rule of surface.prunes) {
    const abs = join(cwd, rule.dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      if (!rule.matches(entry)) continue;
      actions.push({
        kind: 'delete',
        path: join(rule.dir, entry),
        directory: rule.directories === true,
        reason: `a Redline-rendered artifact in ${rule.dir}`,
      });
    }
  }

  for (const relPath of surface.merged) planMergedFile(cwd, relPath, actions);
  planCommandFiles(cwd, root, commandFiles, actions);
  planGateMachinery(platform, cwd, actions);
  planPullRequestTemplates(platform, cwd, actions);
  planCodeowners(cwd, actions);

  actions.push({
    kind: 'delete',
    path: CONFIG_FILE,
    directory: false,
    reason: 'Redline\'s own record of this repository — removed last',
  });
  return actions;
}

function apply(cwd: string, action: FileAction): void {
  if (action.kind === 'kept') return;
  const abs = join(cwd, action.path);
  if (action.kind === 'unmerge') {
    writeFileSync(abs, action.keep);
    return;
  }
  // `recursive` covers the skill folders, which Redline owns as directories.
  rmSync(abs, { recursive: true, force: true });
}

export async function remove(
  platform: Platform,
  hostFor: () => HostWithdrawal | Promise<HostWithdrawal>,
  opts: RemoveOptions
): Promise<RemoveReport> {
  const { cwd } = opts;
  const dryRun = opts.dryRun === true;

  // `readConfig` throws RedlineError('failed') when the file is there and
  // cannot be read, which is the right answer: something is recorded and this
  // run cannot tell what. A file that is simply absent is a different thing —
  // the operator asked to remove Redline from a repository it was never on —
  // and it gets the same `usage` answer, and so the same exit code, that
  // `redline verify` gives that repository.
  const config = readConfig(cwd);
  if (config === null) {
    throw new RedlineError(
      'usage',
      `no ${CONFIG_FILE} in ${cwd} — Redline was never installed here, so there is nothing to remove`,
      'run redline verify to see what this repository looks like to Redline'
    );
  }

  const actions = plan(platform, opts, config.profile, config.commandFiles);
  const files = actions.filter((action) => action.kind !== 'kept').map((action) => action.path);

  const notes = [
    'the security floor stays on: secret scanning, push protection and dependency alerts are the ' +
      "organisation's minimum, not Redline's own state, and removing Redline is not a reason to " +
      'lower them. This command has no flag that turns them off',
    `once ${CONFIG_FILE} is gone, redline verify stops recognising this repository: it reports "not ` +
      'onboarded" and exits 2 rather than reporting drift',
  ];
  if (existsSync(join(cwd, LOCAL_RULES_FILE))) {
    notes.push(
      `${LOCAL_RULES_FILE} is this repository's own rules file — Redline never wrote it and does not ` +
        'remove it; it is left exactly where it is'
    );
  }

  const hostPlan = [
    `withdraw Redline's own state on ${config.host}: the merge policy it applied, the labels it ` +
      'created, and the repository property it set where the host has them',
    `pull request on ${REMOVE_BRANCH}`,
  ];

  if (dryRun) {
    // Nothing is written, nothing is read from the host, and no credential is
    // needed — the same contract `redline init --dry-run` holds, and the reason
    // someone evaluating whether they can back Redline out can find out before
    // going to get an admin token.
    return {
      host: config.host,
      dryRun: true,
      actions,
      files,
      outcomes: [],
      pendingAdmin: [],
      pullRequest: null,
      pullRequestError: null,
      hostPlan,
      notes,
    };
  }

  const ref = await platform.repoRef(cwd);

  // Files first, host after, `.redline.json` last of the files — but the config
  // is only removed once the host withdrawal has had its turn, because it is
  // what says which host to talk to at all. A run that died between the two
  // leaves a repository whose record still describes it.
  for (const action of actions) {
    if (action.path === CONFIG_FILE) continue;
    apply(cwd, action);
  }

  const withdrawal = await (await hostFor()).withdraw(ref);
  notes.push(...withdrawal.notes);
  const outcomes = withdrawal.outcomes;
  const pendingAdmin = outcomes.filter(isPending).map((outcome) => outcome.capability);

  const configAction = actions.find((action) => action.path === CONFIG_FILE);
  if (configAction) apply(cwd, configAction);

  let pullRequest: PullRequestRef | null = null;
  let pullRequestError: string | null = null;
  try {
    pullRequest = await platform.openPullRequest(ref, cwd, {
      branch: REMOVE_BRANCH,
      title: 'chore(redline): remove Redline from this repository',
      body: removalBody(pendingAdmin),
      // No labels. The `redline-sync` label this would carry is one of the
      // labels this very run deletes, and asking the host to apply a label that
      // no longer exists fails the pull request over housekeeping.
      labels: [],
      files,
    });
  } catch (error) {
    // A dirty index is refused before a branch exists and before anything is
    // pushed — the caller's input error, not a half-finished removal.
    if (isRedlineError(error) && error.kind === 'usage') throw error;
    pullRequestError = error instanceof Error ? error.message : String(error);
  }
  if (pullRequest?.outcomes) outcomes.push(...pullRequest.outcomes);

  return {
    host: config.host,
    dryRun: false,
    actions,
    files,
    outcomes,
    pendingAdmin,
    pullRequest,
    pullRequestError,
    hostPlan,
    notes,
  };
}

function removalBody(pendingAdmin: AdminCapability[]): string {
  const pending =
    pendingAdmin.length === 0
      ? 'Every host setting Redline applied has been withdrawn.'
      : `A repository administrator still has to remove: ${pendingAdmin.join(', ')}. Until then ` +
        'some of Redline\'s host state is still in place.';

  return [
    'Removes Redline from this repository: the rendered standards, the merge gate machinery, the',
    'slash-command files and `.redline.json`.',
    '',
    'Only content Redline wrote is removed. Files it merely merged into keep every byte outside the',
    '`<!-- REDLINE:BEGIN -->` block, and anything that could not be attributed to Redline was left',
    'in place and named in the run output.',
    '',
    'The security floor — secret scanning, push protection and dependency alerts — is untouched. It',
    'is the organisation\'s minimum rather than Redline\'s own state, and removing Redline is not a',
    'reason to lower it.',
    '',
    pending,
  ].join('\n');
}
