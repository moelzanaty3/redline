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
  { slug: "build-registry", title: "build-registry.mjs", file: "scripts/build-registry.mjs", description: "Derives registry.json — the register of onboarded repositories — by walking the estate for .redline.json." },
  { slug: "measure-context", title: "measure-context.mjs", file: "scripts/measure-context.mjs", description: "Measures what the skills render target actually saves per profile — the number the roadmap makes that piece conditional on." },
  { slug: "build-baseline", title: "build-baseline.mjs", file: "scripts/build-baseline.mjs", description: "Computes the Phase 0 baseline every later roadmap phase is judged against, with every unavailable figure stating why." },
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

// The four commands v3 fixes the surface at. Two exist; two are designed and
// unbuilt, and are listed because "it does not exist yet" is the answer people
// keep looking for and not finding.
export const COMMANDS: RegistryEntry[] = [
  { slug: "init", title: "redline init", file: "cli/commands/init.ts", description: "Onboard a repository: standards, security floor, merge gate, registration. The one command a product repo runs." },
  { slug: "verify", title: "redline verify", file: "cli/commands/verify.ts", description: "Check a repository still matches what its .redline.json claims — and, with --gate, act as the Azure gate itself." },
  { slug: "sync", title: "redline sync", file: "cli/commands/sync.ts", description: "Lands the current standards on every registered repository as a pull request, from the register derived nightly off the estate." },
  { slug: "exempt", title: "redline exempt", file: "cli/commands/exempt.ts", description: "Decides whether a pull request carries a valid exemption for a failing process check — a reason, a scope and an expiry, not a bare label." },
  { slug: "review", title: "redline review", file: "standards/core.md", description: "Would review the working tree, staged changes or a PR against the applicable rules before you push. Designed in v3 §6.2, not built." },
];

export const SEEDS: RegistryEntry[] = [
  { slug: "clean", title: "clean", file: "seeded/clean/CleanComponent.tsx", description: "Correct code carrying no defects. Measures precision: the pass condition is zero comments, and a reviewer that flags anything here fails." },
  { slug: "javascript", title: "javascript", file: "seeded/javascript/seeded-violations.js", description: "Seeded JavaScript defects — prototype pollution, dynamic code execution, floating promises." },
  { slug: "react", title: "react", file: "seeded/react/SeededViolations.tsx", description: "Seeded React defects — hook discipline, state mutation, render-cycle bugs." },
  { slug: "react-native", title: "react-native", file: "seeded/react-native/SeededViolations.native.tsx", description: "Seeded React Native defects — list performance and the JS/UI thread boundary." },
  { slug: "nodejs", title: "nodejs", file: "seeded/nodejs/seeded-violations.service.ts", description: "Seeded NestJS defects — unvalidated DTOs, request state on singletons, a blocked event loop." },
  { slug: "microservices", title: "microservices", file: "seeded/microservices/seeded_violations_service.ts", description: "Seeded cross-cutting service defects — missing timeouts, non-idempotent consumers, PII in traces." },
  { slug: "java", title: "java", file: "seeded/java/SeededViolations.java", description: "Seeded Spring Boot defects — entities out of controllers, N+1 queries, self-invoked @Transactional." },
  { slug: "go", title: "go", file: "seeded/go/seeded_violations.go", description: "Seeded Go defects — ignored errors, leaked goroutines, missing context propagation." },
  { slug: "python", title: "python", file: "seeded/python/seeded_violations.py", description: "Seeded Python defects — mutable defaults, bare excepts, string-interpolated SQL." },
  { slug: "csharp", title: "csharp", file: "seeded/csharp/SeededViolations.cs", description: "Seeded .NET defects — async void, sync-over-async deadlocks, per-request HttpClient." },
  { slug: "kotlin", title: "kotlin", file: "seeded/kotlin/SeededViolations.kt", description: "Seeded Kotlin defects — GlobalScope launches, swallowed CancellationException, leaked Context." },
  { slug: "swift", title: "swift", file: "seeded/swift/SeededViolations.swift", description: "Seeded Swift defects — UI off the main actor, uncancelled Tasks, retain cycles, force unwraps." },
  { slug: "terraform", title: "terraform", file: "seeded/terraform/seeded_violations.tf", description: "Seeded Terraform defects — committed secrets, public exposure, a rename with no moved block." },
];

export const PLANS: RegistryEntry[] = [
  { slug: "roadmap", title: "Roadmap after the Harness evaluation", file: "docs/superpowers/specs/2026-09-03-redline-roadmap.md", description: "Eight pieces across five phases, and the boundary between what Redline governs and what a delivery platform does. Phase 0 gates everything after it." },
  { slug: "v3-design", title: "Redline v3 design", file: "docs/superpowers/specs/2026-09-01-redline-v3-design.md", description: "The design the roadmap builds on. Every non-goal and decision in it still holds." },
  { slug: "registry-discovery", title: "Registry discovery (Phase 0.1)", file: "docs/superpowers/plans/2026-09-04-registry-discovery.md", description: "The plan for the derived register of onboarded repositories. Implemented — this is the record of how." },
  { slug: "v3-hardening", title: "v3 hardening", file: "docs/superpowers/plans/2026-09-02-redline-v3-hardening.md", description: "The hardening pass executed after v3 phase 1." },
  { slug: "v3-phase-1", title: "v3 phase 1", file: "docs/superpowers/plans/2026-09-01-redline-v3-phase-1.md", description: "The plan the v3 CLI was executed from." },
];

export function findBySlug(list: RegistryEntry[], slug: string): RegistryEntry | undefined {
  return list.find((e) => e.slug === slug);
}
