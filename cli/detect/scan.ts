import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectInput, PackageManifest } from './stack.ts';

const SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'vendor',
  'target',
  '.next',
  '.venv',
  '__pycache__',
]);

const MAX_FILES = 5000;
const MAX_DEPTH = 6;

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePackageManifest(raw: unknown): PackageManifest | undefined {
  if (!isNonNullObject(raw)) return undefined;
  const { dependencies, devDependencies } = raw;
  if (dependencies !== undefined && !isNonNullObject(dependencies)) return undefined;
  if (devDependencies !== undefined && !isNonNullObject(devDependencies)) return undefined;
  const manifest: PackageManifest = {};
  if (dependencies !== undefined) manifest.dependencies = dependencies as Record<string, string>;
  if (devDependencies !== undefined) {
    manifest.devDependencies = devDependencies as Record<string, string>;
  }
  return manifest;
}

export function scanRepo(cwd: string): DetectInput {
  const paths: string[] = [];

  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > MAX_DEPTH || paths.length >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (paths.length >= MAX_FILES) return;
      if (SKIP.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel, depth + 1);
      else paths.push(rel);
    }
  };

  walk(cwd, '', 0);

  let packageJson: PackageManifest | undefined;
  try {
    const raw: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    packageJson = parsePackageManifest(raw);
  } catch {
    packageJson = undefined;
  }

  return packageJson === undefined ? { paths } : { paths, packageJson };
}
