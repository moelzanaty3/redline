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

export function loadManifest(root: string): Manifest {
  const path = join(root, 'standards/manifest.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new RedlineError('usage', `cannot read the standards manifest at ${path}`);
  }
  return JSON.parse(raw) as Manifest;
}
