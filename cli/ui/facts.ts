import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from '../config/redline-json.ts';
import { OWNING_TEAM } from '../commands/init.ts';
import { surveyRepo } from '../detect/existing.ts';
import { offerable as offerableSetup } from '../detect/setup.ts';
import { resolveProfile } from '../render/profile.ts';
import { proposeProfile } from '../detect/stack.ts';
import { scanRepo } from '../detect/scan.ts';
import { loadManifest } from '../render/manifest.ts';
import { detectVendors } from '../commands/init.ts';
import type { Host, WizardFacts } from './wizard.ts';

// Everything the menu needs to preselect its answers, gathered from the
// checkout alone.
//
// No host call: the wizard's first question has to appear before a credential
// is resolved, because `Dry run` is one of its answers and a dry run is
// precisely the path that must work with no credential at all. Anything that
// genuinely needs the host — does the reusable gate workflow resolve? — is
// checked later, on the apply path, where a token exists.

// Where a repository's own pull request pipeline is likely to live. Matching
// one only sets the DEFAULT answer to "what runs your checks?", so a wrong
// guess costs one keystroke; missing a real pipeline is what put a GitHub
// Actions workflow into a repository gated by Azure Pipelines.
const PIPELINE_HINTS = [
  'cicd/pre-merge.yaml',
  'cicd/pre-merge.yml',
  'cicd/pr-validation.yaml',
  'azure-pipelines.yml',
  'azure-pipelines.yaml',
  '.azuredevops/pre-merge.yml',
  '.pipelines/pre-merge.yml',
];

// A directory of pipeline definitions counts too, but only its pull-request
// shaped members: `cicd/release.yaml` is not a pull request gate and offering
// to add a review stage to it would be wrong.
const PIPELINE_DIRS = ['cicd', '.azuredevops', '.pipelines'];
const PR_SHAPED = /^(pre-?merge|pr-|pull-?request)/i;

export function findExistingPipeline(cwd: string): string | null {
  for (const rel of PIPELINE_HINTS) {
    if (existsSync(join(cwd, rel))) return rel;
  }
  for (const dir of PIPELINE_DIRS) {
    const abs = join(cwd, dir);
    if (!existsSync(abs)) continue;
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      continue;
    }
    const match = entries.find((name) => /\.ya?ml$/i.test(name) && PR_SHAPED.test(name));
    if (match !== undefined) return `${dir}/${match}`;
  }
  return null;
}

export interface GatherOptions {
  readonly cwd: string;
  readonly root: string;
  // From the resolved platform, when one could be resolved without a
  // credential. `null` is a legitimate answer and the reason the host question
  // is asked rather than assumed.
  readonly detectedHost: Host | null;
}

export function gatherFacts(opts: GatherOptions): WizardFacts {
  const { cwd, root } = opts;
  const manifest = loadManifest(root);
  const proposal = proposeProfile(scanRepo(cwd));
  const recorded = readConfig(cwd);
  const survey = surveyRepo(cwd);

  // What could be installed here. The profile is not chosen yet — the menu asks
  // for it after this — so the stacks come from what detection proposed, which
  // is what decides CodeQL's language matrix. A profile chosen against the
  // proposal only ever widens it, and CodeQL on one language too few is a worse
  // failure than the file not being offered.
  let stacks: string[] = [];
  try {
    stacks = resolveProfile(manifest, proposal.profile).stacks;
  } catch {
    stacks = [];
  }
  const evidenceFor = new Map(survey.tools.map((tool) => [tool.id, tool.evidence]));
  const offerable = offerableSetup(cwd, opts.detectedHost ?? 'github', stacks).map(
    ({ integration }) => ({
      id: integration.id,
      label: integration.label,
      hint: integration.hint,
      ...(evidenceFor.has(integration.id) ? { evidence: evidenceFor.get(integration.id)! } : {}),
    })
  );

  const orgVendors = Object.entries(manifest.vendors)
    .filter(([, vendor]) => vendor.enabled)
    .map(([id]) => id);

  return {
    manifest,
    survey,
    offerable,
    detectedProfile: proposal.profile,
    defaultOwner: `@<org>/${OWNING_TEAM}`,
    detectedConfidence: proposal.confidence,
    profileEvidence: proposal.evidence,
    detectedVendors: detectVendors(cwd, orgVendors),
    detectedHost: opts.detectedHost,
    existingPipeline: findExistingPipeline(cwd),
    recorded:
      recorded === null
        ? null
        : {
            ...(recorded.profile !== undefined ? { profile: recorded.profile } : {}),
            ...(recorded.vendors !== undefined ? { vendors: recorded.vendors } : {}),
            ...(recorded.rung !== undefined ? { rung: recorded.rung } : {}),
            // Empty means nobody has said, which must fall through to detection
            // rather than record "this repository runs nothing".
            ...(recorded.integrations.length > 0 ? { integrations: recorded.integrations } : {}),
          },
  };
}
