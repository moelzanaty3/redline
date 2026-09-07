#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLI_VERSION } from '../core/version.ts';
import { createLog, type Sink } from '../core/log.ts';
import { exitCodeFor, isRedlineError, RedlineError } from '../core/errors.ts';
import { isSeverity } from '../core/severity.ts';
import { isRung, RUNGS } from '../enforce/ladder.ts';
import {
  resolvePlatform as defaultResolvePlatform,
  type ResolvePlatformOptions,
} from '../platforms/resolve.ts';
import { init, ONBOARD_BRANCH } from '../commands/init.ts';
import {
  capabilitySelection,
  OPTIONAL_CAPABILITIES,
  type MenuSelections,
} from '../config/redline-json.ts';
import { remove, REMOVE_BRANCH } from '../commands/remove.ts';
import { createHostWithdrawal } from '../remove/host.ts';
import { verify } from '../commands/verify.ts';
import { sync } from '../commands/sync.ts';
import { exempt } from '../commands/exempt.ts';
import { formatFinding, policy } from '../commands/policy.ts';
import { review } from '../commands/review.ts';
import { renderFinding } from '../review/schema.ts';
import { embedded } from '../review/engines/embedded.ts';
import { createApiEngine } from '../review/engines/api.ts';
import { METRICS_COMMANDS, helpFor } from '../metrics/options.ts';
import { runMetrics, specFor } from '../metrics/run.ts';
import { createSyncHost } from '../sync/host.ts';
import { verifyRemote } from '../verify/remote.ts';
import { createRemoteVerifyHost } from '../verify/host.ts';
import { standardsVersion } from '../commands/sync.ts';
import type { Platform } from '../platforms/types.ts';
import type { SyncHost } from '../sync/run.ts';
import type { RemoteVerifyHost } from '../verify/remote.ts';
import type { HostWithdrawal } from '../remove/host.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const USAGE = [
  'redline — engineering control plane',
  '',
  '  redline init [--profile <name>] [--vendors <list>] [--blocking] [--no-a11y] [--dry-run] [--repair]',
  '               [--adopt-caller] [--skip <list>] [--with <list>]',
  '      onboard this repository: standards, security floor, merge gate (advisory), registration',
  '      --dry-run   print the plan; writes nothing, needs no credential, contacts no host',
  '      --vendors <list>  comma-separated vendor ids (copilot,agents,claude,cursor) to render for —',
  '                  overrides both detection and whatever .redline.json already recorded; a vendor',
  '                  the org has not enabled never renders no matter what this list names',
  '      --blocking  promote the merge gate from advisory to blocking',
  '      --no-a11y   recorded in .redline.json for a later phase; changes nothing in Phase 1',
  '      --speckit / --no-speckit, --tmf / --no-tmf  the optional context sections rendered',
  '                  into the standards artifacts beside the rules. speckit is on by default',
  '                  and is dropped automatically where the repository already runs Spec Kit;',
  '                  tmf is off unless asked for. Passing the negative on a later run removes',
  '                  a section already rendered — the block is regenerated, not appended to',
  '      --repair    re-apply every capability even if this repository looks already onboarded — for',
  '                  labels, review-ownership, repo-property, gate and merge-policy, whose recorded',
  '                  pendingAdmin entry a plain re-run can never clear on its own; composes with --dry-run',
  `      --skip <list>  comma-separated capabilities this repository does not want Redline to install:`,
  `                  ${OPTIONAL_CAPABILITIES.join(', ')}. Use it when the repository already has its own —`,
  '                  a deselected capability is not attempted, not written, and not reported as missing.',
  '                  The security floor (secret scanning, push protection, dependency alerts) is the',
  '                  organisation-wide minimum and is refused by name rather than deselected',
  '      --with <list>  the same names, selected again — how a deselection recorded in .redline.json is',
  '                  reversed',
  `      --rung <name>  the enforcement rung: ${RUNGS.join(', ')}. A promotion needs recorded`,
  '                  evidence and is refused without it; a demotion is always allowed. Omitting',
  '                  the flag keeps whatever the repository already recorded',
  '      --adopt-caller  let Redline take over the gate machinery file (.github/workflows/redline.yml,',
  '                  .azuredevops/redline-gate.yml) when what is already there carries nothing that',
  '                  attributes it to Redline — a 2.1 caller, in practice. Without it the run refuses',
  '                  rather than overwrite a file that may be the repository\'s own',
  '      omitted flags keep whatever .redline.json already recorded',
  '',
  '  redline remove [--dry-run]',
  '      take Redline back out of this repository: rendered standards, gate machinery, slash',
  '      commands, the host state it applied, and .redline.json last of all — as a pull request',
  '      --dry-run   print the plan; writes nothing, needs no credential, contacts no host',
  '      only content Redline can prove it wrote is removed. A merged file keeps every byte',
  '      outside its REDLINE block; anything unattributable is left in place and named',
  '      the security floor (secret scanning, push protection, dependency alerts) is the',
  '      organisation\'s minimum, not Redline\'s state — no flag here turns it off',
  '',
  '  redline verify [--gate] [--repo <owner/name>]',
  '      check this repository still matches what .redline.json claims',
  '      --repo <owner/name>  check a repository over the API, with no checkout — a check',
  '                  that genuinely needs a working tree reports ?? rather than passing',
  '',
  '  redline review [--staged] [--diff-file <path>] [--base <ref>] [--engine <name>]',
  '      review this change against ONLY the rules that apply to the files it touches',
  '      --engine embedded  emit the bounded prompt for the assistant running this (default)',
  '      --engine api       call a configured endpoint — local or hosted — and parse the result',
  '      local findings are never sent to the telemetry that tunes rules',
  '',
  '  redline policy --diff-file <path>',
  '      evaluate the rules a checker can decide, with no model call. Exit 1 on a BLOCKER',
  '',
  '  redline exempt --body-file <path> [--scope <check>]',
  '      decide whether a pull request carries a valid exemption for a failing process',
  '      check — a reason, an actor and an expiry, not a bare label. Exit 0 if it applies',
  '',
  '  redline sync [--dry-run] [--repo <owner/name>] [--force]',
  '      open a pull request on every registered repository whose standards are behind',
  '      --dry-run   print the plan; opens nothing, pushes nothing',
  '      --repo <owner/name>  one repository instead of the estate',
  '      --force     re-render a repository already at the current standards version',
  '      run from a checkout of the Redline source repository, not a product repo',
  '',
  '  redline metrics <command> [--flags]',
  `      the estate's measurement plane: ${Object.keys(METRICS_COMMANDS).join(', ')}`,
  '      run `redline metrics <command> --help` for its flags. These act on an organisation',
  '      or its collected telemetry, not on the repository you are standing in',
  '',
  '  redline registry [--flags]',
  '      derive the register of onboarded repositories by walking the org',
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
  // Sync spans the estate rather than one repository, so it takes a host of its
  // own instead of the single resolved platform every other command uses.
  syncHost?: () => SyncHost;
  remoteVerifyHost?: () => RemoteVerifyHost;
  // `redline remove` withdraws host state, which the install-and-verify
  // Platform port has no method for — see cli/remove/host.ts.
  hostWithdrawal?: (cwd: string) => HostWithdrawal;
  // Injected so the metrics dispatch can be asserted without executing a runner
  // that talks to GitHub.
  loadRunner?: (path: string) => Promise<unknown>;
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
            'no-speckit': { type: 'boolean' },
            tmf: { type: 'boolean' },
            'no-tmf': { type: 'boolean' },
            'dry-run': { type: 'boolean' },
            repair: { type: 'boolean' },
            'adopt-caller': { type: 'boolean' },
            skip: { type: 'string' },
            with: { type: 'string' },
            rung: { type: 'string' },
          },
          allowPositionals: false,
        })
      );

      const names = (list: string | undefined): string[] =>
        list === undefined
          ? []
          : list
              .split(',')
              .map((name) => name.trim())
              .filter((name) => name !== '');
      // Throws a usage RedlineError on an unknown or non-optional name, before
      // a platform is resolved or a byte is written.
      const selection = capabilitySelection(names(values.skip), names(values.with));

      const menu: Partial<MenuSelections> = { ...selection.menu };
      if (values.blocking !== undefined) menu.blockingGate = values.blocking;
      if (values['no-a11y'] !== undefined) menu.accessibility = !values['no-a11y'];
      if (values.speckit !== undefined) menu.speckit = values.speckit;
      if (values['no-speckit'] === true) menu.speckit = false;
      if (values.tmf !== undefined) menu.tmf = values.tmf;
      if (values['no-tmf'] === true) menu.tmf = false;

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

      if (values.rung !== undefined && !isRung(values.rung)) {
        throw new RedlineError(
          'usage',
          `--rung must be one of ${RUNGS.join(', ')}, not "${values.rung}"`,
          'observe reports and blocks nothing; block-blocker stops a merge on a BLOCKER'
        );
      }

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
        ...(values.rung ? { rung: values.rung } : {}),
        menu,
        capabilities: selection.capabilities,
      });

      log.info(`profile ${report.profile}`);
      if (report.migratedFrom) log.info(`migrated from ${report.migratedFrom}`);
      // Printed on every path, settled included: a report that falls silent
      // about what was never attempted cannot be told from one where it broke.
      if (report.optedOut.length > 0) log.info(`opted out: ${report.optedOut.join(', ')}`);
      for (const note of report.notes) log.info(note);

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

    if (command === 'remove') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: { 'dry-run': { type: 'boolean', default: false } },
          allowPositionals: false,
        })
      );

      const dryRun = values['dry-run'] === true;
      // Same contract as `init --dry-run`: the plan is built from the local
      // checkout, so previewing what backing Redline out would cost needs
      // neither a credential nor a reachable host.
      const platform = await resolve(cwd, dryRun ? { lazyCredentials: true } : {});
      const report = await remove(
        platform,
        () => deps.hostWithdrawal?.(cwd) ?? createHostWithdrawal(cwd),
        { cwd, root, ...(dryRun ? { dryRun: true } : {}) }
      );

      for (const action of report.actions) {
        if (action.kind === 'kept') continue;
        const verb = action.kind === 'delete' ? 'remove ' : 'unmerge';
        log.info(`  ${report.dryRun ? 'would ' : ''}${verb}  ${action.path}  — ${action.reason}`);
      }
      // Printed on every run, dry or not. What was left behind is the half of
      // this command's answer an operator has to act on themselves, and a
      // report that only lists deletions reads as if nothing was left.
      for (const action of report.actions) {
        if (action.kind !== 'kept') continue;
        log.warn(`left in place  ${action.path}  — ${action.reason}`);
      }
      for (const note of report.notes) log.info(note);

      if (report.dryRun) {
        for (const step of report.hostPlan) log.info(`  would apply   ${step}`);
        log.info('dry run — nothing was written, read or changed on the host');
        return 0;
      }

      for (const outcome of report.outcomes) {
        log.info(`  ${outcome.status.padEnd(11)} ${outcome.capability}  ${outcome.detail}`);
      }
      if (report.pendingAdmin.length > 0) {
        log.warn(
          `partially removed — an administrator must still take away: ${report.pendingAdmin.join(', ')}`
        );
      }
      // The host state is withdrawn and the files are gone from the working
      // tree; only the review vehicle is missing. `failed` (1), not host (4):
      // there is nothing to retry, there is a branch to open a pull request from.
      if (report.pullRequestError !== null) {
        log.error(
          `could not open the pull request: ${report.pullRequestError}`,
          `the removal is on branch ${REMOVE_BRANCH} — push it if it is not already on origin, then open the pull request manually`
        );
        return exitCodeFor('failed');
      }
      if (report.pullRequest) log.info(`pull request: ${report.pullRequest.url}`);
      else log.info('nothing left to remove from the working tree — no pull request was opened');
      return 0;
    }

    if (command === 'verify') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: { gate: { type: 'boolean', default: false }, repo: { type: 'string' } },
          allowPositionals: false,
        })
      );

      if (values.repo !== undefined) {
        if (values.gate === true) {
          throw new RedlineError(
            'usage',
            '--gate publishes this repository\'s merge status and cannot target another repository',
            'drop --repo to run the gate, or drop --gate to verify a remote repository'
          );
        }
        const remoteHost = deps.remoteVerifyHost?.() ?? createRemoteVerifyHost();
        const remoteRef = await remoteHost.resolveRef(values.repo);
        const remoteReport = await verifyRemote(remoteHost, remoteRef, {
          root,
          standardsVersion: standardsVersion(root),
        });
        log.info(`${values.repo} (${remoteRef.defaultBranch})`);
        log.report(remoteReport.findings);
        // Same mapping as the local path: one finding means the repository was
        // never onboarded, which is a different thing to tell an operator than
        // onboarded-and-drifted.
        const never = !remoteReport.ok && remoteReport.findings.length === 1;
        return remoteReport.ok ? 0 : never ? exitCodeFor('usage') : exitCodeFor('failed');
      }
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

    if (command === 'review') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: {
            staged: { type: 'boolean', default: false },
            'diff-file': { type: 'string' },
            base: { type: 'string' },
            profile: { type: 'string' },
            engine: { type: 'string', default: 'embedded' },
            provider: { type: 'string', default: 'openai' },
            model: { type: 'string' },
            'base-url': { type: 'string' },
          },
          allowPositionals: false,
        })
      );

      let engine = embedded;
      if (values.engine === 'api') {
        if (!values.model) {
          throw new RedlineError(
            'usage',
            '--engine api needs --model <name>',
            'a model baked into the tool is one nobody can change when it is deprecated'
          );
        }
        // Not a silent fallback: `--provider anthropc` used to become openai and
        // send the diff to a local endpoint that was not running, reporting a
        // connection error for what was a typo.
        if (values.provider !== 'openai' && values.provider !== 'anthropic') {
          throw new RedlineError(
            'usage',
            `--provider must be openai or anthropic, not "${values.provider}"`,
            'openai covers every OpenAI-compatible endpoint, including a local one'
          );
        }
        const provider = values.provider;
        engine = createApiEngine({
          provider,
          model: values.model,
          ...(values['base-url'] ? { baseUrl: values['base-url'] } : {}),
        });
      } else if (values.engine !== 'embedded') {
        throw new RedlineError('usage', `unknown engine "${values.engine}" — use embedded or api`);
      }

      const report = await review(engine, {
        cwd,
        root,
        ...(values.profile ? { profile: values.profile } : {}),
        ...(values.base ? { base: values.base } : {}),
        source: values['diff-file']
          ? { kind: 'diff-file', path: values['diff-file'] }
          : values.staged
            ? { kind: 'staged' }
            : { kind: 'worktree' },
      });

      log.info(
        `profile ${report.scope.profile} — rules in scope: core` +
          (report.scope.stacks.length ? `, ${report.scope.stacks.join(', ')}` : '')
      );
      // A file no stack covers is a gap in the standard. Reviewing it against
      // core alone and saying nothing hides that.
      if (report.scope.uncovered.length > 0) {
        log.warn(
          `no stack covers ${report.scope.uncovered.length} changed file(s), so only the core rules ` +
            `applied to them: ${report.scope.uncovered.slice(0, 5).join(', ')}` +
            (report.scope.uncovered.length > 5 ? ', and more' : '')
        );
      }

      if (report.prompt !== null) {
        log.info('');
        log.info(report.prompt);
        log.info('');
        log.info(report.note ?? '');
        return 0;
      }

      for (const finding of report.findings) {
        log.info(`${finding.file}:${finding.line}`);
        log.info(`  ${renderFinding(finding)}`);
      }
      for (const { reason } of report.rejected) {
        log.warn(`discarded a finding from the model: ${reason}`);
      }
      log.info(
        report.findings.length === 0
          ? 'no findings — an empty review is a valid review'
          : `${report.findings.length} finding(s)`
      );
      // Said out loud on every run. A local review is opt-in and enforces
      // nothing; the pull request review remains the system of record.
      log.info('local review — not recorded, and not counted in rule-tuning telemetry');

      // Always 0. This is a pre-flight convenience, and a non-zero exit would
      // invite someone to wire it into CI as a second gate, where it would
      // enforce nothing while looking like it did.
      return 0;
    }

    if (command === 'policy') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: { 'diff-file': { type: 'string' }, 'fail-on': { type: 'string' } },
          allowPositionals: false,
        })
      );
      const diffFile = values['diff-file'];
      if (!diffFile) throw new RedlineError('usage', 'redline policy needs --diff-file <path>');
      const failOn = values['fail-on'];
      if (failOn !== undefined && !isSeverity(failOn)) {
        throw new RedlineError('usage', `--fail-on must be BLOCKER, HIGH or SUGGESTION, not "${failOn}"`);
      }

      const report = policy({ root, diffFile, ...(failOn ? { failOn } : {}) });

      for (const finding of report.findings) {
        log.info(`${finding.file}:${finding.line}`);
        log.info(`  ${formatFinding(finding)}`);
      }
      // Said on every run, including the clean one. A reviewer has to be able to
      // tell "checked and clean" from "not checked", and silence looks the same
      // as both.
      log.info(
        report.findings.length === 0
          ? `no deterministic findings — ${report.evaluated.length} rule(s) evaluated with no model call`
          : `${report.findings.length} finding(s) from ${report.evaluated.length} deterministic rule(s)`
      );
      for (const id of report.unimplemented) {
        log.warn(`${id} is classified deterministic but has no check — it is enforced by nobody`);
      }

      return report.ok ? 0 : exitCodeFor('failed');
    }

    if (command === 'exempt') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: { 'body-file': { type: 'string' }, scope: { type: 'string' } },
          allowPositionals: false,
        })
      );
      const bodyFile = values['body-file'];
      if (!bodyFile) {
        throw new RedlineError('usage', 'redline exempt needs --body-file <path>');
      }

      const report = exempt({
        bodyFile,
        ...(values.scope ? { scope: values.scope } : {}),
      });
      for (const message of report.messages) {
        if (report.applies) log.info(message);
        else log.warn(message);
      }
      // Exit 1, not 2: a pull request without a valid exemption is a normal,
      // expected answer the gate acts on — not the caller misusing the command.
      return report.applies ? 0 : exitCodeFor('failed');
    }

    if (command === 'sync') {
      const { values } = parseCliArgs(() =>
        parseArgs({
          args: rest,
          options: {
            'dry-run': { type: 'boolean', default: false },
            repo: { type: 'string' },
            force: { type: 'boolean', default: false },
          },
          allowPositionals: false,
        })
      );

      const dryRun = values['dry-run'] === true;
      // A dry run reads the register and the target's own files but never
      // writes, so it still needs a read credential — unlike `init --dry-run`,
      // which contacts no host at all. Saying so beats a confusing 403.
      const report = await sync(deps.syncHost?.() ?? createSyncHost(), {
        root,
        cwd,
        ...(values.repo ? { repo: values.repo } : {}),
        ...(values.force ? { force: true } : {}),
        ...(dryRun ? { dryRun: true } : {}),
      });

      log.info(`standards v${report.plan.standardsVersion} — ${report.plan.targets.length} target(s), ${report.plan.skipped.length} skipped`);
      for (const { repo, outcome } of report.results) {
        if (outcome.kind === 'failed') log.error(`  ${repo}: ${outcome.detail}`);
        else if (outcome.kind === 'current') log.info(`  ${repo}: already current`);
        else if (outcome.kind === 'not-onboarded') log.warn(`  ${repo}: no .redline.json — not onboarded`);
        else if (outcome.kind === 'stale-artifacts') {
          // Content is current, but the target still carries files this profile
          // no longer renders. Sync will not delete another repository's files;
          // saying nothing reported it as healthy, which is what silent drift is.
          log.warn(
            `  ${repo}: current, but still carrying ${outcome.paths.join(', ')} — ` +
              'a stack or vendor left this profile. Re-run redline init there to clear them'
          );
        } else log.info(`  ${repo}: ${outcome.kind} ${outcome.url}`);
      }
      if (dryRun) log.info('dry run — no branch was pushed and no pull request was opened');

      // A partially failed estate run is a failure. Reporting 0 because most
      // repositories succeeded is how a distribution quietly stops covering the
      // ones it cannot reach.
      return report.failures > 0 ? exitCodeFor('failed') : 0;
    }

    if (command === 'metrics' || command === 'registry') {
      // The subcommand is a positional for `metrics` and absent for `registry`,
      // so the flags are whatever follows it.
      const [sub, ...flagArgs] = command === 'metrics' ? rest : ['registry', ...rest];
      if (command === 'metrics' && (sub === undefined || sub === '--help' || sub === '-h')) {
        log.info('redline metrics <command>');
        log.info('');
        for (const [name, spec] of Object.entries(METRICS_COMMANDS)) {
          log.info(`  ${name.padEnd(14)} ${spec.summary}`);
        }
        log.info('');
        log.info('Run `redline metrics <command> --help` for its flags.');
        return sub === undefined ? exitCodeFor('usage') : 0;
      }

      const spec = specFor(sub!);
      if (flagArgs.includes('--help') || flagArgs.includes('-h')) {
        log.info(helpFor(command === 'registry' ? 'registry' : `metrics ${sub}`, spec));
        return 0;
      }

      // Built from the same table that validates and documents them, so a flag
      // cannot exist in one of the three and not the others.
      const options = Object.fromEntries(
        Object.entries(spec.options).map(([flag, option]) => [
          flag,
          { type: option.type === 'boolean' ? ('boolean' as const) : ('string' as const) },
        ])
      );
      const { values } = parseCliArgs(() =>
        parseArgs({ args: flagArgs, options, allowPositionals: false })
      );

      await runMetrics(sub!, { root, flags: values, ...(deps.loadRunner ? { load: deps.loadRunner } : {}) });
      return 0;
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
