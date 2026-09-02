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
  { slug: "validate", title: "validate.mjs", file: "scripts/validate.mjs", description: "Bundle self-check run by CI — check names, approvals, glob portability." },
  { slug: "score-seeds", title: "score-seeds.mjs", file: "scripts/score-seeds.mjs", description: "Scores a seeded-corpus PR: BLOCKER recall and false positives on clean code." },
  { slug: "collect-telemetry", title: "collect-telemetry.mjs", file: "scripts/collect-telemetry.mjs", description: "Nightly central pull of review outcomes across the org." },
  { slug: "build-digest", title: "build-digest.mjs", file: "scripts/build-digest.mjs", description: "Builds the Monday Teams digest as an Adaptive Card." },
  { slug: "build-inbox", title: "build-inbox.mjs", file: "scripts/build-inbox.mjs", description: "Builds the org-wide prioritised PR inbox for GitHub Pages." },
  { slug: "build-dashboard", title: "build-dashboard.mjs", file: "scripts/build-dashboard.mjs", description: "Builds the telemetry dashboard." },
  { slug: "assign-rule-ids", title: "assign-rule-ids.mjs", file: "scripts/assign-rule-ids.mjs", description: "Assigns stable rule ids to standards entries." },
  { slug: "check-pins", title: "check-pins.mjs", file: "scripts/check-pins.mjs", description: "Verifies third-party actions are pinned to full commit SHAs." },
];

export const WORKFLOWS: RegistryEntry[] = [
  { slug: "redline-gate", title: "redline-gate.yml", file: "workflows/redline-gate.yml", description: "Reusable gate: checklist, ADR-for-big-diffs, dependency review, diff secret scan, label-aware aggregation." },
  { slug: "redline-sync", title: "redline-sync.yml", file: "workflows/redline-sync.yml", description: "Distributes standards and gate callers to onboarded repos as PRs." },
  { slug: "redline-collect", title: "redline-collect.yml", file: "workflows/redline-collect.yml", description: "Nightly telemetry collection across the org." },
  { slug: "weekly-digest", title: "weekly-digest.yml", file: "workflows/weekly-digest.yml", description: "Monday Teams digest workflow." },
  { slug: "inbox", title: "inbox.yml", file: "workflows/inbox.yml", description: "Org-wide prioritised PR inbox on GitHub Pages." },
  { slug: "dashboard", title: "dashboard.yml", file: "workflows/dashboard.yml", description: "Telemetry dashboard build and publish." },
  { slug: "seed-canary", title: "seed-canary.yml", file: "workflows/seed-canary.yml", description: "Canary run against the seeded corpus." },
  { slug: "verify-onboarding", title: "verify-onboarding.yml", file: "workflows/verify-onboarding.yml", description: "Verifies onboarded repos still report the required check." },
];

export const TEMPLATES: RegistryEntry[] = [
  { slug: "repo-context", title: "repo-context.md", file: "templates/repo-context.md", description: "Per-repo context template, pasted above the generated block in AGENTS.md." },
  { slug: "codeowners", title: "CODEOWNERS", file: "templates/CODEOWNERS", description: "Protects the enforcement surface so nobody weakens their own gate unreviewed." },
  { slug: "redline-caller", title: "redline.yml", file: "templates/redline.yml", description: "Thin caller installed as .github/workflows/redline.yml in every onboarded repo." },
  { slug: "repo-ruleset", title: "redline-ruleset.json", file: "rulesets/redline-ruleset.json", description: "Per-repo branch ruleset: 1 human approval, thread resolution, required gate check." },
  { slug: "org-ruleset", title: "redline-org-ruleset.json", file: "rulesets/redline-org-ruleset.json", description: "Org-wide ruleset applied by custom repository property — no per-repo drift." },
];

export function findBySlug(list: RegistryEntry[], slug: string): RegistryEntry | undefined {
  return list.find((e) => e.slug === slug);
}
