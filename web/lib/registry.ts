export type RegistryEntry = {
  slug: string;
  title: string;
  file: string;
  description: string;
};

export const STANDARDS: RegistryEntry[] = [
  { slug: "core", title: "Core standards", file: "standards/core.md", description: "Security, type safety, error handling, scope discipline and the severity output contract." },
  { slug: "manifest", title: "manifest.json", file: "standards/manifest.json", description: "Stack globs, profiles, vendor toggles and the standards version." },
  { slug: "javascript", title: "JavaScript", file: "standards/stacks/javascript.md", description: "Untyped and loosely-typed JS: build scripts, config, serverless handlers, legacy app code." },
  { slug: "react", title: "React (web)", file: "standards/stacks/react.md", description: "React web applications." },
  { slug: "react-native", title: "React Native", file: "standards/stacks/react-native.md", description: "React Native apps — extends the React rules." },
  { slug: "nodejs", title: "Node.js (NestJS)", file: "standards/stacks/nodejs.md", description: "NestJS services." },
  { slug: "microservices", title: "Microservice cross-cutting", file: "standards/stacks/microservices.md", description: "Cross-cutting service rules: idempotency, timeouts, queues, observability." },
  { slug: "java", title: "Java (Spring Boot)", file: "standards/stacks/java.md", description: "Spring Boot services." },
  { slug: "go", title: "Go", file: "standards/stacks/go.md", description: "Go services and tools." },
  { slug: "python", title: "Python", file: "standards/stacks/python.md", description: "Python services and tooling." },
  { slug: "csharp", title: "C# (.NET)", file: "standards/stacks/csharp.md", description: ".NET services." },
  { slug: "kotlin", title: "Kotlin", file: "standards/stacks/kotlin.md", description: "Kotlin / Android." },
  { slug: "swift", title: "Swift (iOS)", file: "standards/stacks/swift.md", description: "iOS applications." },
  { slug: "terraform", title: "Terraform / HCL", file: "standards/stacks/terraform.md", description: "Infrastructure as code." },
];

export const SCRIPTS: RegistryEntry[] = [
  { slug: "validate", title: "validate.mjs", file: "scripts/validate.mjs", description: "Bundle self-check run by this repo's CI — manifest integrity, rule ids, ruleset/workflow files, the seed corpus." },
  { slug: "assign-rule-ids", title: "assign-rule-ids.mjs", file: "scripts/assign-rule-ids.mjs", description: "Assigns a permanent id to every rule missing one, and rewrites standards/ in place." },
  { slug: "render-self", title: "render-self.mjs", file: "scripts/render-self.mjs", description: "Renders this repo's own standards artifacts with the CLI's TypeScript renderer, profile tooling." },
  { slug: "check-pins", title: "check-pins.mjs", file: "scripts/check-pins.mjs", description: "Re-resolves SHA-pinned third-party actions against the tag they claim." },
  { slug: "score-seeds", title: "score-seeds.mjs", file: "scripts/score-seeds.mjs", description: "Scores a reviewer's PR comments against the seeded corpus: BLOCKER recall, false positives, rule attribution." },
  { slug: "collect-telemetry", title: "collect-telemetry.mjs", file: "scripts/collect-telemetry.mjs", description: "Nightly central pull of review outcomes across the org — runs in the redline-metrics repo." },
  { slug: "build-digest", title: "build-digest.mjs", file: "scripts/build-digest.mjs", description: "Builds the Monday Teams digest as an Adaptive Card — runs in the redline-metrics repo." },
  { slug: "build-inbox", title: "build-inbox.mjs", file: "scripts/build-inbox.mjs", description: "Builds the org-wide prioritised PR inbox for GitHub Pages." },
  { slug: "build-dashboard", title: "build-dashboard.mjs", file: "scripts/build-dashboard.mjs", description: "Builds the telemetry dashboard — runs in the redline-metrics repo." },
];

export const WORKFLOWS: RegistryEntry[] = [
  { slug: "redline-gate", title: "redline-gate.yml", file: "workflows/redline-gate.yml", description: "Reusable gate: checklist, ADR-for-big-diffs, dependency review, diff secret scan, label-aware aggregation. Active." },
  { slug: "redline-sync", title: "redline-sync.yml", file: "workflows/redline-sync.yml", description: "Would distribute standards and gate callers to onboarded repos as PRs. Inactive in Phase 1 (if: false) — automated standards distribution returns in Phase 3." },
  { slug: "redline-collect", title: "redline-collect.yml", file: "workflows/redline-collect.yml", description: "Nightly telemetry collection across the org. Lives in the redline-metrics repo." },
  { slug: "weekly-digest", title: "weekly-digest.yml", file: "workflows/weekly-digest.yml", description: "Monday Teams digest workflow. Lives in the redline-metrics repo." },
  { slug: "inbox", title: "inbox.yml", file: "workflows/inbox.yml", description: "Org-wide prioritised PR inbox on GitHub Pages. Lives in this (source) repo." },
  { slug: "dashboard", title: "dashboard.yml", file: "workflows/dashboard.yml", description: "Telemetry dashboard build and publish. Lives in the redline-metrics repo." },
  { slug: "seed-canary", title: "seed-canary.yml", file: "workflows/seed-canary.yml", description: "Weekly regression test against the seeded corpus. Lives in the redline-metrics repo." },
  { slug: "verify-onboarding", title: "verify-onboarding.yml", file: "workflows/verify-onboarding.yml", description: "Would re-verify onboarded repos still report the required check. Inactive in Phase 1 (if: false) — returns in Phase 3." },
];

export const TEMPLATES: RegistryEntry[] = [
  { slug: "repo-context", title: "repo-context.md", file: "templates/repo-context.md", description: "Per-repo context template — a human copies it above the generated block in AGENTS.md." },
  { slug: "codeowners", title: "CODEOWNERS", file: "templates/CODEOWNERS", description: "Reference shape of the CODEOWNERS pattern redline init seeds — the CLI generates the real content in code, it doesn't read this file." },
  { slug: "redline-caller", title: "redline.yml", file: "templates/redline.yml", description: "Thin caller installed verbatim as .github/workflows/redline.yml in every onboarded GitHub repo." },
  { slug: "pr-template", title: "pull_request_template.md", file: ".github/pull_request_template.md", description: "GitHub PR template — the gated Launch readiness checklist, written whole by redline init when the repo has none, merged into an existing one otherwise." },
  { slug: "azure-pr-template", title: "azure/pull_request_template.md", file: "templates/azure/pull_request_template.md", description: "The same checklist, worded for Azure DevOps, written whole by redline init when the repo has none, merged into an existing one otherwise." },
  { slug: "azure-gate-template", title: "azure/gate-template.yml", file: "platforms/azure/gate-template.yml", description: "The Azure Pipelines gate — materially weaker than GitHub's: no dependency review, no secret scan." },
  { slug: "repo-ruleset", title: "redline-ruleset.json", file: "rulesets/redline-ruleset.json", description: "Reference shape only — nothing reads this file; redline init builds the equivalent ruleset at runtime." },
  { slug: "org-ruleset", title: "redline-org-ruleset.json", file: "rulesets/redline-org-ruleset.json", description: "Reference shape for a one-time manual org-level import — not applied by any code here." },
];

export function findBySlug(list: RegistryEntry[], slug: string): RegistryEntry | undefined {
  return list.find((e) => e.slug === slug);
}
