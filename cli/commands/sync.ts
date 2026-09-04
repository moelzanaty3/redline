import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RedlineError } from '../core/errors.ts';
import { parseRegistry } from '../registry/serialize.ts';
import type { Registry } from '../registry/types.ts';
import { runSync, type SyncHost, type SyncReport } from '../sync/run.ts';

export interface SyncOptions {
  // Where standards/ and the manifest live. These ship inside the package, so
  // this is the package root — the same root every other command renders from.
  root: string;
  // Where registry.json lives: the checkout of the source repository sync is
  // being run from. It is a source-repo artifact committed by the registry
  // workflow, not something that ships in the published package, so it is found
  // relative to the working directory rather than the package.
  cwd: string;
  repo?: string;
  force?: boolean;
  dryRun?: boolean;
  // Overridable for tests; the register is a file in the source repo.
  registryPath?: string;
}

export const REGISTRY_FILE = 'registry.json';

export function readRegistry(cwd: string, path = REGISTRY_FILE): Registry {
  let raw: string;
  try {
    // resolve, not join: an absolute override has to stay absolute, and join
    // would silently nest it under cwd and report the register as missing.
    raw = readFileSync(resolve(cwd, path), 'utf8');
  } catch {
    throw new RedlineError(
      'usage',
      `no ${path} in ${cwd} — the register of onboarded repositories has not been derived yet`,
      'run the Redline Registry workflow, or: node scripts/build-registry.mjs'
    );
  }
  return parseRegistry(raw);
}

export function standardsVersion(root: string): string {
  const manifest = JSON.parse(readFileSync(resolve(root, 'standards/manifest.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof manifest.version !== 'string') {
    throw new RedlineError('failed', 'standards/manifest.json has no string "version"');
  }
  return manifest.version;
}

// Distribute the current standards to every registered repository that is behind.
//
// It opens pull requests and never merges them, and it never pushes to a default
// branch. A repository that ignores its sync pull request drifts, and the estate
// dashboard's coverage figure is what makes that visible — sync's job is to make
// the change available, not to impose it.
export async function sync(host: SyncHost, opts: SyncOptions): Promise<SyncReport> {
  const registry = readRegistry(opts.cwd, opts.registryPath);
  return runSync(host, registry, {
    root: opts.root,
    standardsVersion: standardsVersion(opts.root),
    ...(opts.repo ? { repo: opts.repo } : {}),
    ...(opts.force ? { force: true } : {}),
    ...(opts.dryRun ? { dryRun: true } : {}),
  });
}
