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

export function scanRepo(cwd: string): DetectInput {
  const paths: string[] = [];

  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > MAX_DEPTH || paths.length >= MAX_FILES) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
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
    packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as PackageManifest;
  } catch {
    packageJson = undefined;
  }

  return packageJson === undefined ? { paths } : { paths, packageJson };
}
