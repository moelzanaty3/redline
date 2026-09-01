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
        description: "The eight-step org rollout, from source repo to widening.",
        keywords: "install setup rollout org secrets tokens ruleset pilot metrics repo",
      },
      {
        title: "Onboard a repository",
        href: "/docs/onboarding",
        description: "One command per repo, then verify the gate is real.",
        keywords: "onboard repo setup-repo.sh verify profile security floor branch ruleset",
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
        title: "The readiness gate",
        href: "/docs/gate",
        description: "Checklist, ADR-for-big-diffs, dependency review, diff secret scan.",
        keywords: "gate redline-gate required check ruleset checklist adr secret scan exempt label",
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
        description: "One function in render.mjs — merge markers, pruning, manifest toggle.",
        keywords: "custom vendor adaptor render.mjs add new vendor merge prune manifest",
      },
    ],
  },
  {
    label: "Reference",
    links: [
      {
        title: "Standards",
        href: "/docs/standards",
        description: "The full rule set — core plus 12 stacks — ready to copy.",
        keywords: "standards rules source copy core stacks markdown",
      },
      {
        title: "Scripts",
        href: "/docs/scripts",
        description: "Render, sync, onboarding, validation and telemetry scripts.",
        keywords: "scripts source render sync setup validate score collect digest inbox dashboard",
      },
      {
        title: "Workflows",
        href: "/docs/workflows",
        description: "Reusable GitHub Actions workflows, ready to install.",
        keywords: "workflows github actions gate sync collect digest inbox canary",
      },
      {
        title: "Templates & rulesets",
        href: "/docs/templates",
        description: "Repo templates, CODEOWNERS and branch rulesets.",
        keywords: "templates codeowners caller ruleset branch protection json",
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
    href: `/docs/templates#${e.slug}`,
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
