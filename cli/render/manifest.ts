import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RedlineError } from '../core/errors.ts';

export interface StackDef {
  title: string;
  source: string;
  globs: string[];
  extends?: string[];
}

export interface CoreDef {
  title: string;
  source: string;
}

export interface VendorDef {
  title: string;
  enabled: boolean;
}

export interface Manifest {
  version: string;
  core: CoreDef;
  stacks: Record<string, StackDef>;
  profiles: Record<string, string[]>;
  profileAliases: Record<string, string>;
  vendors: Record<string, VendorDef>;
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseManifest(raw: unknown): Manifest {
  if (!isNonNullObject(raw)) {
    throw new RedlineError('usage', 'standards manifest is not a JSON object');
  }
  const version = raw['version'];
  if (typeof version !== 'string') {
    throw new RedlineError('usage', 'standards manifest is missing a string "version" field');
  }
  const core = raw['core'];
  const stacks = raw['stacks'];
  const profiles = raw['profiles'];
  const vendors = raw['vendors'];
  if (!isNonNullObject(core)) {
    throw new RedlineError('usage', 'standards manifest is missing an object "core" field');
  }
  if (!isNonNullObject(stacks)) {
    throw new RedlineError('usage', 'standards manifest is missing an object "stacks" field');
  }
  if (!isNonNullObject(profiles)) {
    throw new RedlineError('usage', 'standards manifest is missing an object "profiles" field');
  }
  if (!isNonNullObject(vendors)) {
    throw new RedlineError('usage', 'standards manifest is missing an object "vendors" field');
  }
  const coreTitle = core['title'];
  const coreSource = core['source'];
  if (typeof coreTitle !== 'string' || typeof coreSource !== 'string') {
    throw new RedlineError('usage', 'standards manifest "core" needs string "title" and "source" fields');
  }
  const profileAliasesRaw = raw['profileAliases'];
  if (profileAliasesRaw !== undefined && !isNonNullObject(profileAliasesRaw)) {
    throw new RedlineError('usage', 'standards manifest "profileAliases" must be an object');
  }
  const profileAliases = (profileAliasesRaw ?? {}) as Record<string, string>;
  return {
    version,
    core: { title: coreTitle, source: coreSource },
    stacks: stacks as Record<string, StackDef>,
    profiles: profiles as Record<string, string[]>,
    profileAliases,
    vendors: vendors as Record<string, VendorDef>,
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

export function loadManifest(root: string): Manifest {
  const path = join(root, 'standards/manifest.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'EACCES') {
      throw new RedlineError('permission', `permission denied reading the standards manifest at ${path}`);
    }
    throw new RedlineError('usage', `cannot read the standards manifest at ${path}`);
  }
  const parsed: unknown = JSON.parse(raw);
  return parseManifest(parsed);
}
