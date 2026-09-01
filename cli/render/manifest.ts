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
  return {
    version,
    core: core as unknown as CoreDef,
    stacks: stacks as Record<string, StackDef>,
    profiles: profiles as Record<string, string[]>,
    profileAliases: raw['profileAliases'] as Record<string, string>,
    vendors: vendors as Record<string, VendorDef>,
  };
}

export function loadManifest(root: string): Manifest {
  const path = join(root, 'standards/manifest.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new RedlineError('usage', `cannot read the standards manifest at ${path}`);
  }
  const parsed: unknown = JSON.parse(raw);
  return parseManifest(parsed);
}
