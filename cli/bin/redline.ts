#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLI_VERSION } from '../core/version.ts';
import { createLog, paintMarker, paintSeverity, type Log, type Sink } from '../core/log.ts';
import { closest } from '../core/suggest.ts';
import {
  COMMANDS,
  commandHelp,
  completionScript,
  completionTree,
  isCommand,
  parseCliArgs,
  parseCommand,
  SHELLS,
  usage,
} from './commands.ts';
import {
  clear as clearFunnel,
  record as recordFunnel,
  summarise as summariseFunnel,
  telemetryEnabled,
  telemetryPath,
  TELEMETRY_ENV,
  type FunnelEvent,
} from '../core/telemetry.ts';
import { exitCodeFor, isRedlineError, RedlineError } from '../core/errors.ts';
import { isSeverity } from '../core/severity.ts';
import { isRung, RUNGS } from '../enforce/ladder.ts';
import {
  resolvePlatform as defaultResolvePlatform,
  type ResolvePlatformOptions,
} from '../platforms/resolve.ts';
import { init, ONBOARD_BRANCH } from '../commands/init.ts';
import { explain, loadRules } from '../rules/catalogue.ts';
import { formatStatus, status } from '../commands/status.ts';
import { createGit } from '../core/git.ts';
import { parseRemote } from '../platforms/detect.ts';
import { Cancelled, createPrompter, isInteractive, type Prompter, type Task } from '../ui/prompt.ts';
import { renderReport } from '../ui/report.ts';
import { colorDepth, colorEnabled, glyphs, palette, type Palette } from '../ui/tty.ts';
import { gatherFacts } from '../ui/facts.ts';
import { runWizard, type Host as WizardHost, type WizardAnswers } from '../ui/wizard.ts';
import {
  capabilitySelection,
  OPTIONAL_CAPABILITIES,
  readConfig,
  type MenuSelections,
} from '../config/redline-json.ts';
import { remove, REMOVE_BRANCH } from '../commands/remove.ts';
import { createHostWithdrawal } from '../remove/host.ts';
import { verify } from '../commands/verify.ts';
import { sync } from '../commands/sync.ts';
import { DEFAULT_CONCURRENCY } from '../sync/run.ts';
import { exempt } from '../commands/exempt.ts';
import { formatFinding, policy } from '../commands/policy.ts';
import { review } from '../commands/review.ts';
import { renderFinding } from '../review/schema.ts';
import { embedded } from '../review/engines/embedded.ts';
import { createApiEngine } from '../review/engines/api.ts';
import { detectModel, detectProvider, MODEL_ENV, PROVIDER_ENV } from '../review/detect.ts';
import { METRICS_COMMANDS, REGISTRY_COMMAND, helpFor } from '../metrics/options.ts';
import { runMetrics, specFor } from '../metrics/run.ts';
import { createSyncHost } from '../sync/host.ts';
import { verifyRemote } from '../verify/remote.ts';
import { createRemoteVerifyHost } from '../verify/host.ts';
import { standardsVersion } from '../commands/sync.ts';
import { doctor } from '../commands/doctor.ts';
import { evidenceReport, formatEvidence, recordEvidence } from '../commands/evidence.ts';
import { nodeSupport, unsupportedNodeHint, unsupportedNodeMessage } from '../core/runtime.ts';
import { GATE_PIPELINES, isGatePipeline, isGateSource } from '../platforms/types.ts';
import type { Platform, RepoRef } from '../platforms/types.ts';
import type { SyncHost } from '../sync/run.ts';
import type { RemoteVerifyHost } from '../verify/remote.ts';
import type { HostWithdrawal } from '../remove/host.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEBUG_ENV = 'REDLINE_DEBUG';
const ISSUES_URL = 'https://github.com/moelzanaty3/redline/issues';

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
  // Injected so the Node guard can be asserted on both sides of the boundary
  // without the test suite depending on the runtime it happens to run under.
  nodeVersion?: string;
  // Whether a stepped menu can be shown. Injected so the existing command tests
  // — which run with no TTY but must keep asserting the flag path — cannot be
  // silently answered by a prompt nobody is there to fill in.
  isInteractive?: () => boolean;
  // Injected together so a test can drive the menu without a terminal.
  prompter?: () => Prompter;
}

// Timing and the funnel record wrap the command rather than living inside it:
// every one of the forty-odd returns below would otherwise need a line, and the
// one that got missed would be the interesting one.
export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const startedAt = Date.now();
  const command = argv[0] ?? '--help';
  let code = 0;
  let errorCode: string | undefined;
  try {
    code = await runCommand(argv, deps);
    return code;
  } catch (error) {
    code = 4;
    errorCode = isRedlineError(error) ? error.kind : 'internal';
    throw error;
  } finally {
    if (telemetryEnabled()) {
      recordFunnel({
        at: new Date().toISOString(),
        // The command word only, and only if it is one of ours. Never the
        // arguments — a --diff-file path or a --repo names a person's machine
        // and a customer's project — and never an unrecognised word either:
        // `redline ghp_xxx` is a paste that missed the terminal it was meant
        // for, and writing it to a file would be this tool breaking its own
        // core/customer-data-in-logs rule on its own author.
        command: funnelName(command),
        outcome: outcomeFor(code),
        ms: Date.now() - startedAt,
        ...(errorCode === undefined ? {} : { code: errorCode }),
      });
    }
  }
}

function funnelName(command: string): string {
  if (command === '--version' || command === '-v') return 'version';
  if (command === '--help' || command === '-h') return 'help';
  return isCommand(command) ? command : 'unknown';
}

function outcomeFor(code: number): FunnelEvent['outcome'] {
  if (code === 0) return 'ok';
  if (code === 2) return 'usage';
  if (code === 3) return 'permission';
  if (code === 4) return 'host';
  return 'failed';
}

async function runCommand(argv: string[], deps: RunDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const root = deps.root ?? PACKAGE_ROOT;
  // Colour is decided the same way the prompts decide it, and from the same
  // env: NO_COLOR, FORCE_COLOR, a dumb terminal and a pipe all have to mean the
  // same thing in every part of one run. Per stream, because stdout and stderr
  // are redirected independently. An injected sink is a test or a pipe, so it
  // is never painted — and neither is a JSON document, which log.info never
  // paints.
  const depth = colorDepth(process.env);
  const paint = (isTty: boolean): Palette =>
    palette(deps.sink === undefined && colorEnabled(process.env, isTty), depth);
  const out = paint(process.stdout.isTTY === true);
  const log = createLog(deps.sink, { out, err: paint(process.stderr.isTTY === true) });
  const interactive = deps.isInteractive ?? (() => isInteractive());

  // The host is read from the git remote alone, with no credential and no
  // request — the menu's first question has to render before either exists,
  // because the preview answers contact no host. A remote this cannot classify is
  // `null`, which is exactly the case the host question is there to settle.
  const detectHost = (): WizardHost | null => {
    try {
      return parseRemote(createGit(cwd).remoteUrl()).host;
    } catch {
      return null;
    }
  };

  // One host round-trip, before the first question rather than after the last.
  //
  // `init` reads the repository anyway — this is that same read, moved. What
  // it buys is when the answer arrives: an unreachable repository used to be
  // discovered after ten questions had been answered, and the answers were
  // held in memory only, so the error took them with it. The reader's next
  // move was to answer all ten again.
  //
  // Failure is a fact handed to the menu, not an abort. Two of the three
  // things the menu can do contact no host at all, and someone evaluating
  // Redline against a repository they have no token for is exactly who the
  // credential-free preview exists for — see ResolvePlatformOptions.
  const checkReachable = async (
    dir: string
  ): Promise<{ platform: Platform; ref: RepoRef | null; unreachable: string | null }> => {
    const platform = await resolve(dir, { lazyCredentials: true });
    try {
      return { platform, ref: await platform.repoRef(dir), unreachable: null };
    } catch (error) {
      // Only the two kinds a preview can legitimately outrun. A usage error —
      // no remote, a remote on a host Redline does not know — is not a
      // reachability problem and is not survivable by choosing a dry run, so
      // it keeps aborting the run rather than becoming a note nobody can act
      // on from inside the menu.
      if (!isRedlineError(error) || (error.kind !== 'host' && error.kind !== 'permission')) {
        throw error;
      }
      return {
        platform,
        ref: null,
        unreachable: error.hint === undefined ? error.message : `${error.message}\n${error.hint}`,
      };
    }
  };

  const runInitWizard = async (
    dir: string,
    packageRoot: string,
    unreachable: string | null
  ): Promise<{ answers: WizardAnswers; prompter: Prompter } | null> => {
    const prompter = deps.prompter?.() ?? createPrompter();
    const answers = await runWizard(
      prompter,
      gatherFacts({ cwd: dir, root: packageRoot, detectedHost: detectHost(), unreachable })
    );
    // The prompter comes back with the answers because the work starts the
    // moment the last question is answered, and the operator has to be able to
    // see that it did. Building a second one here would mean a second set of
    // signal handlers on the same terminal.
    return { answers, prompter };
  };

  const reportTheme = {
    palette: out,
    glyphs: glyphs(process.env),
    width: process.stdout.columns ?? 80,
  };
  const resolve =
    deps.resolvePlatform ??
    ((dir: string, options?: ResolvePlatformOptions) => defaultResolvePlatform(dir, options));

  const [command, ...rest] = argv;

  if (command === '--version' || command === '-v') {
    log.info(CLI_VERSION);
    return 0;
  }
  if (command === undefined || command === '--help' || command === '-h') {
    log.info(usage(out));
    return command === undefined ? exitCodeFor('usage') : 0;
  }

  // Ahead of the Node guard for the same reason --help is: reading how a
  // command works must not depend on being able to run it. `metrics` and
  // `registry` have no section because their help is generated from their own
  // option tables further down.
  const section = isCommand(command) ? COMMANDS[command].help : null;
  if (section !== null && (rest.includes('--help') || rest.includes('-h'))) {
    log.info(commandHelp(section, out));
    return 0;
  }

  // Before anything else, and after --version/--help so a broken runtime can
  // still be identified. npm's engines field only warns, so without this the
  // first symptom of Node 18 is a parse error inside a dependency, raised
  // partway through a command that may already have written files.
  //
  // `doctor` is exempt: it exists to say this out loud, in a list, with the
  // three ways out. Refusing to run the diagnostic on the machine that needs
  // diagnosing is the failure mode this whole guard is here to avoid.
  // `completion` too: it prints a fixed script that a shell sources at startup,
  // and an error there would print on every new terminal.
  if (command !== 'doctor' && command !== 'funnel' && command !== 'completion') {
    const support = nodeSupport(deps.nodeVersion ?? process.version);
    if (!support.ok) {
      log.error(unsupportedNodeMessage(deps.nodeVersion ?? process.version));
      log.info(unsupportedNodeHint(command));
      log.info('');
      log.info('`redline doctor` runs on any Node and reports the rest of what it finds.');
      return exitCodeFor('usage');
    }
  }

  try {
    if (command === 'doctor') {
      const { values } = parseCommand('doctor', COMMANDS.doctor, rest);

      const report = doctor({ cwd, ...(deps.nodeVersion === undefined ? {} : { nodeVersion: deps.nodeVersion }) });
      if (values.json === true) {
        log.info(JSON.stringify(report, null, 2));
      } else {
        // The same three-column shape `verify` prints, deliberately: these two
        // are read back to back when something is wrong, and a second layout
        // for the same kind of answer is one more thing to parse by eye.
        const marker = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' } as const;
        for (const check of report.checks) {
          const detail = check.status === 'ok' ? out.dim(check.detail) : check.detail;
          log.info(`${paintMarker(marker[check.status], out)}  ${check.name.padEnd(22)} ${detail}`);
          if (check.fix !== undefined) {
            for (const line of check.fix.split('\n')) log.info(`        ${line}`);
          }
        }
      }
      // A warning is not a failure. `credential` warns on a machine that has
      // deliberately not logged in, and the preview commands are the ones that
      // machine is meant to be running — exiting non-zero there would fail a
      // CI step that is working exactly as intended.
      return report.ok ? 0 : exitCodeFor('failed');
    }

    if (command === 'init') {
      const { values } = parseCommand('init', COMMANDS.init, rest);

      // `redline init` with nothing after it, at a terminal, is a person asking
      // to be walked through onboarding — so walk them through it. Any flag at
      // all means the caller has already decided, and the menu would be in the
      // way; CI and pipes never see it (isInteractive), so the scripted path is
      // byte-identical to what it was before the menu existed.
      const checked = rest.length === 0 && interactive() ? await checkReachable(cwd) : null;
      const wizard = checked ? await runInitWizard(cwd, root, checked.unreachable) : null;

      const names = (list: string | undefined): string[] =>
        list === undefined
          ? []
          : list
              .split(',')
              .map((name) => name.trim())
              .filter((name) => name !== '');
      // Throws a usage RedlineError on an unknown or non-optional name, before
      // a platform is resolved or a byte is written.
      //
      // The menu answers arrive here as the same two lists the flags produce,
      // rather than as a parallel set of options: a capability the operator
      // deselected in the wizard is a `--skip`, and there is exactly one place
      // that decides what a skip means.
      const selection = wizard
        ? capabilitySelection(
            OPTIONAL_CAPABILITIES.filter((name) => !wizard.answers.capabilities.includes(name)),
            [...wizard.answers.capabilities]
          )
        : capabilitySelection(names(values.skip), names(values.with));

      const menu: Partial<MenuSelections> = { ...selection.menu };
      if (values.blocking !== undefined) menu.blockingGate = values.blocking;
      if (values['no-a11y'] !== undefined) menu.accessibility = !values['no-a11y'];
      if (values.speckit !== undefined) menu.speckit = values.speckit;
      if (values['no-speckit'] === true) menu.speckit = false;
      if (values.tmf !== undefined) menu.tmf = values.tmf;
      if (values['no-tmf'] === true) menu.tmf = false;
      if (wizard) {
        menu.speckit = wizard.answers.speckit;
        menu.tmf = wizard.answers.tmf;
      }

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

      if (values.pipeline !== undefined && !isGatePipeline(values.pipeline)) {
        throw new RedlineError(
          'usage',
          `--pipeline must be one of ${GATE_PIPELINES.join(', ')}, not "${values.pipeline}"`,
          'a repository on GitHub whose pull request checks are Azure Pipelines wants azure-pipelines'
        );
      }
      if (values['gate-source'] !== undefined && !isGateSource(values['gate-source'])) {
        throw new RedlineError(
          'usage',
          `--gate-source must be org or local, not "${values['gate-source']}"`,
          'org references the reusable gate in the organisation .github repository; local vendors a ' +
            'copy into this repository, which means a pull request can edit the gate judging it'
        );
      }
      const pipelineChoice = wizard?.answers.pipeline ?? values.pipeline;
      const gateSourceChoice = wizard?.answers.gateSource ?? values['gate-source'];

      const dryRun = values['dry-run'] === true || wizard?.answers.action === 'dry-run';
      const noCommit = values['no-commit'] === true || wizard?.answers.action === 'no-commit';
      const repair = values.repair === true;
      const adoptCaller = values['adopt-caller'] === true;
      // A dry run sends no request, so it must not require a credential —
      // see ResolvePlatformOptions.lazyCredentials. --no-commit contacts no host
      // either, so it must not demand a credential up front any more than a dry
      // run does — working offline is most of the reason it exists. Every other
      // path here resolves one up front, exactly as before.
      // Reused when the reachability check already built one, so it costs
      // no extra request: its client is lazy, which is what every wizard
      // action needs — the two preview actions must not demand a credential,
      // and `apply` resolves one on its first request as it always did.
      const platform =
        checked?.platform ?? (await resolve(cwd, dryRun || noCommit ? { lazyCredentials: true } : {}));
      const profileChoice = wizard?.answers.profile ?? values.profile;
      const vendorChoice = wizard ? [...wizard.answers.vendors] : vendors;
      const rungChoice = wizard?.answers.rung ?? values.rung;
      // Read here rather than inside init() so the same record is what `redline
      // evidence` reports and what a promotion is judged against — two readers
      // of one file, not two notions of what was measured.
      const recordedEvidence = readConfig(cwd)?.evidence ?? null;
      const setupChoice = wizard
        ? [...wizard.answers.setup]
        : values.setup?.split(',').map((id) => id.trim()).filter((id) => id !== '');
      const branchChoice = values.branches?.split(',').map((b) => b.trim()).filter((b) => b !== '');
      const ownerChoice = wizard
        ? [...wizard.answers.reviewOwners]
        : values['review-owners']?.split(',').map((o) => o.trim()).filter((o) => o !== '');
      const integrationChoice = wizard
        ? [...wizard.answers.integrations]
        : values.integrations?.split(',').map((id) => id.trim()).filter((id) => id !== '');

      // Only the wizard path spins: a scripted `redline init` in CI has nobody
      // watching, and an animated line in a build log is noise with no reader.
      // Reassigned, not just stopped: the fallback prompt below has to take the
      // terminal back from the spinner to be readable at all, and the run
      // carries on afterwards — so it gets a fresh one rather than finishing in
      // silence.
      let task: Task | null = wizard?.prompter.task('onboarding this repository') ?? null;
      const report = await init(platform, {
        cwd,
        root,
        ...(wizard ? { onStep: (label: string) => task?.update(label) } : {}),
        ...(profileChoice ? { profile: profileChoice } : {}),
        ...(vendorChoice ? { vendors: vendorChoice } : {}),
        ...(dryRun ? { dryRun: true } : {}),
        ...(noCommit ? { noCommit: true } : {}),
        ...(checked?.ref ? { ref: checked.ref } : {}),
        ...(repair ? { repair: true } : {}),
        ...(adoptCaller ? { adoptCaller: true } : {}),
        ...(rungChoice ? { rung: rungChoice } : {}),
        // The recorded measurement, read back from .redline.json.
        //
        // Without this the ladder was decorative: canPromote asked for evidence,
        // nothing ever passed any, so every promotion was refused and every
        // repository stayed at observe forever. Absent is still absent — a
        // repository nobody has measured is refused, which is correct — but a
        // repository that HAS been measured can now climb.
        ...(recordedEvidence === null ? {} : { evidence: recordedEvidence }),
        ...(integrationChoice ? { integrations: integrationChoice } : {}),
        ...(ownerChoice && ownerChoice.length > 0 ? { reviewOwners: ownerChoice } : {}),
        ...(branchChoice && branchChoice.length > 0 ? { branches: branchChoice } : {}),
        ...(setupChoice && setupChoice.length > 0 ? { setup: setupChoice } : {}),
        ...(pipelineChoice ? { pipeline: pipelineChoice } : {}),
        // Distinguished from absent rather than truthy-checked: `--docs-url ""`
        // is how a repository clears a link it no longer wants, and a truthy
        // check would silently keep the old one.
        ...(values['docs-url'] !== undefined ? { docsUrl: values['docs-url'] } : {}),
        ...(gateSourceChoice ? { gateSource: gateSourceChoice } : {}),
        // Offered only at a terminal, and only when the planning pass finds the
        // organisation publishes no gate. A scripted run gets the denial it has
        // always got: vendoring the gate is a weaker control, and nothing
        // unattended should be able to choose it on an operator's behalf.
        ...(wizard
          ? {
              onGateFallback: async (detail: string): Promise<boolean> => {
                task?.stop();
                const vendor = await wizard.prompter.select(
                  `${detail}. Install the gate where?`,
                  [
                    {
                      value: false,
                      label: 'skip the gate for now',
                      hint: 'everything else installs; re-run once the org publishes one',
                    },
                    {
                      value: true,
                      label: 'vendor it into this repository',
                      hint: 'weaker: a pull request can edit the gate that judges it',
                    },
                  ],
                  false
                );
                task = wizard.prompter.task('onboarding this repository');
                return vendor;
              },
            }
          : {}),
        menu,
        capabilities: selection.capabilities,
      }).finally(() => task?.stop());

      const summary = {
        profile: report.profile,
        migratedFrom: report.migratedFrom,
        optedOut: report.optedOut,
        notes: report.notes,
        files: report.files,
        removals: report.removals,
        outcomes: report.outcomes,
        pullRequestUrl: report.pullRequest?.url ?? null,
        pendingAdmin: report.pendingAdmin,
        dryRun: report.dryRun,
        hostPlan: report.hostPlan,
      };

      if (report.dryRun) {
        if (report.alreadyOnboarded) {
          for (const line of renderReport({ ...summary, files: [], hostPlan: [] }, reportTheme)) {
            log.info(line);
          }
          log.info('');
          log.info('already onboarded — no file would change (host settings were not read)');
          return 0;
        }
        for (const line of renderReport(summary, reportTheme)) log.info(line);
        log.info('');
        // The menu is the half of a dry run the file list cannot show: two of
        // its answers move no file at all, and a preview that hid them would
        // send an operator to `--blocking` to find out what `--blocking` did.
        log.info(
          `  menu: ${Object.entries(report.menu)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ')}`
        );
        log.info('');
        log.info(out.yellow('dry run — nothing was written, read or changed on the host'));
        return 0;
      }

      for (const line of renderReport(summary, reportTheme)) log.info(line);
      log.info('');
      // Said plainly, because the one thing an operator must not do after this
      // is assume the repository is onboarded: the files are on disk, the host
      // is untouched, and the branch a full run would have opened does not
      // exist. The run that finishes the job is named rather than described.
      if (report.noCommit === true) {
        // Determined work, not a claim about settings this path never touched:
        // the gate installer really did run, so a pipeline definition nobody has
        // registered is known about now and is the operator's to act on. Printed
        // before the "not committed" line so the last thing on screen is still
        // the run that finishes the job.
        if (report.pendingAdmin.length > 0) {
          log.warn(
            `an administrator must still enable: ${report.pendingAdmin.join(', ')}`
          );
        }
        // Branch-aware, because the generic version of this advice is a trap.
        // "Commit them, then run redline init" is correct on a feature branch
        // and wrong on the default one: a protected default branch rejects the
        // commit at push time, which is after the operator has followed the
        // instruction and has a commit to unpick. The branch is a local read
        // with a safe fallback, so this costs no host call.
        const here = createGit(cwd);
        const branch = here.currentBranch();
        const onDefault = branch !== 'HEAD' && branch === here.defaultBranch();
        log.info(
          onDefault
            ? `  not committed — the files are in your working tree, and you are on ${branch}, the ` +
              'default branch. Branch first (git checkout -b redline/standards), commit there, then ' +
              'run redline init to apply the repository settings and open the pull request'
            : '  not committed — the files are in your working tree. Review them, commit them, then ' +
              'run redline init to apply the repository settings and open the pull request'
        );
        return 0;
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
      if (report.pullRequest) {
        // The URL itself is printed by the report's own Pull request section.
        // What that section cannot say is why the working tree looks untouched:
        // onboarding commits to its own branch and pushes it, so `git status`
        // here stays clean. Without this the run looked like it did nothing —
        // the first real onboarding ended with the operator running `init` a
        // second time and being told "already onboarded" by a repository they
        // believed was not.
        log.info(
          `  the changes are committed on ${ONBOARD_BRANCH} and pushed, not in your working tree —`
        );
        log.info('  `git status` here stays clean. Review and merge the pull request above.');
        // The exit, named at the moment somebody might want it. `redline
        // remove` has existed all along, and the run that has just changed
        // their repository is the first time anyone wonders how to undo it —
        // by which point the help output is two commands behind them. Closing
        // the pull request is the cheaper answer while it is still open, so it
        // goes first.
        log.info(
          '  Changed your mind? Close the pull request, or run `redline remove --dry-run` to see ' +
            'what taking Redline back out would do.'
        );
      } else if (report.alreadyOnboarded) {
        log.info(
          `already onboarded — nothing to change (recorded in .redline.json; ` +
            `re-run with --repair to re-apply every capability)`
        );
      }
      return 0;
    }

    if (command === 'remove') {
      const { values } = parseCommand('remove', COMMANDS.remove, rest);

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

      if (values.json === true) {
        log.info(
          JSON.stringify(
            {
              dryRun: report.dryRun,
              actions: report.actions,
              caveats: report.caveats,
              notes: report.notes,
              hostPlan: report.hostPlan,
              outcomes: report.outcomes,
              pendingAdmin: report.pendingAdmin,
              pullRequest: report.pullRequest ?? null,
              pullRequestError: report.pullRequestError,
            },
            null,
            2
          )
        );
        return report.pullRequestError !== null ? exitCodeFor('failed') : 0;
      }

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
        log.info(out.yellow('dry run — nothing was written, read or changed on the host'));
        printCaveats(log, report.caveats);
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
      printCaveats(log, report.caveats);
      return 0;
    }

    if (command === 'verify') {
      const { values } = parseCommand('verify', COMMANDS.verify, rest);

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
          cliVersion: CLI_VERSION,
        });
        if (values.json === true) {
          log.info(JSON.stringify({ repo: values.repo, ref: remoteRef.defaultBranch, ...remoteReport }, null, 2));
        } else {
          log.info(`${values.repo} (${remoteRef.defaultBranch})`);
          log.report(remoteReport.findings);
        }
        // Same mapping as the local path: one finding means the repository was
        // never onboarded, which is a different thing to tell an operator than
        // onboarded-and-drifted.
        const never = !remoteReport.ok && remoteReport.findings.length === 1;
        return remoteReport.ok ? 0 : never ? exitCodeFor('usage') : exitCodeFor('failed');
      }
      // resolve is passed unevaluated: verify() must be able to report "not
      // onboarded" without a host credential — see cli/commands/verify.ts.
      const report = await verify(() => resolve(cwd), { cwd, root, gate: values.gate === true });
      // The findings are the same object either way. `--json` exists because a
      // tool whose whole claim is auditability was unreadable by anything but a
      // human, and a wrapper had to scrape prose to learn what it already knew.
      if (values.json === true) log.info(JSON.stringify(report, null, 2));
      else log.report(report.findings);

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
      const { values } = parseCommand('review', COMMANDS.review, rest);

      // --print-prompt is the embedded engine with the log turned off. The
      // prompt was always reachable, but it came out wrapped in the scope line
      // and any uncovered-file warning, so copying it meant copying those too
      // and hoping the model ignored them. Anyone whose model is a browser tab
      // rather than an API key needs `redline review --print-prompt | pbcopy`
      // to put exactly the prompt on the clipboard and nothing else.
      const printPrompt = values['print-prompt'] === true;
      if (printPrompt && values.engine !== 'embedded') {
        throw new RedlineError(
          'usage',
          '--print-prompt has nothing to print with --engine api',
          'the api engine calls a model itself; --print-prompt hands you the prompt to paste'
        );
      }

      let engine = embedded;
      if (values.engine === 'api') {
        // The engine stays something you asked for; only its configuration is
        // inferred. `--engine api` used to need --provider and --model on every
        // run, which made the one command that actually reviews a diff four
        // flags long — so it was demonstrated once and never used again.
        const detected = detectProvider();
        const model = values.model ?? detectModel();
        if (!model) {
          throw new RedlineError(
            'usage',
            '--engine api needs a model',
            `pass --model <name>, or set ${MODEL_ENV} once and drop the flag — a model baked into ` +
              'the tool is one nobody can change when it is deprecated'
          );
        }
        // Not a silent fallback: `--provider anthropc` used to become openai and
        // send the diff to a local endpoint that was not running, reporting a
        // connection error for what was a typo.
        const named = values.provider ?? detected.provider;
        if (named !== 'openai' && named !== 'anthropic') {
          throw new RedlineError(
            'usage',
            values.provider === undefined
              ? '--engine api needs a provider and no API key is set to infer one from'
              : `--provider must be openai or anthropic, not "${values.provider}"`,
            values.provider === undefined
              ? 'export OPENAI_API_KEY or ANTHROPIC_API_KEY and it is inferred, or pass --provider. ' +
                'openai covers every OpenAI-compatible endpoint, including a local one that needs no key'
              : 'openai covers every OpenAI-compatible endpoint, including a local one'
          );
        }
        const provider = named;
        // Under --json these went to stdout ahead of the document, so
        // `redline review --engine api --json | jq` failed to parse.
        const say = values.json === true ? log.note : log.info;
        if (values.provider === undefined && detected.from !== null) {
          say(`provider ${provider}, from ${detected.from}`);
          if (detected.available.length > 1) {
            say(`  ${detected.available.join(' and ')} keys are both set — ${PROVIDER_ENV} overrides`);
          }
        }
        engine = createApiEngine({
          provider,
          model,
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

      if (printPrompt) {
        // Written straight to the two file descriptors rather than through the
        // log, and that is the whole point of the flag. `log.warn` routes to
        // sink.out, which is stdout — so the scope line landed in the pipe
        // beside the prompt and `| pbcopy` copied both. The sink abstraction
        // has no way to say "stderr" for a non-error, and these two lines are
        // a matched pair: the prompt on fd 1, everything a human needs on fd 2.
        process.stderr.write(
          `profile ${report.scope.profile} — rules in scope: core` +
            (report.scope.stacks.length ? `, ${report.scope.stacks.join(', ')}` : '') +
            '. Paste the prompt into any assistant; it asks for JSON back.\n'
        );
        process.stdout.write(`${report.prompt ?? ''}\n`);
        return 0;
      }

      if (values.json === true) {
        log.info(
          JSON.stringify(
            { scope: report.scope, prompt: report.prompt, findings: report.findings },
            null,
            2
          )
        );
        // 0, as below. The exit code answers "may this proceed" and a local
        // review never decides that; the findings are in the document.
        return 0;
      }

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

      // The repository's own link base, or '' when it has not set one. Read
      // here rather than threaded through the review: `redline review` runs
      // against the working tree, so the config beside it is the authority.
      const reviewDocsUrl = readConfig(cwd)?.docsBaseUrl ?? '';
      for (const finding of report.findings) {
        log.info(out.bold(`${finding.file}:${finding.line}`));
        log.info(`  ${paintSeverity(renderFinding(finding, reviewDocsUrl), out)}`);
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
      const { values } = parseCommand('policy', COMMANDS.policy, rest);
      const diffFile = values['diff-file'];
      if (!diffFile) throw new RedlineError('usage', 'redline policy needs --diff-file <path>');
      const failOn = values['fail-on'];
      if (failOn !== undefined && !isSeverity(failOn)) {
        throw new RedlineError('usage', `--fail-on must be BLOCKER, HIGH or SUGGESTION, not "${failOn}"`);
      }

      const report = policy({ root, diffFile, ...(failOn ? { failOn } : {}) });

      const policyDocsUrl = readConfig(cwd)?.docsBaseUrl ?? '';

      // The exit code answers "may this proceed", which is deliberately not the
      // same question as "was anything found" — three HIGH findings pass a
      // BLOCKER gate. Anything building on top of this needs both answers and
      // the findings themselves, and parsing them back out of prose written for
      // a human is how a wrapper breaks on a wording change.
      if (values.json) {
        log.info(
          JSON.stringify(
            {
              ok: report.ok,
              failOn: failOn ?? 'BLOCKER',
              findings: report.findings.map((finding) => ({
                rule: finding.ruleId,
                severity: finding.severity,
                file: finding.file,
                line: finding.line,
                problem: finding.problem,
                ...(policyDocsUrl ? { docs: `${policyDocsUrl}/r/${finding.ruleId}` } : {}),
              })),
              evaluated: report.evaluated,
              // Not a detail. Most of the catalogue needs a model, so a caller
              // that reads `findings: []` as "this diff is clean" is wrong
              // about the majority of the standard.
              catalogue: report.catalogue,
              modelled: report.catalogue - report.evaluated.length,
              unimplemented: report.unimplemented,
            },
            null,
            2
          )
        );
        return report.ok ? 0 : exitCodeFor('failed');
      }

      for (const finding of report.findings) {
        log.info(out.bold(`${finding.file}:${finding.line}`));
        log.info(`  ${paintSeverity(formatFinding(finding, policyDocsUrl), out)}`);
      }
      // Said on every run, including the clean one. A reviewer has to be able to
      // tell "checked and clean" from "not checked", and silence looks the same
      // as both.
      log.info(
        report.findings.length === 0
          ? `no deterministic findings — ${report.evaluated.length} rule(s) evaluated with no model call`
          : `${report.findings.length} finding(s) from ${report.evaluated.length} deterministic rule(s)`
      );
      // The other half of the same sentence, and the more important half on a
      // clean run. Most of the catalogue cannot be decided without a model —
      // hardcoded secrets, SQL built by concatenation, a missing auth check —
      // so "no deterministic findings" against a diff that plainly breaks one
      // of those reads as "this tool does not work". It read that way to the
      // author of docs/verifying.md, who wrote the diff to prove the opposite.
      const modelled = report.catalogue - report.evaluated.length;
      if (modelled > 0) {
        log.info(
          `${modelled} of the ${report.catalogue} rule(s) in the catalogue cannot be decided without a ` +
            'model and were not checked here — run `redline review` for those'
        );
      }
      for (const id of report.unimplemented) {
        log.warn(`${id} is classified deterministic but has no check — it is enforced by nobody`);
      }

      return report.ok ? 0 : exitCodeFor('failed');
    }

    if (command === 'evidence') {
      const { values, positionals } = parseCommand('evidence', COMMANDS.evidence, rest);

      const sub = positionals[0];
      if (sub !== undefined && sub !== 'record') {
        throw new RedlineError('usage', `unknown evidence subcommand "${sub}" — use \`record\`, or no subcommand to report`);
      }

      // A flag given but unparseable is refused rather than read as absent.
      // "Not measured" and "the recorder emitted NaN" mean opposite things to
      // the ladder, and silently turning the second into the first would grant
      // a promotion on a number nobody produced.
      const num = (flag: string): number | null => {
        const raw = values[flag as 'seed-recall'];
        if (raw === undefined) return null;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          throw new RedlineError('usage', `--${flag} must be a number, not "${raw}"`);
        }
        return parsed;
      };

      if (sub === 'record') {
        const report = recordEvidence({
          cwd,
          seedRecall: num('seed-recall'),
          actedOnRate: num('acted-on-rate'),
          sampleSize: num('sample-size') ?? 0,
          falsePositives: num('false-positives'),
          source: values.source ?? '',
        });
        if (values.json === true) {
          log.info(JSON.stringify(report, null, 2));
        } else {
          log.info('recorded.');
          log.info('');
          for (const line of formatEvidence(report)) log.info(line);
        }
        return 0;
      }

      const report = evidenceReport({ cwd });
      if (values.json === true) {
        log.info(JSON.stringify(report, null, 2));
      } else {
        for (const line of formatEvidence(report)) log.info(line);
      }
      // Not eligible is an answer, not a failure — this is the command somebody
      // runs to find out how far off they are, and a non-zero exit would break
      // the script that asked.
      return 0;
    }

    if (command === 'funnel') {
      const { values, positionals } = parseCommand('funnel', COMMANDS.funnel, rest);

      const path = telemetryPath();
      if (positionals[0] === 'clear') {
        log.info(clearFunnel(path) ? `removed ${path}` : 'nothing recorded — nothing to remove');
        return 0;
      }
      if (positionals[0] !== undefined) {
        throw new RedlineError('usage', `unknown funnel subcommand "${positionals[0]}" — use: clear`);
      }

      const summary = summariseFunnel(path);
      if (values.json === true) {
        log.info(JSON.stringify({ path, enabled: telemetryEnabled(), ...summary }, null, 2));
        return 0;
      }

      if (!telemetryEnabled()) {
        log.info(`off — export ${TELEMETRY_ENV}=1 to record locally`);
      }
      if (summary.total === 0) {
        log.info('nothing recorded yet');
        log.info(`  it would be written to ${path}, on this machine, and sent nowhere`);
        return 0;
      }

      log.info(`${summary.total} run(s) recorded in ${path}`);
      log.info('');
      for (const row of summary.byCommand) {
        log.info(
          `  ${row.command.padEnd(10)} ${String(row.runs).padStart(4)} run(s)  ` +
            `${String(row.ok).padStart(4)} ok  ${String(row.failed).padStart(4)} failed  ` +
            `median ${row.medianMs}ms`
        );
      }
      if (summary.topErrors.length > 0) {
        log.info('');
        log.info('  what fails most');
        for (const row of summary.topErrors.slice(0, 5)) {
          log.info(`    ${row.code.padEnd(12)} ${row.count}`);
        }
      }
      log.info('');
      log.info('  this file has never left this machine. redline funnel clear removes it');
      return 0;
    }

    if (command === 'status') {
      const { values } = parseCommand('status', COMMANDS.status, rest);

      const report = status(cwd, root);
      if (values.json === true) {
        log.info(JSON.stringify(report, null, 2));
      } else {
        for (const line of formatStatus(report)) log.info(line);
      }
      // Not onboarded is an answer, not a failure: `status` is what somebody
      // runs to find that out, and exiting non-zero would break the script that
      // asked.
      return 0;
    }

    if (command === 'explain') {
      const { values, positionals } = parseCommand('explain', COMMANDS.explain, rest);

      const rules = loadRules(root);
      if (values.list === true) {
        for (const rule of rules.values()) {
          log.info(`${paintSeverity(rule.severity.padEnd(10), out)} ${rule.id}`);
        }
        log.info(`${rules.size} rule(s) across the core standard and every stack`);
        return 0;
      }

      const id = positionals[0];
      if (id === undefined) {
        throw new RedlineError(
          'usage',
          'redline explain needs a rule id',
          'the id is the part in brackets on a finding: redline explain core/hardcoded-secrets'
        );
      }

      const found = explain(root, id);
      if (values.json === true) {
        log.info(JSON.stringify(found, null, 2));
        return 0;
      }

      log.info(`${paintSeverity(found.rule.severity, out)} ${out.bold(found.rule.id)}`);
      log.info('');
      log.info(`  ${found.rule.text}`);
      log.info('');
      log.info(`  decided by   ${found.deterministic ? 'a checker, with no model call' : 'review judgement'}`);
      log.info(`  defined in   ${found.rule.source}:${found.rule.line}`);
      if (found.globs.length > 0) {
        log.info(`  applies to   ${found.globs.join(', ')}`);
      } else {
        log.info('  applies to   every file — the core standard is not scoped by stack');
      }
      log.info(`  reaches      ${found.profiles.join(', ')}`);
      return 0;
    }

    if (command === 'exempt') {
      const { values } = parseCommand('exempt', COMMANDS.exempt, rest);
      const bodyFile = values['body-file'];
      if (!bodyFile) {
        throw new RedlineError('usage', 'redline exempt needs --body-file <path>');
      }

      const report = exempt({
        bodyFile,
        ...(values.scope ? { scope: values.scope } : {}),
      });
      if (values.json === true) {
        log.info(JSON.stringify({ applies: report.applies, messages: report.messages }, null, 2));
        return report.applies ? 0 : exitCodeFor('failed');
      }
      for (const message of report.messages) {
        if (report.applies) log.info(message);
        else log.warn(message);
      }
      // Exit 1, not 2: a pull request without a valid exemption is a normal,
      // expected answer the gate acts on — not the caller misusing the command.
      return report.applies ? 0 : exitCodeFor('failed');
    }

    if (command === 'sync') {
      const { values } = parseCommand('sync', COMMANDS.sync, rest);

      const dryRun = values['dry-run'] === true;
      // A dry run reads the register and the target's own files but never
      // writes, so it still needs a read credential — unlike `init --dry-run`,
      // which contacts no host at all. Saying so beats a confusing 403.
      const concurrency = values.concurrency === undefined ? undefined : Number(values.concurrency);
      if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) {
        throw new RedlineError(
          'usage',
          `--concurrency must be a whole number of 1 or more, not "${values.concurrency}"`,
          `the default is ${DEFAULT_CONCURRENCY}; lower it if the host is rate limiting the run`
        );
      }

      const report = await sync(deps.syncHost?.() ?? createSyncHost(), {
        root,
        cwd,
        ...(values.repo ? { repo: values.repo } : {}),
        ...(values.force ? { force: true } : {}),
        ...(dryRun ? { dryRun: true } : {}),
        ...(concurrency === undefined ? {} : { concurrency }),
        // A two-hundred repository run took twenty minutes and said nothing
        // until it finished, which is indistinguishable from hung. Suppressed
        // under --json so the document on stdout stays a document.
        ...(values.json === true
          ? {}
          : {
              onResult: (result, done, total) => {
                const counter = out.dim(`[${done}/${total}]`);
                if (result.outcome.kind === 'failed') {
                  log.warn(`  ${counter} ${result.repo}: ${result.outcome.detail}`);
                } else {
                  log.info(`  ${counter} ${result.repo}: ${result.outcome.kind}`);
                }
              },
            }),
      });

      // An estate run across 200 repositories is the case that gets piped into
      // a dashboard, and the per-repository outcome is the whole point of it.
      if (values.json === true) {
        log.info(
          JSON.stringify(
            {
              standardsVersion: report.plan.standardsVersion,
              dryRun,
              targets: report.plan.targets.length,
              skipped: report.plan.skipped,
              failures: report.failures,
              results: report.results.map(({ repo, outcome }) => ({ repo, ...outcome })),
            },
            null,
            2
          )
        );
        return report.failures > 0 ? exitCodeFor('failed') : 0;
      }

      log.info('');
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
      if (dryRun) log.info(out.yellow('dry run — no branch was pushed and no pull request was opened'));

      // A partially failed estate run is a failure. Reporting 0 because most
      // repositories succeeded is how a distribution quietly stops covering the
      // ones it cannot reach.
      return report.failures > 0 ? exitCodeFor('failed') : 0;
    }

    if (command === 'completion') {
      const { positionals } = parseCommand('completion', COMMANDS.completion, rest);
      const shell = SHELLS.find((name) => name === positionals[0]);
      if (shell === undefined) {
        throw new RedlineError(
          'usage',
          positionals[0] === undefined
            ? `redline completion needs a shell: ${SHELLS.join(', ')}`
            : `redline completion supports ${SHELLS.join(', ')}, not "${positionals[0]}"`,
          'redline completion --help shows how to load it in each shell'
        );
      }
      log.info(completionScript(shell, completionTree(METRICS_COMMANDS, REGISTRY_COMMAND)));
      return 0;
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
      const { values } = parseCliArgs(command === 'registry' ? 'registry' : `metrics ${sub}`, {
        args: flagArgs,
        options,
        allowPositionals: false,
      });

      await runMetrics(sub!, { root, flags: values, ...(deps.loadRunner ? { load: deps.loadRunner } : {}) });
      return 0;
    }

    const guess = closest(command, Object.keys(COMMANDS));
    log.error(
      `unknown command "${command}"`,
      guess === undefined ? 'run: redline --help' : `did you mean redline ${guess}? run: redline --help`
    );
    return exitCodeFor('usage');
  } catch (error) {
    // Cancelling at a prompt is a decision, not a failure. It must not print an
    // `error` line: an operator who pressed Ctrl-C already knows what happened,
    // and a wrapping script reading exit 1 would file it as onboarding broken.
    if (error instanceof Cancelled) {
      log.info('cancelled — nothing was written');
      return error.exitCode;
    }
    if (isRedlineError(error)) {
      log.error(error.message, error.hint);
      return error.exitCode;
    }
    // Not a RedlineError: parseArgs failures are already converted to a
    // usage RedlineError at their own call site (parseCliArgs in commands.ts), and
    // resolveProfile (unknown profile) and render() (unknown vendor) in
    // cli/render/ throw RedlineError('usage', ...) as of Task 21. So
    // whatever reaches here is a genuine internal defect — a TypeError, a
    // null dereference, an unexpected throw from anywhere — not the user's
    // mistake. Exit 2 would tell the user to check their flags when the
    // tool itself is broken, which sends CI readers debugging the wrong
    // thing. There is no sixth exit code to add for "internal defect", so
    // this reuses exit 4 (host/network) as the least-wrong of the five
    // published codes: at least it does not accuse the user.
    //
    // No stack by default: a trace is noise to an operator whose run broke. It
    // is one variable away for whoever files the report.
    const debug = (process.env[DEBUG_ENV] ?? '') !== '' && process.env[DEBUG_ENV] !== '0';
    log.error(
      `redline failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
      debug
        ? `this is a defect in Redline, not in how it was run — report it with the trace below at ${ISSUES_URL}`
        : `this is a defect in Redline, not in how it was run — re-run with ${DEBUG_ENV}=1 for the ` +
            `stack trace and report it at ${ISSUES_URL}`
    );
    if (debug && error instanceof Error && error.stack !== undefined) {
      for (const line of error.stack.split('\n')) log.note(line);
    }
    return exitCodeFor('host');
  }
}

// npm installs a bin as a symlink on POSIX, so process.argv[1] is the symlink
// path while import.meta.url is the real file. A textual comparison is false
// there, run() never fires, and the process exits 0 having printed nothing —
// which would make `redline verify --gate` pass unconditionally in CI. Compare
// resolved real paths instead. realpathSync throws if argv[1] is not a real
// path (an eval/stdin entry point), which is not this module being executed.
// What removal did NOT do. Both lines below used to sit in the middle of the
// notes array, printed with log.info between "removed AGENTS.md" and the pull
// request URL, and they were read as flavour text — one team came away
// believing Redline had switched their secret scanning off on the way out.
// A heading, a warning channel, and the last position on screen.
function printCaveats(log: Log, caveats: readonly string[]): void {
  if (caveats.length === 0) return;
  // The separator goes through info, not warn: an empty string on the warn
  // channel prints a bare `warn` prefix with nothing after it, which reads as a
  // warning the tool forgot to write.
  log.info('');
  log.warn('what this did not do');
  for (const caveat of caveats) log.warn(`  · ${caveat}`);
}

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
