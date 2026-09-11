// The public agent-skill catalogue, as published on skills.sh.
//
// Nothing here is written by Redline and nothing here is vendored: every entry
// is a skill somebody else publishes, and the only thing this file adds is the
// SDLC placement and the sentence saying when an engineer should reach for it.
// That is the whole product — the registry has 20,000 skills and no opinion
// about which of them belong in a delivery pipeline.
//
// Every `publisher` + `name` pair below was checked against skills.sh's own
// sitemap. An entry that 404s upstream is a broken promise on our page, so if
// you add one, confirm https://www.skills.sh/<owner>/<repo>/<name> resolves
// before you commit it.

export type Phase =
  | "plan"
  | "design"
  | "build"
  | "test"
  | "review"
  | "secure"
  | "ship"
  | "operate"
  | "meta";

export type Kind = "skill" | "agent";

export type PhaseInfo = {
  id: Phase;
  label: string;
  short: string;
  blurb: string;
};

// The eight that form the rail, in delivery order. `meta` is deliberately not
// among them: skills about skills are not a stage of shipping software, and
// putting them on the rail would imply a ninth phase nobody runs.
export const PHASES: PhaseInfo[] = [
  {
    id: "plan",
    label: "Plan & specify",
    short: "Plan",
    blurb:
      "Turning an intention into something an agent can execute without inventing the requirements as it goes.",
  },
  {
    id: "design",
    label: "Design & architect",
    short: "Design",
    blurb:
      "Interfaces, module boundaries and domain language — decided before the code sets them in concrete.",
  },
  {
    id: "build",
    label: "Implement",
    short: "Build",
    blurb:
      "Writing the change: framework-specific conventions, and the discipline that keeps a long agent run on the rails.",
  },
  {
    id: "test",
    label: "Test",
    short: "Test",
    blurb:
      "Proving the change does what it claims — and finding the assertions that were never written.",
  },
  {
    id: "review",
    label: "Review",
    short: "Review",
    blurb:
      "Reading a diff critically, and the far harder skill of acting on what a reviewer said.",
  },
  {
    id: "secure",
    label: "Secure",
    short: "Secure",
    blurb:
      "Threat modelling, scanning, supply chain, and finding the other five copies of the bug you just found.",
  },
  {
    id: "ship",
    label: "Ship",
    short: "Ship",
    blurb: "Branches, pipelines, releases and the deploy itself.",
  },
  {
    id: "operate",
    label: "Operate & maintain",
    short: "Operate",
    blurb:
      "Production reality: debugging, performance, instrumentation, and writing down why the system is the way it is.",
  },
];

export const META_PHASE: PhaseInfo = {
  id: "meta",
  label: "Working with skills",
  short: "Meta",
  blurb:
    "Finding skills, writing your own, and keeping a skill library from turning into a junk drawer.",
};

export type Publisher = {
  id: string;
  owner: string;
  repo: string;
  name: string;
  // Why this publisher is worth trusting. `official` means they publish the
  // thing the skill is about — Vercel on Vercel, Expo on Expo — which is a
  // materially different claim from "a well-regarded engineer wrote this".
  official: boolean;
  note: string;
};

export const PUBLISHERS: Publisher[] = [
  {
    id: "anthropics/skills",
    owner: "anthropics",
    repo: "skills",
    name: "Anthropic",
    official: true,
    note: "Anthropic's own reference skills — the house style for the format itself.",
  },
  {
    id: "openai/skills",
    owner: "openai",
    repo: "skills",
    name: "OpenAI",
    official: true,
    note: "OpenAI's skill collection, written against Codex.",
  },
  {
    id: "vercel-labs/agent-skills",
    owner: "vercel-labs",
    repo: "agent-skills",
    name: "Vercel Labs",
    official: true,
    note: "Vercel on React, Next.js and deploying to Vercel.",
  },
  {
    id: "vercel-labs/skills",
    owner: "vercel-labs",
    repo: "skills",
    name: "Vercel Labs",
    official: true,
    note: "The registry's own tooling, from the team that runs it.",
  },
  {
    id: "expo/skills",
    owner: "expo",
    repo: "skills",
    name: "Expo",
    official: true,
    note: "Expo and EAS, from Expo — 39 skills covering router, modules, updates and builds.",
  },
  {
    id: "cloudflare/skills",
    owner: "cloudflare",
    repo: "skills",
    name: "Cloudflare",
    official: true,
    note: "Workers, Durable Objects and edge performance, from Cloudflare.",
  },
  {
    id: "supabase/agent-skills",
    owner: "supabase",
    repo: "agent-skills",
    name: "Supabase",
    official: true,
    note: "Supabase and Postgres practice, from Supabase.",
  },
  {
    id: "prisma/skills",
    owner: "prisma",
    repo: "skills",
    name: "Prisma",
    official: true,
    note: "Prisma client, migrations and upgrades, from Prisma.",
  },
  {
    id: "microsoft/playwright",
    owner: "microsoft",
    repo: "playwright",
    name: "Playwright",
    official: true,
    note: "Shipped inside the Playwright repository itself.",
  },
  {
    id: "dotnet/skills",
    owner: "dotnet",
    repo: "skills",
    name: ".NET team",
    official: true,
    note: "107 skills from the .NET team — MSBuild, EF Core, MAUI, testing, migrations.",
  },
  {
    id: "trailofbits/skills",
    owner: "trailofbits",
    repo: "skills",
    name: "Trail of Bits",
    official: false,
    note: "A security research firm's working toolkit: fuzzing, static analysis, variant hunting, audit process.",
  },
  {
    id: "obra/superpowers",
    owner: "obra",
    repo: "superpowers",
    name: "Jesse Vincent",
    official: false,
    note: "The process library that most agent workflows are downstream of — TDD, plans, subagents, worktrees.",
  },
  {
    id: "addyosmani/agent-skills",
    owner: "addyosmani",
    repo: "agent-skills",
    name: "Addy Osmani",
    official: false,
    note: "A full SDLC set in one repository — the single highest-coverage install on this page.",
  },
  {
    id: "addyosmani/web-quality-skills",
    owner: "addyosmani",
    repo: "web-quality-skills",
    name: "Addy Osmani",
    official: false,
    note: "Web quality specifically: Core Web Vitals, accessibility, SEO, audits.",
  },
  {
    id: "mattpocock/skills",
    owner: "mattpocock",
    repo: "skills",
    name: "Matt Pocock",
    official: false,
    note: "Strong on the thinking end — domain modelling, interrogating a plan, architecture.",
  },
];

export type CatalogEntry = {
  name: string;
  title: string;
  kind: Kind;
  publisher: string;
  phases: Phase[];
  stacks: string[];
  summary: string;
  // The sentence that earns the entry its place: the moment in a real week
  // when you would go and install this.
  reachFor: string;
};

// `agent` vs `skill` is a real distinction, not a label. An agent runs a
// multi-step loop with its own control flow — it spawns subagents, drives a
// browser, or writes artifacts and keeps going. A skill is knowledge the model
// reads and then applies to whatever it was already doing.
export const CATALOG: CatalogEntry[] = [
  // ---------------------------------------------------------------- plan
  {
    name: "brainstorming",
    title: "Brainstorming",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Pulls a vague idea apart into options and trade-offs before anything is committed to a plan.",
    reachFor:
      "The ticket says what somebody wants but not what should be built, and the first design you thought of is the only one you have thought of.",
  },
  {
    name: "writing-plans",
    title: "Writing plans",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "The plan format the rest of the superpowers library executes against — ordered, checkable steps rather than prose.",
    reachFor:
      "Before any change big enough that you would not want the agent deciding the order of the work on its own.",
  },
  {
    name: "spec-driven-development",
    title: "Spec-driven development",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Write the specification first, then let the implementation be judged against it rather than against taste.",
    reachFor:
      "Work that will be reviewed by someone who was not in the room when it was scoped.",
  },
  {
    name: "planning-and-task-breakdown",
    title: "Planning & task breakdown",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Decomposes a feature into tasks small enough that each one can be finished and verified independently.",
    reachFor:
      "A feature that is obviously more than one sitting, and you want the pieces to land separately.",
  },
  {
    name: "constraint-driven-development",
    title: "Constraint-driven development",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "States the constraints — budget, latency, compatibility, blast radius — as inputs rather than discovering them in review.",
    reachFor:
      "The requirement that will actually kill the design is non-functional, and nobody has written it down.",
  },
  {
    name: "context-engineering",
    title: "Context engineering",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["plan", "meta"],
    stacks: ["any"],
    summary:
      "Deliberately curating what the agent sees and when — the single biggest lever on output quality.",
    reachFor:
      "Output quality is sliding: hallucinated APIs, ignored conventions, patterns from the wrong part of the repo.",
  },
  {
    name: "grilling",
    title: "Grilling",
    kind: "agent",
    publisher: "mattpocock/skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Interviews you about your own plan, relentlessly, until the assumptions that were never stated are on the table.",
    reachFor:
      "You are about to start building and the plan feels fine — which is exactly when it has not been tested.",
  },
  {
    name: "to-prd",
    title: "To PRD",
    kind: "agent",
    publisher: "mattpocock/skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Turns a conversation into a product requirements document somebody else could pick up.",
    reachFor:
      "The decision happened in a thread and now needs to exist somewhere a new joiner can read it.",
  },
  {
    name: "define-goal",
    title: "Define goal",
    kind: "skill",
    publisher: "openai/skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Shapes intent into a measurable objective with explicit evidence and bounded scope, rather than a description of activity.",
    reachFor:
      "The task is phrased as work to do ('improve the dashboard') instead of an outcome you could check.",
  },
  {
    name: "ask-questions-if-underspecified",
    title: "Ask questions if underspecified",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["plan"],
    stacks: ["any"],
    summary:
      "Makes the agent stop and ask instead of filling a gap in the requirements with a plausible guess.",
    reachFor:
      "Any task where a confidently wrong assumption costs more than the round trip of asking.",
  },

  // -------------------------------------------------------------- design
  {
    name: "api-and-interface-design",
    title: "API & interface design",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["design"],
    stacks: ["any"],
    summary:
      "Designing interfaces that are hard to misuse and cheap to evolve — naming, versioning, error shape, defaults.",
    reachFor:
      "You are about to add a public function, endpoint or package export that other teams will depend on.",
  },
  {
    name: "codebase-design",
    title: "Codebase design",
    kind: "skill",
    publisher: "mattpocock/skills",
    phases: ["design"],
    stacks: ["any"],
    summary: "Where module boundaries go, and what belongs on each side of one.",
    reachFor:
      "The new feature does not have an obvious home, and the wrong answer becomes permanent within a sprint.",
  },
  {
    name: "domain-modeling",
    title: "Domain modeling",
    kind: "skill",
    publisher: "mattpocock/skills",
    phases: ["design"],
    stacks: ["typescript"],
    summary:
      "Modelling the problem so that illegal states cannot be represented, instead of validating them at every call site.",
    reachFor: "You are reaching for a fourth optional boolean on the same type.",
  },
  {
    name: "ubiquitous-language",
    title: "Ubiquitous language",
    kind: "skill",
    publisher: "mattpocock/skills",
    phases: ["design"],
    stacks: ["any"],
    summary:
      "One name per concept, shared between the code and the people who asked for it.",
    reachFor:
      "The same thing is a `customer` in one service, an `account` in the next and a `user` in the database.",
  },
  {
    name: "frontend-design",
    title: "Frontend design",
    kind: "skill",
    publisher: "anthropics/skills",
    phases: ["design", "build"],
    stacks: ["web", "react"],
    summary:
      "Anthropic's guidance for producing interfaces that look designed rather than defaulted.",
    reachFor:
      "The agent is generating UI and everything comes out looking like an untouched component library.",
  },
  {
    name: "web-design-guidelines",
    title: "Web design guidelines",
    kind: "skill",
    publisher: "vercel-labs/agent-skills",
    phases: ["design"],
    stacks: ["web"],
    summary:
      "Vercel's design rules for agent-generated web interfaces: layout, spacing, typography, motion, state.",
    reachFor:
      "You want generated UI to be consistent across a team without a designer reviewing every PR.",
  },
  {
    name: "diagramming-code",
    title: "Diagramming code",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["design", "operate"],
    stacks: ["any"],
    summary:
      "Produces accurate architecture and data-flow diagrams from the code that exists, not the code somebody described.",
    reachFor:
      "Onboarding onto an unfamiliar service, or preparing a design review for a system nobody has drawn in two years.",
  },

  // --------------------------------------------------------------- build
  {
    name: "executing-plans",
    title: "Executing plans",
    kind: "agent",
    publisher: "obra/superpowers",
    phases: ["build"],
    stacks: ["any"],
    summary:
      "Works through a written plan step by step, checking off as it goes and stopping when a step does not hold.",
    reachFor:
      "You have a plan and want it executed in order, not reinterpreted halfway through.",
  },
  {
    name: "subagent-driven-development",
    title: "Subagent-driven development",
    kind: "agent",
    publisher: "obra/superpowers",
    phases: ["build"],
    stacks: ["any"],
    summary:
      "Splits work across subagents with their own context windows so a long task does not degrade as the transcript grows.",
    reachFor: "The job is big enough that quality visibly drops before it finishes.",
  },
  {
    name: "dispatching-parallel-agents",
    title: "Dispatching parallel agents",
    kind: "agent",
    publisher: "obra/superpowers",
    phases: ["build"],
    stacks: ["any"],
    summary:
      "Runs genuinely independent work concurrently, with the rules for when that is a speedup and when it is a merge conflict.",
    reachFor: "Several unrelated changes across a repo that do not touch the same files.",
  },
  {
    name: "incremental-implementation",
    title: "Incremental implementation",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["build"],
    stacks: ["any"],
    summary:
      "Keeps the tree working after every step, so a failure is attributable to the last change rather than to the batch.",
    reachFor:
      "Any refactor big enough that a single broken commit would be painful to bisect.",
  },
  {
    name: "frontend-ui-engineering",
    title: "Frontend UI engineering",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["build"],
    stacks: ["web", "react"],
    summary:
      "Component structure, state placement, accessibility and the rendering costs that only show up on a real device.",
    reachFor:
      "Building UI that has to survive contact with slow networks and assistive technology.",
  },
  {
    name: "using-git-worktrees",
    title: "Using git worktrees",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["build"],
    stacks: ["any"],
    summary:
      "Gives each agent run its own checkout, so parallel work does not fight over one working directory.",
    reachFor:
      "You want to run more than one agent on the same repository without them stepping on each other.",
  },
  {
    name: "vercel-react-best-practices",
    title: "React best practices",
    kind: "skill",
    publisher: "vercel-labs/agent-skills",
    phases: ["build"],
    stacks: ["react", "web"],
    summary:
      "Vercel's current React guidance — server and client boundaries, data fetching, caching, the Compiler era.",
    reachFor:
      "Your agent is still writing 2022 React: manual memoisation, effects for derived state, client components by default.",
  },
  {
    name: "vercel-react-native-skills",
    title: "React Native skills",
    kind: "skill",
    publisher: "vercel-labs/agent-skills",
    phases: ["build"],
    stacks: ["react-native"],
    summary: "React Native conventions and the places the web mental model breaks.",
    reachFor:
      "A web-shaped agent is writing mobile code and the result runs badly on device.",
  },
  {
    name: "expo-router",
    title: "Expo Router",
    kind: "skill",
    publisher: "expo/skills",
    phases: ["build"],
    stacks: ["react-native"],
    summary:
      "File-based routing for Expo apps, from Expo — layouts, groups, typed routes, deep links.",
    reachFor:
      "Starting or restructuring navigation in an Expo app, where the generated code otherwise lags the current API by a major version.",
  },
  {
    name: "workers-best-practices",
    title: "Workers best practices",
    kind: "skill",
    publisher: "cloudflare/skills",
    phases: ["build"],
    stacks: ["cloud", "node"],
    summary:
      "Cloudflare's own guidance for Workers: runtime limits, bindings, request lifecycle, what does not exist at the edge.",
    reachFor:
      "Writing Workers code, where half the Node.js API surface an agent assumes is simply absent.",
  },
  {
    name: "supabase-postgres-best-practices",
    title: "Supabase Postgres best practices",
    kind: "skill",
    publisher: "supabase/agent-skills",
    phases: ["build", "secure"],
    stacks: ["sql"],
    summary: "Schema, indexing and row-level security as Supabase recommends them.",
    reachFor:
      "Anything touching RLS policies — the place where a plausible-looking generated policy is a data leak.",
  },
  {
    name: "prisma-client-api",
    title: "Prisma Client API",
    kind: "skill",
    publisher: "prisma/skills",
    phases: ["build"],
    stacks: ["node", "sql"],
    summary: "The current Prisma Client surface, from Prisma.",
    reachFor:
      "Generated Prisma queries keep using APIs that moved or were removed a major version ago.",
  },
  {
    name: "dotnet-webapi",
    title: ".NET Web API",
    kind: "skill",
    publisher: "dotnet/skills",
    phases: ["build"],
    stacks: [".net"],
    summary: "Building ASP.NET Core web APIs the way the .NET team builds them.",
    reachFor:
      "Starting a service, or bringing a controller-era codebase onto the current minimal-API conventions.",
  },
  {
    name: "mcp-builder",
    title: "MCP builder",
    kind: "agent",
    publisher: "anthropics/skills",
    phases: ["build"],
    stacks: ["any"],
    summary:
      "Builds a Model Context Protocol server — tool design, transport, schema, the mistakes that make a server unusable.",
    reachFor:
      "You are exposing an internal system to agents and want the tool surface designed rather than generated.",
  },

  // ---------------------------------------------------------------- test
  {
    name: "test-driven-development",
    title: "Test-driven development",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["test", "build"],
    stacks: ["any"],
    summary:
      "The strict red-green-refactor loop, written so an agent cannot quietly write the test after the code.",
    reachFor:
      "You want the test to be evidence the code works, not a transcript of what it already does.",
  },
  {
    name: "test-driven-development",
    title: "TDD (Osmani)",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["test"],
    stacks: ["any"],
    summary:
      "The same discipline in the SDLC set, so it composes with the planning and review skills beside it.",
    reachFor:
      "You are installing the Osmani set anyway and want one consistent vocabulary across the phases.",
  },
  {
    name: "verification-before-completion",
    title: "Verification before completion",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["test"],
    stacks: ["any"],
    summary:
      "Forces the agent to actually run the thing before it claims to be finished.",
    reachFor:
      "The failure mode you keep hitting is a confident summary of work that does not build.",
  },
  {
    name: "webapp-testing",
    title: "Webapp testing",
    kind: "agent",
    publisher: "anthropics/skills",
    phases: ["test"],
    stacks: ["web"],
    summary: "Drives a real browser against a running app and reports what it found.",
    reachFor:
      "You want the change exercised end to end rather than asserted about in a unit test.",
  },
  {
    name: "playwright-dev",
    title: "Playwright",
    kind: "skill",
    publisher: "microsoft/playwright",
    phases: ["test"],
    stacks: ["web"],
    summary:
      "Authoring Playwright tests, shipped in the Playwright repository itself — locators, waiting, fixtures, traces.",
    reachFor:
      "Your generated E2E tests are full of arbitrary sleeps and brittle CSS selectors.",
  },
  {
    name: "browser-testing-with-devtools",
    title: "Browser testing with DevTools",
    kind: "agent",
    publisher: "addyosmani/agent-skills",
    phases: ["test", "operate"],
    stacks: ["web"],
    summary:
      "Uses the DevTools protocol to inspect, measure and reproduce behaviour in a live page.",
    reachFor:
      "A bug that only exists in the browser, and only with the real network and real data.",
  },
  {
    name: "property-based-testing",
    title: "Property-based testing",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["test"],
    stacks: ["any"],
    summary:
      "Tests the invariant across generated inputs instead of the three examples you thought of.",
    reachFor:
      "Parsers, serialisers, money arithmetic, permission logic — anywhere the interesting input is the one you did not imagine.",
  },
  {
    name: "mutation-testing",
    title: "Mutation testing",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["test"],
    stacks: ["any"],
    summary:
      "Breaks the code on purpose to find out whether the suite notices — the only honest measure of test quality.",
    reachFor:
      "Coverage is high, confidence is not, and you suspect the tests assert very little.",
  },
  {
    name: "test-gap-analysis",
    title: "Test gap analysis",
    kind: "agent",
    publisher: "dotnet/skills",
    phases: ["test"],
    stacks: [".net"],
    summary:
      "Finds the behaviour that no test currently exercises and reports it as a list.",
    reachFor:
      "Inheriting a service with a suite nobody trusts and no idea where the holes are.",
  },
  {
    name: "code-testing-agent",
    title: "Code testing agent",
    kind: "agent",
    publisher: "dotnet/skills",
    phases: ["test"],
    stacks: ["any"],
    summary:
      "A multi-agent pipeline that researches, plans and then generates a working test suite — language-agnostic despite the publisher.",
    reachFor:
      "A module with no tests at all, where the first hour is deciding what is even worth asserting.",
  },

  // -------------------------------------------------------------- review
  {
    name: "requesting-code-review",
    title: "Requesting code review",
    kind: "agent",
    publisher: "obra/superpowers",
    phases: ["review"],
    stacks: ["any"],
    summary:
      "Dispatches a reviewer with fresh context, so the review is not done by the model that just wrote the code.",
    reachFor:
      "Before you open the PR — a self-review from the authoring context finds almost nothing.",
  },
  {
    name: "receiving-code-review",
    title: "Receiving code review",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["review"],
    stacks: ["any"],
    summary:
      "How to act on review feedback without either capitulating to all of it or arguing with all of it.",
    reachFor:
      "The agent's instinct on a review comment is to apply it immediately, including when it is wrong.",
  },
  {
    name: "code-review-and-quality",
    title: "Code review & quality",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["review"],
    stacks: ["any"],
    summary: "What to look for in a diff, in priority order, and what to leave alone.",
    reachFor: "Your AI reviewer produces forty style nits and misses the race condition.",
  },
  {
    name: "code-simplification",
    title: "Code simplification",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["review"],
    stacks: ["any"],
    summary:
      "Reduces complexity while preserving exact behaviour — judged on whether a new joiner reads it faster, not on line count.",
    reachFor:
      "The feature works and the tests pass, but the implementation is heavier than the problem.",
  },
  {
    name: "improve-codebase-architecture",
    title: "Improve codebase architecture",
    kind: "skill",
    publisher: "mattpocock/skills",
    phases: ["review", "design"],
    stacks: ["any"],
    summary:
      "Finds the places where deepening a module would remove a whole class of call-site complexity.",
    reachFor:
      "Every feature touches nine files and you want to know which boundary is wrong.",
  },
  {
    name: "deprecation-and-migration",
    title: "Deprecation & migration",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["review", "operate"],
    stacks: ["any"],
    summary:
      "Retiring an old path safely: migrating consumers, proving nothing still calls it, then deleting it.",
    reachFor:
      "The new implementation shipped six months ago and the old one is still there because nobody dared.",
  },
  {
    name: "differential-review",
    title: "Differential security review",
    kind: "agent",
    publisher: "trailofbits/skills",
    phases: ["review", "secure"],
    stacks: ["any"],
    summary:
      "Security-focused review of a PR, commit or diff — risk-first, evidence-backed, with stated coverage limits.",
    reachFor:
      "A change touching auth, crypto, value transfer or an external call, where a generic reviewer will not go deep enough.",
  },
  {
    name: "fix-review",
    title: "Fix review",
    kind: "agent",
    publisher: "trailofbits/skills",
    phases: ["review", "secure"],
    stacks: ["any"],
    summary:
      "Checks that a fix actually closes the reported issue and did not just move it.",
    reachFor: "Verifying a security patch before you tell the reporter it is resolved.",
  },

  // -------------------------------------------------------------- secure
  {
    name: "security-and-hardening",
    title: "Security & hardening",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["secure"],
    stacks: ["any"],
    summary:
      "Input validation, authn/authz, secrets, dependency risk and logging — the everyday floor rather than a formal audit.",
    reachFor:
      "The baseline you want loaded on any change that touches user input or credentials.",
  },
  {
    name: "security-best-practices",
    title: "Security best practices",
    kind: "skill",
    publisher: "openai/skills",
    phases: ["secure"],
    stacks: ["any"],
    summary: "OpenAI's secure-coding guidance for agent-written code.",
    reachFor:
      "A second, independently written baseline when you do not want one author's blind spots.",
  },
  {
    name: "security-threat-model",
    title: "Security threat model",
    kind: "agent",
    publisher: "openai/skills",
    phases: ["secure", "design"],
    stacks: ["any"],
    summary:
      "Produces a threat model for a feature or system — assets, entry points, trust boundaries, mitigations.",
    reachFor:
      "A new externally-reachable surface, before it is built rather than after it is pentested.",
  },
  {
    name: "semgrep",
    title: "Semgrep",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["secure"],
    stacks: ["any"],
    summary:
      "Running Semgrep properly and writing rules that catch a pattern without drowning the repo in findings.",
    reachFor:
      "You want a class of bug caught deterministically in CI instead of hopefully by a model.",
  },
  {
    name: "codeql",
    title: "CodeQL",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["secure"],
    stacks: ["any"],
    summary:
      "Writing and running CodeQL queries for dataflow problems a pattern matcher cannot see.",
    reachFor:
      "Taint tracking — proving that untrusted input can or cannot reach a dangerous sink.",
  },
  {
    name: "variant-analysis",
    title: "Variant analysis",
    kind: "agent",
    publisher: "trailofbits/skills",
    phases: ["secure"],
    stacks: ["any"],
    summary:
      "Finds the other instances of a bug you already found — one root cause usually has several manifestations.",
    reachFor:
      "The moment a vulnerability is confirmed. Fixing only the reported instance is the most common incomplete fix there is.",
  },
  {
    name: "supply-chain-risk-auditor",
    title: "Supply chain risk auditor",
    kind: "agent",
    publisher: "trailofbits/skills",
    phases: ["secure", "ship"],
    stacks: ["any"],
    summary: "Audits dependencies and their provenance for supply-chain risk.",
    reachFor:
      "A release with new third-party dependencies, or a periodic sweep of what you already ship.",
  },
  {
    name: "secure-workflow-guide",
    title: "Secure workflow guide",
    kind: "skill",
    publisher: "trailofbits/skills",
    phases: ["secure", "ship"],
    stacks: ["ci/cd"],
    summary:
      "Hardening CI: pinned actions, scoped tokens, and the injection paths in a pull_request_target trigger.",
    reachFor:
      "Any workflow that runs against a fork's code or holds a token worth stealing.",
  },
  {
    name: "agentic-actions-auditor",
    title: "Agentic actions auditor",
    kind: "agent",
    publisher: "trailofbits/skills",
    phases: ["secure"],
    stacks: ["ci/cd"],
    summary:
      "Audits CI workflows that invoke AI agents — where prompt injection becomes a repository write.",
    reachFor:
      "You just gave an agent a token in CI. This is the review of that decision.",
  },

  // ---------------------------------------------------------------- ship
  {
    name: "finishing-a-development-branch",
    title: "Finishing a development branch",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["ship"],
    stacks: ["any"],
    summary:
      "The end-of-branch checklist: rebase, squash, description, and what must be true before it merges.",
    reachFor:
      "Agent-authored branches that arrive with 40 commits called 'fix' and an empty description.",
  },
  {
    name: "git-workflow-and-versioning",
    title: "Git workflow & versioning",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["ship"],
    stacks: ["any"],
    summary: "Commit hygiene, branching and semantic versioning as one consistent set.",
    reachFor: "Commit messages that describe the diff instead of the reason for it.",
  },
  {
    name: "ci-cd-and-automation",
    title: "CI/CD & automation",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["ship"],
    stacks: ["ci/cd"],
    summary: "Pipeline structure, caching, matrix builds and gating.",
    reachFor: "A pipeline that takes eleven minutes to tell you about a lint error.",
  },
  {
    name: "shipping-and-launch",
    title: "Shipping & launch",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["ship"],
    stacks: ["any"],
    summary:
      "Release readiness: rollout, flags, rollback and what gets watched after the deploy.",
    reachFor: "A change that is risky enough to want a plan for turning it off again.",
  },
  {
    name: "authoring-github-workflows",
    title: "Authoring GitHub workflows",
    kind: "skill",
    publisher: "dotnet/skills",
    phases: ["ship"],
    stacks: ["ci/cd"],
    summary:
      "Writing Actions workflows, from a team that maintains some very large ones.",
    reachFor:
      "Beyond the generated starter workflow — reusable workflows, concurrency, permissions.",
  },
  {
    name: "gh-fix-ci",
    title: "Fix CI",
    kind: "agent",
    publisher: "openai/skills",
    phases: ["ship"],
    stacks: ["ci/cd"],
    summary: "Reads a failing CI run, reproduces the failure and pushes the fix.",
    reachFor:
      "A red pipeline on a PR you already understand, where the loop is mechanical.",
  },
  {
    name: "gh-address-comments",
    title: "Address PR comments",
    kind: "agent",
    publisher: "openai/skills",
    phases: ["ship", "review"],
    stacks: ["any"],
    summary:
      "Works through review comments on a pull request and responds to or resolves each one.",
    reachFor: "A PR with twenty review threads, most of which are small and unambiguous.",
  },
  {
    name: "deploy-to-vercel",
    title: "Deploy to Vercel",
    kind: "agent",
    publisher: "vercel-labs/agent-skills",
    phases: ["ship"],
    stacks: ["web"],
    summary: "Takes a project from local to a live Vercel deployment.",
    reachFor: "First deploy of a new app, or wiring preview deploys into a workflow.",
  },
  {
    name: "eas-workflows",
    title: "EAS workflows",
    kind: "skill",
    publisher: "expo/skills",
    phases: ["ship"],
    stacks: ["react-native"],
    summary: "Expo Application Services build, submit and update pipelines, from Expo.",
    reachFor:
      "Automating mobile releases, where the store submission steps are the part that is easy to get wrong.",
  },
  {
    name: "github-triage",
    title: "GitHub triage",
    kind: "agent",
    publisher: "trailofbits/skills",
    phases: ["ship", "operate"],
    stacks: ["any"],
    summary:
      "Triages issues and pull requests into something a maintainer can work through.",
    reachFor: "An issue tracker that has stopped being read because it is too long.",
  },

  // ------------------------------------------------------------- operate
  {
    name: "systematic-debugging",
    title: "Systematic debugging",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["operate"],
    stacks: ["any"],
    summary:
      "Reproduce, narrow, hypothesise, test one variable at a time — instead of changing four things and rerunning.",
    reachFor: "The bug has survived two speculative fixes and is starting to cost a day.",
  },
  {
    name: "diagnose",
    title: "Diagnose",
    kind: "agent",
    publisher: "mattpocock/skills",
    phases: ["operate"],
    stacks: ["any"],
    summary: "A diagnosis loop that ends in a regression test, not just a green build.",
    reachFor:
      "A production bug where the fix matters less than making sure it cannot come back.",
  },
  {
    name: "debugging-and-error-recovery",
    title: "Debugging & error recovery",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["operate"],
    stacks: ["any"],
    summary:
      "Reading failures properly, and getting an agent out of a loop where it keeps retrying the same broken approach.",
    reachFor:
      "The agent has been stuck on the same error for six turns and is getting more confident, not less.",
  },
  {
    name: "performance-optimization",
    title: "Performance optimization",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["operate"],
    stacks: ["any"],
    summary: "Measure, find the actual bottleneck, change one thing, measure again.",
    reachFor: "Somebody says it feels slow and the instinct is to start adding caches.",
  },
  {
    name: "core-web-vitals",
    title: "Core Web Vitals",
    kind: "skill",
    publisher: "addyosmani/web-quality-skills",
    phases: ["operate"],
    stacks: ["web"],
    summary: "LCP, INP and CLS: what moves each one, and what only looks like it does.",
    reachFor:
      "A failing field-data report, where lab numbers are already green and unhelpful.",
  },
  {
    name: "accessibility",
    title: "Accessibility",
    kind: "skill",
    publisher: "addyosmani/web-quality-skills",
    phases: ["operate", "build"],
    stacks: ["web"],
    summary:
      "WCAG in practice — semantics, focus management, contrast, and what automated checks cannot see.",
    reachFor:
      "Any user-facing UI. Generated markup passes axe and still cannot be operated with a keyboard.",
  },
  {
    name: "web-perf",
    title: "Web performance",
    kind: "skill",
    publisher: "cloudflare/skills",
    phases: ["operate"],
    stacks: ["web", "cloud"],
    summary:
      "Cloudflare's view of web performance — caching, edge behaviour and delivery.",
    reachFor: "The bottleneck is in front of your origin rather than inside your bundle.",
  },
  {
    name: "vercel-optimize",
    title: "Vercel optimize",
    kind: "skill",
    publisher: "vercel-labs/agent-skills",
    phases: ["operate"],
    stacks: ["web"],
    summary: "Finding and fixing what is slow or expensive in a Vercel-hosted app.",
    reachFor: "A bill or a p95 that moved and nobody knows which deploy did it.",
  },
  {
    name: "analyzing-dotnet-performance",
    title: "Analyzing .NET performance",
    kind: "skill",
    publisher: "dotnet/skills",
    phases: ["operate"],
    stacks: [".net"],
    summary:
      "Traces, dumps and allocation analysis, from the team that builds the runtime.",
    reachFor:
      "A .NET service with a memory profile or GC pattern that needs real tooling, not guesses.",
  },
  {
    name: "observability-and-instrumentation",
    title: "Observability & instrumentation",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["operate"],
    stacks: ["any"],
    summary:
      "What to emit — logs, metrics, traces — and what must never end up in any of them.",
    reachFor:
      "Adding instrumentation to a path that handles personal data, where a helpful log line is a privacy incident.",
  },
  {
    name: "documentation-and-adrs",
    title: "Documentation & ADRs",
    kind: "skill",
    publisher: "addyosmani/agent-skills",
    phases: ["operate", "design"],
    stacks: ["any"],
    summary:
      "Recording architectural decisions so the reasoning survives the people who made it.",
    reachFor:
      "A decision that will look arbitrary in a year unless the alternatives are written down now.",
  },

  // ---------------------------------------------------------------- meta
  {
    name: "find-skills",
    title: "Find skills",
    kind: "agent",
    publisher: "vercel-labs/skills",
    phases: ["meta"],
    stacks: ["any"],
    summary:
      "Searches the registry for a skill that fits what you are doing, and installs it.",
    reachFor:
      "The honest answer to 'is there already a skill for this' — there are 20,000 of them.",
  },
  {
    name: "using-superpowers",
    title: "Using superpowers",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["meta"],
    stacks: ["any"],
    summary:
      "The index for the rest of the library — which skill applies when, so the others actually get invoked.",
    reachFor: "Install this alongside the superpowers set or most of it will sit unused.",
  },
  {
    name: "skill-creator",
    title: "Skill creator",
    kind: "agent",
    publisher: "anthropics/skills",
    phases: ["meta"],
    stacks: ["any"],
    summary:
      "Anthropic's own tool for writing a new skill in the format agents actually load.",
    reachFor:
      "You have internal knowledge worth encoding and want it to match the house format.",
  },
  {
    name: "writing-skills",
    title: "Writing skills",
    kind: "skill",
    publisher: "obra/superpowers",
    phases: ["meta"],
    stacks: ["any"],
    summary:
      "What separates a skill that changes behaviour from one that is ignored — mostly the description field.",
    reachFor: "Your team wrote skills and the model never triggers them.",
  },
];

// ---------------------------------------------------------------- helpers

export const PUBLISHER_BY_ID = new Map(PUBLISHERS.map((p) => [p.id, p]));

export function publisherOf(entry: CatalogEntry): Publisher {
  const p = PUBLISHER_BY_ID.get(entry.publisher);
  if (!p) throw new Error(`Unknown publisher: ${entry.publisher}`);
  return p;
}

// Two publishers ship a skill called `test-driven-development`, so the owner is
// part of the identity rather than decoration. The route mirrors skills.sh's
// own /<owner>/<repo>/<name> shape, minus the repo — no owner in this catalogue
// publishes the same skill name from two repositories.
export function slugOf(entry: CatalogEntry): string {
  return `${publisherOf(entry).owner}/${entry.name}`;
}

/**
 * The invariants the routes depend on, checked rather than asserted in a
 * comment.
 *
 * This runs once when the module is first imported, which during `next build`
 * means the build fails rather than the site shipping wrong. Both rules here
 * have already been broken once by ordinary editing:
 *
 * - Two entries sharing owner+name would collide in the route. `generateStaticParams`
 *   would emit the slug twice and `findEntryOfKind` would return whichever was
 *   declared first, making one legitimate page permanently unreachable with no
 *   error anywhere. Four owners already publish from two repos each, so the name
 *   only has to repeat across those two for it to happen.
 * - `any` means "assumes no particular stack", so pairing it with a concrete one
 *   is a contradiction. Left unchecked it reaches the reader as a page that says
 *   "stack-agnostic" in the summary and ".net" in the facts rail.
 */
function validateCatalog(): void {
  const seen = new Map<string, string>();
  for (const entry of CATALOG) {
    const p = PUBLISHERS.find((pub) => pub.id === entry.publisher);
    if (!p) {
      throw new Error(
        `skills-catalog: "${entry.name}" names publisher "${entry.publisher}", which does not exist.`,
      );
    }

    const slug = `${p.owner}/${entry.name}`;
    const first = seen.get(slug);
    if (first) {
      throw new Error(
        `skills-catalog: slug "${slug}" is used by both "${first}" and "${entry.publisher}". ` +
          `One of the two pages would be unreachable — rename the entry or drop the duplicate.`,
      );
    }
    seen.set(slug, entry.publisher);

    if (entry.stacks.includes("any") && entry.stacks.length > 1) {
      throw new Error(
        `skills-catalog: "${slug}" lists "any" alongside ${entry.stacks
          .filter((s) => s !== "any")
          .join(", ")}. "any" means no particular stack is assumed, so it cannot be combined.`,
      );
    }

    if (entry.stacks.length === 0) {
      throw new Error(`skills-catalog: "${slug}" has no stacks — use ["any"] if it assumes none.`);
    }

    if (entry.phases.length === 0) {
      throw new Error(`skills-catalog: "${slug}" sits in no delivery phase.`);
    }
  }
}

validateCatalog();

// Skills and agents are separate sections of the site, not a filter on one
// page, because they answer different questions. "What should be loaded while I
// work on this?" and "what can I hand this whole job to?" are not two views of
// one list, and the install decision is different in kind: a skill is nearly
// free, an agent costs tokens and wall-clock time.
export const SKILLS: CatalogEntry[] = CATALOG.filter((e) => e.kind === "skill");
export const AGENTS: CatalogEntry[] = CATALOG.filter((e) => e.kind === "agent");

export function basePathOf(kind: Kind): string {
  return kind === "agent" ? "/docs/agents" : "/docs/skills";
}

export function entriesOfKind(kind: Kind): CatalogEntry[] {
  return kind === "agent" ? AGENTS : SKILLS;
}

export function hrefOf(entry: CatalogEntry): string {
  return `${basePathOf(entry.kind)}/${slugOf(entry)}`;
}

export function repoUrl(p: Publisher): string {
  return `https://github.com/${p.owner}/${p.repo}`;
}

// One command installs every skill in the repository, not just this one — the
// CLI's unit is the source, not the skill. Saying otherwise would have people
// wondering why they got ten skills when they asked for one.
export function installCommand(p: Publisher): string {
  return `npx skills add ${p.owner}/${p.repo}`;
}

export function findEntry(owner: string, name: string): CatalogEntry | undefined {
  return CATALOG.find((e) => publisherOf(e).owner === owner && e.name === name);
}

// Scoped lookup, so /docs/agents/<owner>/<skill-name> 404s rather than quietly
// rendering a skill under the agents breadcrumb.
export function findEntryOfKind(
  kind: Kind,
  owner: string,
  name: string,
): CatalogEntry | undefined {
  const entry = findEntry(owner, name);
  return entry?.kind === kind ? entry : undefined;
}

// Ranked, not sliced. Taking the first N in catalogue order surfaces whatever
// happened to be declared earliest in this file, which is not a recommendation.
// Overlapping phases dominate, then same kind, then an official publisher, then
// a *different* publisher — more skills from the repo you are already
// installing is not an alternative, it is the same option. Ties break on title
// so the static build is byte-stable.
export function relatedTo(entry: CatalogEntry, limit = 6): CatalogEntry[] {
  return CATALOG.filter(
    (e) => slugOf(e) !== slugOf(entry) && e.phases.some((ph) => entry.phases.includes(ph)),
  )
    .map((e) => {
      const shared = e.phases.filter((ph) => entry.phases.includes(ph)).length;
      return {
        entry: e,
        score:
          shared * 3 +
          (e.kind === entry.kind ? 2 : 0) +
          (publisherOf(e).official ? 1 : 0) +
          (e.publisher === entry.publisher ? 0 : 1),
      };
    })
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map((s) => s.entry);
}

// The summary panel on a detail page. Every line is derived from data already
// in this file — nothing here is a paraphrase of a SKILL.md we have not read,
// because a plausible-sounding invented bullet is worse than no bullet.
export function summaryBullets(entry: CatalogEntry): string[] {
  const p = publisherOf(entry);
  const phases = [...PHASES, META_PHASE].filter((ph) => entry.phases.includes(ph.id));
  const alsoHere = CATALOG.filter(
    (e) => e.publisher === entry.publisher && slugOf(e) !== slugOf(entry),
  ).length;
  const stacks = entry.stacks.filter((s) => s !== "any");

  const out = [
    `Reach for it when ${entry.reachFor.charAt(0).toLowerCase()}${entry.reachFor.slice(1)}`,
    phases.length === 1
      ? `Sits in ${phases[0]?.label} — ${phases[0]?.blurb.charAt(0).toLowerCase()}${phases[0]?.blurb.slice(1)}`
      : `Spans ${phases.map((ph) => ph.label).join(" and ")}, so it is usually worth loading for the whole piece of work rather than at one moment in it.`,
    stacks.length === 0
      ? "Stack-agnostic — nothing in it assumes a particular language or framework."
      : `Assumes ${stacks.join(", ")}.`,
    p.official
      ? `Published by ${p.name}, who ship the thing it is about — a stronger claim than a well-regarded engineer having written something good.`
      : `Published by ${p.name}. Well regarded, but not the vendor of the thing it covers.`,
  ];

  out.push(
    alsoHere === 0
      ? `Installing pulls the whole ${p.owner}/${p.repo} repository, which is the CLI's unit — not this file alone.`
      : `Installing pulls the whole ${p.owner}/${p.repo} repository: this catalogue lists ${alsoHere} other ${alsoHere === 1 ? "entry" : "entries"} from it, and the repo may hold more.`,
  );

  return out;
}

export function entriesInPhase(phase: Phase): CatalogEntry[] {
  return CATALOG.filter((e) => e.phases.includes(phase));
}

export function countsByPhase(): Record<Phase, number> {
  const out = {} as Record<Phase, number>;
  for (const p of [...PHASES, META_PHASE]) out[p.id] = entriesInPhase(p.id).length;
  return out;
}

// Stack filter values, derived rather than listed: a tag added to an entry
// shows up in the filter bar without a second edit here. Scoped by kind so the
// agents page does not offer a stack chip that matches nothing on it.
export const STACKS: string[] = [...new Set(CATALOG.flatMap((e) => e.stacks))].sort(
  (a, b) => (a === "any" ? -1 : b === "any" ? 1 : a.localeCompare(b)),
);

export function stacksOfKind(kind: Kind): string[] {
  return [...new Set(entriesOfKind(kind).flatMap((e) => e.stacks))].sort((a, b) =>
    a === "any" ? -1 : b === "any" ? 1 : a.localeCompare(b),
  );
}

export function phasesOf(entry: CatalogEntry): PhaseInfo[] {
  return [...PHASES, META_PHASE].filter((ph) => entry.phases.includes(ph.id));
}

// Phase counts within one kind, for the rail on a split page.
export function countsByPhaseOfKind(kind: Kind): Map<Phase, number> {
  const list = entriesOfKind(kind);
  return new Map(
    [...PHASES, META_PHASE].map((p) => [
      p.id,
      list.filter((e) => e.phases.includes(p.id)).length,
    ]),
  );
}

export const KIND_COPY: Record<Kind, { label: string; blurb: string }> = {
  skill: {
    label: "Skill",
    blurb: "Knowledge the model reads and applies to whatever it was already doing.",
  },
  agent: {
    label: "Agent",
    blurb:
      "Runs a multi-step loop of its own — spawns subagents, drives a browser, or writes artifacts and keeps going.",
  },
};
