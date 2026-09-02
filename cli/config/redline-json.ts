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
}

export const MENU_KEYS: (keyof MenuSelections)[] = [
  'blockingGate',
  'adrForLargeDiffs',
  'accessibility',
  'speckit',
  'sensitivePathReviewers',
];

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
