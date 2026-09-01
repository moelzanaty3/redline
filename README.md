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
| `scripts/render.mjs` | Renders standards into Copilot / AGENTS.md / Claude / Cursor artifacts | run by sync and CI |
| `.github/pull_request_template.md` | Readiness checklist + ADR link | every onboarded repo |
| `templates/repo-context.md` | Per-repo context template, pasted above the generated block in `AGENTS.md` | every onboarded repo |
| `templates/CODEOWNERS` | Makes `require_code_owner_review` real and protects the enforcement surface | every onboarded repo |
| `templates/redline.yml` | Thin caller installed as `.github/workflows/redline.yml` | every onboarded repo |
| `rulesets/redline-ruleset.json` | Per-repo branch ruleset: 1 human approval, thread resolution, automatic review, required `redline-gate / gate` check | applied by the setup script |
| `rulesets/redline-org-ruleset.json` | Same rules applied org-wide by custom repository property — no per-repo drift | applied once at org level |
| `workflows/redline-gate.yml` | Reusable gate: checklist, ADR-for-big-diffs, dependency review, diff secret scan, label-aware aggregation | org `.github` repo |
| `workflows/redline-sync.yml` + `scripts/sync.sh` | Distributes standards, gate caller and template to onboarded repos as PRs | this (source) repo |
| `workflows/redline-collect.yml` + `scripts/collect-telemetry.mjs` | Nightly central pull of review outcomes across the org | `redline-metrics` repo |
| `workflows/weekly-digest.yml` + `scripts/build-digest.mjs` | Monday Teams digest as an Adaptive Card | `redline-metrics` repo |
| `workflows/inbox.yml` + `scripts/build-inbox.mjs` | Org-wide prioritised PR inbox on GitHub Pages | this (source) repo |
| `scripts/setup-repo.sh` | One-command onboarding: security floor, ruleset, labels, property, sync, verification | run by the platform team |
| `workflows/dashboard.yml` + `scripts/build-dashboard.mjs` | Static dashboard on Pages: acted-on rate, trends, seed recall history, the rule tuning queue | `redline-metrics` repo |
| `workflows/seed-canary.yml` | Weekly regression test of the reviewer itself: opens a seeded PR, scores it, closes it | `redline-metrics` repo |
| `workflows/verify-onboarding.yml` | Weekly re-verification of every onboarded repo; opens an issue on drift | this (source) repo |
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

## Rollout order

1. **Source repo** — push this bundle to `<org>/redline`.
2. **Org `.github` repo** — copy `workflows/redline-gate.yml` to
   `.github/workflows/redline-gate.yml` there so `uses:` resolves org-wide.
   The secret scanner is already pinned to a commit SHA; `scripts/check-pins.mjs`
   re-resolves it against its upstream tag on every CI run.
3. **Metrics repo** — create `redline-metrics` with `workflows/redline-collect.yml`,
   `workflows/weekly-digest.yml`, `workflows/dashboard.yml`, `workflows/seed-canary.yml`,
   and the `scripts/` directory (the metrics workflows use `lib/`, so copy the whole thing).
4. **Secrets and variables**

   | Name | Lives in | Scope |
   | --- | --- | --- |
   | `REDLINE_SYNC_TOKEN` | source repo | contents:write, pull_requests:write, **workflows:write** on target repos |
   | `REDLINE_ORG_READ_TOKEN` | source repo + metrics repo | read-only: metadata, contents, pull requests |
   | `REDLINE_CANARY_TOKEN` | metrics repo | contents:write + pull_requests:write on the **canary repos only** |
   | `TEAMS_WEBHOOK_URL` | metrics repo | Power Automate flow URL (not a retired O365 connector) |
   | `PAGES_VISIBILITY_ACKNOWLEDGED` (variable) | source + metrics repo | `private` or `internal` — the inbox and dashboard builds refuse to run otherwise |
   | `CANARY_TARGETS` (variable) | metrics repo | JSON array, e.g. `[{"repo":"acme/pilot-web","stack":"react"}]` |
   | `REDLINE_DASHBOARD_URL` (variable) | metrics repo | pasted into the weekly digest as a button |

   No Redline secret is ever stored in a product repo.
5. **Org ruleset** — create the custom repository property `redline` (org settings), then
   apply `rulesets/redline-org-ruleset.json` once.
6. **Pilot** — one repo per stack:

   ```sh
   scripts/setup-repo.sh acme/web-shop-checkout web
   # merge the sync PR, then:
   scripts/setup-repo.sh acme/web-shop-checkout --verify
   ```

7. **Validate** — open a PR adding `seeded/<stack>/` and `seeded/clean/`, then:

   ```sh
   GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/web-shop-checkout --pr 12
   ```

   Target: 100% BLOCKER recall, zero comments on `seeded/clean/`. Record both in
   `CHANGELOG.md` before widening. Close the PR — never merge it.
8. **Automate the validation** — set `CANARY_TARGETS` and let `seed-canary.yml` re-score
   weekly. It fails the run when BLOCKER recall drops or a false positive appears on the
   clean corpus, so a regression in the reviewer surfaces without anyone remembering to look.
9. **Widen** — onboard by team, not big-bang. Tune the standards from telemetry:
   the dashboard's tuning queue names the rules to cut first.

## Verify before you trust

The single most common silent failure in a system like this is a required status check
whose name nothing ever reports: every PR sits on "Expected — waiting for status" forever.

Reusable workflows report as `<caller job id> / <called job id>`. Here that is
**`redline-gate / gate`**, and it is asserted in three places: the ruleset JSON,
`scripts/validate.mjs` (CI fails if a job is renamed), and
`scripts/setup-repo.sh --verify` (which reads the check names GitHub actually reported on
a real PR). Run the verify step on every onboarded repo.

## Making a change to the standards

```sh
$EDITOR standards/stacks/react.md          # 1. edit the source, never the output
node scripts/assign-rule-ids.mjs           # 2. give any new rule a permanent id
$EDITOR standards/manifest.json            # 3. bump version
node scripts/render.mjs --self             # 4. re-render this repo's own artifacts
node scripts/validate.mjs                  # 5. self-check
$EDITOR CHANGELOG.md                       # 6. say what changed and why
```

Rule ids are permanent. Reword a rule freely; never edit its id, or every historical
telemetry record for it orphans and the tuning history resets.

Merging to `main` opens a sync PR on every repo in `sync-targets.txt`. Teams review and
merge their own gate changes; Redline never pushes to a default branch.

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
  dependency review and a diff secret scan — enabled by the onboarding script, not
  assumed. Security checks in the gate can never be label-exempted.
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
