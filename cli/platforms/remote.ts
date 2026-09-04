import { RedlineError } from '../core/errors.ts';
import { parseConfig, type RedlineConfig } from '../config/redline-json.ts';
import type { RepoRef } from './types.ts';

// Reading a repository's own .redline.json without a checkout.
//
// Two things need it and neither can clone: `redline sync` has to know which
// profile and vendors a target recorded before it can render anything for it,
// and `redline verify --repo` has to assert against what the repository claims
// rather than what a register cached. Reading it live also means neither can be
// wrong about a repository that changed since the register was last derived.
export interface RemoteConfigResult {
  // null means the repository carries no .redline.json — not onboarded, which
  // is a fact rather than a failure.
  config: RedlineConfig | null;
  // The commit or branch the file was read at, so a caller can say what it
  // asserted against.
  ref: string;
}

export interface PlatformRemote {
  readRemoteConfig(ref: RepoRef): Promise<RemoteConfigResult>;
}

// Shared by both hosts: the file is external input from a repository this
// process does not control, so a malformed one is a reported failure naming the
// repository, never a crash that costs a whole estate walk.
export function parseRemoteConfig(raw: string, where: string): RedlineConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new RedlineError(
      'failed',
      `${where}: .redline.json is not valid JSON (${error instanceof Error ? error.message : String(error)})`
    );
  }
  try {
    return parseConfig(parsed);
  } catch (error) {
    throw new RedlineError(
      'failed',
      `${where}: .redline.json is invalid — ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
