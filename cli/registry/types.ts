import type { Host } from '../platforms/types.ts';

// One onboarded repository, as discovered from its own .redline.json. Every
// field here is read from that file or from the host's repository record —
// nothing is inferred, so a stale entry is impossible: an entry exists only
// while the file does.
//
// The shape is deliberately the minimum the register's consumers need today.
// It is not a schema to design ahead: the register is derived from scratch on
// every run, so adding a field later costs one nightly re-walk and no
// migration. Add one when a consumer needs it, not before.
export interface RegistryEntry {
  host: Host;
  org: string;
  // Azure only: repositories live under a project. Absent on GitHub.
  project?: string;
  repo: string;
  defaultBranch: string;
  profile: string;
  standardsVersion: string;
  cliVersion: string;
  onboardedAt: string;
}

export interface Registry {
  generatedAt: string;
  // owner/name of the repository this register was generated from, so a
  // consumer can tell which estate it describes.
  source: string;
  entries: RegistryEntry[];
}
