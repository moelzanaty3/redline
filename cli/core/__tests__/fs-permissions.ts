import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Whether `chmod 000` actually denies this process a read.
//
// Root ignores file permission bits, so a test that proves Redline degrades
// gracefully on an unreadable path asserts nothing when the suite runs as root
// — and it does, in CI containers and in the agent sandboxes this repository is
// developed from. Probing beats checking `getuid() === 0`: what matters is
// whether the denial can be staged at all, and a capability-restricted root or
// an exotic filesystem answers that question differently from its uid.
//
// Computed once. The answer cannot change within a run, and every call would
// otherwise touch the disk.
let cached: boolean | undefined;

export function permissionsCanDenyReads(): boolean {
  if (cached !== undefined) return cached;

  const dir = mkdtempSync(join(tmpdir(), 'redline-perm-probe-'));
  const path = join(dir, 'probe');
  try {
    writeFileSync(path, 'x');
    chmodSync(path, 0o000);
    readFileSync(path);
    cached = false;
  } catch {
    cached = true;
  } finally {
    chmodSync(path, 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
  return cached;
}

export const SKIP_WITHOUT_PERMISSION_ENFORCEMENT = permissionsCanDenyReads()
  ? false
  : 'file permissions do not deny this process a read (running as root) — the unreadable path cannot be staged';
