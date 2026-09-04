// The four questions every reference page has to answer about its item: how it
// reaches you, how you use it, what it produces, and how you change it.
//
// Most of the answer is the same for every item in a category and is derived
// here from the repository itself — manifest profiles, rule ids, the CI steps
// that guard each file — rather than restated by hand 39 times, where it would
// drift the first time a workflow changed. Per-item facts that the derivation
// cannot know live in the *-info modules beside the copy they belong to.
import { loadManifest } from "./manifest";
import { rulesForStack, type Severity } from "./rules";

export type Step = { label: string; detail: string };

// --- standards ---------------------------------------------------------------

// Which profiles pull a stack in, following `extends` — react-native extends
// react, so a repo on the mobile-rn profile gets the react rules too and a page
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
      "standards/ is the only place a human edits a rule. Everything under AGENTS.md, .github/copilot-instructions.md and .github/instructions/ is rendered from it and is overwritten by the next render.",
  },
  {
    label: "node scripts/assign-rule-ids.mjs",
    detail:
      "Assigns a permanent <stack>/<slug> id to any new rule bullet and rewrites the file in place. Do not invent an id by hand. CI runs the same script with --check and fails if a rule is missing one.",
  },
  {
    label: "node scripts/render-self.mjs",
    detail:
      "Re-renders this repository's own artifacts from the edited source. CI runs it with --check, so stale checked-in output fails the build.",
  },
  {
    label: "Bump standards/manifest.json → version",
    detail:
      "Required in the same pull request as the rule change. Sync pull requests quote the version, so a repository's rendered artifacts always name where they came from.",
  },
  {
    label: "Add a CHANGELOG.md entry",
    detail:
      "Also in the same pull request. A standards change with no measurement is an opinion — record the seed score alongside it.",
  },
  {
    label: "node scripts/validate.mjs",
    detail:
      "The bundle self-check CI runs: manifest integrity, well-formed rule ids, the severity output contract surviving your edit, glob portability.",
  },
];

// --- scripts, workflows, templates -------------------------------------------

export const SCRIPT_EDIT: Step[] = [
  {
    label: "Edit the .mjs file directly",
    detail:
      "Nothing generates these — scripts/ is hand-written maintainer tooling with no runtime dependencies. Keep it that way: package.json declares none, and these run in CI with only Node's builtins available.",
  },
  {
    label: "node --check scripts/<file>.mjs",
    detail:
      "CI's lint job parses every script in scripts/. A syntax error there fails the build without running anything.",
  },
  {
    label: "Run it locally with the same env CI gives it",
    detail:
      "Each script is env-configured with no argument parsing, so a local run is the CI run. The environment variables it needs are listed above.",
  },
];

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
      "If you add a third-party action, pin it to a 40-character commit SHA with a trailing # vX.Y.Z comment. First-party actions/* are referenced by tag. The pin checker re-resolves the SHA against the tag the comment claims.",
  },
  {
    label: "node scripts/validate.mjs",
    detail:
      "Asserts the workflow files the bundle depends on still exist, and that the gate's job ids still match the required check name derived from them.",
  },
];

export const TEMPLATE_EDIT: Step[] = [
  {
    label: "Check whether the CLI reads this file at all",
    detail:
      "Several of these are reference shapes: the CLI generates the equivalent in code and never opens the checked-in copy. Editing one of those changes nothing about what redline init writes. The onboarding section above says which kind this is.",
  },
  {
    label: "Edit the real source",
    detail:
      "For a generated artifact that is cli/commands/init.ts; for a file installed verbatim it is the template itself.",
  },
  {
    label: "npm test && node scripts/validate.mjs",
    detail:
      "The install path is unit-tested against a fake host client, and validate.mjs pins the shapes the merge gate's required check name depends on.",
  },
];

// The finding shape a rule produces, so the page can show the output contract
// filled in with this stack's own id prefix rather than a generic example.
export function findingExample(stack: string, severity: Severity, slug: string): string {
  return `Redline/${severity} [${stack}/${slug}]: <one-line problem>`;
}
