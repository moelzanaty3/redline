#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLI_VERSION } from '../core/version.ts';
import { createLog, type Sink } from '../core/log.ts';
import { exitCodeFor, isRedlineError, RedlineError } from '../core/errors.ts';
import { resolvePlatform as defaultResolvePlatform } from '../platforms/resolve.ts';
import { init } from '../commands/init.ts';
import { verify } from '../commands/verify.ts';
import type { Platform } from '../platforms/types.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const USAGE = [
  'redline — engineering control plane',
  '',
  '  redline init [--profile <name>] [--blocking] [--no-a11y] [--speckit]',
  '      onboard this repository: standards, security floor, merge gate (advisory), registration',
  '',
  '  redline verify [--gate]',
  '      check this repository still matches what .redline.json claims',
  '',
  '  redline --version',
].join('\n');

// node:util's parseArgs throws a plain Error on an unrecognised flag — that
// is bad input, not an internal defect, so it is converted to a usage
// RedlineError right at its own call site rather than left for the run()
// catch-all below to misclassify.
function parseCliArgs<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new RedlineError('usage', error instanceof Error ? error.message : String(error));
  }
}

export interface RunDeps {
  cwd?: string;
  root?: string;
  sink?: Sink;
  resolvePlatform?: (cwd: string) => Promise<Platform>;
}

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const root = deps.root ?? PACKAGE_ROOT;
  const log = createLog(deps.sink);
  const resolve = deps.resolvePlatform ?? ((dir: string) => defaultResolvePlatform(dir));

  const [command, ...rest] = argv;

  if (command === '--version' || command === '-v') {
    log.info(CLI_VERSION);
    return 0;
  }
  if (command === undefined || command === '--help' || command === '-h') {
    log.info(USAGE);
    return command === undefined ? exitCodeFor('usage') : 0;
  }

  try {
    if (command === 'init') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: {
            profile: { type: 'string' },
            blocking: { type: 'boolean', default: false },
            'no-a11y': { type: 'boolean', default: false },
            speckit: { type: 'boolean', default: false },
          },
          allowPositionals: false,
        })
      );

      const platform = await resolve(cwd);
      const report = await init(platform, {
        cwd,
        root,
        ...(values.profile ? { profile: values.profile } : {}),
        menu: {
          blockingGate: values.blocking === true,
          accessibility: values['no-a11y'] !== true,
          speckit: values.speckit === true,
        },
      });

      log.info(`profile ${report.profile}`);
      if (report.migratedFrom) log.info(`migrated from ${report.migratedFrom}`);
      for (const file of report.files) log.info(`  write  ${file}`);
      for (const outcome of report.outcomes) {
        log.info(`  ${outcome.status.padEnd(11)} ${outcome.capability}  ${outcome.detail}`);
      }
      if (report.pendingAdmin.length > 0) {
        log.warn(
          `partially onboarded — an administrator must still enable: ${report.pendingAdmin.join(', ')}`
        );
      }
      if (report.pullRequest) log.info(`pull request: ${report.pullRequest.url}`);
      else if (report.alreadyOnboarded) log.info('already onboarded — nothing to change');
      return 0;
    }

    if (command === 'verify') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: { gate: { type: 'boolean', default: false } },
          allowPositionals: false,
        })
      );
      // resolve is passed unevaluated: verify() must be able to report "not
      // onboarded" without a host credential — see cli/commands/verify.ts.
      const report = await verify(() => resolve(cwd), { cwd, root });
      log.report(report.findings);

      // verify() short-circuits to exactly one finding when .redline.json is
      // missing or corrupt (see cli/commands/verify.ts), precisely so this
      // mapping can tell "never onboarded" (usage, 2) apart from "onboarded
      // but wrong" (failed, 1) without verify() itself owning exit codes.
      const notOnboarded = !report.ok && report.findings.length === 1;
      const exitCode = report.ok ? 0 : notOnboarded ? exitCodeFor('usage') : exitCodeFor('failed');

      if (values.gate === true) {
        if (report.ok) log.info('Redline gate passed.');
        else if (notOnboarded) log.info('Redline gate: repository not onboarded — run redline init.');
        else log.info('Redline gate failed.');
      }
      return exitCode;
    }

    log.error(`unknown command "${command}"`, 'run: redline --help');
    return exitCodeFor('usage');
  } catch (error) {
    if (isRedlineError(error)) {
      log.error(error.message, error.hint);
      return error.exitCode;
    }
    // Not a RedlineError: parseArgs failures are already converted to a
    // usage RedlineError at their own call site (parseCliArgs above), and
    // resolveProfile (unknown profile) and render() (unknown vendor) in
    // cli/render/ throw RedlineError('usage', ...) as of Task 21. So
    // whatever reaches here is a genuine internal defect — a TypeError, a
    // null dereference, an unexpected throw from anywhere — not the user's
    // mistake. Exit 2 would tell the user to check their flags when the
    // tool itself is broken, which sends CI readers debugging the wrong
    // thing. There is no sixth exit code to add for "internal defect", so
    // this reuses exit 4 (host/network) as the least-wrong of the five
    // published codes: at least it does not accuse the user.
    log.error(`redline failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
    return exitCodeFor('host');
  }
}

// npm installs a bin as a symlink on POSIX, so process.argv[1] is the symlink
// path while import.meta.url is the real file. A textual comparison is false
// there, run() never fires, and the process exits 0 having printed nothing —
// which would make `redline verify --gate` pass unconditionally in CI. Compare
// resolved real paths instead. realpathSync throws if argv[1] is not a real
// path (an eval/stdin entry point), which is not this module being executed.
function isDirectlyExecuted(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectlyExecuted()) {
  process.exitCode = await run(process.argv.slice(2));
}
