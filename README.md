# Redline

Engineering oversight layer for AI-assisted development at enterprise scale, built on
GitHub-native primitives: automated code review against versioned standards, branch
rulesets, reusable Actions workflows, and Pages. No servers, no SaaS, no per-seat fee
beyond the AI licences already paid for.

One system covering the full delivery loop: AI writes code, automated review against
versioned standards, readiness gates, decision log, org-wide inbox — plus the measurement
and distribution that let it evolve from data rather than opinion.

**Vendor-neutral.** The rules live once in `standards/` and render to GitHub Copilot,
OpenAI Codex / `AGENTS.md`, Claude, and Cursor. See [docs/vendors.md](docs/vendors.md).

## What's in the box

| Path | What | Where it lives in production |
| --- | --- | --- |
| `standards/core.md` | Core standards: security, type safety, error handling, scope, and the severity output contract | source of truth — **the only file a human edits** |
| `standards/stacks/*.md` | Per-stack rules: javascript, react, react-native, nodejs, microservices, java, go, python, csharp, kotlin, swift, terraform | source of truth |
| `standards/manifest.json` | Stack globs, profiles, vendor toggles, standards version | source of truth |
| `cli/` | The `redline` CLI (`redline init`, `redline verify`) — detects the platform, renders standards, installs the gate | run via `npx --package=redline-cli@latest redline` |
| `.github/pull_request_template.md` | Readiness checklist + ADR link | every onboarded repo |
| `templates/repo-context.md` | Per-repo context template, pasted above the generated block in `AGENTS.md` | every onboarded repo |
| `templates/CODEOWNERS` | Makes `require_code_owner_review` real and protects the enforcement surface | every onboarded repo |
| `templates/redline.yml` | Thin caller installed as `.github/workflows/redline.yml` | every onboarded repo |
| `rulesets/redline-ruleset.json` | Per-repo branch ruleset: 1 human approval, thread resolution, automatic review, required `redline-gate / gate` check | applied by `redline init` |
| `rulesets/redline-org-ruleset.json` | Same rules applied org-wide by custom repository property — no per-repo drift | applied once at org level |
| `workflows/redline-gate.yml` | Reusable gate: checklist, ADR-for-big-diffs, dependency review, diff secret scan, label-aware aggregation | org `.github` repo |
| `workflows/redline-sync.yml` | Distributes standards, gate caller and template to onboarded repos as PRs — **disabled in Phase 1**, see [CHANGELOG.md](CHANGELOG.md) | this (source) repo |
| `workflows/redline-collect.yml` + `scripts/collect-telemetry.mjs` | Nightly central pull of review outcomes across the org | `redline-metrics` repo |
| `workflows/weekly-digest.yml` + `scripts/build-digest.mjs` | Monday Teams digest as an Adaptive Card | `redline-metrics` repo |
| `workflows/inbox.yml` + `scripts/build-inbox.mjs` | Org-wide prioritised PR inbox on GitHub Pages | this (source) repo |
| `workflows/dashboard.yml` + `scripts/build-dashboard.mjs` | Static dashboard on Pages: acted-on rate, trends, seed recall history, the rule tuning queue | `redline-metrics` repo |
| `workflows/seed-canary.yml` | Weekly regression test of the reviewer itself: opens a seeded PR, scores it, closes it | `redline-metrics` repo |
| `workflows/verify-onboarding.yml` | Weekly re-verification of every onboarded repo; opens an issue on drift — **disabled in Phase 1**, see [CHANGELOG.md](CHANGELOG.md) | this (source) repo |
| `scripts/validate.mjs` | Bundle self-check, run by this repo's CI | this repo |
| `scripts/check-pins.mjs` | Re-resolves SHA-pinned actions against their upstream tag | this repo's CI |
| `scripts/assign-rule-ids.mjs` | Assigns and verifies the stable `<stack>/<slug>` id on every rule | this repo |
| `seeded/` | Recall corpus (12 stacks, 82 BLOCKER seeds) + precision corpus, scored by `scripts/score-seeds.mjs` | validation only, never merged |

## Language coverage vs org reality

Primary-language tally across the org's active repos (2026-09-01):
Java 187 · TypeScript 86 · Python 47 · JavaScript 32 · HCL 24 · C# 22 ·
Kotlin 14 · Swift 9 · Go 6. All covered — including plain JavaScript, which the
TypeScript-only globs previously missed. Shell/Dockerfile/Gherkin intentionally uncovered
(linters serve better than LLM review there).

## Onboard a repository

```sh
cd your-repo
npx --package=redline-cli@latest redline init
```

That is the whole procedure. It detects your stack, renders the standards for it, installs
the merge-readiness template and the gate (advisory — it reports, it does not block),
turns on the security floor, and opens a pull request. Anything that needed repository
admin rights you do not have is listed at the end for an administrator to run.

```sh
npx --package=redline-cli@latest redline verify
```

Checks the repository still matches what it claims. Run it any time; the control plane runs
it across the estate weekly.

Both GitHub and Azure DevOps are supported. Redline detects which from your git remote.

## Verify before you trust

The single most common silent failure in a system like this is a required status check
whose name nothing ever reports: every PR sits on "Expected — waiting for status" forever.

Reusable workflows report as `<caller job id> / <called job id>`. Here that is
**`redline-gate / gate`**, and it is asserted in three places: the ruleset JSON,
`scripts/validate.mjs` (CI fails if a job is renamed), and `redline verify` (which reads
the check names GitHub or Azure DevOps actually reports). Run it on every onboarded repo.

## Making a change to the standards

```sh
$EDITOR standards/stacks/react.md          # 1. edit the source, never the output
node scripts/assign-rule-ids.mjs           # 2. give any new rule a permanent id
$EDITOR standards/manifest.json            # 3. bump version
node scripts/render-self.mjs               # 4. re-render this repo's own artifacts
node scripts/validate.mjs                  # 5. self-check
$EDITOR CHANGELOG.md                       # 6. say what changed and why
```

Rule ids are permanent. Reword a rule freely; never edit its id, or every historical
telemetry record for it orphans and the tuning history resets.

Distribution to already-onboarded repos (`redline sync`) is Phase 3 — see
[CHANGELOG.md](CHANGELOG.md). Until then, an onboarded repo picks up a standards change by
re-running `redline init`. Redline never pushes to a default branch; every change lands as
a pull request a team reviews and merges itself.

## Why this works at enterprise scale

- **Feedback loop that measures the right thing.** Every rule carries a permanent id,
  every finding cites one, and telemetry records not just how often a rule fired but how
  often it was *acted on* — resolved threads versus findings left stale and outdated. The
  dashboard turns that into a tuning queue: the specific rules to cut, named. See
  [docs/measurement.md](docs/measurement.md).
- **The reviewer itself is regression-tested.** A weekly canary opens a PR of known-bad
  code against a pilot repo, scores what came back against 82 seeded BLOCKER defects and
  a corpus of correct code that must draw zero comments, then closes it. "No findings"
  and "nothing to find" are otherwise indistinguishable.
- **Distribution.** One source of truth, rendered per profile, synced to hundreds of
  repos as reviewable PRs. Never copy-paste per project, never a stale rule file left
  behind when a repo changes stack.
- **Hard enforcement.** Org-level ruleset plus a required check that is name-verified.
  CODEOWNERS on the enforcement surface, so nobody can weaken their own gate unreviewed.
- **A real security floor.** Secret scanning with push protection, Dependabot alerts,
  dependency review and a diff secret scan — enabled by `redline init`, not assumed.
  Security checks in the gate can never be label-exempted. On GitHub, that is; see
  [CHANGELOG.md](CHANGELOG.md) for what Azure DevOps does not yet get at the gate.
- **Least privilege.** Telemetry is pulled centrally with a read-only token. Onboarding a
  repo grants Redline no write access to it.
- **Enterprise shape.** Per-stack rule composition, human approval always required, full
  audit trail native to GitHub.

## Design decisions

- Automated review is **advisory input to a human**, never the approver. The ruleset
  requires one human approval regardless, and `validate.mjs` fails if that is ever
  lowered to zero.
- Standards carry an explicit **output contract** (`Redline/BLOCKER:` …). Without it,
  severity is unparseable and every metric downstream is a guess.
- Standards carry explicit **What NOT to flag** sections — AI review dies by nitpick
  spam, so noise control is a first-class rule and a measured one.
- Everything distributes as **PRs, never pushes** — teams see and own changes to their
  gates.
- The gate separates **process checks from security checks**. `redline-exempt` downgrades
  the checklist and ADR requirements to warnings for a reviewer who accepts the
  trade-off; it does nothing to dependency review or the secret scan.
- **Profiles, not glob negation.** Rule sets that would contradict each other are never
  installed in the same repo, so no rule depends on unsupported negation syntax.
