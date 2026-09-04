import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RedlineError } from '../core/errors.ts';
import { ADMIN_CAPABILITIES, HOSTS, type AdminCapability, type Host } from '../platforms/types.ts';

export const CONFIG_FILE = '.redline.json';

export interface MenuSelections {
  blockingGate: boolean;
  adrForLargeDiffs: boolean;
  accessibility: boolean;
  speckit: boolean;
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
}

export const MENU_KEYS: (keyof MenuSelections)[] = [
  'blockingGate',
  'adrForLargeDiffs',
  'accessibility',
  'speckit',
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
    localRules: o['localRules'] === true,
    capabilities,
    commandFiles,
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

export function writeConfig(cwd: string, config: RedlineConfig): void {
  writeFileSync(join(cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
}
