#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLI_VERSION } from '../core/version.ts';
import { createLog, type Sink } from '../core/log.ts';
import { exitCodeFor, isRedlineError } from '../core/errors.ts';
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
      const { values } = parseArgs({
        args: rest,
        options: {
          profile: { type: 'string' },
          blocking: { type: 'boolean', default: false },
          'no-a11y': { type: 'boolean', default: false },
          speckit: { type: 'boolean', default: false },
        },
        allowPositionals: false,
      });

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
      const { values } = parseArgs({
        args: rest,
        options: { gate: { type: 'boolean', default: false } },
        allowPositionals: false,
      });
      const platform = await resolve(cwd);
      const report = await verify(platform, { cwd, root });
      log.report(report.findings);
      if (values.gate === true) {
        log.info(report.ok ? 'Redline gate passed.' : 'Redline gate failed.');
      }
      return report.ok ? 0 : exitCodeFor('failed');
    }

    log.error(`unknown command "${command}"`, 'run: redline --help');
    return exitCodeFor('usage');
  } catch (error) {
    if (isRedlineError(error)) {
      log.error(error.message, error.hint);
      return error.exitCode;
    }
    // Not a RedlineError: resolveProfile (unknown profile) and render()
    // (unknown vendor) in cli/render/ throw RedlineError('usage', ...) as of
    // Task 21, so the only remaining source here is node:util parseArgs
    // rejecting an unrecognised flag. That is bad input, so it gets the usage
    // exit code rather than being mistaken for a host outage (4) or a
    // permission failure (3) that implies an admin can fix it.
    log.error(error instanceof Error ? error.message : String(error));
    return exitCodeFor('usage');
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  process.exitCode = await run(process.argv.slice(2));
}
