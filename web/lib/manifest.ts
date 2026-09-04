// Build-time access to standards/manifest.json — the single source of truth for stack
// globs, profile composition and vendor toggles. Read the same way web/lib/content.ts
// reads any other repo file: trusted local input, validated separately in CI by
// scripts/validate.mjs.
import { readRepoFile } from "./content";

export type StackDef = {
  title: string;
  source: string;
  globs: string[];
  extends?: string[];
};

export type Manifest = {
  version: string;
  core: { title: string; source: string };
  stacks: Record<string, StackDef>;
  profiles: Record<string, string[]>;
  profileAliases: Record<string, string>;
  vendors: Record<string, { title: string; enabled: boolean }>;
  // Rule ids a checker decides without a model. Absent in a manifest written
  // before the tier existed, where every rule is judgement — which is exactly
  // what those manifests meant.
  deterministic?: string[];
};

let cached: Manifest | null = null;

export function loadManifest(): Manifest {
  if (!cached) {
    cached = JSON.parse(readRepoFile("standards/manifest.json")) as Manifest;
  }
  return cached;
}

export function stackDef(stack: string): StackDef | undefined {
  return loadManifest().stacks[stack];
}
