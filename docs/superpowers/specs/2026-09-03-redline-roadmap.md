# Redline — Roadmap after the Harness evaluation

**Status:** draft for review
**Date:** 2026-09-03
**Owner:** @moelzanaty3 (sole maintainer — see §9)
**Builds on:** `2026-09-01-redline-v3-design.md` (v3 design). This document does not
supersede it. Every non-goal and decision in v3 still holds; where this roadmap touches a
v3 open question, it says so.

---

## 1. Why now

The organisation evaluated Harness as the platform for an SDLC transformation programme:
30% reduction in time-to-market, 20% reduction in production MTTR. Reviewing their
material against what Redline is produced a clearer picture of the boundary than any
internal discussion had.

Harness's own positioning states the boundary out loud: *"No matter how your code is
written, Harness Agents take every change from there to production."* Their SDLC Knowledge
Graph models Builds, Vulnerabilities, Services, Incidents, Costs and Deploys. **There is
no node for the change itself while it is still a diff.** Their reference pipeline starts
at push and its pre-merge stages are signature scanners — secrets regex, dependency CVEs,
SAST patterns — plus SBOM, SLSA and artifact signing.

That is a real and mature capability set, and it is not Redline's. What it leaves
untouched is whether the code an AI assistant just wrote is correct, whether the new
endpoint has an auth check, whether the async work races. Redline governs the artifact
before it enters the pipeline; Harness governs its journey afterwards.

Three things follow, and they are what this roadmap addresses:

1. Redline is **one more finding producer** competing with scanners it should be
   consuming.
2. Redline can prove review works but **cannot price it**, which is exactly the gap the
   programme named ("in-house DORA tracking can't justify ROI of AI to Finance").
3. Redline's enforcement is **binary** — advisory or blocking — which does not survive
   contact with hundreds of repositories.

## 2. Positioning — unchanged, sharpened

v3 §2 holds: the unit of value is the estate, not the repository. The Harness evaluation
adds a second line to hold:

> Redline is the **standards and findings control plane**. It does not produce delivery
> infrastructure and it increasingly does not produce findings — it governs the standard,
> normalises whoever found what, and measures whether anyone acted.

This is the natural extension of v3's *"Redline ships no reviewer. It governs and measures
whichever one the market licenses."* Extend "reviewer" to "scanner" and Phase A follows
directly from a decision already taken.

## 3. Success metric

**Primary: BLOCKER acted-on rate across the estate.** One number, it captures both that
findings reach a human and that the human agreed they mattered.

A primary metric alone is gameable, so it carries guardrails. All four must be reported
beside it, never instead of it:

| Guardrail | Guards against | Available |
|---|---|---|
| Coverage — onboarded / active repositories | succeeding on a shrinking island | today |
| Merge rate on Redline's own pull requests | the estate quietly declining | Phase 0 |
| False positives on the clean corpus | buying acted-on rate with noise | today |
| Standing exemptions, trending | teams routing around the gate | Phase 3 (F) |

If the primary rises while coverage falls, Redline is not working. Read them together or
not at all.

## 4. Non-goals

All v3 §14 non-goals stand unchanged. The Harness evaluation adds:

- **No delivery infrastructure.** No pipelines, builds, deployments, artifact promotion,
  progressive delivery, or rollback. Wrong layer, and well served.
- **No runtime.** No production monitoring, incident detection, or MTTR instrumentation.
  Redline's data ends at merge.
- **No supply-chain artifacts.** Redline does not generate SBOMs, SLSA provenance, or
  signatures. It may require *evidence* that a repository produces them — that is a
  standards rule, not a build step.
- **No cloud cost management.** Redline measures the cost of AI review against the value
  of what review caught. It has no opinion on cloud spend.
- **No MCP server.** Considered and rejected.
- **No new agents.** v3 §14 already forbids these. The local pre-flight review capability
  people ask for is `/redline-review`, which v3 §6.2 already designs — it is unbuilt, not
  unplanned.

## 5. The work

Eight pieces. Four are independent and could each ship alone.

| # | Piece | Touches | Depends on |
|---|---|---|---|
| A | SARIF ingestion | collector, `scripts/lib/rules.mjs`, dashboard | — |
| B | Skills render target | `cli/render/vendors.ts`, `standards/manifest.json` | — |
| C | Deterministic policy tier | `standards/`, gate workflow | — |
| D | Cost + DORA telemetry | collector, dashboard | A |
| E | Graduated enforcement | `init`, `verify`, rulesets, dashboard | D |
| F | Structured exemptions | gate, collector | — |
| G | Finish `redline review` | `cli/commands/` | — (v3 §6.2) |
| H | Ignored-finding → outcome correlation | collector | A, D |

### A — SARIF ingestion

**Problem.** Redline produces findings and so do CodeQL, Snyk, Semgrep, SonarQube and
whatever else a market already licenses. Each has its own severity vocabulary, its own
dashboard, and its own answer to "did anyone act on this". Nobody can see the estate.

**Intent.** Accept SARIF from tools a repository already runs, map it into Redline's
finding format with rule ids, and put it through the same severity contract, the same
acted-on rate, the same tuning queue. Ingestion only — Redline never runs the scanner.

**Why it matters most.** It ends an argument Redline cannot win on its own terms. Redline's
diff secret scan and dependency review are weaker than a real scanner stack and always will
be. Consuming those tools converts a weakness into the product: one severity contract and
one measure of whether findings get acted on, across LLM review and static analysis
together. Ingested findings must be distinguishable from Redline's own throughout, so rule
tuning is never distorted by another tool's noise.

### B — Skills render target

**Problem.** An asymmetry in the vendor matrix. Copilot receives
`.github/instructions/redline-*.instructions.md` with `applyTo:` globs — conditional,
per-stack loading. Claude receives `CLAUDE.md` → `@AGENTS.md`: the entire composed standard,
every turn, for the life of every session.

**Intent.** A skills adapter alongside the existing four vendors, rendering per-stack rules
that load only when relevant files are in play. Same source, same pipeline, one more
adapter.

**Note on overlap with G.** `redline review` (v3 §6.2) already resolves applicable rules for
the *review* path. B addresses the *authoring* path — what the assistant knows while it is
writing. Distinct, and complementary.

**Constraint.** Skills are a Claude-shaped artifact. Rules stay authored in `standards/`;
skill packaging is an output only. No Claude-specific concept may leak backward into how
rules are written.

### C — Deterministic policy tier

**Problem.** A share of what the standard asserts needs no model: an ADR link is present or
it is not, the manifest version was bumped or it was not. Sending those to an LLM costs
tokens and invites false positives on facts.

**Intent.** Split `standards/` into rules a checker can decide and rules that need
judgement. Deterministic rules never hallucinate and cost nothing to evaluate.

**Risk.** This changes the shape of the source of truth every other piece renders from.
Highest-risk item on the list; sequence it accordingly.

### D — Cost + DORA telemetry

**Problem.** The programme asked for ROI justification to Finance and for control of AI
token spend. Redline has neither. It can prove review works; it cannot say what that cost.

**Intent.** The nightly collector already walks merged PRs org-wide. Lead time and change
failure rate are derivable from that data alone; deployment frequency needs the deployments
API. Add AI spend from the assistant vendors' own usage reporting.

**The number that matters.** Cost per BLOCKER caught. Harness's Cost Management Agent knows
spend but has no code-level findings, so it cannot compute value. Redline knows which
findings were acted on. Joining the two produces a figure nobody else in the toolchain can.

**Explicitly out:** MTTR. It needs an incident feed Redline does not have and should not
acquire.

### E — Graduated enforcement

**Problem.** Enforcement is binary today: advisory by default, blocking with
`redline init --blocking`. Rolling blocking enforcement across hundreds of repositories in
one step is not achievable; leaving everything advisory means the organisation can never
state a guarantee.

**Intent.** A maturity ladder per repository — observe, warn, block on BLOCKER, block on
HIGH — with promotion gated on evidence the dashboard already computes: seed recall and
acted-on rate.

**Answers a v3 open question.** v3 §15 Q2 asks whether `advisory → blocking` promotion is
self-service or a platform-team decision. A ladder with evidence-gated promotion is the
answer this roadmap proposes; the spec for E must settle it explicitly.

### F — Structured exemptions

**Problem.** `redline-exempt` is a bare label. It downgrades process checks to warnings and
leaves no record of who applied it or why.

**Intent.** Require a reason, record the actor, expire the exemption, and report standing
exemptions on the dashboard. The compliance narrative the programme wants — audit evidence
that generates itself rather than being assembled by hand — is mostly this piece.

**Unchanged:** the exemption must continue to touch process checks only, never dependency
review or the secret scan.

### G — Finish `redline review`

**Problem.** `cli/commands/` contains `init.ts` and `verify.ts`. `redline review`, designed
in full in v3 §6.2 with both `embedded` and `api` engines and a published findings schema,
does not exist. Every request for "catch it before I push" is a request for this command.

**Intent.** Build what v3 already specifies. No new design, no new agent, no new non-goal
violated.

**Honest limitation to carry into the spec.** A local command is opt-in and therefore
enforces nothing. Redline's power is that the merge gate is unavoidable. `redline review` is
a pre-flight convenience; the PR review remains the system of record. Local findings must
not enter the telemetry that drives rule tuning, or they will distort acted-on rate with
runs nobody can verify.

### H — Ignored-finding → outcome correlation

**Problem.** Redline can say a rule was ignored. It cannot say ignoring it cost anything.

**Intent.** Where a finding was ignored and the same file later attracts a revert or a
hotfix, that is evidence the rule earns its place. Computable from git history alone — no
incident feed, consistent with the non-goals.

**Status.** The most speculative item here. It is research, and it should be sequenced last
and cut without regret if the signal proves too weak.

## 6. Phasing

Each phase is independently shippable. No phase depends on a later one.

### Phase 0 — distribution and baseline (gate on everything after)

**Contains:** no new roadmap pieces. Three v3 capabilities this roadmap assumed were
already present, plus a measurement exercise the owner runs.

**Why it exists.** Every phase below changes `standards/` or the artifacts rendered from
it — A's severity mappings, C's reclassification, E's rungs, F's exemption schema. Today an
onboarded repository picks up a standards change only by re-running `redline init` by hand.
Stacking eight pieces on a distribution path that is switched off means each one reaches
the estate by hand, or not at all. The roadmap does not compound until this works.

**This is not two feature flags.** `workflows/redline-sync.yml` and
`workflows/verify-onboarding.yml` are gated `if: false`, but they were disabled because the
capability underneath each was removed, not paused. Three things have to be built.

**0.1 — A register of onboarded repositories.** `sync-targets.txt` is deleted, and it had
already lost its only writer: `scripts/setup-repo.sh` appended to it on each onboarding and
`redline init` does not. The v3 design already settled the replacement's shape — derived
from `.redline.json` discovery, never hand-edited, never written by `init`. Nothing to
re-decide; it has to be built. `workflows/dashboard.yml` reads the old file through a
guarded call that now always takes the failure branch, which is why the dashboard's
coverage figure is currently absent rather than wrong.

**0.2 — `redline sync` as a command.** `scripts/sync.sh` was deleted with no replacement.
This is the third of v3's four designed commands. The disabled workflow was deliberately
left in place as a shape to rewire, not as something to un-comment.

**0.3 — `redline verify` against a remote repository.** `verify` reads `.redline.json` from
a local checkout and has no `--repo owner/name` mode that works over the API. The weekly
re-verification loop needs either that mode or a clone-then-verify loop. This is why
`verify-onboarding` is off.

**0.4 — The baseline.** Arithmetic nobody has done, and it needs org credentials and access
to the metrics repository rather than changes to this one. Owner-run, and it can proceed in
parallel with 0.1–0.3.

**Acceptance criteria.**
- A register exists, is derived rather than hand-maintained, and the dashboard's coverage
  figure is populated from it again.
- `redline sync` lands a `standards/` change as a pull request on every registered
  repository, on both hosts, with a dry-run mode.
- `redline verify` can assert a named remote repository without a manual checkout, and
  `verify-onboarding` runs on its schedule, opening an issue on drift against a
  deliberately broken repository.
- Baseline published, covering at minimum: repositories onboarded; today's acted-on rate;
  findings per week; **the merge rate on Redline's own pull requests**; how many
  repositories already emit SARIF and from which tools (open question 1); current token
  spend per review.

**Risks.** The baseline may invalidate the phase order. If acted-on rate is already high
and almost no repository emits SARIF, Phase 1 is the wrong first move and B or F should
lead. That is the point of measuring before building. Separately, 0.1–0.3 are control-plane
work of a size comparable to a roadmap phase in its own right — do not let "Phase 0" imply
"small".

**Kill criteria.** If distribution cannot be enabled for reasons outside this repository's
control — org policy, host limitation, no mandate to open pull requests across the estate —
stop and escalate. Do not proceed to Phase 1 on manual distribution; that turns every later
phase into hand-delivery.

**Exit condition.** A standards change made in this repository reaches every registered
repository as a pull request without human shepherding, drift re-detection runs weekly, and
the baseline numbers exist in writing.

### Phase 1 — become the aggregation plane

**Contains:** A.

**Acceptance criteria.**
- A repository already running a SARIF-emitting scanner has those findings visible in
  Redline's dashboard, carrying rule ids and Redline severities.
- Ingested findings are distinguishable from Redline-produced findings in every view and
  in the tuning queue.
- Acted-on rate is computed across both sources without either distorting the other.
- No repository is required to change which scanners it runs.

**Risks.** Severity mapping between foreign vocabularies and Redline's three levels is a
judgement call that will be wrong in places; it must be configurable and visible, not
buried.

**Kill criteria.** Shelve A if the Phase 0 baseline shows too few repositories emit SARIF
to matter — the threshold is set from that baseline, not guessed here — or if ingested
findings cannot be kept separable from Redline's own in telemetry. In either case B or F
leads instead.

**Exit condition.** One pilot repository on each host reporting ingested and native
findings side by side for two consecutive weeks.

### Phase 2 — cut Redline's own cost and noise

**Contains:** B, then C.

**Acceptance criteria.**
- B: a Claude session editing a single-stack file loads that stack's rules, not the composed
  standard. Measured reduction in per-turn context reported on the dashboard.
- B: `standards/` is unchanged by this work. Rendering only.
- C: every rule in `standards/` is classified deterministic or judgement, and deterministic
  rules are evaluated without a model call.
- C: no rule changes meaning as a result of reclassification; rule ids are untouched.

**Risks.** C changes the source of truth. If classification is wrong, it degrades review
quality silently. It ships after B for that reason, and needs the seeded corpus green before
and after.

**Kill criteria.** B dies if the measured context reduction against the Phase 0 baseline
is marginal — it is a cost optimisation and must pay for itself. C is reverted and
abandoned if seed BLOCKER recall drops and cannot be recovered within one iteration;
reclassification is not worth a quieter reviewer that misses more.

**Exit condition.** Seed BLOCKER recall unchanged or improved, measured on the existing
corpus, with a demonstrated reduction in tokens per review.

### Phase 3 — the ROI story and safe rollout

**Contains:** D, then E and F.

**Acceptance criteria.**
- D: lead time and change failure rate visible per repository and per market, derived from
  data the collector already pulls.
- D: cost per BLOCKER caught computed and published.
- E: every onboarded repository sits at a named rung, and promotion is driven by recorded
  evidence rather than opinion.
- E: v3 §15 Q2 is answered in the spec, not left open.
- F: no exemption can be applied without a recorded reason and actor; standing exemptions
  are reported.

**Risks.** D depends on assistant vendors' usage reporting, which is outside Redline's
control and may not be granular enough to attribute spend to a repository. If attribution
is impossible, publish org-level spend against org-level value rather than inventing a
per-repo number.

**Kill criteria.** If AI spend cannot be attributed even at org level, drop the cost half
and ship DORA alone rather than publishing a number nobody can source. If the Phase 0
baseline shows the estate cannot reach rung 2, stop E — the constraint is adoption, and
enforcement machinery will not fix it.

**Exit condition.** A single page a finance stakeholder can read that states what AI review
cost and what it caught, sourced entirely from collected data.

### Phase 4 — the daily command, then research

**Contains:** G, then H.

**Acceptance criteria.**
- G: `redline review` runs against the working tree, staged changes, and an existing PR, in
  both `embedded` and `api` engines, returning findings against the published schema.
- G: local findings are excluded from, or separately tagged in, rule-tuning telemetry.
- H: correlation is reported with its confidence, or the work is abandoned and said so.

**Kill criteria.** G stops being maintained if adoption stays below a share stated in its
own spec within a defined window — a convenience nobody runs is a liability, not a feature.
H is cut without regret if the correlation signal is too weak to report with confidence.

**Exit condition.** For G, adoption measured rather than assumed — if engineers do not run
it, that is the finding.

## 7. Sequencing rationale

Phase 0 first because the rest does not compound without it, and because the phase order
below is a hypothesis until the baseline exists. Treat the ordering of Phases 1–4 as
provisional: the baseline may reorder them, and should be allowed to.

Phase 1 next because it is the largest strategic change and unblocks D and H. Phase 2
second because both pieces reduce Redline's own operating cost, which compounds across
everything after. Phase 3 third because E cannot promote on evidence that D has not yet
produced. Phase 4 last because G's value depends on voluntary adoption and H is research.

C sits behind B inside Phase 2 deliberately: B is additive and cannot break anything, C
touches the source of truth and can.

## 8. Defensibility

GitHub is absorbing this territory steadily — custom instructions, code scanning, Copilot
code review, rulesets. Which pieces survive that matters for how much to invest in each.

| Piece | Exposure | Why |
|---|---|---|
| A — SARIF ingestion | Low | Hosts aggregate their own scanning. Nobody aggregates it against an org standard with acted-on measurement |
| B — Skills render target | **High** | Per-file conditional instruction loading is exactly what a platform makes free. Build it thin; do not over-invest |
| C — Policy tier | Medium | Generic policy engines are commodity. The standard being the source is the differentiator |
| D — Cost + DORA | Low | Needs the finding history to compute value. Cost tools lack findings; DORA tools lack judgement |
| E — Graduated enforcement | Low | Estate-level, cross-host, evidence-gated. No vendor builds this for someone else's org |
| F — Structured exemptions | Medium | Approval workflows are common; binding them to rule ids and telemetry is not |
| G — `redline review` | Medium | Assistants review code already. Bounded-to-applicable-rules is the difference |
| H — Outcome correlation | Low | Requires Redline's own finding history. Nobody else holds it |

**Rule:** invest in measurement and estate governance. Keep the rendering pieces thin
enough to abandon.

## 9. Ownership

**Owner:** @moelzanaty3. Sole maintainer, sole point of support.

Stated plainly because it will be raised: **bus factor is 1.** For a control plane that
gates merges across the estate, this is the strongest argument against Redline in any
build-versus-buy comparison, and it is currently true. Nothing in this roadmap addresses
it, because nothing in this roadmap can — it is an organisational commitment, not code.

Two things make it survivable, and neither is a phase:

- A named second who can cut a release and respond to a gate misfiring outside working
  hours.
- A documented break-glass: how a market disables the gate itself, without waiting for the
  owner.

Until both exist, treat every blocking-enforcement promotion under E as carrying this risk
explicitly.

## 10. Risks across the roadmap

- **Scope drift toward delivery.** Every piece here has an adjacent Harness capability that
  would be tempting to build. §4 exists to make that visible when it happens.
- **Standards churn.** A, C and F all imply changes to `standards/`. Each requires a
  `standards/manifest.json` version bump and a `CHANGELOG.md` entry in the same PR, and
  each propagates to every onboarded repository as a pull request. These are production
  changes.
- **Rule id stability.** C reclassifies rules. Rule ids are permanent; reclassification
  must not touch them or every historical telemetry record orphans.
- **Azure asymmetry.** The Azure gate is already materially weaker than the GitHub gate — no
  dependency review, no diff secret scan. A and F risk widening that gap. Each spec must
  state its Azure story or explicitly defer it.
- **Distribution is still Phase 3 in v3 terms.** `redline sync` is disabled; onboarded
  repositories pick up standards changes by re-running `redline init`. Several pieces here
  assume changes reach the estate. Sequencing must account for that or say it does not.

## 11. Open questions

1. **Which SARIF producers are actually in use across the estate?** A's severity mapping
   and its value both depend on the answer, and nobody has counted.
2. **Is per-repository AI spend attributable** from the assistant vendors' reporting, or
   only org-level? Determines whether D's headline number is per-repo or estate-wide.
3. **Does E's promotion ladder apply per repository or per market?** Markets have different
   regulators and different appetites; a single org-wide ladder may not be workable.
4. **Do ingested scanner findings participate in the merge gate,** or only in measurement?
   Gating on another tool's output makes Redline responsible for that tool's false
   positives.

## 12. What this roadmap does not decide

Nothing here is an implementation plan. Each phase needs its own spec and its own plan
before code. The pieces are described at intent level deliberately: the point of this
document is agreeing the shape and the order, not the design.
