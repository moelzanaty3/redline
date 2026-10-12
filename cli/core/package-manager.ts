import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * How this repository runs Redline.
 *
 * Every hint the CLI prints, and every command it renders for an assistant, used
 * to say `npx redlinegate …`. That is wrong in two ways in a Node project. When
 * the project already depends on Redline it fetches a second copy, possibly a
 * different version from the one the team pinned. And in a project whose
 * `package.json` carries `devEngines.packageManager` naming pnpm, yarn or bun —
 * which `pnpm init` writes by default — npm 10.9 and later refuse to run `npx`
 * there at all, before Redline is even downloaded.
 *
 * So the command is worked out from the repository: its own package manager,
 * and its own copy of Redline when it has one.
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export const PACKAGE_NAME = 'redlinegate';

export interface ProjectRunner {
  // null when there is no package.json: Go, Java, Terraform and the rest, where
  // a Node dependency has no business existing and npx is the only route.
  readonly packageManager: PackageManager | null;
  // What `devEngines.packageManager.name` says, when it names one. npm refuses
  // to run in the project when this is not npm, which is the case that makes
  // a plain `npx` hint unusable.
  readonly enforcedManager: PackageManager | null;
  // Whether redlinegate is already one of the project's dependencies.
  readonly pinned: boolean;
  // A pnpm workspace root, where `pnpm add` refuses without `--workspace-root`.
  readonly pnpmWorkspaceRoot: boolean;
  // A yarn workspaces root: classic yarn needs `-W` there and berry rejects it,
  // and nothing in the checkout reliably says which one runs.
  readonly yarnWorkspacesRoot: boolean;
}

const MANAGERS: readonly PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

function isManager(value: string): value is PackageManager {
  return (MANAGERS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `pnpm@12.6.0+sha512.…` → pnpm. Anything else is not an answer.
function managerFromSpec(spec: unknown): PackageManager | null {
  if (typeof spec !== 'string') return null;
  const name = spec.split('@')[0]?.trim() ?? '';
  return isManager(name) ? name : null;
}

function dependsOnRedline(manifest: Record<string, unknown>): boolean {
  return ['dependencies', 'devDependencies'].some((field) => {
    const deps = manifest[field];
    return isRecord(deps) && PACKAGE_NAME in deps;
  });
}

// The lockfile is the strongest evidence of what actually installs here, and
// the order matters only when a repository carries two: pnpm and yarn are both
// deliberate choices, a stray package-lock.json beside them usually is not.
const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

function readManifest(cwd: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return isRecord(raw) ? raw : null;
  } catch {
    // No package.json, or one that does not parse: either way this is not a
    // project Redline can add itself to, and npx is still a working answer.
    return null;
  }
}

export function detectRunner(cwd: string): ProjectRunner {
  const manifest = readManifest(cwd);
  if (manifest === null) {
    return {
      packageManager: null,
      enforcedManager: null,
      pinned: false,
      pnpmWorkspaceRoot: false,
      yarnWorkspacesRoot: false,
    };
  }

  const devEngines = manifest.devEngines;
  const enforcedManager =
    isRecord(devEngines) && isRecord(devEngines.packageManager)
      ? managerFromSpec(devEngines.packageManager.name)
      : null;
  const lockfileManager = LOCKFILES.find(([file]) => existsSync(join(cwd, file)))?.[1] ?? null;
  const packageManager =
    managerFromSpec(manifest.packageManager) ?? enforcedManager ?? lockfileManager ?? 'npm';

  return {
    packageManager,
    enforcedManager,
    pinned: dependsOnRedline(manifest),
    pnpmWorkspaceRoot: packageManager === 'pnpm' && existsSync(join(cwd, 'pnpm-workspace.yaml')),
    yarnWorkspacesRoot: packageManager === 'yarn' && manifest.workspaces !== undefined,
  };
}

/**
 * The command that runs Redline in this repository, followed by `args`.
 *
 * The project's own copy when it has one, through its own package manager.
 * Otherwise `npx redlinegate` — unless the project tells npm it may not run
 * here, in which case that package manager's own one-off runner.
 */
export function redlineCommand(runner: ProjectRunner, args: string): string {
  const tail = args === '' ? '' : ` ${args}`;
  if (runner.pinned) {
    switch (runner.packageManager) {
      case 'pnpm':
        return `pnpm redline${tail}`;
      case 'yarn':
        return `yarn redline${tail}`;
      case 'bun':
        return `bun run redline${tail}`;
      default:
        // The package's own name, not `redline`: npx finds the project's copy
        // in node_modules/.bin when it is installed, and on a fresh clone
        // without node_modules it fetches redlinegate — where `npx redline`
        // would fetch an unrelated package of that name.
        return `npx ${PACKAGE_NAME}${tail}`;
    }
  }
  switch (runner.enforcedManager) {
    case 'pnpm':
      return `pnpm dlx ${PACKAGE_NAME}${tail}`;
    case 'yarn':
      return `yarn dlx ${PACKAGE_NAME}${tail}`;
    case 'bun':
      return `bunx ${PACKAGE_NAME}${tail}`;
    default:
      return `npx ${PACKAGE_NAME}${tail}`;
  }
}

/** The same, read from the repository in `cwd`. */
export function redlineCommandIn(cwd: string, args: string): string {
  return redlineCommand(detectRunner(cwd), args);
}

export interface AddCommand {
  readonly command: PackageManager;
  readonly args: readonly string[];
}

/**
 * How to add redlinegate at exactly `version` as a development dependency, or
 * null when this project cannot take one unattended.
 *
 * Exact, not a range: the point of pinning is that everyone on the team, and
 * every assistant, runs the same Redline until someone upgrades it on purpose.
 * Install scripts are skipped. Adding one package must not run every
 * dependency's postinstall on the operator's machine as a side effect of
 * onboarding — redlinegate has none of its own.
 *
 * So is the code a repository can make its package manager run on any
 * command: pnpm's `.pnpmfile.cjs`, and the yarn binary `yarnPath` points at
 * (see INSTALL_ENV). Redline is often run by a platform team on a repository
 * it does not own, and `init` executed nothing from the repository before it
 * learned to pin itself. Yarn berry plugins committed to the repository still
 * load: there is no switch for them, which the menu and --help say.
 */
export function addCommand(runner: ProjectRunner, version: string): AddCommand | null {
  const spec = `${PACKAGE_NAME}@${version}`;
  switch (runner.packageManager) {
    case 'npm':
      return { command: 'npm', args: ['install', '--save-dev', '--save-exact', '--ignore-scripts', spec] };
    case 'pnpm':
      return {
        command: 'pnpm',
        args: [
          'add',
          '--save-dev',
          '--save-exact',
          '--ignore-scripts',
          '--ignore-pnpmfile',
          ...(runner.pnpmWorkspaceRoot ? ['--workspace-root'] : []),
          spec,
        ],
      };
    case 'yarn':
      // Classic and berry disagree on the workspace-root flag and on how to
      // skip scripts; outside a workspaces root only the latter remains, and
      // the environment handles it for both (see INSTALL_ENV).
      return runner.yarnWorkspacesRoot
        ? null
        : { command: 'yarn', args: ['add', '--dev', '--exact', spec] };
    case 'bun':
      return { command: 'bun', args: ['add', '--dev', '--exact', '--ignore-scripts', spec] };
    default:
      return null;
  }
}

/**
 * The package manager that would add Redline to the project in `cwd`, or null
 * when there is nothing to offer: no package.json, already a dependency, or a
 * project shape `addCommand` will not guess at.
 */
export function pinnableManager(cwd: string): PackageManager | null {
  const runner = detectRunner(cwd);
  if (runner.pinned || addCommand(runner, 'latest') === null) return null;
  return runner.packageManager;
}

// Yarn berry has no --ignore-scripts flag and classic reads npm's config from
// the environment, so both are told here rather than on the command line.
// YARN_IGNORE_PATH makes yarn ignore `yarnPath`, which otherwise hands the
// whole command to a JavaScript file the repository itself supplies.
export const INSTALL_ENV: Readonly<Record<string, string>> = {
  YARN_ENABLE_SCRIPTS: 'false',
  YARN_IGNORE_PATH: '1',
  npm_config_ignore_scripts: 'true',
};

// Every file a package manager may touch when it adds one dependency: the
// manifest, its lockfile, and the config pnpm and yarn write beside them (pnpm
// records a release-age exclusion in pnpm-workspace.yaml for a version
// published today). Compared before and after, so the onboarding pull request
// stages exactly what changed and nothing that was already dirty.
export const PROJECT_FILES: readonly string[] = [
  'package.json',
  ...LOCKFILES.map(([file]) => file),
  'pnpm-workspace.yaml',
  '.yarnrc.yml',
];

function snapshot(cwd: string): Map<string, string | null> {
  return new Map(
    PROJECT_FILES.map((file) => {
      try {
        return [file, readFileSync(join(cwd, file), 'utf8')] as const;
      } catch {
        return [file, null] as const;
      }
    })
  );
}

export type RunInstall = (cwd: string, add: AddCommand) => void;

/**
 * The first copy of `command` on PATH that starts, or the bare name when none
 * is found and the shell's own lookup should report the failure.
 *
 * Not simply the first one: a version manager can put a broken install ahead
 * of a working one. Volta does exactly that for any Node it starts — its pnpm
 * 12.6.0 image ships without the `bin/pnpm.cjs` its shim launches — so a pin
 * failed on a machine whose own terminal ran pnpm perfectly well.
 */
export function workingExecutable(
  command: string,
  path: string = process.env.PATH ?? '',
  starts: (file: string) => boolean = (file) => {
    try {
      execFileSync(file, ['--version'], { stdio: 'pipe', env: { ...process.env, ...INSTALL_ENV } });
      return true;
    } catch {
      return false;
    }
  }
): string {
  // Windows resolves .cmd shims through PATHEXT, which a plain directory scan
  // would have to reimplement; leave it to the shell there.
  if (process.platform === 'win32') return command;
  const seen = new Set<string>();
  for (const dir of path.split(delimiter)) {
    if (dir === '') continue;
    const file = join(dir, command);
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (starts(file)) return file;
  }
  return command;
}

const runInstall: RunInstall = (cwd, add) => {
  execFileSync(workingExecutable(add.command), [...add.args], {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, ...INSTALL_ENV },
    // On Windows the package managers are .cmd shims, which Node will only
    // start through a shell. The arguments are this module's own constants
    // and a version string, never input from the repository.
    shell: process.platform === 'win32',
  });
};

export type PinResult =
  | { readonly status: 'pinned'; readonly command: string; readonly written: readonly string[] }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly command: string; readonly reason: string };

// The line that says what went wrong. Not simply the last one: a crashed
// package manager ends its output with the Node version, which tells nobody
// anything, while the line naming the error is further up.
function failureLine(error: unknown): string {
  const stderr =
    typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
  const lines = stderr.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return (
    lines.find((line) => /\berror\b|ERR_/i.test(line)) ??
    lines.at(-1) ??
    (error instanceof Error ? error.message : String(error))
  );
}

/**
 * Add redlinegate at exactly `version` to the project in `cwd`, with the
 * project's own package manager. Never throws: a failure here must not cost
 * the rest of onboarding, so it comes back as a reason to report.
 */
export function pinRedline(cwd: string, version: string, run: RunInstall = runInstall): PinResult {
  const runner = detectRunner(cwd);
  if (runner.packageManager === null) {
    return { status: 'skipped', reason: 'there is no package.json here to add Redline to' };
  }
  if (runner.pinned) {
    return { status: 'skipped', reason: 'redlinegate is already one of this project\'s dependencies' };
  }
  const add = addCommand(runner, version);
  if (add === null) {
    return {
      status: 'skipped',
      reason: 'this is a yarn workspaces root, where classic and berry need different flags — add redlinegate yourself',
    };
  }
  const command = [add.command, ...add.args].join(' ');
  const before = snapshot(cwd);
  try {
    run(cwd, add);
  } catch (error) {
    return { status: 'failed', command, reason: failureLine(error) };
  }
  const after = snapshot(cwd);
  const written = PROJECT_FILES.filter((file) => before.get(file) !== after.get(file));
  return { status: 'pinned', command, written };
}
