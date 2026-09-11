#!/usr/bin/env node
// Build, pack and install this CLI globally, so `redline` on PATH is the working tree.
//
// The whole reason this is a script and not a one-line npm chain: which `npm` runs
// the global install decides whether the install is visible at all.
//
// Under pnpm, `npm` resolves to ./node_modules/.bin/npm — a locally installed npm
// that is not shimmed by Volta. Its `npm i -g` writes into its own global prefix,
// while the `redline` command on PATH is a Volta shim pointing at Volta's package
// image. The install reports success, the tarball is correct, and the binary you
// run is still the old one. That failure is silent and costs an hour.
//
// So: resolve npm explicitly, never through a node_modules/.bin that a package
// manager put in front, and verify afterwards that the binary on PATH is actually
// the build we just made.

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Present only in a current build: the check at the end greps the installed
// binary's own help for it.
const MARKER = 'redline status';

const run = (file, args, opts = {}) =>
  execFileSync(file, args, { cwd: ROOT, stdio: 'inherit', ...opts });

// Volta sets _VOLTA_TOOL_RECURSION on anything it launches, and its shims skip
// their own hook when they see it — sensible, since it stops a tool Volta ran
// from re-entering Volta forever. It also means a global install performed from
// inside a script Volta started never updates the shim: the files land, npm says
// "added 1 package", and the `redline` on PATH keeps running the old build. That
// single variable is why every publish this session appeared to succeed and
// changed nothing. Clearing it for the install restores the behaviour of typing
// the command in a shell.
const withoutVoltaGuard = () => {
  const env = { ...process.env };
  delete env['_VOLTA_TOOL_RECURSION'];
  return env;
};

const quiet = (command) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

/**
 * The npm that a global install has to go through.
 *
 * Under Volta this is `~/.volta/bin/npm` — the SHIM. Not `volta which npm`,
 * which returns the image binary underneath it: installing through that writes
 * the package into the node image and never triggers the hook that builds the
 * package image the `redline` shim actually executes. The install reports
 * success, the files land, and the command keeps running the old build.
 *
 * Then any npm on PATH that is not inside a node_modules — that is one a package
 * manager shadowed, as pnpm does with the npm semantic-release depends on.
 */
function resolveNpm() {
  const shim = join(process.env.HOME ?? '', '.volta', 'bin', 'npm');
  if (existsSync(shim)) return shim;

  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '' || dir.includes('node_modules')) continue;
    const candidate = join(dir, 'npm');
    if (existsSync(candidate)) return candidate;
  }
  return 'npm';
}

/**
 * The `redline` a person actually gets when they type it.
 *
 * PATH first. Falling back to Volta's shim matters because a non-interactive
 * shell does not always carry ~/.volta/bin, and reporting "not installed" to
 * somebody whose terminal runs it perfectly well is worse than useless.
 */
function liveBinary() {
  // The shim first, when there is one. It is what a person's interactive shell
  // runs, and it is the copy that goes stale — `command -v redline` in a
  // non-interactive shell can easily resolve to a different, fresher copy and
  // report success for a binary nobody types.
  const shim = join(process.env.HOME ?? '', '.volta', 'bin', 'redline');
  if (existsSync(shim)) return shim;
  return quiet('command -v redline') !== '' ? 'redline' : '';
}

const npm = resolveNpm();
console.log(`  using npm at ${npm}`);

// A unique version per publish, and this is the load-bearing part.
//
// package.json carries 0.0.0-development permanently — semantic-release sets the
// real version at publish time. Both npm and Volta key a global package by
// name@version, so every local publish looked identical to the last one and was
// served from cache: the tarball was rebuilt, the install reported success, and
// Volta restored the SAME old package image behind the shim. Each publish was
// actively downgrading the binary back to whatever was cached first.
//
// Stamping a timestamp version defeats both caches, and has a second use: the
// version `redline --version` prints is now the moment it was installed, so a
// stale binary is visible without any of this archaeology.
const manifestPath = join(ROOT, 'package.json');
const original = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(original);
const localVersion = `0.0.0-local.${Math.floor(Date.now() / 1000)}`;
const tarball = `redlinegate-${localVersion}.tgz`;

// Clear Volta's entry first, and before anything else.
//
// Volta keeps its own copy of a global package — the one its shim runs — apart
// from the node image npm writes to. While it holds an entry, `npm i -g` updates
// only the node image and the shim keeps executing the old code. Order matters:
// clearing it after the pack leaves the shim deleted and not recreated, which is
// how `redline` kept vanishing from PATH.
const hasVolta = quiet('volta --version') !== '';
if (hasVolta) {
  try {
    execFileSync('volta', ['uninstall', 'redlinegate'], {
      stdio: 'ignore',
      env: withoutVoltaGuard(),
    });
  } catch {
    // Not installed through Volta. Nothing to clear.
  }
}

try {
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, version: localVersion }, null, 2) + '\n',
    'utf8'
  );

  run(npm, ['run', 'build']);
  run(npm, ['pack']);

  run(npm, ['i', '-g', `./${tarball}`], { env: withoutVoltaGuard() });
} finally {
  // The real version is semantic-release's to set. Restoring it has to survive a
  // failed build, or a crash here leaves a timestamp version committed.
  writeFileSync(manifestPath, original, 'utf8');
  rmSync(join(ROOT, tarball), { force: true });
}

// Verify by RUNNING both and comparing what they print.
//
// Every other way of checking this was wrong at least once. A marker string in
// --help stays true across builds, so it passed while the installed copy was
// three changes behind. Comparing files means guessing which of the copies the
// command resolves to — and under Volta there are two, in different places,
// only one of which the shim executes. Executing it answers the only question
// that matters: does the command a person types run the code just built.
const binary = liveBinary();
if (binary === '') {
  console.error('\n  redline is not on PATH after installing. Check your shell PATH.\n');
  process.exit(1);
}

const live = quiet(`${binary} --help`);
const built = quiet(`node "${join(ROOT, 'dist', 'bin', 'redline.js')}" --help`);
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

if (live === '' || built === '') {
  console.error('\n  Could not run redline to compare builds.\n');
  process.exit(1);
}
if (live !== built) {
  console.error('\n  The installed redline is STALE: it runs older code than this build.');
  console.error(`    installed ${digest(live)}   built ${digest(built)}`);
  console.error('\n  Under Volta the package image is cached by name@version, and this version');
  console.error('  never changes. Clear it and install again:');
  console.error('    volta uninstall redlinegate');
  console.error('    ~/.volta/bin/npm i -g ./redlinegate-<version>.tgz\n');
  process.exit(1);
}
console.log(`  installed redline runs this build (${digest(built)})`);
