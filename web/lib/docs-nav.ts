import { COMMANDS, PLANS, SCRIPTS, SEEDS, STANDARDS, TEMPLATES, WORKFLOWS, type RegistryEntry } from "@/lib/registry";

export type DocLink = {
  title: string;
  href: string;
  description: string;
  keywords: string;
  // Every item in a reference category gets its own page, and the sidebar lists
  // them rather than hiding them behind an index of cards. A category page that
  // only fans out to cards reads as "workflows are one page", which is exactly
  // what it is not — there are eight of them and each has its own onboarding,
  // edit loop and output.
  children?: DocLink[];
};

export type DocSection = {
  label: string;
  links: DocLink[];
};

// A registry entry becomes a child link under its category. Keywords carry the
// category word so ⌘K finds "javascript standard" as readily as "javascript".
const childrenOf = (
  entries: RegistryEntry[],
  base: string,
  keywords: string,
): DocLink[] =>
  entries.map((e) => ({
    title: e.title,
    href: `${base}/${e.slug}`,
    description: e.description,
    keywords: `${keywords} ${e.file} ${e.slug}`,
  }));

export const DOCS_NAV: DocSection[] = [
  {
    label: "Getting Started",
    links: [
      {
        title: "Introduction",
        href: "/docs",
        description: "What Redline is and how the oversight loop fits together.",
        keywords: "overview what is redline oversight ai review standards architecture delivery loop",
      },
      {
        title: "Installation",
        href: "/docs/installation",
        description: "Install the CLI, install the gate workflow into the org, onboard a repo.",
        keywords: "install setup npx redline-cli npm package github azure devops gate workflow",
      },
      {
        title: "Onboard a repository",
        href: "/docs/onboarding",
        description: "One command per repo, on GitHub or Azure DevOps, then verify the gate is real.",
        keywords: "onboard repo redline init verify profile security floor merge policy pending admin azure github",
      },
      {
        title: "CLI commands",
        href: "/docs/cli",
        description: "Four commands, deliberately — what init and verify do, and what sync and review would do once built.",
        keywords: "cli command redline init verify sync review flags dry-run skip with repair blocking gate exit codes",
        children: childrenOf(COMMANDS, "/docs/cli", "cli command"),
      },
    ],
  },
  {
    label: "Core Concepts",
    links: [
      {
        title: "The output contract",
        href: "/docs/output-contract",
        description: "Machine-readable severities and rule ids on every finding.",
        keywords: "output contract severity blocker high suggestion rule id machine readable finding noise",
      },
      {
        title: "Profiles & stacks",
        href: "/docs/profiles",
        description: "12 stack rule sets composed into profiles — a repo installs exactly one.",
        keywords: "profiles stacks javascript react nodejs java go python kotlin swift terraform glob negation",
      },
      {
        title: "The merge gate",
        href: "/docs/gate",
        description: "Checklist, ADR-for-big-diffs, dependency review, diff secret scan — advisory on both hosts.",
        keywords: "gate merge redline-gate redline/gate required check ruleset checklist adr secret scan exempt label azure github advisory blocking",
      },
      {
        title: "Telemetry & validation",
        href: "/docs/telemetry",
        description: "Acted-on findings, seeded corpus scoring, digest and inbox.",
        keywords: "telemetry metrics digest teams inbox acted-on noise recall precision seeded corpus validation score",
      },
    ],
  },
  {
    label: "Adaptors",
    links: [
      {
        title: "GitHub Copilot",
        href: "/docs/adaptors/github-copilot",
        description: "Connect Copilot code review to the rendered instruction files.",
        keywords: "github copilot adaptor connect copilot-instructions applyTo automatic code review",
      },
      {
        title: "Claude",
        href: "/docs/adaptors/claude",
        description: "Claude Code and Claude in GitHub via CLAUDE.md.",
        keywords: "claude adaptor claude code claude github CLAUDE.md import agents.md anthropic",
      },
      {
        title: "AGENTS.md agents",
        href: "/docs/adaptors/agents-md",
        description: "OpenAI Codex, Copilot coding agent, Jules, Devin, Cursor agent.",
        keywords: "agents.md adaptor codex jules devin cursor agent openai concatenated",
      },
      {
        title: "Cursor rules",
        href: "/docs/adaptors/cursor",
        description: "Scoped .mdc rules for the Cursor IDE.",
        keywords: "cursor adaptor rules mdc globs ide",
      },
      {
        title: "Add your own vendor",
        href: "/docs/adaptors/custom",
        description: "One function in cli/render/vendors.ts — merge markers, pruning, manifest toggle.",
        keywords: "custom vendor adaptor cli render vendors.ts add new vendor merge prune manifest",
      },
    ],
  },
  {
    label: "Reference",
    links: [
      {
        title: "Standards",
        href: "/docs/standards",
        description: "What a standard is, what a developer actually sees, and a rule reference per stack.",
        keywords: "standards rules source copy core stacks markdown severity output contract rule id profile",
        children: childrenOf(STANDARDS, "/docs/standards", "standard rules source"),
      },
      {
        title: "Workflows",
        href: "/docs/workflows",
        description: "What each workflow does, what triggers it, where it lives, and whether it works in Phase 1.",
        keywords: "workflows github actions gate sync collect digest inbox canary phase 1 disabled azure",
        children: childrenOf(WORKFLOWS, "/docs/workflows", "workflow github actions"),
      },
      {
        title: "Templates & rulesets",
        href: "/docs/templates",
        description: "What each template is, who installs it and where, and what's a live ruleset vs. a reference shape.",
        keywords: "templates codeowners caller ruleset branch protection json azure pull request checklist",
        children: childrenOf(TEMPLATES, "/docs/templates", "template ruleset"),
      },
      {
        title: "Seeded corpus",
        href: "/docs/seeds",
        description: "Known-bad code and known-good code beside it — how Redline measures whether the reviewer still works.",
        keywords: "seeded corpus validation recall precision false positive canary score-seeds marker clean known bad",
        children: childrenOf(SEEDS, "/docs/seeds", "seeded corpus validation"),
      },
    ],
  },
  {
    label: "Maintaining Redline",
    links: [
      {
        title: "Scripts",
        href: "/docs/scripts",
        description: "Internal maintainer tooling for this repo's own CI, telemetry and validation — not something an onboarded repo runs.",
        keywords: "scripts maintainer ci validate score collect digest inbox dashboard assign-rule-ids check-pins render-self internal redline-metrics",
        children: childrenOf(SCRIPTS, "/docs/scripts", "script source"),
      },
      {
        title: "Roadmap & plans",
        href: "/docs/roadmap",
        description: "Where Redline is going, why it stops where it does, and the record of how each piece was built.",
        keywords: "roadmap spec plan phase harness sarif skills policy tier dora cost enforcement exemptions review correlation non-goals",
        children: childrenOf(PLANS, "/docs/roadmap", "roadmap spec plan"),
      },
    ],
  },
];

// Children are inlined directly after their parent, so prev/next walks the docs
// in reading order: Standards → core → manifest → javascript → … → Workflows.
export const FLAT_DOCS: DocLink[] = DOCS_NAV.flatMap((s) =>
  s.links.flatMap((l) => [l, ...(l.children ?? [])]),
);

export type SearchEntry = DocLink & { group: string };

export const SEARCH_INDEX: SearchEntry[] = DOCS_NAV.flatMap((s) =>
  s.links.flatMap((l) => [
    { ...l, group: s.label },
    ...(l.children ?? []).map((c) => ({ ...c, group: l.title })),
  ]),
);

export function adjacentDocs(href: string): {
  prev: DocLink | null;
  next: DocLink | null;
} {
  const i = FLAT_DOCS.findIndex((d) => d.href === href);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? (FLAT_DOCS[i - 1] ?? null) : null,
    next: i < FLAT_DOCS.length - 1 ? (FLAT_DOCS[i + 1] ?? null) : null,
  };
}
