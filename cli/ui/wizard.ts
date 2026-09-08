import type { Manifest } from '../render/manifest.ts';
import type { RepoSurvey } from '../detect/existing.ts';
import { RUNGS, type Rung } from '../enforce/ladder.ts';
import type { Choice, Prompter } from './prompt.ts';

// The questions `redline init` asks, and the order it asks them in.
//
// Onboarding used to be a wall of flags in a USAGE block and a wall of results
// on stdout. Both walls carried the same defect: the operator learned what
// Redline had decided only after it had decided, and every term it used
// ("rung", "advisory", "pendingAdmin") was defined somewhere they were not
// looking. This module inverts that — each decision is a question with the
// detected answer preselected and a one-line explanation of the term beside it,
// and nothing is written until a plan screen has been agreed.
//
// It is deliberately not a state machine over `InitOptions`. The wizard's
// output is exactly the shape `init()` already took from the flag parser, so
// there is one code path into onboarding and the prompts are a second way of
// filling the same struct — never a second way of onboarding.

export type Host = 'github' | 'azure';
export type Pipeline = 'github-actions' | 'azure-pipelines';

export interface WizardFacts {
  readonly manifest: Manifest;
  readonly survey: RepoSurvey;
  // From proposeProfile(scanRepo(cwd)) — the profile init would have picked.
  readonly detectedProfile: string;
  readonly profileEvidence: readonly string[];
  // From detectVendors() — what the repository's own files suggest.
  readonly detectedVendors: readonly string[];
  // Resolved from the git remote. `null` when detection could not tell, which
  // is the case the menu exists for.
  readonly detectedHost: Host | null;
  // Non-null when the repository has its own CI that a gate stage could join,
  // e.g. `cicd/pre-merge.yaml`. Drives the pipeline question's default.
  readonly existingPipeline: string | null;
  // What `.redline.json` already recorded, when this is a re-run.
  readonly recorded: {
    readonly profile?: string;
    readonly vendors?: readonly string[];
    readonly rung?: Rung;
  } | null;
}

export interface WizardAnswers {
  readonly profile: string;
  readonly vendors: readonly string[];
  readonly host: Host;
  readonly pipeline: Pipeline;
  readonly speckit: boolean;
  readonly tmf: boolean;
  // Capability ids the operator kept. Anything in OPTIONAL_CAPABILITIES and not
  // in here becomes a `--skip`.
  readonly capabilities: readonly string[];
  readonly rung: Rung;
  readonly action: 'apply' | 'dry-run';
}

// Plain-English, at the moment of choosing. Every one of these was a term the
// operator met for the first time in output that assumed they knew it.
const RUNG_HINTS: Record<Rung, string> = {
  observe: 'comments only — the check is always green. Start here',
  warn: 'comments and labels the PR — still never blocks a merge',
  'block-blocker': 'a BLOCKER finding fails the check and stops the merge',
  'block-high': 'BLOCKER and HIGH both stop the merge — the strictest rung',
};

const CAPABILITY_HINTS: Record<string, string> = {
  gate: 'the pull request check that runs the review',
  'merge-policy': 'branch protection requiring the check and an approval',
  labels: 'the labels the gate uses to mark and exempt a pull request',
  'review-ownership': 'seeds CODEOWNERS — off unless you ask, it can block every PR',
};

// Which Redline check a tool the repository already runs makes redundant.
// Phrased as what the operator would otherwise get twice, because "stands down
// the dependencies job" means nothing to someone meeting Redline today.
const STAND_DOWN_LABEL: Record<string, string> = {
  secrets: 'secret scanning',
  dependencies: 'dependency vulnerability review',
  policy: 'static analysis',
};

function profileChoices(manifest: Manifest, detected: string): Choice<string>[] {
  const ids = Object.keys(manifest.profiles).sort((a, b) => {
    if (a === detected) return -1;
    if (b === detected) return 1;
    return a.localeCompare(b);
  });
  return ids.map((id) => {
    // The stacks' own titles, not their ids. `JavaScript, React (web)` tells an
    // operator what they are choosing; `javascript, react` makes them guess at
    // the difference between two profiles that share a prefix.
    const stacks = (manifest.profiles[id] ?? []).map(
      (stack) => manifest.stacks[stack]?.title ?? stack
    );
    return {
      value: id,
      label: id,
      hint: stacks.join(', ') + (id === detected ? '   (detected)' : ''),
    };
  });
}

// Every vendor the standards know about, including the ones this organisation
// has switched off — shown greyed with the reason rather than filtered out.
//
// Hiding them was wrong for the same reason hiding a covered capability would
// be: an operator looking for Cursor and not finding it cannot tell whether
// Redline forgot about Cursor, does not support it, or was told not to render
// for it here. Only the last is true, and only the last is something they can
// go and change.
function vendorChoices(manifest: Manifest): Choice<string>[] {
  return Object.entries(manifest.vendors).map(([id, vendor]) => ({
    value: id,
    label: id,
    ...(vendor.enabled
      ? { hint: vendor.title }
      : // Reason first: a long vendor title truncates, and the half worth
        // keeping is the part that says why the row cannot be picked.
        { disabled: `not enabled for this organisation — ${vendor.title}` }),
  }));
}

/**
 * Run the menu.
 *
 * Every question is skippable in the sense that it has a preselected answer;
 * none is skippable in the sense of being hidden. A capability the repository
 * already covers is still shown — deselected, with the tool that covers it
 * named — because an operator who cannot see a decision cannot overrule it,
 * and this repository's detection is wrong often enough that overruling has to
 * stay one keystroke away.
 */
export async function runWizard(p: Prompter, facts: WizardFacts): Promise<WizardAnswers> {
  const { manifest, survey, recorded } = facts;

  p.intro('Redline');

  const profile = await p.select<string>(
    'Which standards apply here?',
    profileChoices(manifest, facts.detectedProfile),
    recorded?.profile ?? facts.detectedProfile
  );

  const hostChoices: Choice<Host>[] = [
    {
      value: 'github',
      label: 'GitHub',
      hint: 'GitHub.com or GitHub Enterprise Server' + (facts.detectedHost === 'github' ? '   (detected)' : ''),
    },
    {
      value: 'azure',
      label: 'Azure DevOps',
      // Deliberately no hostnames: cli/platforms/__tests__/boundary.test.ts
      // holds the line that only an adapter knows what a host's URLs look like,
      // and a menu hint is not an adapter.
      hint: 'Azure Repos' + (facts.detectedHost === 'azure' ? '   (detected)' : ''),
    },
  ];
  const host = await p.select<Host>(
    'Where does this repository live?',
    hostChoices,
    facts.detectedHost ?? 'github'
  );

  // Asked separately from the host because the two genuinely come apart: every
  // VFUK repository is on github.com and built by Azure Pipelines. Deriving the
  // pipeline from the host is what put a GitHub Actions caller into a repo
  // whose real gate is `cicd/pre-merge.yaml`.
  const pipelineChoices: Choice<Pipeline>[] = [
    {
      value: 'github-actions',
      label: 'GitHub Actions',
      hint: 'a workflow under .github/workflows',
    },
    {
      value: 'azure-pipelines',
      label: 'Azure Pipelines',
      hint:
        facts.existingPipeline === null
          ? 'a stage in an Azure pipeline definition'
          : `a stage added to ${facts.existingPipeline}   (detected)`,
    },
  ];
  const pipeline = await p.select<Pipeline>(
    'What runs your pull request checks?',
    pipelineChoices,
    facts.existingPipeline !== null ? 'azure-pipelines' : 'github-actions'
  );

  const vendors = await p.multiselect(
    'Which assistants should read the standards?',
    vendorChoices(manifest),
    [...(recorded?.vendors ?? facts.detectedVendors)]
  );

  const contexts = await p.multiselect(
    'Extra context to render beside the rules',
    [
      {
        value: 'speckit',
        label: 'Spec-driven development',
        hint: 'how to work from a spec — dropped automatically if you already run Spec Kit',
      },
      {
        value: 'tmf',
        label: 'TM Forum',
        hint: 'resource naming, @type, paging, error bodies. Only if you implement TMF APIs',
      },
    ],
    ['speckit']
  );

  // A capability a detected tool already covers starts deselected and says
  // which tool. `standDown` is advisory: nothing here is decided for the
  // operator, only defaulted.
  const covered = new Map<string, string>();
  for (const tool of survey.tools) {
    if (tool.standsDown === null) continue;
    covered.set(tool.standsDown, tool.label);
  }

  const capabilityChoices: Choice<string>[] = Object.entries(CAPABILITY_HINTS).map(
    ([id, hint]) => ({ value: id, label: id, hint })
  );
  const capabilities = await p.multiselect(
    'What should Redline install?',
    capabilityChoices,
    ['gate', 'merge-policy', 'labels']
  );

  if (covered.size > 0) {
    const named = [...covered]
      .map(([job, label]) => `${label} already covers ${STAND_DOWN_LABEL[job] ?? job}`)
      .join('; ');
    p.note(`${named}. Redline adds its own on top rather than replacing them.`);
  }

  const rung = await p.select<Rung>(
    'How hard should the check bite?',
    RUNGS.map((value) => ({ value, label: value, hint: RUNG_HINTS[value] })),
    recorded?.rung ?? 'observe'
  );

  const action = await p.select(
    'Ready?',
    [
      {
        value: 'dry-run' as const,
        label: 'Dry run',
        hint: 'print the plan — writes nothing, contacts no host, needs no credential',
      },
      {
        value: 'apply' as const,
        label: 'Apply',
        hint: 'write the files and open a pull request on redline/onboard',
      },
    ],
    'dry-run'
  );

  return {
    profile,
    vendors,
    host,
    pipeline,
    speckit: contexts.includes('speckit'),
    tmf: contexts.includes('tmf'),
    capabilities,
    rung,
    action,
  };
}
