import type { Registry, RegistryEntry } from '../registry/types.ts';

export interface SyncTarget {
  entry: RegistryEntry;
  // What the target has now, so the pull request body can say what it is moving from.
  from: string;
}

export interface SyncSkip {
  entry: RegistryEntry;
  reason: string;
}

export interface SyncPlan {
  standardsVersion: string;
  targets: SyncTarget[];
  skipped: SyncSkip[];
}

export interface PlanOptions {
  // One repository instead of the estate, as "owner/name".
  repo?: string;
  // Re-sync a target that already records the current version. For re-rendering
  // after a renderer change, where the standards version has not moved.
  force?: boolean;
}

// Compare two dotted versions numerically. A string compare would rank 0.0.10
// below 0.0.9 and quietly stop syncing an estate on the tenth patch.
function isBehind(recorded: string, current: string): boolean {
  const parse = (v: string): number[] => v.split('.').map((p) => Number.parseInt(p, 10));
  const a = parse(recorded);
  const b = parse(current);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    // A recorded version that is not a number at all — hand-edited, or written
    // by a version of the CLI that did not exist yet — is treated as behind.
    // Syncing it proposes a correction; skipping it would strand the repository.
    if (Number.isNaN(left)) return true;
    if (Number.isNaN(right)) return false;
    if (left !== right) return left < right;
  }
  return false;
}

// Which registered repositories need a pull request, and why each other one
// does not. Pure: no host, no filesystem. Every skip carries its reason so a
// dry run explains the whole estate rather than only the part it would touch.
export function planSync(
  registry: Registry,
  standardsVersion: string,
  opts: PlanOptions = {}
): SyncPlan {
  const targets: SyncTarget[] = [];
  const skipped: SyncSkip[] = [];

  for (const entry of registry.entries) {
    const name = `${entry.org}/${entry.repo}`;
    if (opts.repo && name !== opts.repo) {
      skipped.push({ entry, reason: `not ${opts.repo}` });
      continue;
    }
    if (opts.force) {
      targets.push({ entry, from: entry.standardsVersion });
      continue;
    }
    if (isBehind(entry.standardsVersion, standardsVersion)) {
      targets.push({ entry, from: entry.standardsVersion });
      continue;
    }
    skipped.push({ entry, reason: `already at standards v${entry.standardsVersion}` });
  }

  return { standardsVersion, targets, skipped };
}
