import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RedlineError } from '../core/errors.ts';
import {
  ADMIN_CAPABILITIES,
  HOSTS,
  type AdminCapability,
  type GateSource,
  type Host,
} from '../platforms/types.ts';
import { isRung, type Rung } from '../enforce/ladder.ts';

export const CONFIG_FILE = '.redline.json';

export interface MenuSelections {
  blockingGate: boolean;
  adrForLargeDiffs: boolean;
  accessibility: boolean;
  speckit: boolean;
  // TM Forum context. Off unless asked for: it is right for the repositories
  // that implement TMF interfaces and noise in every other one.
  tmf: boolean;
  sensitivePathReviewers: boolean;
}

// What this repository selected at install time. A capability recorded
// `false` is not attempted, not written and not reported as missing: it is the
// repository saying it already has its own, not Redline failing to install it.
//
// Review ownership is deliberately NOT here. `menu.sensitivePathReviewers` is
// already exactly that switch — `redline init` gates `ensureReviewOwnership`
// and `requireCodeOwnerReview` on it, and `redline verify` compares against it
// — and a second switch for one decision is a second place for the two to
// disagree. `redline init --skip review-ownership` sets that key instead.
//
// The security floor is not here either, and cannot be: it is the org floor
// this product exists to hold, and an opt-out for it would be a supported way
// to fall below it. `redline init --skip security-floor` is refused by name
// rather than recorded — see MANDATORY_CAPABILITIES below.
export interface CapabilitySelections {
  gate: boolean;
  mergePolicy: boolean;
  labels: boolean;
}

export const CAPABILITY_KEYS: (keyof CapabilitySelections)[] = ['gate', 'mergePolicy', 'labels'];

export interface RedlineConfig {
  standardsVersion: string;
  cliVersion: string;
  host: Host;
  profile: string;
  vendors: string[];
  menu: MenuSelections;
  pendingAdmin: AdminCapability[];
  // When this repository joined the standard. Set once and carried forward by
  // every later run, so a re-run cannot rewrite the repository's own history.
  onboardedAt: string;
  // When `redline init` last did real work here. Absent in configs written
  // before the field existed, where it reads back as onboardedAt.
  lastRunAt: string;
  // Where this repository sits on the enforcement ladder. Absent in configs
  // written before the ladder existed, where it reads back as `observe` — the
  // rung that changes nothing, which is what those repositories were already
  // doing. A stale or hand-edited value must never be able to silently raise
  // enforcement, so an unrecognised rung reads back as `observe` too.
  rung: Rung;
  // Whether `.redline/local.md` was present at the last run. It is what lets
  // `verify` tell "this repository never had repo-local rules" from "it had
  // some and they are gone" — the rendered artifacts look the same in both
  // cases, and only the second is work the next render has to do. Absent in
  // configs written before the field existed, which read back as false: a
  // repository that had a local file then has stale artifacts reported as
  // work to do rather than as drift, which is the forgiving direction.
  localRules: boolean;
  // Absent in configs written before the field existed, where every key reads
  // back selected — which is what every repository onboarded then chose.
  capabilities: CapabilitySelections;
  // Content identifier of what Redline last wrote at each command file it owns
  // whole. It is what lets a later run recognise its own earlier output after
  // `commands/<name>.md` has changed here, which byte-exact recomputation
  // cannot. Empty for a repository onboarded before the field existed, and
  // deliberately not work to do on its own: a settled repository is not given a
  // pull request just to gain a hash.
  commandFiles: Record<string, string>;
  // The controls this repository already runs, as confirmed by whoever onboarded
  // it — not as detected. Detection reads a checkout, so it cannot see a scanner
  // wired through a shared pipeline template, and it believes a config file that
  // nothing references. Both are wrong in a way only a human can correct, and
  // the correction has to survive the next run or it has to be made every time.
  // Empty for a repository onboarded before the field existed, which reads back
  // as "ask detection", not as "runs nothing".
  integrations: string[];
  // Where this repository's gate machinery lives. Absent reads back as `org`,
  // which is what every repository onboarded before the choice existed has: it
  // references the organisation's reusable workflow. `local` means the gate is
  // vendored into this repository, which is a weaker control — see
  // GateOptions.gateSource — and `verify` reports it as such rather than
  // treating the two as equivalent.
  //
  // An unrecognised value reads back as `org`. A hand edit must not be able to
  // make verify stop asking whether the organisation gate resolves, and `org`
  // is the reading that keeps every check running.
  gateSource: GateSource;
  // The CLI version stamped into the vendored gate at the last run. Empty when
  // the gate is not vendored, and when a development build wrote it — neither
  // is a drift measurement, and reporting either as stale would file work
  // nobody can do.
  gateVersion: string;
  // Where this organisation's copy of the standard is published, so a finding
  // can carry the address of the rule it cites: `<docsBaseUrl>/r/<rule-id>`.
  //
  // Empty by default, and empty prints no link. There is no honest default here
  // — an organisation running Redline internally wants findings pointing at its
  // own documentation, not at somebody else's — and a wrong link costs the
  // reader the click before they discover it goes nowhere. Absent in configs
  // written before the field existed, which is every repository onboarded so
  // far: they keep printing findings exactly as they did.
  docsBaseUrl: string;
}

// What each menu key means when a repository has not recorded one. Lives here
// rather than in cli/commands/init.ts so the parser can fill an absent key
// without importing the command that writes it; init re-exports it as
// DEFAULT_MENU.
export const MENU_DEFAULTS: MenuSelections = {
  blockingGate: false,
  adrForLargeDiffs: true,
  accessibility: true,
  speckit: true,
  tmf: false,
  sensitivePathReviewers: false,
};

export const MENU_KEYS: (keyof MenuSelections)[] = [
  'blockingGate',
  'adrForLargeDiffs',
  'accessibility',
  'speckit',
  'tmf',
  'sensitivePathReviewers',
];

// The names an operator types, and where each one is recorded. Review
// ownership resolves to `menu.sensitivePathReviewers` because that key already
// is the switch — see the comment on CapabilitySelections.
const CAPABILITY_NAMES: Record<string, keyof CapabilitySelections | 'reviewOwnership'> = {
  gate: 'gate',
  'merge-policy': 'mergePolicy',
  labels: 'labels',
  'review-ownership': 'reviewOwnership',
};

// Not a capability an operator may decline. Secret scanning, push protection
// and dependency alerts are the organisation's floor, not this repository's
// preference, and unlike a gate pipeline or a branch policy there is no
// "we already have our own" to respect: they are host settings that add to
// whatever else the repository runs. An opt-out here would be a supported way
// to fall below the floor, so the flag is refused by name — which is the one
// thing a silent ignore could never do, tell the operator it did not happen.
export const MANDATORY_CAPABILITIES: Record<string, string> = {
  'security-floor':
    'the security floor is the organisation-wide minimum: secret scanning, push protection and ' +
    'dependency alerts are additive host settings, so nothing a repository already runs is ' +
    'displaced by them',
};

export const OPTIONAL_CAPABILITIES = Object.keys(CAPABILITY_NAMES);

/**
 * The name an operator types, from the key the config stores.
 *
 * `mergePolicy` is an implementation detail of the JSON; `--skip merge-policy`
 * is what the CLI accepts and what its output must therefore say back.
 */
export function capabilityName(key: string): string {
  return Object.entries(CAPABILITY_NAMES).find(([, stored]) => stored === key)?.[0] ?? key;
}

// The gate install is what creates Redline's labels — GitHub pre-declares the
// gate's soft-fail labels there, and Azure creates pull request labels on use —
// so a deselected gate takes the labels with it whatever the operator chose for
// them. True of the effective state, never of the record: `.redline.json` keeps
// the operator's own choice, so re-selecting the gate brings the labels back
// without a second flag.
export function labelsCarriedByGate(capabilities: CapabilitySelections): boolean {
  return !capabilities.gate && capabilities.labels;
}

// The operator-facing names of everything that is off, in the order they are
// documented. `redline verify` reports the same list, which is how a reader
// tells "off because we chose to" from "off because it broke" — so it reports
// what is actually off, not only what was asked for: a capability reported as
// on while nothing will ever create it is the silence this selection exists to
// end. `labelsCarriedByGate` above is the one place the two differ.
export function deselectedCapabilities(
  menu: MenuSelections,
  capabilities: CapabilitySelections
): string[] {
  return OPTIONAL_CAPABILITIES.filter((name) => {
    const key = CAPABILITY_NAMES[name];
    if (key === 'reviewOwnership') return !menu.sensitivePathReviewers;
    if (key === 'labels') return !capabilities.labels || labelsCarriedByGate(capabilities);
    return key !== undefined && !capabilities[key];
  });
}

export interface CapabilityFlags {
  menu: Partial<MenuSelections>;
  capabilities: Partial<CapabilitySelections>;
}

// `--skip a,b` and `--with a,b`. Per capability, not a whole selection: naming
// one capability must not silently re-select the others the repository already
// declined.
export function capabilitySelection(skip: string[], keep: string[]): CapabilityFlags {
  const flags: CapabilityFlags = { menu: {}, capabilities: {} };
  for (const name of skip) {
    if (keep.includes(name)) {
      throw new RedlineError('usage', `"${name}" is named in both --skip and --with, so neither can be meant`);
    }
  }
  for (const [names, on] of [
    [skip, false],
    [keep, true],
  ] as const) {
    for (const name of names) {
      const mandatory = MANDATORY_CAPABILITIES[name];
      if (mandatory !== undefined) {
        if (on) continue; // already on and staying on
        throw new RedlineError('usage', `"${name}" cannot be deselected — ${mandatory}`);
      }
      const key = CAPABILITY_NAMES[name];
      if (key === undefined) {
        throw new RedlineError(
          'usage',
          `unknown capability "${name}". Known: ${OPTIONAL_CAPABILITIES.join(', ')}`
        );
      }
      if (key === 'reviewOwnership') flags.menu.sensitivePathReviewers = on;
      else flags.capabilities[key] = on;
    }
  }
  return flags;
}

const bad = (what: string): never => {
  throw new RedlineError('failed', `${CONFIG_FILE} is invalid: ${what}`);
};

export function parseConfig(raw: unknown): RedlineConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) bad('expected an object');
  const o = raw as Record<string, unknown>;

  const str = (key: string): string =>
    typeof o[key] === 'string' && o[key] !== '' ? (o[key] as string) : bad(`${key} must be a non-empty string`);

  const host = str('host');
  if (!(HOSTS as readonly string[]).includes(host)) bad(`host must be one of ${HOSTS.join(', ')}`);

  const vendors = o['vendors'];
  if (!Array.isArray(vendors) || !vendors.every((v) => typeof v === 'string')) {
    bad('vendors must be an array of strings');
  }

  const menuRaw = o['menu'];
  if (typeof menuRaw !== 'object' || menuRaw === null) bad('menu must be an object');
  const menuObj = menuRaw as Record<string, unknown>;
  const menu = {} as MenuSelections;
  for (const key of MENU_KEYS) {
    // A key this file has never heard of takes its default rather than failing
    // the parse. Every menu key added since a repository was onboarded is
    // absent from its `.redline.json`, and rejecting that made a CLI upgrade
    // invalidate the config of every repository in the estate at once — every
    // `redline verify` reporting "`.redline.json` is invalid" for a key nobody
    // had the chance to write. A value that IS present and is not a boolean is
    // still an error: that is a corrupt file, not an old one.
    if (menuObj[key] === undefined) {
      menu[key] = MENU_DEFAULTS[key];
      continue;
    }
    if (typeof menuObj[key] !== 'boolean') bad(`menu.${key} must be a boolean`);
    menu[key] = menuObj[key] as boolean;
  }

  const pending = o['pendingAdmin'];
  if (!Array.isArray(pending)) bad('pendingAdmin must be an array');
  for (const entry of pending as unknown[]) {
    if (typeof entry !== 'string' || !(ADMIN_CAPABILITIES as readonly string[]).includes(entry)) {
      bad(`pendingAdmin contains an unknown capability "${String(entry)}"`);
    }
  }

  // Only an explicit `false` deselects. A key some other tool wrote, or one a
  // hand edit mistyped, must never be the way a repository falls below the
  // standard — so anything that is not `false` reads back selected, and a
  // whole missing object selects everything.
  const capabilityRaw = o['capabilities'];
  const capabilityObj =
    typeof capabilityRaw === 'object' && capabilityRaw !== null && !Array.isArray(capabilityRaw)
      ? (capabilityRaw as Record<string, unknown>)
      : {};
  const capabilities = {} as CapabilitySelections;
  for (const key of CAPABILITY_KEYS) capabilities[key] = capabilityObj[key] !== false;

  const commandRaw = o['commandFiles'];
  const commandFiles: Record<string, string> = {};
  if (typeof commandRaw === 'object' && commandRaw !== null && !Array.isArray(commandRaw)) {
    for (const [path, id] of Object.entries(commandRaw as Record<string, unknown>)) {
      if (typeof id === 'string') commandFiles[path] = id;
    }
  }

  // Anything not a recognised rung reads back as `observe`. A typo must not be
  // able to raise enforcement on a repository, and the failure direction for an
  // unreadable value is the one that blocks nobody.
  const rungRaw = o['rung'];
  const rung: Rung = isRung(rungRaw) ? rungRaw : 'observe';

  const onboardedAt = str('onboardedAt');
  const lastRunRaw = o['lastRunAt'];
  const lastRunAt = typeof lastRunRaw === 'string' && lastRunRaw !== '' ? lastRunRaw : onboardedAt;

  return {
    standardsVersion: str('standardsVersion'),
    cliVersion: str('cliVersion'),
    host: host as Host,
    profile: str('profile'),
    vendors: vendors as string[],
    menu,
    pendingAdmin: pending as AdminCapability[],
    onboardedAt,
    lastRunAt,
    rung,
    localRules: o['localRules'] === true,
    capabilities,
    commandFiles,
    integrations: Array.isArray(o['integrations'])
      ? o['integrations'].filter((id): id is string => typeof id === 'string')
      : [],
    gateSource: o['gateSource'] === 'local' ? 'local' : 'org',
    gateVersion: typeof o['gateVersion'] === 'string' ? o['gateVersion'] : '',
    // Anything that is not a string reads back as "no link", which is also what
    // a string this file cannot make a URL of ends up as — ruleUrl refuses
    // anything that is not http(s), so a hand edit cannot put an arbitrary
    // scheme into a comment on someone else's pull request.
    docsBaseUrl: typeof o['docsBaseUrl'] === 'string' ? o['docsBaseUrl'].trim() : '',
  };
}

export function readConfig(cwd: string): RedlineConfig | null {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new RedlineError('failed', `${CONFIG_FILE} is not valid JSON`, 'delete it and re-run redline init');
  }
  return parseConfig(raw);
}

// JSON has no comments, and this file is the only record of what a repository
// chose and why. Without something in the file itself, the first person to open
// it after onboarding finds eleven keys and no way to tell which are theirs to
// change from which are Redline's bookkeeping. `//` is the convention every
// JSON tool already ignores, and parseConfig ignores unknown keys, so it costs
// nothing to carry and is rewritten on every run.
const EXPLAINER: readonly string[] = [
  'Written by `redline init`. Edit with the command, not by hand — the next run rewrites this file.',
  'menu.blockingGate — the gate blocks a merge rather than reporting. `redline init --blocking`.',
  'menu.adrForLargeDiffs — a diff over the threshold needs an ADR link in the pull request body.',
  'menu.accessibility — recorded for a later phase; nothing reads it yet.',
  'menu.speckit — renders the spec-driven development context into the standards artifacts.',
  'menu.tmf — renders the TM Forum context. `redline init --tmf` / `--no-tmf`.',
  'menu.sensitivePathReviewers — writes CODEOWNERS and requires code-owner review on those paths.',
  'capabilities.* — false means "this repository has its own"; Redline does not install or report it.',
  'rung — how hard the gate bites: observe, warn, block-blocker, block-high. Promotion needs evidence.',
  'pendingAdmin — capabilities an administrator still has to grant. Not a failure, a to-do list.',
  'gateSource — org: the gate lives in the organisation .github repo. local: vendored into this',
  '  repository, which means a pull request can edit the gate judging it. `--gate-source`.',
  'gateVersion — the redlinegate version the vendored gate was written by. Empty when not vendored.',
  'docsBaseUrl — where your copy of the standard is published. Set it and every finding carries',
  '  the address of the rule it cites: <docsBaseUrl>/r/<rule-id>. Empty prints no link.',
  'commandFiles, standardsVersion, cliVersion, onboardedAt, lastRunAt — Redline\'s own bookkeeping.',
];

export function writeConfig(cwd: string, config: RedlineConfig): void {
  const documented = { '//': EXPLAINER, ...config };
  writeFileSync(join(cwd, CONFIG_FILE), `${JSON.stringify(documented, null, 2)}\n`);
}
