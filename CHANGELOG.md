# Changelog

Standards versions follow `standards/manifest.json` → `version`. Sync PRs quote it, so a
repo's rendered artifacts always name the version they came from.

Record seed scores here. A standards change with no measurement is an opinion.

## 0.0.1 — 2026-09-01

Initial release.

- Vendor-neutral standards in `standards/` (core + 12 stacks, 249 rules, each with a
  permanent `<stack>/<slug>` rule id), rendered to Copilot, AGENTS.md, Claude and Cursor
  by `scripts/render.mjs`.
- Severity output contract: every finding is prefixed
  `Redline/<SEVERITY> [<rule-id>]: …` — parseable, aggregatable per rule.
- Profiles instead of glob negation; a repo installs exactly one.
- Readiness gate (`redline-gate / gate`): checklist, ADR-for-big-diffs, dependency
  review, diff secret scan (SHA-pinned). `redline-exempt` soft-fails process checks only.
- Org + per-repo rulesets: one human approval, thread resolution, name-verified required
  check. CODEOWNERS protects the enforcement surface.
- One-command onboarding (`scripts/setup-repo.sh`) with `--verify`; sync distributes
  everything as PRs, never pushes.
- Telemetry measures acted-on findings per rule id; weekly Teams digest, org inbox and
  dashboard on Pages; weekly seed canary and onboarding re-verification.
- Validation corpus: 82 BLOCKER + 23 HIGH seeds across 12 stacks plus a clean precision
  corpus. Target: 100% BLOCKER recall, zero findings on clean code.

### Not yet measured

No seed scores recorded. The pilot produces the first ones; nothing widens past one repo
per stack until they are in this file.
