import { SCRIPTS, STANDARDS, TEMPLATES, WORKFLOWS } from "@/lib/registry";

export type DocLink = {
  title: string;
  href: string;
  description: string;
  keywords: string;
};

export type DocSection = {
  label: string;
  links: DocLink[];
};

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
      },
      {
        title: "Workflows",
        href: "/docs/workflows",
        description: "What each workflow does, what triggers it, where it lives, and whether it works in Phase 1.",
        keywords: "workflows github actions gate sync collect digest inbox canary phase 1 disabled azure",
      },
      {
        title: "Templates & rulesets",
        href: "/docs/templates",
        description: "What each template is, who installs it and where, and what's a live ruleset vs. a reference shape.",
        keywords: "templates codeowners caller ruleset branch protection json azure pull request checklist",
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
      },
    ],
  },
];

export const FLAT_DOCS: DocLink[] = DOCS_NAV.flatMap((s) => s.links);

export type SearchEntry = DocLink & { group: string };

export const SEARCH_INDEX: SearchEntry[] = [
  ...DOCS_NAV.flatMap((s) => s.links.map((l) => ({ ...l, group: s.label }))),
  ...STANDARDS.map((e) => ({
    title: e.title,
    href: `/docs/standards/${e.slug}`,
    description: e.description,
    keywords: `standard rules source ${e.file} ${e.slug}`,
    group: "Standards",
  })),
  ...SCRIPTS.map((e) => ({
    title: e.title,
    href: `/docs/scripts/${e.slug}`,
    description: e.description,
    keywords: `script source ${e.file} ${e.slug}`,
    group: "Scripts",
  })),
  ...WORKFLOWS.map((e) => ({
    title: e.title,
    href: `/docs/workflows/${e.slug}`,
    description: e.description,
    keywords: `workflow github actions ${e.file} ${e.slug}`,
    group: "Workflows",
  })),
  ...TEMPLATES.map((e) => ({
    title: e.title,
    href: `/docs/templates/${e.slug}`,
    description: e.description,
    keywords: `template ruleset ${e.file} ${e.slug}`,
    group: "Templates",
  })),
];

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
