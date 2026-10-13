// Facts the reference pages derive from the repository itself — manifest
// profiles, rule ids, the CI steps that guard each file — rather than restate by
// hand on every page, where they would drift the first time a workflow changed.
// Per-item facts the derivation cannot know live in the *-info modules.
import { loadManifest } from "./manifest";
import { rulesForStack, type Severity } from "./rules";

export type Step = { label: string; detail: string };

// --- standards ---------------------------------------------------------------

// Which profiles pull a stack in, following `extends` — react-native extends
// react, so a repo on the mobile-react-native profile gets the react rules too and a page
// that listed only direct membership would be wrong.
export function profilesIncluding(stack: string): string[] {
  const { profiles, stacks } = loadManifest();
  const pulls = (id: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(id)) return seen;
    seen.add(id);
    for (const parent of stacks[id]?.extends ?? []) pulls(parent, seen);
    return seen;
  };
  return Object.entries(profiles)
    .filter(([, ids]) => ids.some((id) => pulls(id).has(stack)))
    .map(([name]) => name)
    .sort();
}

export function severityBreakdown(stack: string): Record<Severity, number> {
  const counts: Record<Severity, number> = { BLOCKER: 0, HIGH: 0, SUGGESTION: 0 };
  for (const rule of rulesForStack(stack)) counts[rule.severity] += 1;
  return counts;
}

// The standards edit loop, in the order the checks run. Every step here is a
// real command in .github/workflows/ci.yml — skipping one is a red build, not a
// style preference, which is why they are listed as commands and not advice.
export const STANDARDS_EDIT: Step[] = [
  {
    label: "Edit the markdown",
    detail:
      "standards/ is the only place a human edits a rule. AGENTS.md, CLAUDE.md, .github/copilot-instructions.md and .github/instructions/ are rendered from it, and the next render overwrites any hand edit there.",
  },
  {
    label: "node scripts/assign-rule-ids.mjs",
    detail:
      "Assigns a permanent <stack>/<slug> id to any new rule bullet and rewrites the file in place. Do not invent an id by hand. CI runs the same script with --check and fails if a rule is missing one.",
  },
  {
    label: "node scripts/render-self.mjs",
    detail:
      "Re-renders this repository's own copies of those files. CI runs it with --check, so a stale copy fails the build.",
  },
  {
    label: "Bump standards/manifest.json → version",
    detail:
      "In the same pull request as the rule change. Sync pull requests quote the version, so every repository can tell which standards it is on.",
  },
  {
    label: "Add a CHANGELOG.md entry",
    detail:
      "Also in the same pull request. Say what changed and why, and record the seed score: a standards change with no measurement is an opinion.",
  },
  {
    label: "node scripts/validate.mjs",
    detail:
      "The self-check CI runs: the manifest is consistent, rule ids are well formed, the output contract is intact, and every glob is one Copilot can read.",
  },
];

// --- workflows, templates ----------------------------------------------------

export const WORKFLOW_EDIT: Step[] = [
  {
    label: "Edit the YAML in workflows/ or .github/workflows/",
    detail:
      "workflows/ holds files destined for other repositories; .github/workflows/ is this repository's own CI. The two are not interchangeable — check where this one lives before editing.",
  },
  {
    label: "actionlint",
    detail:
      "CI lints .github/workflows/*.yml, workflows/*.yml and templates/redline.yml together. workflows/ is pointed at explicitly because actionlint's own discovery would skip it.",
  },
  {
    label: "node scripts/check-pins.mjs",
    detail:
      "If you add a third-party action, pin it to a 40-character commit SHA with a trailing # vX.Y.Z comment; a Docker image, to its digest with the tag in the comment. First-party actions/* are referenced by tag. The pin checker re-resolves each pin against the tag its comment claims. CI runs it as its own job, allowed to fail, because it needs the network.",
  },
  {
    label: "node scripts/validate.mjs",
    detail:
      "Asserts the workflow files the bundle depends on still exist, and that the gate's job ids still match the required check name derived from them.",
  },
];

export const TEMPLATE_EDIT: Step[] = [
  {
    label: "Find the real source",
    detail:
      "Check the Editing it column. A file marked no effect is a picture of what the CLI builds in code; its page names the code to change instead.",
  },
  {
    label: "Edit it",
    detail:
      "For a live template, edit the file in templates/ or platforms/azure/. For a generated file, edit the code its page names, such as SENSITIVE_PATHS in cli/commands/init.ts or applyPolicy in cli/platforms/github/install.ts.",
  },
  {
    label: "npm test && node scripts/validate.mjs",
    detail:
      "The install path is unit-tested against a fake host client. validate.mjs checks the shapes the required check name depends on, such as the caller's redline-gate job id.",
  },
  {
    label: "Release, then re-run redline init",
    detail:
      "Templates ship inside the published redlinegate package. For a file redline init writes, a merged edit reaches a repository once it is released and redline init runs there again. Repositories already onboarded keep their copy until then.",
  },
];

// The finding shape a rule produces, so the page can show the output contract
// filled in with this stack's own id prefix rather than a generic example.
export function findingExample(stack: string, severity: Severity, slug: string): string {
  return `Redline/${severity} [${stack}/${slug}]: <one-line problem>`;
}
