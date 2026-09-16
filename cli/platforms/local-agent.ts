import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { CapabilityOutcome, GateMachinery, GateOptions, InstallResult } from './types.ts';
import { CLI_VERSION, UNPUBLISHED_VERSION } from '../core/version.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Repository-relative path of the hook that IS the gate on this pipeline. */
export const LOCAL_HOOK_PATH = '.redline/hooks/pre-push';

/** The directory `core.hooksPath` has to name for the hook above to run. */
export const LOCAL_HOOKS_DIR = '.redline/hooks';

/**
 * The gate for a repository that runs no pull request checks at all.
 *
 * Writes a `pre-push` hook and points `core.hooksPath` at it. Nothing is
 * installed on the host and no check is published, because there is no build to
 * publish one from — which is the whole trade this option makes, and the reason
 * a blocking merge policy is refused alongside it.
 *
 * Committed at `.redline/hooks/` rather than written into `.git/hooks`, for two
 * reasons that pull the same way: `.git/hooks` is not versioned, so a hook put
 * there could never be reviewed, updated by a sync, or removed by `redline
 * remove`; and a teammate cloning the repository gets the file either way but
 * has to opt in by pointing their own `core.hooksPath` at it. A local gate that
 * installed itself silently into every clone would be a local gate that runs
 * code a reviewer never saw.
 */
export function installLocalAgentGate(
  cwd: string,
  _opts: GateOptions,
  check: boolean
): InstallResult {
  const files: string[] = [];

  // `redlinegate@latest` inside a hook committed to every onboarded repository
  // means any npm publish changes the gate on every engineer's machine with no
  // pull request anywhere. Pin the version that wrote it, exactly as the CI
  // templates do, so a CLI upgrade arrives as a reviewable change.
  //
  // replaceAll, not replace: the placeholder appears twice — once in the npx
  // invocation and once in the `npm install -g` line the hook prints when npx
  // is costing a push real time. String-form `replace` substitutes the first
  // only, which would have handed the engineer a literal
  // `redlinegate@REDLINE_CLI_VERSION` to install.
  const hook = readFileSync(join(PACKAGE_ROOT, 'platforms/local/pre-push'), 'utf8').replaceAll(
    'redlinegate@REDLINE_CLI_VERSION',
    CLI_VERSION === UNPUBLISHED_VERSION ? 'redlinegate@latest' : `redlinegate@${CLI_VERSION}`
  );

  if (syncExecutable(cwd, LOCAL_HOOK_PATH, hook, check)) files.push(LOCAL_HOOK_PATH);

  if (check) return { files, outcomes: [] };

  return { files, outcomes: [pointHooksPath(cwd)] };
}

/**
 * Point this clone's `core.hooksPath` at the hook, unless something else owns
 * it.
 *
 * `core.hooksPath` is a single value for the whole repository, so setting it
 * replaces every hook the engineer already had. A repository running husky, or
 * one whose team pointed it somewhere deliberately, would have those hooks
 * silently stop firing — a gate that disables another team's gate to install
 * itself is the failure this product exists to catch, not one it may commit.
 */
function pointHooksPath(cwd: string): CapabilityOutcome {
  const current = readHooksPath(cwd);

  if (current === LOCAL_HOOKS_DIR) {
    return {
      capability: 'gate',
      status: 'applied',
      detail: `${LOCAL_HOOK_PATH} runs on every push from this clone`,
    };
  }

  if (current !== null) {
    return {
      capability: 'gate',
      status: 'denied',
      detail:
        `wrote ${LOCAL_HOOK_PATH}, but core.hooksPath already points at "${current}" and ` +
        'overwriting it would stop those hooks firing — chain this one from there, or run: ' +
        `git config core.hooksPath ${LOCAL_HOOKS_DIR}`,
    };
  }

  try {
    execFileSync('git', ['config', 'core.hooksPath', LOCAL_HOOKS_DIR], { cwd, stdio: 'ignore' });
  } catch {
    // Not a git repository, or a git that refused the write. The file is on
    // disk and useful the moment somebody points at it, so this is work left
    // for a human rather than a failed install.
    return {
      capability: 'gate',
      status: 'denied',
      detail:
        `wrote ${LOCAL_HOOK_PATH}, but could not set core.hooksPath here — run: ` +
        `git config core.hooksPath ${LOCAL_HOOKS_DIR}`,
    };
  }

  return {
    capability: 'gate',
    status: 'applied',
    detail:
      `${LOCAL_HOOK_PATH} runs on every push from this clone. It is not published to any host, ` +
      `so each teammate enables it once: git config core.hooksPath ${LOCAL_HOOKS_DIR}`,
  };
}

/** The clone's configured hooks path, or null when it has none. */
export function readHooksPath(cwd: string): string | null {
  try {
    const value = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value === '' ? null : value;
  } catch {
    // git exits 1 when the key is unset, which is the common case and not an
    // error — and exits non-zero outside a repository, which this cannot fix.
    return null;
  }
}

/**
 * Undo `pointHooksPath`, and only where Redline set it.
 *
 * A clone whose `core.hooksPath` names somebody else's directory is one this
 * never owned — unsetting it there would disable hooks Redline did not install,
 * which is the mirror image of the overwrite `pointHooksPath` refuses to do.
 * Returns what happened, so `remove` can report it rather than assume it.
 */
export function unsetHooksPath(cwd: string): 'unset' | 'not-ours' | 'absent' {
  const current = readHooksPath(cwd);
  if (current === null) return 'absent';
  if (current !== LOCAL_HOOKS_DIR) return 'not-ours';
  try {
    execFileSync('git', ['config', '--unset', 'core.hooksPath'], { cwd, stdio: 'ignore' });
    return 'unset';
  } catch {
    return 'not-ours';
  }
}

/** The ownership line every Redline-written file carries. */
const OWNED = 'Managed by Redline';

/**
 * What `verify` can honestly say about a gate that runs on somebody's laptop.
 *
 * `publishes` is null and stays null: this gate reports to no host, so there is
 * no check name for a branch ruleset to require and none to read out of the
 * file. `externallyNamed` carries the same meaning it does for a GitHub
 * repository built by Azure Pipelines — the machinery is wired up and will run,
 * judged on something other than a name. Here that is `core.hooksPath`: a hook
 * sitting in a directory git is not looking at is a file, not a gate, and it is
 * the single most likely way this option is silently not working.
 */
export function localAgentMachinery(cwd: string): GateMachinery {
  const base = { path: LOCAL_HOOK_PATH, expected: 'the pre-push hook on this machine' };
  const abs = join(cwd, LOCAL_HOOK_PATH);
  if (!existsSync(abs)) return { ...base, present: false, publishes: null, vendored: null };

  return {
    ...base,
    present: true,
    publishes: null,
    vendored: null,
    externallyNamed: readHooksPath(cwd) === LOCAL_HOOKS_DIR && isExecutable(abs),
  };
}

/**
 * The same read with no checkout — `verify --repo`, which has the file's bytes
 * from the API and nothing else.
 *
 * `core.hooksPath` and the execute bit are properties of a clone, not of the
 * repository, so neither is knowable here. This reports whether the hook is
 * committed and whether it is Redline's; whether anybody enabled it is a
 * question only the machine holding the clone can answer.
 */
export function localAgentMachineryFromBody(body: string | null): GateMachinery {
  const base = { path: LOCAL_HOOK_PATH, expected: 'the pre-push hook on this machine' };
  if (body === null) return { ...base, present: false, publishes: null, vendored: null };
  return {
    ...base,
    present: true,
    publishes: null,
    vendored: null,
    externallyNamed: body.includes(OWNED),
  };
}

const isExecutable = (abs: string): boolean => {
  try {
    return (statSync(abs).mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

/**
 * `syncFile`, plus the execute bit. *
 * A hook without it is not a hook: git skips a non-executable file in the hooks
 * path without a word, so the gate would report installed and never run once.
 * The mode is re-checked even when the bytes already match, because a file
 * restored from an archive or a `git checkout` on a filesystem that dropped the
 * bit is exactly the case that leaves correct content that cannot execute.
 */
function syncExecutable(cwd: string, relPath: string, contents: string, check: boolean): boolean {
  const target = join(cwd, relPath);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  const executable = current !== null && (statSync(target).mode & 0o111) !== 0;

  if (current === contents && executable) return false;
  if (check) return true;

  mkdirSync(dirname(target), { recursive: true });
  if (current !== contents) writeFileSync(target, contents);
  chmodSync(target, 0o755);
  return true;
}
