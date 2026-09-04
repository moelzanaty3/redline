# Roadmap execution — Phases 0.2 through 4

**Spec:** `2026-09-03-redline-roadmap.md`. This plan covers everything in it that
`2026-09-04-registry-discovery.md` (Phase 0.1) did not.

**Status:** in execution.

---

## What this plan does and does not decide

The roadmap describes eight pieces at intent level and says plainly that nothing in it is
an implementation plan. This document is that plan. Where the roadmap left a question
open, this plan answers it and says so; where an answer needs data nobody has collected,
it builds the instrument rather than guessing the number.

Two constraints shape every task below and are not restated in each one:

- **Zero runtime dependencies.** `package.json` declares none. Everything uses `node:`
  builtins and the existing HTTP layer. This is what makes `npx redline-cli` viable on a
  locked-down Azure agent, and it is not negotiable for a convenience.
- **Rule ids are permanent.** Several pieces reclassify or re-tag rules. Not one of them
  may change an id: every historical telemetry record is keyed on it.

## Ordering

The roadmap's order, with one deviation stated up front.

| # | Piece | Why here |
|---|---|---|
| 0.2 | `redline sync` | Nothing compounds until a standards change reaches the estate |
| 0.3 | Remote `verify` | The weekly drift loop needs it; `sync` needs the same remote read |
| 0.4 | Baseline instrument | Owner-run. This plan builds the tool, not the number |
| F | Structured exemptions | **Moved earlier.** See below |
| A | SARIF ingestion | The aggregation plane |
| B | Skills render target | Additive, cannot break anything |
| C | Deterministic policy tier | Touches the source of truth; ships after B |
| D | Cost + DORA telemetry | Needs A's finding stream |
| E | Graduated enforcement | Promotes on evidence D produces |
| G | `redline review` | Designed in v3 §6.2; no new design |
| H | Outcome correlation | Research, cut without regret |

**The deviation.** The roadmap puts F (structured exemptions) in Phase 3. It moves ahead of
A here because F is the only piece that changes the *shape of a finding's outcome*, and A,
D and H all read that outcome. Building A first means building its acted-on accounting
twice — once against a bare label, once against a structured exemption. F is also
independent, small, and the roadmap itself lists it as a Phase-1 alternative if the
baseline disfavours A. Nothing else moves.

---

## Phase 0.2 — `redline sync`

**Problem.** A standards change reaches an onboarded repository only when someone re-runs
`redline init` there by hand. Eight pieces below change `standards/` or what is rendered
from it. Without distribution each one arrives by hand, or not at all.

**Answers.** v3 fixes the command surface at four; this is the third.

### Tasks

1. **`cli/sync/plan.ts`** — pure planning. Given a `Registry` and the current standards
   version, decide which entries need a pull request: an entry whose `standardsVersion` is
   behind, or `--force`. Produces `SyncPlan { targets, skipped }` with a reason per skip.
   Unit-tested with no host.
2. **`cli/sync/render.ts`** — for one target, render the artifacts its recorded profile
   and vendors imply, reusing `cli/render/standards.ts`. No new rendering logic.
3. **`cli/sync/pull-request.ts`** — the host-facing half, behind the existing platform
   adapters. Branch, commit the rendered files, open or update one pull request per target.
   **Idempotent**: re-running against a target that already has an open sync PR updates
   that branch rather than opening a second.
4. **`cli/commands/sync.ts`** + wiring in `cli/bin/redline.ts`. Flags: `--dry-run`
   (default-safe, prints the plan, contacts no host for writes), `--repo owner/name` (one
   target), `--force` (re-sync a target already current).
5. **Rewire `workflows/redline-sync.yml`** — remove `if: false`, call the command.
6. Docs page, CHANGELOG.

**Acceptance.** A standards change in this repository opens a pull request on every
registered repository that is behind, on both hosts, quoting the standards version; a
dry run prints the same plan and writes nothing; a second run against an unmerged target
updates the existing pull request instead of opening another.

**Stated limitation.** Sync opens pull requests. It never merges them, and it never pushes
to a default branch. A repository that ignores its sync PRs drifts, and that is what the
dashboard's coverage figure is for.

---

## Phase 0.3 — remote `verify`

**Problem.** `verify` reads `.redline.json` from a local checkout. There is no
`--repo owner/name` mode, which is why `verify-onboarding.yml` is off.

### Tasks

1. **`cli/platforms/*/remote.ts`** — `readRemoteConfig(ref)`, reading `.redline.json` over
   the API on both hosts. GitHub has this shape already in the registry walk; Azure needs
   an items read.
2. **`verify --repo owner/name`** — the same checks, sourced remotely. Checks that
   genuinely need a working tree (rendered-artifact staleness) report `unknown` with the
   reason rather than passing silently. **This distinction is the whole point**: a check
   that cannot run must never be reported as a check that passed.
3. **Rewire `workflows/verify-onboarding.yml`** — remove `if: false`, loop the register,
   open one tracking issue naming every repository that failed.
4. Docs, CHANGELOG.

**Acceptance.** `redline verify --repo owner/name` reports drift without a checkout; the
weekly workflow runs and opens one issue against a deliberately broken repository.

---

## Phase 0.4 — the baseline instrument

The roadmap's 0.4 is arithmetic requiring org credentials. This plan does not invent the
numbers. It builds `scripts/build-baseline.mjs`, which computes every figure the roadmap's
acceptance criteria name — repositories onboarded, acted-on rate, findings per week, merge
rate on Redline's own pull requests, SARIF producers in use, token spend per review — and
writes `baseline.json` plus a readable summary. The owner runs it once with credentials.

**Acceptance.** The script runs against a fake client in tests and produces every field the
roadmap's Phase 0 acceptance list names, with each unavailable field explicitly `null` and
a reason, never `0`.

---

## F — Structured exemptions

**Problem.** `redline-exempt` is a bare label. It downgrades process checks to warnings and
records nothing: not who, not why, not until when.

**Unchanged.** An exemption still touches process checks only — never dependency review,
never the secret scan. That boundary is load-bearing and this piece does not move it.

### Tasks

1. **`cli/exempt/parse.ts`** — parse an exemption request from the pull request body:
   a `## Redline exemption` block naming `rule`, `reason` and `until`. Rejects a missing
   reason, an unparseable or past date, and an expiry beyond a maximum (90 days).
2. **Gate integration** — `workflows/redline-gate.yml` reads the block. The bare label
   alone stops being sufficient: a label with no valid block fails the check with a message
   saying what is missing. **This is a behaviour change for every onboarded repository** and
   ships behind the standards version bump, with the gate reporting a warning for one
   version before it fails.
3. **Telemetry** — the collector records `{rule, actor, reason, expiresAt}` per exemption
   so standing exemptions are reportable and the dashboard can trend them.
4. Docs, seeds, CHANGELOG, `standards/manifest.json` bump.

**Acceptance.** No exemption applies without a recorded reason and actor; an expired
exemption stops exempting; standing exemptions appear on the dashboard.

---

## A — SARIF ingestion

**Problem.** Redline competes with scanners it should consume. Nobody can see the estate.

**Answers open question 4** (do ingested findings gate?): **no.** Ingested findings are
measured, never gating. Gating on another tool's output makes Redline responsible for that
tool's false positives, and the roadmap names that risk itself. Stated in the spec, not
left open.

### Tasks

1. **`cli/sarif/parse.ts`** — parse SARIF 2.1.0 into a normalised finding. Tolerant:
   a run without `results`, a result without a location, a `ruleId` absent from `rules`.
   A malformed file is a reported problem, never a thrown error that costs the whole batch.
2. **`cli/sarif/map.ts`** — map a foreign severity to Redline's three. **Configurable and
   visible**, per the roadmap's risk note: a default table plus a per-repo override in
   `.redline.json`, and every ingested finding carries the mapping that produced it.
3. **Provenance** — every finding carries `source: 'redline' | 'sarif'` and, for SARIF, the
   tool name. This threads through the collector, the tuning queue and every dashboard
   view. **Non-negotiable**: without it another tool's noise distorts Redline's own rule
   tuning, which is the one thing this piece must not do.
4. **Collector + dashboard** — ingest, aggregate both sources, never merge them in a view
   that implies one rule catalogue.
5. Docs, CHANGELOG.

**Acceptance.** A repository emitting SARIF has those findings in the dashboard with rule
ids and Redline severities; ingested and native findings are distinguishable everywhere;
acted-on rate is computed across both without either distorting the other; no repository
changes which scanners it runs.

---

## B — Skills render target

**Problem.** Copilot gets per-stack conditional loading; Claude gets the whole composed
standard every turn of every session.

**Constraint.** Skills are a Claude-shaped artifact. Rules stay authored in `standards/`;
skill packaging is output only. No Claude concept leaks backward.

### Tasks

1. **`cli/render/vendors.ts`** — a `skills` vendor rendering `.claude/skills/redline-<stack>/SKILL.md`,
   one per stack in the profile, each with a description that triggers on that stack's globs.
2. **`standards/manifest.json`** — the vendor toggle. Rendering only; no rule file changes.
3. **Measurement** — report the context reduction, because the roadmap makes B's survival
   conditional on it paying for itself.
4. Docs, CHANGELOG.

**Acceptance.** A Claude session editing a single-stack file loads that stack's rules, not
the composed standard; `standards/` is unchanged by this work.

---

## C — Deterministic policy tier

**Problem.** A share of the standard needs no model. Sending it to one costs tokens and
invites false positives on facts.

**Highest-risk item in the roadmap.** It changes the shape of the source of truth. It ships
after B, and the seeded corpus must be green before and after.

### Tasks

1. **Classification** — every rule gains `deterministic: true|false` in the rule catalogue,
   derived from a marker in `standards/` markdown. **Rule ids are untouched** and no rule
   changes meaning.
2. **`cli/policy/checks.ts`** — the deterministic evaluator. Each deterministic rule maps to
   a named check function over the diff and repository state. No model call.
3. **Gate integration** — deterministic rules evaluate in the gate directly.
4. **`scripts/validate.mjs`** — fail if a rule is marked deterministic with no
   implementation, which is the failure mode that would silently stop enforcing it.
5. Docs, CHANGELOG, manifest bump.

**Acceptance.** Every rule is classified; deterministic rules evaluate without a model; no
rule changes meaning; seed BLOCKER recall unchanged or improved.

**Kill criterion, honoured.** If seed BLOCKER recall drops and cannot be recovered in one
iteration, C is reverted. A quieter reviewer that misses more is worse than an expensive one.

---

## D — Cost + DORA telemetry

**Problem.** Redline can prove review works. It cannot say what that cost.

**Answers open question 2** (is spend attributable per repo?): the collector attributes
where the vendor's reporting allows and **publishes org-level when it does not**, rather
than inventing a per-repo number. Explicitly out: MTTR.

### Tasks

1. **`scripts/lib/dora.mjs`** — lead time and change failure rate from merged-PR data the
   collector already pulls. Deployment frequency from the deployments API where present,
   `null` with a reason where absent.
2. **`scripts/lib/spend.mjs`** — AI spend from vendor usage reporting, at whatever grain it
   offers, carrying its own grain in the record.
3. **Cost per BLOCKER caught** — the number nobody else in the toolchain can compute.
4. **Dashboard** — one page a finance stakeholder can read, sourced entirely from collected
   data, with every unavailable figure absent rather than zero.
5. Docs, CHANGELOG.

---

## E — Graduated enforcement

**Problem.** Enforcement is binary. Rolling blocking across hundreds of repositories in one
step is not achievable; leaving everything advisory means no guarantee can be stated.

**Answers v3 §15 Q2** (self-service or platform decision?): **evidence-gated self-service.**
A repository promotes itself when the dashboard's recorded evidence supports it; it cannot
promote on assertion. Demotion is always available without evidence — the safe direction
never needs permission.

**Answers open question 3** (per repo or per market?): **per repository, with a per-market
floor.** A market may raise its minimum rung; it may not lower a repository below its own.

### Tasks

1. **Rungs** — `observe`, `warn`, `block-blocker`, `block-high`, recorded in `.redline.json`
   and carried in the register.
2. **`cli/enforce/ladder.ts`** — promotion eligibility from recorded evidence: seed recall
   and acted-on rate over a window, thresholds in the manifest.
3. **`redline init --rung <name>`** and gate behaviour per rung.
4. **Dashboard** — every repository at a named rung, with what it needs to promote.
5. Docs, CHANGELOG, manifest bump.

---

## G — `redline review`

**Problem.** Every request for "catch it before I push" is a request for this. Designed in
full in v3 §6.2; no new design.

**Honest limitation, carried into the code.** A local command is opt-in and enforces
nothing. The PR review remains the system of record. **Local findings are excluded from
rule-tuning telemetry** or they distort acted-on rate with runs nobody can verify.

### Tasks

1. **`cli/review/scope.ts`** — resolve applicable rules from the changed files, via profile
   and stack globs. Bounded prompt, not the whole standard.
2. **`cli/review/engines/`** — `embedded` (emit the bounded prompt for the assistant running
   the command) and `api` (OpenAI-compatible and Anthropic dialects, per v3).
3. **`cli/review/schema.ts`** — the published findings schema. The CLI validates the model's
   JSON and renders the `Redline/<SEVERITY> [rule-id]:` lines itself. **One renderer**: the
   comment contract is generated by code, never free-typed by a model.
4. **`cli/commands/review.ts`** — `--staged`, `--pr <n>`, working tree by default.
5. Docs, CHANGELOG.

---

## H — Ignored-finding → outcome correlation

**Problem.** Redline can say a rule was ignored. It cannot say ignoring it cost anything.

**The most speculative item, sequenced last, cut without regret.**

### Tasks

1. **`scripts/lib/correlate.mjs`** — where a finding was ignored and the same file later
   attracted a revert or hotfix, count it. Git history only; no incident feed.
2. **Report with confidence, or abandon and say so.** A correlation reported without its
   sample size and confidence is worse than none.

---

## Done when

- Every piece above is built, tested, documented on the site, and in the CHANGELOG.
- `npm test`, `npm run typecheck`, `scripts/validate.mjs`, `render-self --check`,
  `assign-rule-ids --check`, actionlint and the web build are all green.
- Every roadmap open question is answered in writing, or explicitly deferred with a reason.
- Every acceptance criterion the roadmap states is met, or its gap is named.
