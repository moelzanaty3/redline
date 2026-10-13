import { COMMANDS, SEEDS, STANDARDS, TEMPLATES, WORKFLOWS, type RegistryEntry } from "@/lib/registry";
import { LEARN_STEPS, learnHref } from "@/lib/learn";
import { entriesOfKind, hrefOf, publisherOf, type Kind } from "@/lib/skills-catalog";

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

  // How many children to show while the reader is somewhere else. Off by
  // default: Reference alone has four categories with children, and previewing
  // every one of them rebuilds the wall the collapse exists to prevent. Set it
  // where a closed category would otherwise look empty and the reader has a
  // real reason to compare it with its sibling.
  preview?: number;

  // Whether these children form a reading order. A reference category does —
  // the pager walks Standards → core → manifest → javascript. The catalogue
  // does not: it is entered from its explorer or from search and left from
  // Related, so its 59 alphabetical neighbours are not a sequence, and
  // threading them through the pager puts 60 presses of Next between Skills
  // and the page that actually follows it.
  orderedChildren?: boolean;
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

// Catalogue entries are real pages, so they live in the nav like every other
// page rather than being reachable only from search. Alphabetical: a sidebar
// list of this length is scanned for a name, and delivery order — which is what
// the index page is for — gives no clue where to look.
const catalogChildren = (kind: Kind): DocLink[] =>
  entriesOfKind(kind)
    .map((entry) => {
      const p = publisherOf(entry);
      return {
        title: entry.title,
        href: hrefOf(entry),
        description: entry.summary,
        keywords: `${kind} ${entry.name} ${p.owner} ${p.repo} ${p.name} ${entry.phases.join(" ")} ${entry.stacks.join(" ")} skills.sh install`,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

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
        title: "Learn",
        href: "/docs/learn",
        description: "Take a small TypeScript service from no Redline to a merge gate that has earned its rung, one pull request per step. No prior knowledge needed.",
        keywords: "learn tutorial quickstart quick start get started step by step walkthrough workshop redline-demo demo onboard first finding explain fix team rule adr security floor dependency review blocking required check exemption evidence rung",
        children: LEARN_STEPS.map((step) => ({
          title: `${step.n} · ${step.title}`,
          href: learnHref(step),
          description: step.summary,
          keywords: `learn tutorial step ${step.n} ${step.title.toLowerCase()} ${step.tag ?? ""}`,
        })),
      },
      {
        title: "Onboard a repository",
        href: "/docs/onboarding",
        description: "Your own repository, on GitHub or Azure DevOps: the one-off first run, what an administrator still owes, and a short check that the gate is real.",
        keywords: "onboard repo install setup installation prerequisites node npx redlinegate npm package devDependency pin-cli redline init verify profile security floor merge policy pending admin azure github reusable gate workflow limitations prove it verification scenarios stand-down vendored gate",
      },
      {
        title: "Adopting Redline",
        href: "/docs/adopting",
        description: "Day one to month two: what happens in order, and when it is reasonable to start blocking merges.",
        keywords: "adopting rollout adoption path day one week one month two pilot promote blocking evidence ownership break glass success is it used end state estate commands",
      },
      {
        title: "Troubleshooting",
        href: "/docs/troubleshooting",
        description: "Every failure that actually happens, the string it prints, and the command that resolves it.",
        keywords: "troubleshooting troubleshoot problem broken error help stuck fix debug waiting for status expected never resolves check name required context partially onboarded pendingAdmin denied admin rights repair exemption ignored label not working checklist heading deleted rule not firing globs added lines stale artifacts drift no link docsBaseUrl docs-url ?? FAIL exit code 1 2 green but nothing checked false green needs aggregate remove uninstall",
      },
      {
        title: "Removing Redline",
        href: "/docs/removing",
        description: "Every file and host setting redline init created, and how to take it back out without losing the security floor.",
        keywords: "remove removing uninstall undo revert back out delete rollback offboard redline remove markers codeowners ruleset labels repository property security floor exit",
      },
      {
        title: "CLI commands",
        href: "/docs/cli",
        description: "Every command you type in a repository — what init and verify do, and what status, explain, sync, review, policy and exempt do around them.",
        keywords: "cli command redline init verify status explain sync review policy exempt remove registry metrics flags dry-run json list rule id skip with repair blocking rung gate exit codes speckit no-speckit tmf review-ownership codeowners context section",
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
        description: "Why a NestJS service never gets React rules: stack rule sets composed into one profile per repository.",
        keywords: "profiles stacks javascript react nodejs java go python kotlin swift terraform glob negation",
      },
      {
        title: "Deterministic rules",
        href: "/docs/deterministic",
        description: "The share of the standard a checker decides without a model — and why the classification is not in the markdown.",
        keywords: "deterministic policy tier checker no model todo ticket suppression radix added lines classification manifest",
      },
      {
        title: "Reviewing before you push",
        href: "/docs/local-review",
        description: "redline review: only the rules that apply to what you changed, in either engine.",
        keywords: "local review redline review staged diff engine embedded api ollama local model bounded prompt findings schema telemetry excluded",
      },
      {
        title: "The merge gate",
        href: "/docs/gate",
        description: "The five checks on every pull request: three process checks the rung governs, and a security floor that blocks at every rung.",
        keywords: "gate merge redline-gate redline/gate required check ruleset checklist launch readiness adr no-adr secret scan dependency review security floor process checks policy exempt label azure github blocking vendored gate-source",
      },
      {
        title: "Enforcement ladder",
        href: "/docs/enforcement",
        description: "Three rungs a repository climbs on evidence — and steps back from without asking.",
        keywords: "enforcement ladder rung observe block-blocker block-high promotion evidence record acted-on seed recall false positives 90 days demotion blocking required check",
      },
      {
        title: "Exemptions",
        href: "/docs/exemptions",
        description: "Merging with a failing process check, on the record: who accepted what, why, and until when.",
        keywords: "exemption redline-exempt label reason until scope expiry 90 days waiver process checks checklist adr policy security floor exemption-enforcement",
      },
      {
        title: "Distribution & drift",
        href: "/docs/distribution",
        description: "How a standards change reaches the estate, and how a repository that ignores it becomes visible.",
        keywords: "distribution sync registry register drift verify remote weekly sweep tracking issue coverage markers agents.md",
      },
      {
        title: "Telemetry & value",
        href: "/docs/telemetry",
        description: "Acted-on findings, the dashboard, scanner findings under one severity contract, and cost per BLOCKER caught.",
        keywords: "sarif ingestion code scanning codeql snyk semgrep cost roi value spend dora finance telemetry metrics digest teams inbox acted-on noise recall precision attribution seeded corpus validation score dashboard tiles tuning queue registry collect score-seeds history canary estate",
      },
    ],
  },
  {
    label: "Adaptors",
    links: [
      {
        title: "Adaptors overview",
        href: "/docs/adaptors",
        description: "One standard, the files each assistant reads it from: Copilot, Claude, Cursor, Codex and AGENTS.md agents.",
        keywords: "adaptors adaptor vendors github copilot copilot-instructions applyTo claude CLAUDE.md agents.md codex cursor mdc globs alwaysApply marker block local.md prompts slash commands detection",
      },
      {
        title: "Add a vendor",
        href: "/docs/adaptors/custom",
        description: "Everything a new assistant needs: the renderer, the manifest entry, detection, help text, commands and tests.",
        keywords: "custom vendor adaptor cli render vendors.ts add new vendor merge prune manifest",
      },
    ],
  },
  {
    // One section, two links. Labelling a section "Skills" and then putting a
    // link called "Skills" inside it reads as a stutter and costs a line of
    // sidebar for nothing.
    label: "Catalogue",
    links: [
      {
        title: "Skills",
        href: "/docs/skills",
        description: "Public agent skills from skills.sh, mapped onto the eight stages of delivery — what to load, and when.",
        keywords: "skills skills.sh catalogue catalog registry npx skills add sdlc lifecycle plan design build test review secure ship operate superpowers addyosmani anthropic vercel expo trail of bits claude code cursor codex install public open knowledge",
        children: catalogChildren("skill"),
        preview: 5,
        orderedChildren: false,
      },
      {
        title: "Agents",
        href: "/docs/agents",
        description: "Public agents from skills.sh — the ones that run their own loop: subagents, browsers, artifacts.",
        keywords: "agents subagent autonomous loop skills.sh catalogue registry npx skills add browser automation parallel worktree orchestration codex claude code cursor install public open",
        children: catalogChildren("agent"),
        preview: 5,
        orderedChildren: false,
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
        description: "Where each workflow runs, what starts it, and what it leaves behind.",
        keywords: "workflows github actions gate sync collect digest inbox canary dashboard registry azure redline-metrics",
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
        title: "What changed",
        href: "/docs/changes",
        description: "Release notes, read from CHANGELOG.md at build time so they cannot drift from the record.",
        keywords: "changelog release notes what changed history versions unreleased upgrade",
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
        title: "Maintainer scripts",
        href: "/docs/scripts",
        description: "The scripts that keep the Redline source repository honest, who runs each one, and how. Product repositories never run them.",
        keywords: "scripts maintainer ci validate score-seeds collect digest inbox dashboard registry assign-rule-ids check-pins render-self fetch-stars publish-local internal redline-metrics",
      },
      {
        title: "Who runs what",
        href: "/docs/who-runs-what",
        description: "Where each command and workflow runs, under which credential, and what it can reach.",
        keywords: "credentials tokens REDLINE_ORG_READ_TOKEN REDLINE_SYNC_TOKEN REDLINE_CANARY_TOKEN tiers blast radius who runs what",
      },
    ],
  },
];

// Every page the nav can reach, parents and children alike. This is the count
// the sidebar reports, so it has to include the catalogue: those pages exist.
export const FLAT_DOCS: DocLink[] = DOCS_NAV.flatMap((s) =>
  s.links.flatMap((l) => [l, ...(l.children ?? [])]),
);

// The same list minus the categories that are destinations rather than steps,
// so the pager walks the docs in reading order: Standards → core → manifest →
// javascript → … → Workflows, and skips straight over the catalogue.
const PAGER_DOCS: DocLink[] = DOCS_NAV.flatMap((s) =>
  s.links.flatMap((l) => [
    l,
    ...(l.orderedChildren === false ? [] : (l.children ?? [])),
  ]),
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
  // A catalogue entry is not in this list, so it gets no pager at all — which
  // is right: its neighbours downstairs are Related, not the next skill in the
  // alphabet.
  const i = PAGER_DOCS.findIndex((d) => d.href === href);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? (PAGER_DOCS[i - 1] ?? null) : null,
    next: i < PAGER_DOCS.length - 1 ? (PAGER_DOCS[i + 1] ?? null) : null,
  };
}
