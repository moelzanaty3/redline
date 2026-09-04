import { RedlineError } from '../core/errors.ts';

// The flag surface for the estate commands, declared as data.
//
// Why this shape. The runners under `scripts/` are already env-configured
// programs, and they work. What they lack is a front door: no `--help`, no
// validation, and the only way to discover that `MIN_SAMPLE` exists is to read
// the source. So this layer owns configuration — every flag has a type, a
// default and a help line — and hands the runner the environment contract it
// already documents.
//
// Declaring it as data rather than writing a parser per command is what makes it
// testable: that `--days 90` becomes `DAYS=90`, that `--days banana` is refused
// by name, and that a missing required flag says which one, are all assertions
// about this table.

export type OptionType = 'string' | 'number' | 'boolean' | 'path';

export interface OptionSpec {
  // The environment variable the runner reads. This is the contract between the
  // two layers and is deliberately visible: someone debugging a scheduled run
  // sees the same names in the workflow and in the docs.
  env: string;
  type: OptionType;
  help: string;
  required?: boolean;
  default?: string;
  // For an enum-ish string, the values it accepts. A typo in a value is the
  // failure this catches: today `SPEND_GRAIN=per-seat` silently becomes
  // "unknown" and the number it produces is quietly less trustworthy.
  values?: string[];
}

export interface CommandSpec {
  summary: string;
  // Where this runs, said in the help text. Several of these are org
  // infrastructure and are meaningless in a product repository, and a command
  // that does not say so wastes somebody's afternoon.
  runsIn: string;
  script: string;
  options: Record<string, OptionSpec>;
}

const DATA: OptionSpec = {
  env: 'DATA_DIR',
  type: 'path',
  help: 'directory of collected telemetry',
  default: 'data',
};
const ORG: OptionSpec = { env: 'ORG', type: 'string', help: 'the GitHub organisation', required: true };
const TOKEN: OptionSpec = {
  env: 'GH_TOKEN',
  type: 'string',
  help: 'a token with org read access (or set GH_TOKEN in the environment)',
};

export const METRICS_COMMANDS: Record<string, CommandSpec> = {
  collect: {
    summary: 'pull review outcomes for merged pull requests across the org',
    runsIn: 'the metrics repo, on a schedule',
    script: 'scripts/collect-telemetry.mjs',
    options: {
      org: ORG,
      token: TOKEN,
      days: { env: 'DAYS', type: 'number', help: 'how far back to look', default: '8' },
      since: { env: 'SINCE', type: 'string', help: 'YYYY-MM-DD, instead of --days' },
      out: { env: 'OUT', type: 'path', help: 'where to write the monthly JSONL', default: 'data' },
      'dry-run': { env: 'DRY_RUN', type: 'boolean', help: 'print a sample and write nothing' },
      'skip-sarif': { env: 'SKIP_SARIF', type: 'boolean', help: 'do not ingest code-scanning alerts' },
    },
  },
  dashboard: {
    summary: 'build the telemetry dashboard page',
    runsIn: 'the metrics repo, or any checkout of its data/',
    script: 'scripts/build-dashboard.mjs',
    options: {
      org: ORG,
      data: DATA,
      days: { env: 'DAYS', type: 'number', help: 'window in days', default: '90' },
      out: { env: 'OUT', type: 'path', help: 'output directory', default: 'dist' },
      registry: { env: 'REGISTRY', type: 'path', help: 'the register, for coverage and the ladder', default: 'registry.json' },
      onboarded: { env: 'ONBOARDED', type: 'number', help: 'onboarded repo count, if not read from the register' },
      'seed-scores': { env: 'SEED_SCORES', type: 'path', help: 'seed score history', default: 'data/seed-scores.jsonl' },
      'standards-version': { env: 'STANDARDS_VERSION', type: 'string', help: 'version to display' },
    },
  },
  digest: {
    summary: 'build the weekly stakeholder digest as an Adaptive Card',
    runsIn: 'the metrics repo, weekly',
    script: 'scripts/build-digest.mjs',
    options: {
      org: ORG,
      data: DATA,
      days: { env: 'DAYS', type: 'number', help: 'window in days', default: '7' },
      out: { env: 'OUT', type: 'path', help: 'write the card here instead of stdout' },
      'open-prs': { env: 'OPEN_PRS', type: 'number', help: 'open PR count, from the caller' },
      'stale-prs': { env: 'STALE_PRS', type: 'number', help: 'stale PR count, from the caller' },
    },
  },
  inbox: {
    summary: 'build the org-wide prioritised pull request inbox',
    runsIn: 'the source repo, on a schedule',
    script: 'scripts/build-inbox.mjs',
    options: {
      org: ORG,
      token: TOKEN,
      out: { env: 'OUT', type: 'path', help: 'output directory', default: 'dist' },
      'max-pages': { env: 'MAX_PAGES', type: 'number', help: 'search pages to walk', default: '10' },
    },
  },
  baseline: {
    summary: 'compute the baseline every roadmap phase is measured against',
    runsIn: 'a maintainer terminal, once, with org credentials',
    script: 'scripts/build-baseline.mjs',
    options: {
      data: DATA,
      org: { env: 'ORG', type: 'string', help: 'the org, to survey Redline\'s own PRs and SARIF producers' },
      token: TOKEN,
      registry: { env: 'REGISTRY', type: 'path', help: 'the derived register', default: 'registry.json' },
      days: { env: 'DAYS', type: 'number', help: 'window in days', default: '90' },
      out: { env: 'OUT', type: 'path', help: 'where to write the JSON', default: 'baseline.json' },
      'spend-total': { env: 'SPEND_TOTAL', type: 'number', help: 'AI spend, from the vendor\'s own usage reporting' },
      'spend-currency': { env: 'SPEND_CURRENCY', type: 'string', help: 'currency of --spend-total', default: 'USD' },
      'spend-grain': {
        env: 'SPEND_GRAIN',
        type: 'string',
        help: 'whether the spend figure is per repo or org-wide',
        default: 'org',
        values: ['repo', 'org', 'unknown'],
      },
    },
  },
  roi: {
    summary: 'build the page that says what review cost against what it caught',
    runsIn: 'the metrics repo, or any checkout of its data/',
    script: 'scripts/build-roi.mjs',
    options: {
      data: DATA,
      days: { env: 'DAYS', type: 'number', help: 'window in days', default: '90' },
      out: { env: 'OUT', type: 'path', help: 'JSON output', default: 'roi.json' },
      html: { env: 'HTML', type: 'path', help: 'the readable page', default: 'roi.html' },
      'spend-total': { env: 'SPEND_TOTAL', type: 'number', help: 'AI spend for the window' },
      'spend-currency': { env: 'SPEND_CURRENCY', type: 'string', help: 'currency of --spend-total', default: 'USD' },
      'spend-grain': {
        env: 'SPEND_GRAIN',
        type: 'string',
        help: 'per repo or org-wide — an org figure will not answer a per-repo question',
        default: 'org',
        values: ['repo', 'org', 'unknown'],
      },
      'spend-source': { env: 'SPEND_SOURCE', type: 'string', help: 'where the figure came from, recorded with it' },
    },
  },
  correlate: {
    summary: 'research: whether ignoring a finding cost anything',
    runsIn: 'the metrics repo. It is an experiment, not a loop',
    script: 'scripts/build-correlation.mjs',
    options: {
      data: DATA,
      days: { env: 'DAYS', type: 'number', help: 'how much history to read', default: '180' },
      'window-days': { env: 'WINDOW_DAYS', type: 'number', help: 'how long after a merge a revert still counts', default: '30' },
      'min-sample': {
        env: 'MIN_SAMPLE',
        type: 'number',
        help: 'ignored findings a rule needs before any rate is reported',
        default: '10',
      },
      out: { env: 'OUT', type: 'path', help: 'where to write the JSON', default: 'correlation.json' },
    },
  },
  'score-seeds': {
    summary: 'score an automated reviewer against the seeded corpus',
    runsIn: 'anywhere, against a pull request that carries the corpus',
    script: 'scripts/score-seeds.mjs',
    options: {
      repo: { env: 'REPO', type: 'string', help: 'owner/name of the pilot repository', required: true },
      pr: { env: 'PR', type: 'number', help: 'the pull request number', required: true },
      token: TOKEN,
      stack: { env: 'STACK', type: 'string', help: 'the seeded stack under test' },
      json: { env: 'JSON_OUT', type: 'boolean', help: 'machine-readable output' },
    },
  },
  context: {
    summary: 'measure what the skills render target saves, per profile',
    runsIn: 'the source repo',
    script: 'scripts/measure-context.mjs',
    options: {
      root: { env: 'ROOT', type: 'path', help: 'the repo to measure', default: '.' },
      out: { env: 'OUT', type: 'path', help: 'also write the rows as JSON here' },
    },
  },
};

export const REGISTRY_COMMAND: CommandSpec = {
  summary: 'derive the register of onboarded repositories by walking the org',
  runsIn: 'the source repo, nightly',
  script: 'scripts/build-registry.mjs',
  options: {
    org: ORG,
    token: TOKEN,
    source: {
      env: 'SOURCE',
      type: 'string',
      help: 'owner/name of this repo, recorded so a consumer knows which estate the register describes',
      required: true,
    },
    out: { env: 'OUT', type: 'path', help: 'where to write it', default: 'registry.json' },
  },
};

/**
 * Turn parsed flags into the environment the runner reads.
 *
 * Every refusal here is one that used to be silent. An unset required option was
 * a runner throwing halfway through; a non-numeric `--days` became `NaN` and
 * produced an empty window; a mistyped `--spend-grain` became "unknown" and made
 * the resulting number quietly less trustworthy than it looked.
 */
export function resolveEnv(
  spec: CommandSpec,
  flags: Record<string, string | boolean | undefined>,
  env: NodeJS.ProcessEnv,
  name: string
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [flag, option] of Object.entries(spec.options)) {
    const raw = flags[flag];

    if (option.type === 'boolean') {
      if (raw === true) resolved[option.env] = '1';
      continue;
    }

    // Precedence: the flag, then the environment, then the default. The
    // environment stays honoured so a scheduled job can keep using a secret
    // without putting a token on a command line, where it lands in shell history
    // and in the process table.
    const value = raw !== undefined ? String(raw) : (env[option.env] ?? option.default);

    if (value === undefined || value === '') {
      if (option.required) {
        throw new RedlineError(
          'usage',
          `redline ${name} needs --${flag} (${option.help})`,
          `or set ${option.env} in the environment`
        );
      }
      continue;
    }

    if (option.type === 'number' && !Number.isFinite(Number(value))) {
      throw new RedlineError('usage', `--${flag} must be a number, not "${value}"`);
    }
    if (option.values && !option.values.includes(value)) {
      throw new RedlineError(
        'usage',
        `--${flag} must be one of ${option.values.join(', ')}, not "${value}"`
      );
    }

    resolved[option.env] = value;
  }

  return resolved;
}

/** The help for one command, generated from the same table that validates it. */
export function helpFor(name: string, spec: CommandSpec): string {
  const left = (flag: string, option: OptionSpec): string =>
    `  --${flag}${option.type === 'boolean' ? '' : ` <${option.type}>`}`;
  // Sized to the widest flag in THIS command, not to a constant: a fixed column
  // collides the moment a longer flag is added, and a help screen whose columns
  // run together reads as unmaintained.
  const width =
    Math.max(...Object.entries(spec.options).map(([f, o]) => left(f, o).length)) + 2;

  const flags = Object.entries(spec.options).map(([flag, option]) => {
    const suffix = option.required
      ? '  (required)'
      : option.default
        ? `  (default: ${option.default})`
        : '';
    return left(flag, option).padEnd(width) + `${option.help}${suffix}`;
  });

  return [
    `redline ${name} — ${spec.summary}`,
    '',
    `Runs in: ${spec.runsIn}.`,
    '',
    ...flags,
    '',
    'Every option can also be set as an environment variable — see the names in the docs.',
  ].join('\n');
}
