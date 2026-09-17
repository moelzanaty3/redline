import { parseArgs, type ParseArgsConfig, type ParseArgsOptionsConfig } from 'node:util';
import { OPTIONAL_CAPABILITIES } from '../config/redline-json.ts';
import { RedlineError } from '../core/errors.ts';
import { closest } from '../core/suggest.ts';
import { TELEMETRY_ENV } from '../core/telemetry.ts';
import { RUNGS } from '../enforce/ladder.ts';
import { GATE_PIPELINES } from '../platforms/types.ts';
import type { Palette } from '../ui/tty.ts';

// Every command's summary, help and flags, in one place. The parser, the help
// screens, the typo suggestions and the shell completion all read this table,
// so a flag cannot be accepted and undocumented, or documented and refused,
// without cli/bin/__tests__/commands.test.ts failing.
export interface CommandSpec {
  readonly summary: string;
  // null where the help is generated elsewhere: metrics and registry build
  // theirs from their own option tables in cli/metrics/options.ts.
  readonly help: readonly string[] | null;
  readonly options: ParseArgsOptionsConfig;
  readonly allowPositionals: boolean;
}

// The first three lines are the whole of a first run, in order, and they sit
// above everything else deliberately. What was here before opened on `redline
// init` with eleven flags attached, so the first thing a new user read was the
// full surface of the most consequential command in the tool — and the safe way
// to try it, --dry-run, was the fourth line of its own flag list.
export const QUICKSTART = [
  'first time here? three commands, in this order:',
  '',
  '  redline doctor              is this machine set up — runtime, git, credential',
  '  redline init --dry-run      what onboarding would do, writing nothing',
  '  redline init                do it',
  '',
  '  nothing is irreversible: redline remove backs it all out.',
];

export const COMMANDS = {
  init: {
    summary: 'onboard this repository: standards, security floor, merge gate, registration',
    help: [
      '  redline init [--profile <list>] [--vendors <list>] [--blocking] [--no-a11y] [--dry-run] [--repair]',
      '               [--adopt-caller] [--skip <list>] [--with <list>] [--pipeline <name>]',
      '               [--gate-source org|local] [--docs-url <base>] [--no-commit]',
      '      onboard this repository: standards, security floor, merge gate (advisory), registration',
      '      --dry-run   print the plan; writes nothing, needs no credential, contacts no host',
      '      --no-commit write the files into the working tree and stop: no repository setting is',
      '                  changed, no branch is made, nothing is committed and no pull request is',
      '                  opened. Needs no credential and contacts no host, so it works offline — and',
      '                  so an org-sourced caller is written without checking the organisation',
      '                  publishes the gate it references. Run redline verify once you have committed',
      '      --profile <list>  one profile, or several separated by commas, whose stacks are',
      '                  rendered together — a React app with its own Terraform beside it is',
      '                  web,infra. The recorded name is sorted, so the order you type cannot',
      '                  change the artifacts. Omitted, the stack is detected from the checkout',
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
      '      --gate-source org|local  where the gate machinery lives. org (the default) references the',
      '                  reusable workflow published at <org>/.github; local vendors a copy into this',
      '                  repository at .github/workflows/redline-gate.yml, for a repository whose',
      '                  organisation has no shared .github repo yet. local is the WEAKER control: the',
      '                  workflow runs from the pull request\'s own head commit, so a pull request can',
      '                  edit the gate that is judging it — protect .github/workflows/ with CODEOWNERS.',
      '                  Omitting the flag keeps whatever the repository already recorded',
      '      --docs-url <base>  where your organisation publishes its copy of the standard. Set it and',
      '                  every finding carries the address of the rule it cites, as <base>/r/<rule-id>,',
      '                  so a reviewer reaches the rule from the comment instead of searching for it.',
      '                  Unset by default — there is no honest default, and a link that goes nowhere',
      '                  costs the reader the click. Pass an empty string to clear one',
      `      --rung <name>  the enforcement rung: ${RUNGS.join(', ')}. A promotion needs recorded`,
      '                  evidence and is refused without it; a demotion is always allowed. Omitting',
      '                  the flag keeps whatever the repository already recorded',
      '      --branches <patterns>  which branches the merge policy governs, comma separated, in the',
      '      host\'s own syntax (~DEFAULT_BRANCH, refs/heads/release/*). Default: the default branch',
      '      alone. Widening this widens an enforcement boundary, so it is never detected for you.',
      '      --review-owners <list>  who owns the paths seeded into CODEOWNERS — a team, a user or',
      '      an email, several separated by commas. Defaults to the platform team, which may not',
      '      exist in your organisation: GitHub ignores an owner it cannot resolve, so the file',
      '      would install and enforce nothing.',
      '      --setup <list>  controls to install alongside Redline: dependabot, renovate, codeql.',
      '      Only what works with no account and no token is offered — writes .github/dependabot.yml,',
      '      renovate.json, .github/workflows/codeql.yml. An existing file is never overwritten.',
      '      --integrations <list>  comma-separated ids of controls this repository already runs',
      '      (sonarqube,snyk,mend,dependabot,renovate,gitleaks,trufflehog,codeql). Overrides what',
      '      detection found — it reads a checkout, so it cannot see a scanner wired through a',
      '      shared pipeline template. Recorded, so the correction is made once.',
      `      --pipeline <name>  ${GATE_PIPELINES.join(' | ')} — what actually runs this`,
      '                  repository\'s pull request checks. Asked separately from the host because',
      '                  the two come apart: a repository on GitHub can be built entirely by Azure',
      '                  Pipelines, and installing an Actions workflow there gates nothing.',
      '                  local-agent installs no CI at all: the gate is a pre-push hook on the',
      '                  engineer\'s machine, so it publishes no check and no ruleset can require one',
      '      --adopt-caller  let Redline take over the gate machinery file (.github/workflows/redline.yml,',
      '                  .azuredevops/redline-gate.yml) when what is already there carries nothing that',
      '                  attributes it to Redline — a 2.1 caller, in practice. Without it the run refuses',
      '                  rather than overwrite a file that may be the repository\'s own',
      '      omitted flags keep whatever .redline.json already recorded',
    ],
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
      'no-commit': { type: 'boolean' },
      repair: { type: 'boolean' },
      'adopt-caller': { type: 'boolean' },
      skip: { type: 'string' },
      with: { type: 'string' },
      rung: { type: 'string' },
      pipeline: { type: 'string' },
      'gate-source': { type: 'string' },
      'docs-url': { type: 'string' },
      integrations: { type: 'string' },
      'review-owners': { type: 'string' },
      setup: { type: 'string' },
      branches: { type: 'string' },
    },
    allowPositionals: false,
  },
  remove: {
    summary: 'take Redline back out of this repository, as a pull request',
    help: [
      '  redline remove [--dry-run] [--json]',
      '      take Redline back out of this repository: rendered standards, gate machinery, slash',
      '      commands, the host state it applied, and .redline.json last of all — as a pull request',
      '      --dry-run   print the plan; writes nothing, needs no credential, contacts no host',
      '      only content Redline can prove it wrote is removed. A merged file keeps every byte',
      '      outside its REDLINE block; anything unattributable is left in place and named',
      '      the security floor (secret scanning, push protection, dependency alerts) is the',
      '      organisation\'s minimum, not Redline\'s state — no flag here turns it off',
      '      --json      the whole report as JSON on stdout, for a wrapper that has to act on it',
    ],
    options: {
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  },
  verify: {
    summary: 'check this repository still matches what .redline.json claims',
    help: [
      '  redline verify [--gate] [--repo <owner/name>] [--json]',
      '      check this repository still matches what .redline.json claims',
      '      --gate      run as the merge gate in CI: a setting the build identity cannot see or',
      '                  enable does not fail the pull request, and the run ends on a pass/fail line',
      '      --json      the whole report as JSON, for a wrapper that has to act on it',
      '      --repo <owner/name>  check a repository over the API, with no checkout — a check',
      '                  that genuinely needs a working tree reports ?? rather than passing',
    ],
    options: {
      gate: { type: 'boolean', default: false },
      repo: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  },
  status: {
    summary: 'what is installed here, how hard it bites, what an administrator still owes',
    help: [
      '  redline status [--json]',
      '      what is installed here, how hard it bites, what an administrator still owes',
      '      you and whether the standards have moved on. Reads the checkout only.',
      '      --json      the whole report as JSON on stdout, for a wrapper that has to act on it',
    ],
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: false,
  },
  doctor: {
    summary: 'can this machine run Redline against this repository?',
    help: [
      '  redline doctor [--json]',
      '      can this machine run Redline against this repository? Node version, git, the',
      '      remote, a credential and whether .redline.json is here — with the fix for each',
      '      thing that is wrong. Contacts no host, needs no credential, and is the one',
      '      command that still runs on a Node too old for the rest',
      '      --json      the whole report as JSON on stdout, for a wrapper that has to act on it',
    ],
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: false,
  },
  review: {
    summary: 'review this change against only the rules that apply to the files it touches',
    help: [
      '  redline review [--staged] [--diff-file <path>] [--base <ref>] [--engine <name>] [--print-prompt]',
      '                 [--provider openai|anthropic] [--model <name>] [--base-url <url>] [--json]',
      '      review this change against ONLY the rules that apply to the files it touches',
      '      by default the working tree against its merge base with the default branch',
      '      --staged    review only what is staged',
      '      --diff-file <path>  review a unified diff read from a file instead of the checkout',
      '      --base <ref>  the branch to diff against, instead of the default branch',
      '      --profile <name>  the profile whose rules apply; defaults to the one in .redline.json',
      '      --engine embedded  emit the bounded prompt for the assistant running this (default)',
      '      --engine api       call a configured endpoint — local or hosted — and parse the result.',
      '                  The provider is inferred from OPENAI_API_KEY or ANTHROPIC_API_KEY, and the',
      '                  model from REDLINE_REVIEW_MODEL, so a key and a model name set once are',
      '                  enough. Choosing this engine stays explicit: nothing is ever sent anywhere',
      '                  because a key happens to be exported',
      '      --provider openai|anthropic  which API the api engine speaks; inferred from the key',
      '      --model <name>  the model the api engine calls; defaults to REDLINE_REVIEW_MODEL',
      '      --base-url <url>  the endpoint the api engine calls — a local OpenAI-compatible server',
      '                  needs no key',
      '      --print-prompt     write the prompt to stdout and nothing else, for any assistant you',
      '                  already have — a browser tab counts. Everything else goes to stderr, so',
      '                  `redline review --print-prompt | pbcopy` copies the prompt alone',
      '      local findings are never sent to the telemetry that tunes rules',
      '      --json      scope, prompt and findings as JSON on stdout. Exits 0 either way',
    ],
    options: {
      staged: { type: 'boolean', default: false },
      'diff-file': { type: 'string' },
      base: { type: 'string' },
      profile: { type: 'string' },
      engine: { type: 'string', default: 'embedded' },
      'print-prompt': { type: 'boolean', default: false },
      provider: { type: 'string' },
      model: { type: 'string' },
      'base-url': { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  },
  policy: {
    summary: 'evaluate the rules a checker can decide, with no model call',
    help: [
      '  redline policy --diff-file <path> [--fail-on <severity>] [--json]',
      '      evaluate the rules a checker can decide, with no model call. Exit 1 on a BLOCKER.',
      '      Most of the catalogue needs a model — the run says how many it could not decide',
      '      --diff-file <path>  the unified diff to evaluate (required)',
      '      --fail-on <severity>  the lowest severity that fails the run: BLOCKER (default), HIGH or',
      '                  SUGGESTION',
      '      --json      the whole report as JSON on stdout, for a wrapper that has to act on it',
    ],
    options: {
      'diff-file': { type: 'string' },
      'fail-on': { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  },
  explain: {
    summary: 'what a rule means, who decided it and which files it applies to',
    help: [
      '  redline explain <rule-id> [--json]',
      '      what a rule means, who decided it, which files it is scoped to and which',
      '      profiles receive it. The id is the bracketed part of a finding.',
      '      --list      every rule id in the standards, with its severity',
      '      --json      the rule, its scope and the profiles it reaches as JSON on stdout',
    ],
    options: { list: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } },
    allowPositionals: true,
  },
  exempt: {
    summary: 'decide whether a pull request carries a valid exemption',
    help: [
      '  redline exempt --body-file <path> [--scope <check>] [--json]',
      '      decide whether a pull request carries a valid exemption for a failing process',
      '      check — a reason, an actor and an expiry, not a bare label. Exit 0 if it applies',
      '      --body-file <path>  the pull request description to read the exemption from (required)',
      '      --scope <check>  the failing check the exemption has to cover',
      '      --json      whether it applies, and why, as JSON on stdout',
    ],
    options: {
      'body-file': { type: 'string' },
      scope: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  },
  evidence: {
    summary: "the measurement behind this repository's rung, and recording a new one",
    help: [
      '  redline evidence [--json]',
      '      the measurement behind this repository\'s rung, and what the next one asks for.',
      '      Nothing else can raise enforcement: a rung is earned on a recorded figure, not',
      '      asserted. Reads the checkout only.',
      '  redline evidence record --source <where> [--seed-recall <0..1>] [--acted-on-rate <0..1>]',
      '                          [--sample-size <n>] [--false-positives <n>]',
      '      record a measurement against this repository. The numbers come from the metrics',
      '      plane, which sees the estate over a window — the CLI supplies the audit trail,',
      '      not the figures. --source is required: evidence with no provenance is an',
      '      assertion. Evidence older than 90 days no longer justifies a promotion',
      '      --source <where>  where the figures came from — a run, a dashboard, a report',
      '      --seed-recall <0..1>  share of seeded-corpus BLOCKERs the reviewer caught for this stack',
      '      --acted-on-rate <0..1>  share of findings acted on over the window',
      '      --sample-size <n>  pull requests the rate is computed from',
      '      --false-positives <n>  findings raised on the clean corpus; any at all blocks a',
      '                  blocking rung',
      '      --json      the whole report as JSON on stdout, for a wrapper that has to act on it',
    ],
    options: {
      json: { type: 'boolean', default: false },
      'seed-recall': { type: 'string' },
      'acted-on-rate': { type: 'string' },
      'sample-size': { type: 'string' },
      'false-positives': { type: 'string' },
      source: { type: 'string' },
    },
    allowPositionals: true,
  },
  sync: {
    summary: 'open a pull request on every registered repository whose standards are behind',
    help: [
      '  redline sync [--dry-run] [--repo <owner/name>] [--force] [--concurrency <n>] [--json]',
      '      open a pull request on every registered repository whose standards are behind',
      '      --dry-run   print the plan; opens nothing, pushes nothing',
      '      --repo <owner/name>  one repository instead of the estate',
      '      --force     re-render a repository already at the current standards version',
      '      --concurrency <n>  repositories in flight at once (default 8). Lower it if the host',
      '                  starts rate limiting; a 429 is waited out for as long as the host asks',
      '      run from a checkout of the Redline source repository, not a product repo',
      '      --json      per-repository outcomes as JSON on stdout, with no progress lines',
    ],
    options: {
      'dry-run': { type: 'boolean', default: false },
      repo: { type: 'string' },
      force: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      concurrency: { type: 'string' },
    },
    allowPositionals: false,
  },
  metrics: {
    summary: "the estate's measurement plane — acts on an organisation, not this repository",
    help: null,
    options: {},
    allowPositionals: false,
  },
  registry: {
    summary: 'derive the register of onboarded repositories by walking the org',
    help: null,
    options: {},
    allowPositionals: false,
  },
  funnel: {
    summary: 'where your own runs of this CLI succeed and stop — local, off by default',
    help: [
      '  redline funnel [--json] | redline funnel clear',
      '      where your own runs of this CLI succeed and where they stop. OFF by default;',
      `      export ${TELEMETRY_ENV}=1 to record. There is no endpoint in the code that writes it:`,
      '      the record is a file in ~/.redline on this machine, it holds a command name, an',
      '      outcome and a duration — never arguments, paths, repository names or diffs — and',
      '      moving it anywhere is your deliberate act. redline funnel clear deletes it',
      '      --json      the summary, the file path and whether recording is on, as JSON',
    ],
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
  },
  completion: {
    summary: 'print a tab-completion script for bash, zsh or fish',
    help: [
      '  redline completion bash|zsh|fish',
      '      print a script that tab-completes commands and flags. Load it from your shell:',
      '        bash  source <(redline completion bash)        in ~/.bashrc',
      '        zsh   source <(redline completion zsh)         in ~/.zshrc, after compinit',
      '        fish  redline completion fish > ~/.config/fish/completions/redline.fish',
    ],
    options: {},
    allowPositionals: true,
  },
} satisfies Record<string, CommandSpec>;

export type CommandName = keyof typeof COMMANDS;

export function isCommand(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name);
}

export const SHELLS = ['bash', 'zsh', 'fish'] as const;
export type Shell = (typeof SHELLS)[number];

export function usage(c: Palette): string {
  const names = Object.keys(COMMANDS) as CommandName[];
  const width = Math.max(...names.map((name) => name.length));
  return [
    c.bold('redline — engineering control plane'),
    '',
    ...QUICKSTART.map((line) =>
      line.replace(/^( {2})(redline \w+(?: --[\w-]+)?)/, (_, pad: string, cmd: string) => pad + c.cyan(cmd))
    ),
    '',
    c.bold('commands'),
    ...names.map((name) => `  ${c.cyan(`redline ${name.padEnd(width)}`)}  ${COMMANDS[name].summary}`),
    '',
    `run ${c.cyan('redline <command> --help')} for its flags, ${c.cyan('redline --version')} for the version`,
  ].join('\n');
}

export function commandHelp(section: readonly string[], c: Palette): string {
  return section
    .map((line) =>
      line
        .replace(/^( {2})(redline(?: [a-z]+)+)/, (_, pad: string, cmd: string) => pad + c.cyan(cmd))
        .replace(/^( {6})(--[\w-]+)/, (_, pad: string, flag: string) => pad + c.bold(flag))
    )
    .join('\n');
}

// node:util's parseArgs throws a plain Error on an unrecognised flag — that
// is bad input, not an internal defect, so it is converted to a usage
// RedlineError right at its own call site rather than left for the run()
// catch-all to misclassify. The hint names the nearest real flag, since the
// usual cause is a typo of one.
export function parseCliArgs<T extends ParseArgsConfig>(command: string, config: T): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unknown = /^Unknown option '([^']+)'/.exec(message)?.[1];
    const guess =
      unknown === undefined
        ? undefined
        : closest(unknown, Object.keys(config.options ?? {}).map((name) => `--${name}`));
    throw new RedlineError(
      'usage',
      message,
      `${guess === undefined ? '' : `did you mean ${guess}? `}run: redline ${command} --help`
    );
  }
}

// Takes the spec itself rather than looking it up by name: indexing the table
// with a generic key resolves to the union of every command's flags, and the
// caller's `values` would lose its per-command type.
type ConfigFor<S extends CommandSpec> = {
  args: string[];
  options: S['options'];
  allowPositionals: S['allowPositionals'];
};

export function parseCommand<S extends CommandSpec>(
  name: CommandName,
  spec: S,
  args: string[]
): ReturnType<typeof parseArgs<ConfigFor<S>>> {
  return parseCliArgs<ConfigFor<S>>(name, { args, options: spec.options, allowPositionals: spec.allowPositionals });
}

// What a shell needs to complete one level: the words that may come next, and
// what each means. `metrics` is the only command with a second level of
// subcommands, and those carry their own flags.
export interface CompletionTree {
  commands: readonly { name: string; summary: string; flags: readonly string[] }[];
  metrics: readonly { name: string; summary: string; flags: readonly string[] }[];
}

const flagsOf = (options: ParseArgsOptionsConfig): string[] => [
  ...Object.keys(options).map((name) => `--${name}`),
  '--help',
];

interface OptionTable {
  summary: string;
  options: Readonly<Record<string, unknown>>;
}

export function completionTree(
  metrics: Readonly<Record<string, OptionTable>>,
  registry: OptionTable
): CompletionTree {
  return {
    commands: (Object.keys(COMMANDS) as CommandName[]).map((name) => ({
      name,
      summary: COMMANDS[name].summary,
      flags:
        name === 'registry'
          ? [...Object.keys(registry.options).map((flag) => `--${flag}`), '--help']
          : name === 'completion'
            ? [...SHELLS]
            : name === 'evidence'
              ? ['record', ...flagsOf(COMMANDS[name].options)]
              : name === 'funnel'
                ? ['clear', ...flagsOf(COMMANDS[name].options)]
                : flagsOf(COMMANDS[name].options),
    })),
    metrics: Object.entries(metrics).map(([name, spec]) => ({
      name,
      summary: spec.summary,
      flags: [...Object.keys(spec.options).map((flag) => `--${flag}`), '--help'],
    })),
  };
}

// Every word below comes from the tables in this file and cli/metrics, never
// from the command line, and each is still quoted for the shell it lands in:
// a summary with an apostrophe must not end a string early.
const single = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

export function completionScript(shell: Shell, tree: CompletionTree): string {
  const top = tree.commands.map((c) => c.name);
  if (shell === 'bash') {
    return [
      '# redline bash completion — source <(redline completion bash)',
      '_redline() {',
      '  local cur=${COMP_WORDS[COMP_CWORD]} words=""',
      '  if [[ $COMP_CWORD -eq 1 ]]; then',
      `    words=${single([...top, '--help', '--version'].join(' '))}`,
      '  else',
      '    case ${COMP_WORDS[1]} in',
      ...tree.commands
        .filter((c) => c.name !== 'metrics')
        .map((c) => `      ${c.name}) words=${single(c.flags.join(' '))} ;;`),
      '      metrics)',
      '        if [[ $COMP_CWORD -eq 2 ]]; then',
      `          words=${single([...tree.metrics.map((m) => m.name), '--help'].join(' '))}`,
      '        else',
      '          case ${COMP_WORDS[2]} in',
      ...tree.metrics.map((m) => `            ${m.name}) words=${single(m.flags.join(' '))} ;;`),
      '          esac',
      '        fi ;;',
      '    esac',
      '  fi',
      '  COMPREPLY=($(compgen -W "$words" -- "$cur"))',
      '}',
      'complete -F _redline redline redlinegate',
      '',
    ].join('\n');
  }
  if (shell === 'zsh') {
    const described = (items: readonly { name: string; summary: string }[]): string =>
      items.map((item) => single(`${item.name}:${item.summary.replace(/:/g, '\\:')}`)).join(' ');
    return [
      '#compdef redline redlinegate',
      '# redline zsh completion — source <(redline completion zsh), after compinit',
      '_redline() {',
      '  local -a described',
      '  if (( CURRENT == 2 )); then',
      `    described=(${described(tree.commands)})`,
      "    _describe 'command' described",
      '    return',
      '  fi',
      '  case $words[2] in',
      ...tree.commands
        .filter((c) => c.name !== 'metrics')
        .map((c) => `    ${c.name}) compadd -- ${c.flags.map(single).join(' ')} ;;`),
      '    metrics)',
      '      if (( CURRENT == 3 )); then',
      `        described=(${described(tree.metrics)})`,
      "        _describe 'metrics command' described",
      '      else',
      '        case $words[3] in',
      ...tree.metrics.map((m) => `          ${m.name}) compadd -- ${m.flags.map(single).join(' ')} ;;`),
      '        esac',
      '      fi ;;',
      '  esac',
      '}',
      'compdef _redline redline redlinegate',
      '',
    ].join('\n');
  }
  const fish = (condition: string, word: string, summary?: string): string => {
    const arg = word.startsWith('--') ? `-l ${word.slice(2)}` : `-a ${single(word)}`;
    return `complete -c $bin -n ${single(condition)} -f ${arg}${summary ? ` -d ${single(summary)}` : ''}`;
  };
  return [
    '# redline fish completion — redline completion fish > ~/.config/fish/completions/redline.fish',
    'for bin in redline redlinegate',
    ...tree.commands.map((c) => `  ${fish('__fish_use_subcommand', c.name, c.summary)}`),
    ...tree.commands
      .filter((c) => c.name !== 'metrics')
      .flatMap((c) => c.flags.map((flag) => `  ${fish(`__fish_seen_subcommand_from ${c.name}`, flag)}`)),
    ...tree.metrics.map(
      (m) => `  ${fish(`__fish_seen_subcommand_from metrics; and not __fish_seen_subcommand_from ${tree.metrics.map((x) => x.name).join(' ')}`, m.name, m.summary)}`
    ),
    ...tree.metrics.flatMap((m) =>
      m.flags.map((flag) => `  ${fish(`__fish_seen_subcommand_from metrics; and __fish_seen_subcommand_from ${m.name}`, flag)}`)
    ),
    'end',
    '',
  ].join('\n');
}
