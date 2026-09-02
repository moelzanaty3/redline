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

interface WalkFrame {
  dir: string;
  prefix: string;
  depth: number;
}

export function scanRepo(cwd: string): DetectInput {
  const paths: string[] = [];

  // Breadth-first so root-level manifests (go.mod, pom.xml) always land within
  // MAX_FILES, even when an early subtree alone would exhaust the budget.
  const queue: WalkFrame[] = [{ dir: cwd, prefix: '', depth: 0 }];
  let frame: WalkFrame | undefined;
  while ((frame = queue.shift()) !== undefined && paths.length < MAX_FILES) {
    let entries;
    try {
      entries = readdirSync(frame.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (paths.length >= MAX_FILES) break;
      if (SKIP.has(entry.name)) continue;
      const rel = frame.prefix ? `${frame.prefix}/${entry.name}` : entry.name;
      if (!entry.isDirectory()) {
        paths.push(rel);
      } else if (entry.name.endsWith('.xcodeproj')) {
        // Xcode projects are directories; emit a marker so the ios signal fires,
        // and skip their metadata contents.
        paths.push(rel);
      } else if (frame.depth < MAX_DEPTH) {
        queue.push({ dir: join(frame.dir, entry.name), prefix: rel, depth: frame.depth + 1 });
      }
    }
  }

  let packageJson: PackageManifest | undefined;
  try {
    const raw: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    packageJson = parsePackageManifest(raw);
  } catch {
    packageJson = undefined;
  }

  return packageJson === undefined ? { paths } : { paths, packageJson };
}
