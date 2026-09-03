#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLI_VERSION } from '../core/version.ts';
import { createLog, type Sink } from '../core/log.ts';
import { exitCodeFor, isRedlineError, RedlineError } from '../core/errors.ts';
import {
  resolvePlatform as defaultResolvePlatform,
  type ResolvePlatformOptions,
} from '../platforms/resolve.ts';
import { init, ONBOARD_BRANCH } from '../commands/init.ts';
import type { MenuSelections } from '../config/redline-json.ts';
import { verify } from '../commands/verify.ts';
import type { Platform } from '../platforms/types.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const USAGE = [
  'redline — engineering control plane',
  '',
  '  redline init [--profile <name>] [--vendors <list>] [--blocking] [--no-a11y] [--speckit] [--dry-run] [--repair]',
  '               [--adopt-caller]',
  '      onboard this repository: standards, security floor, merge gate (advisory), registration',
  '      --dry-run   print the plan; writes nothing, needs no credential, contacts no host',
  '      --vendors <list>  comma-separated vendor ids (copilot,agents,claude,cursor) to render for —',
  '                  overrides both detection and whatever .redline.json already recorded; a vendor',
  '                  the org has not enabled never renders no matter what this list names',
  '      --blocking  promote the merge gate from advisory to blocking',
  '      --no-a11y, --speckit  recorded in .redline.json for later phases; changes nothing in Phase 1',
  '      --repair    re-apply every capability even if this repository looks already onboarded — for',
  '                  labels, review-ownership, repo-property, gate and merge-policy, whose recorded',
  '                  pendingAdmin entry a plain re-run can never clear on its own; composes with --dry-run',
  '      --adopt-caller  let Redline take over the gate machinery file (.github/workflows/redline.yml,',
  '                  .azuredevops/redline-gate.yml) when what is already there carries nothing that',
  '                  attributes it to Redline — a 2.1 caller, in practice. Without it the run refuses',
  '                  rather than overwrite a file that may be the repository\'s own',
  '      omitted flags keep whatever .redline.json already recorded',
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
  resolvePlatform?: (cwd: string, opts?: ResolvePlatformOptions) => Promise<Platform>;
}

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const root = deps.root ?? PACKAGE_ROOT;
  const log = createLog(deps.sink);
  const resolve =
    deps.resolvePlatform ??
    ((dir: string, options?: ResolvePlatformOptions) => defaultResolvePlatform(dir, options));

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
          // No `default`: parseArgs then leaves an untyped flag `undefined`,
          // which is how init() tells "the user asked for advisory" from "the
          // user said nothing, keep what the repository already chose". A
          // default here silently demoted every --blocking repo on its next
          // plain re-run.
          options: {
            profile: { type: 'string' },
            vendors: { type: 'string' },
            blocking: { type: 'boolean' },
            'no-a11y': { type: 'boolean' },
            speckit: { type: 'boolean' },
            'dry-run': { type: 'boolean' },
            repair: { type: 'boolean' },
            'adopt-caller': { type: 'boolean' },
          },
          allowPositionals: false,
        })
      );

      const menu: Partial<MenuSelections> = {};
      if (values.blocking !== undefined) menu.blockingGate = values.blocking;
      if (values['no-a11y'] !== undefined) menu.accessibility = !values['no-a11y'];
      if (values.speckit !== undefined) menu.speckit = values.speckit;

      // Same "no default" reasoning as the menu flags above: undefined is how
      // init() tells "nothing typed, keep detection or the recorded
      // selection" from "the caller typed an empty list".
      const vendors =
        values.vendors !== undefined
          ? values.vendors
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v !== '')
          : undefined;

      const dryRun = values['dry-run'] === true;
      const repair = values.repair === true;
      const adoptCaller = values['adopt-caller'] === true;
      // A dry run sends no request, so it must not require a credential —
      // see ResolvePlatformOptions.lazyCredentials. Every other path here
      // resolves one up front, exactly as before.
      const platform = await resolve(cwd, dryRun ? { lazyCredentials: true } : {});
      const report = await init(platform, {
        cwd,
        root,
        ...(values.profile ? { profile: values.profile } : {}),
        ...(vendors ? { vendors } : {}),
        ...(dryRun ? { dryRun: true } : {}),
        ...(repair ? { repair: true } : {}),
        ...(adoptCaller ? { adoptCaller: true } : {}),
        menu,
      });

      log.info(`profile ${report.profile}`);
      if (report.migratedFrom) log.info(`migrated from ${report.migratedFrom}`);

      if (report.dryRun) {
        log.info('dry run — nothing was written, read or changed on the host');
        if (report.alreadyOnboarded) {
          log.info('already onboarded — no file would change (host settings were not read)');
          return 0;
        }
        for (const file of report.files) {
          log.info(`  would ${report.removals.includes(file) ? 'remove' : 'write '}  ${file}`);
        }
        for (const step of report.hostPlan) log.info(`  would apply   ${step}`);
        for (const [key, value] of Object.entries(report.menu)) log.info(`  menu   ${key}: ${value}`);
        return 0;
      }

      for (const file of report.files) {
        log.info(`  ${report.removals.includes(file) ? 'remove' : 'write '}  ${file}`);
      }
      for (const outcome of report.outcomes) {
        log.info(`  ${outcome.status.padEnd(11)} ${outcome.capability}  ${outcome.detail}`);
      }
      if (report.pendingAdmin.length > 0) {
        // On the already-onboarded path this run applied nothing, so the list
        // is what was recorded — not a finding this run made. Saying so is the
        // difference between a status and a claim.
        log.warn(
          `partially onboarded — an administrator must still enable: ${report.pendingAdmin.join(', ')}` +
            (report.alreadyOnboarded ? ' (as recorded at the last run)' : '')
        );
      }
      // The host settings and .redline.json are already written — only the
      // review vehicle is missing. That is `failed` (1), not host (4): there
      // is nothing to retry, there is a branch to open a pull request from.
      // The hint does not assert the push succeeded, because the same wrap
      // catches a git step that failed before it: the error line above is the
      // git error itself, which already says where the work was left.
      if (report.pullRequestError !== null) {
        log.error(
          `could not open the pull request: ${report.pullRequestError}`,
          `the Redline changes are on branch ${ONBOARD_BRANCH} — push it if it is not already on origin, then open the pull request manually`
        );
        return exitCodeFor('failed');
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
      const report = await verify(() => resolve(cwd), { cwd, root, gate: values.gate === true });
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
