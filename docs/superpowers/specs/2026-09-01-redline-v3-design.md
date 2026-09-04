# Redline v3 — Design

**Status:** draft for review
**Date:** 2026-09-01
**Supersedes:** Redline 2.1.0 (workflow bundle, GitHub-only, no command surface)

---

## 1. Problem

Redline 2.1 works but nobody can adopt it. It is a bundle of scripts and workflows a
platform engineer wires up by hand, across a rollout document with eight numbered steps.
There is no moment where an engineer types one thing and their repo becomes correct.

Two adjacent products get the adoption experience right and the substance wrong:

- **ApexYard** — 66 slash commands for solo founders. Great front door, enormous long
  tail, GitHub-only, gates are local markers a determined author can forge.
- **ai-sdlc-kit** (internal, 265 commits) — org standards plus 15 agents distributed by
  git submodule and symlinks. Real standards content. The agents are shelfware: every
  assistant already refactors, lints and tests, so `/refactor` and `/lint` go untyped.
  Enforcement is `pre-commit` / `pre-push`, defeated by `--no-verify`. No measurement:
  `catch rate` and `recall` appear zero times in the repository.

Neither addresses the estate this organisation actually has: **many markets, hundreds of
repositories, split across GitHub and Azure DevOps, with different AI assistants licensed
in different markets.**

## 2. Positioning — the line to hold

> Both competitors' unit of value is **a repository**. Install a bundle, that repo gets
> better. Redline's unit of value is **the estate**.

Four properties follow, and none of them are copyable without a rewrite:

1. **Mixed-host control plane.** Some markets GitHub, some Azure DevOps. ApexYard is
   GitHub-only; ai-sdlc-kit touches Azure in a single shell script with no enforcement or
   telemetry. This is the unglamorous part nobody builds speculatively, which is exactly
   why it is defensible.
2. **Enforcement the author cannot bypass.** Server-side required checks and branch
   policies, with the check name verified against live check-runs and drift re-detected
   weekly. Not a hook, not a marker file.
3. **Continuous evidence.** Telemetry on every merged PR across the estate, nightly, plus
   a weekly conformance run against a known-answer corpus. ApexYard's `/eval-agents` is a
   benchmark you run; this is a trend you watch, per rule, per repo, per market.
4. **Zero agents, deliberately.** Markets license different assistants. A product that
   ships its own reviewer breaks the moment a market uses a different one. Redline governs
   the pull request and measures whoever reviewed it.

**Failure mode to guard against:** if Redline becomes "four commands that install
markdown," it is a lookalike with a smaller feature list. The commands are the surface;
the plane behind them is the product.

## 3. Decisions taken

| Decision | Choice |
|---|---|
| Enforcement at init | Menu of options, with a floor nobody can decline |
| The floor | Standards + review contract · security floor · PR readiness (advisory) · measurement participation |
| Command surface | Four, outcome-grouped |
| Azure DevOps | Full parity, first-class from v1 — the estate is genuinely mixed |
| Command hosting | Rendered per host, same adapter pattern as standards |
| Architecture | Two planes over a shared CLI core; deterministic work in code, judgement in prompts |
| Distribution | `npx redline@latest init` for terminals; pinned single-file executable for pipelines |
| Review engine | Pluggable: `embedded` (the assistant itself) or `api` (OpenAI-compatible / Anthropic endpoint) |
| Registry | Derived nightly from `.redline.json` discovery — never hand-edited, never written by init |
| Releases | semantic-release: every merge to `main` publishes; every PR publishes a canary |

**Commands:** `/redline-init` · `/redline-review` · `/redline-triage` · `/redline-verify`

## 4. Architecture

### 4.1 Two planes

**Control plane** — operated by the platform team, invisible to engineers.

| Repo | Holds | Runs |
|---|---|---|
| `redline` (source) | `standards/`, `commands/`, `platforms/`, `cli/`, `conformance/`, `templates/`, registry | sync → PRs to every registered repo; weekly drift verification |
| `redline-metrics` | telemetry JSONL, conformance history | nightly collection from both hosts; weekly conformance run; dashboard; digest |
| org `.github` (per GitHub org) | reusable gate workflow | called by every GitHub repo |
| `redline-pipelines` (per Azure org) | gate pipeline template | referenced by every Azure repo |

Two host-side repos is unavoidable: Actions and Pipelines resolve shared definitions
differently. Both are ten-line shims calling `redline verify --gate`, so the gate has one
implementation, not two.

**Repo plane** — everything `/redline-init` lands, and nothing else.

```
rendered standards      per vendor (Copilot / AGENTS.md / Claude / Cursor)
rendered commands       per host (Copilot prompts / opencode / Claude / Cursor),
                        thin wrappers over the CLI
PR template             .github/ or .azuredevops/
gate caller             workflow yml or pipeline yml
review ownership        CODEOWNERS  |  Azure required-reviewer policy with path filters
.redline.json           profile, version, host, enabled menu items
```

No git submodule. No symlinks — ai-sdlc-kit's symlink fan-out breaks on Windows checkouts
and is a standing support cost not worth inheriting.

### 4.2 CLI core

One package, `redline`, is the only thing both planes share. It runs identically in a
developer's terminal, in GitHub Actions, and in Azure Pipelines.

Work is split by its nature, not by convenience:

| Command | Deterministic (CLI) | Judgement (prompt) |
|---|---|---|
| `/redline-init` | detect stack → resolve profile → render → install → register → report admin gaps | none |
| `/redline-verify` | read policies, check-run names, security settings, drift | none |
| `/redline-triage` | query both hosts, rank, print | none |
| `/redline-review` | resolve applicable rules, fetch diff, post findings | **read the diff, apply the rules** |

Three of four are pure code — testable, versioned, one implementation. Only
`/redline-review` needs a model, and that is precisely the piece that must stay a prompt
so it runs on whatever assistant a market licenses.

The rendered command files are thin wrappers. Logic never lives in markdown, because four
commands × four hosts is sixteen copies that drift silently. This is the deliberate break
from both competitors, who put everything in markdown; correct for a solo founder, wrong
for a governed estate.

**Distribution.** `npx redline@latest init` is the front door — no install step precedes
the first command. Pipelines and locked-down build agents use the pinned single-file
executable (built per OS — linux, macOS, Windows — and attached to every release, §16).
The CLI version that rendered a repo is recorded in `.redline.json` and checked by
`/redline-verify`, so version skew across the estate surfaces as visible drift, never as
silently different behaviour.

### 4.3 Repository layout

```
redline/
  cli/                       the engine
    commands/                init, review, triage, verify
    platforms/
      types.ts               the adapter interface
      github/
      azure/
    render/                  vendor + host renderers
    telemetry/
    conformance/
  standards/                 vendor-neutral rules (unchanged from 2.1)
    core.md
    stacks/*.md
    manifest.json
  commands/                  command sources, rendered per host
  conformance/               corpus (renamed from seeded/)
    <stack>/
    clean/
  templates/                 PR template, CODEOWNERS, gate callers, repo-context
  platforms/
    github/gate.yml
    azure/gate-template.yml
  registry/targets.yaml      generated: onboarded repos discovered nightly, never hand-edited
```

`registry/targets.yaml` is generated, never hand-edited. A nightly control-plane job scans
both hosts for repos carrying `.redline.json` and rebuilds the registry from what it finds.
The repo's own `.redline.json` is the single source of truth; the registry is a derived
cache. Two consequences: `/redline-init` never needs write access to the redline repo, and
the two files cannot drift — one is rebuilt from the other. The rare opt-out lives in an
explicit `registry/exclude.yaml`.

## 5. Platform adapter interface

The single most important boundary in the system. Nothing outside `cli/platforms/` knows
which host it is talking to.

```ts
interface Platform {
  // identity
  detect(cwd: string): Promise<boolean>;
  repoRef(cwd: string): Promise<RepoRef>;

  // install (used by /redline-init)
  installGate(ref: RepoRef, opts: GateOptions): Promise<InstallResult>;
  applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult>;
  enableSecurityFloor(ref: RepoRef): Promise<SecurityResult>;
  ensureReviewOwnership(ref: RepoRef, rules: OwnershipRule[]): Promise<void>;
  openPullRequest(ref: RepoRef, change: Change): Promise<PullRequestRef>;

  // verify (used by /redline-verify and weekly drift detection)
  readPolicy(ref: RepoRef): Promise<MergePolicy>;
  readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]>;
  readSecurityState(ref: RepoRef): Promise<SecurityResult>;

  // measure (used by the collector and conformance runs)
  listMergedPullRequests(org: string, since: string): AsyncIterable<PullRequestSummary>;
  readReviewThreads(ref: RepoRef, pr: number): Promise<ReviewThread[]>;
  listNeedsAttention(org: string): Promise<TriageItem[]>;
}
```

`ReviewThread` normalises the two hosts' different resolution models:

```ts
type ThreadOutcome = 'acted_on' | 'dismissed' | 'ignored' | 'open';
```

| Host | Source | Mapping |
|---|---|---|
| GitHub | `isResolved`, `isOutdated` | resolved → `acted_on`; unresolved+outdated → `ignored`; else `open` |
| Azure DevOps | thread `status` | `fixed`/`closed` → `acted_on`; `wontFix` → `dismissed`; `active` + superseded iteration → `ignored` |

Azure is the **more** accurate of the two: `wontFix` is an explicit human judgement that
GitHub simply does not record. Where GitHub infers, Azure states. The normalised type is
designed around Azure's richer model rather than GitHub's, and GitHub's `dismissed` bucket
is documented as always empty. GitHub's `acted_on` is likewise an upper bound — people
resolve threads to clear the UI without acting — so the dashboard never compares acted-on
rates across hosts without stating that caveat.

### 5.1 Known asymmetries

| Capability | GitHub | Azure DevOps | Resolution |
|---|---|---|---|
| Repo tagging | custom properties → org ruleset targets automatically | none | Azure tracked via central registry + `.redline.json`; policy applied per repo by the CLI |
| Merge policy | branch ruleset (org or repo) | branch policies per repo | adapter; org-level ruleset is a GitHub-only optimisation, not a requirement |
| Code ownership | `CODEOWNERS` | required-reviewer policy with path filters | adapter, same intent |
| Secret scanning | GHAS + push protection | Advanced Security for Azure DevOps (separately licensed) | adapter reports what it could not enable rather than failing |
| Automatic AI review | Copilot review, ruleset-triggered | **no platform-native equivalent** | see risk R2 |

### 5.2 Credentials

No new credential system, and no Redline secret is ever stored in a product repo:

| Context | GitHub | Azure DevOps |
|---|---|---|
| Developer terminal | `gh auth token` | `az` login / `AZURE_DEVOPS_EXT_PAT` |
| Gate in CI | the workflow's own `GITHUB_TOKEN` | the pipeline's `System.AccessToken` |
| Control plane (sync, collector, drift) | GitHub App, org-scoped short-lived installation tokens | service connection; PAT in a variable group with a rotation date in the runbook |

Collector credentials are read-only. Admin-scoped operations (`applyPolicy`,
`enableSecurityFloor`) run with whatever the invoking human already holds — which is why
the §6.1 permission degradation path is the normal path, not the error path.

## 6. The four commands

### 6.1 `/redline-init` — onboard this repository

Floor plus menu. The floor is installed with no prompt; the menu is chosen.

**Floor (no opt-out):**
1. Rendered standards for the detected stack, plus the review output contract
2. Security floor — secret scanning, push protection, dependency review, and the
   no-secrets / no-PII rules
3. PR readiness — the merge-readiness template and the gate running **advisory**
4. Measurement participation — the repo becomes visible to central telemetry (read-only;
   no secret is placed in the repo)

**Menu (offered, defaulted, skippable):**

| Item | Default |
|---|---|
| Promote the gate from advisory to **blocking** | off — promoted deliberately after a soak |
| ADR requirement for large diffs | on |
| Accessibility standard | on for web/mobile profiles |
| SpecKit scaffolding | off |
| Extra required reviewers on sensitive paths | on |

**Flow:**

```
detect host (github | azure)      → adapter
detect stack                      → profile proposal, confirmed by the user
render standards + commands       → working tree
install template, gate, ownership → working tree
apply security floor + policy     → host APIs
register in .redline.json         → working tree
open a pull request               → never a direct push to the default branch
report                            → what landed, what needs an admin
```

**Idempotent and migration-aware.** Re-running `/redline-init` on an onboarded repo is a
no-op plus a report. On a repo carrying 2.1 artifacts (AGENTS.md marker blocks,
`setup-repo.sh`-era workflows) it removes them and lands the v3 layout in the same PR,
reported as "migrated from 2.1". `/redline-verify` flags leftover legacy artifacts as
drift, so fleet migration is the same one command — not a separate tool, not a runbook.

**Permission degradation.** The floor includes settings requiring repository admin. An
ordinary engineer running `/redline-init` will not have them. The command must therefore:

- complete everything it can, and never abort part-way;
- open the PR regardless, so the file-level work is not lost;
- print an explicit, copy-pasteable list of what an admin must still run;
- record `pendingAdmin: [...]` in `.redline.json`, so `/redline-verify` and the weekly
  drift job both report the repo as **partially onboarded** rather than done.
  (Field renamed from `pending_admin` to `pendingAdmin` to match the shipped
  `.redline.json` schema — camelCase decided during Phase 1 implementation,
  2026-09-02; this spec updated to match, docs honesty sweep, 2026-09-03.)

A repo stuck in partial onboarding is a visible number on the dashboard. This is
deliberate: silent partial adoption is the failure mode that makes governance theatre.

### 6.2 `/redline-review` — review my change against our standards

The only command with daily use and the only one that needs a model.

```
redline review                 # working-tree diff against merge base — the default
redline review --pr 123        # an existing pull request
redline review --staged        # staged changes only, before commit
```

The CLI resolves which rules apply to the changed files (via profile + stack globs), fetches
the diff, and hands the model a bounded prompt containing **only the applicable rules** —
not the whole standard. The model returns findings; the CLI formats them, and with `--pr`
posts them through the adapter.

**Engines.** The model behind the review is configured, never assumed:

| Mode | How it runs | Typical use |
|---|---|---|
| `embedded` | the assistant executing the slash command applies the bounded prompt itself | Copilot / Claude / Cursor in the editor |
| `api` | the CLI calls a configured endpoint directly | bare terminal, CI, Azure pipelines |

`api` mode speaks two dialects: OpenAI-compatible chat completions and the Anthropic API.
OpenAI-compatible covers the fully local case for free — Ollama, LM Studio and vLLM all
expose it:

```jsonc
// .redline.json
"review": {
  "engine": { "provider": "openai", "baseUrl": "http://localhost:11434/v1", "model": "qwen2.5-coder:14b" }
}
```

Recommended local model: a code-tuned 14B or larger (Qwen2.5-Coder class). Below that,
contract compliance degrades — and the conformance run will show exactly how much, which
is the point of having one.

**Findings contract (model → CLI).** In both modes the model returns findings as JSON
against a published schema (`rule`, `severity`, `file`, `line`, `problem`, `fix`). The CLI
validates the JSON and renders the `Redline/<SEVERITY> [rule-id]:` comment lines itself.
One schema, one renderer: the PR-comment contract (R1) is generated by code, never
free-typed by a model.

Security and accessibility are **dimensions inside this command**, not separate commands.
ApexYard's fourteen separate audits are the long tail we are explicitly not building.

### 6.3 `/redline-triage` — what needs me right now

Cross-host, cross-repo, ranked. Replaces the 2.1 static Pages inbox as the primary surface;
the Pages page remains for people who want a link rather than a terminal.

Ranking: gate failing → changes requested → awaiting review → idle over N days.

### 6.4 `/redline-verify` — is this repo still correct

Reads live state and compares against what `.redline.json` claims:

- the required check name is one the host has actually reported on a real PR
- merge policy matches the repo's chosen menu
- security floor is still enabled
- rendered artifacts are not stale relative to the current standards version
- `pendingAdmin` is empty

Run on demand, and weekly across the whole registry by the control plane, which opens an
issue on drift.

## 7. Rules and the review contract

Unchanged from 2.1 and already built:

- 249 rules in `standards/`, each with a permanent `<stack>/<slug>` id
- output contract: `Redline/BLOCKER [core/query-string-concatenation]: …`
- `core/uncatalogued` reserved for real findings no rule covers
- ids are permanent; rewording is free, renaming orphans history

**New in v3:** rule resolution moves into the CLI. `/redline-review` sends only the rules
matching the changed files, which shortens the prompt, improves attribution, and makes the
same review reproducible across assistants.

**Deliberately deferred:** the human → standard loop (ApexYard's `/codify-rule`). Redline
measures which rules underperform but has no path from "a human caught what review missed"
back into the standard. Recognised gap; not a v3 command. Revisit once telemetry shows
whether `core/uncatalogued` actually accumulates.

## 8. Measurement and conformance

Terminology changes (see §11): `seeded/` → `conformance/`; seed canary → **conformance run**.

- **Nightly telemetry** across both hosts via `listMergedPullRequests` +
  `readReviewThreads`. Per-rule fired / acted-on / ignored, exemption use, contract
  compliance.
- **Weekly conformance run** — opens a known-bad PR against a canary repo per host, waits
  for review to settle, scores recall / precision / attribution, closes the PR, fails on
  regression.
- **Dashboard** — acted-on rate as the hero, trends, conformance history, the rule tuning
  queue, coverage including partially-onboarded repos.

Both hosts must be represented, or the estate numbers are a lie. Conformance runs on one
GitHub canary and one Azure canary; the dashboard reports them separately, because the
reviewer differs (see R2). Where a host has no platform-native reviewer, the conformance
pipeline invokes `redline review --pr` in `api` mode itself and posts threads through the
adapter — conformance never depends on the host shipping a reviewer.

**Known undercount.** Local `redline review` runs (working tree, `--staged`) emit no
telemetry; only PR-posted reviews are measured. Acted-on rate therefore measures the PR
slice of review. Accepted: that is the slice that gates merges.

## 9. Harvest and delete

**Harvest from ai-sdlc-kit** (it has content Redline lacks):

| Take | Into |
|---|---|
| `standards/org/platforms/drupal.md` | new `standards/stacks/drupal.md` — a real coverage gap |
| `standards/org/platforms/{backend,ios,android,web,react-native}.md` | merge into existing stack files where they add rules |
| `standards/org/accessibility.md` | `standards/stacks/` accessibility rules, as a menu item |
| `governance.yaml` inheritance model (org → team → project, `strictest-rule-wins`) | Redline has no layering at all today; this is the missing team/project tier |
| ADR template | `templates/` |

**Do not take:** the 15 agents, the ~40 platform skills, SpecKit as a spine, submodules,
symlinks.

**Delete from Redline 2.1:**

| Remove | Why |
|---|---|
| the eight-step rollout in `README.md` | replaced by `/redline-init` |
| `scripts/setup-repo.sh` | becomes `redline init` in the CLI |
| `scripts/sync.sh` | becomes `redline sync`, adapter-aware |
| direct `gh` calls scattered through scripts | all host access goes through an adapter |
| the "no other tool measures" claim | false — ApexYard ships `/eval-agents` |
| "launch readiness" wording | see §11 |

## 10. SpecKit

A menu item, never the spine. Selecting it seeds `.specify/` templates and registers the
speckit prompts for the host. Redline neither requires nor extends it. Off by default.

## 11. Naming

| Current / borrowed | Becomes | Why |
|---|---|---|
| "AI-SDLC kit" as a category | **engineering control plane** | toolkits get installed and forgotten; planes get operated and funded |
| "launch readiness" (ApexYard) | **merge readiness** | Redline gates merges, not launches — and it stops the echo |
| "inbox" (ApexYard) | **triage** | done |
| `/redline-check` | **`/redline-verify`** | "check" is vague; verify confirms a claim |
| `seeded/` corpus | **conformance corpus** | it is what it actually is |
| seed canary | **conformance run** | consistent |
| "the gate" | **merge gate** | separates it from the review |

## 12. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| **R1** | **The output contract is still unvalidated against a real reviewer.** Per-rule attribution assumes Copilot emits `Redline/BLOCKER [rule-id]:`. Never tested. | If it fails, per-rule measurement collapses to zero and the dashboard's best panel is empty | Test in Phase 0, before any other work. One repo, one PR, read raw comments. Fallback: match finding text against rule text |
| **R2** | **Azure DevOps has no platform-native AI review.** | Azure markets get standards and gates but nothing to measure | `api`-mode engine (§6.2) gives Azure a pipeline-invocable reviewer regardless; Phase 0 still spikes whether the licensed assistant can be driven natively. Platform-native review becomes an optimisation, not a dependency |
| **R3** | Node dependency in every pipeline | Friction on locked-down build agents | Ship a single-file executable per OS (linux / macOS / Windows — Azure agents skew Windows); pin it; document an offline install |
| **R4** | `/redline-init` needs admin rights most engineers lack | Silent partial onboarding | Explicit `pendingAdmin`, visible on the dashboard, checked weekly (§6.1) |
| **R5** | Two internal assets claiming to own standards | Drifting security rules across the org | Harvest and supersede (§9), agreed with ai-sdlc-kit's owner before Phase 1 ships |
| **R6** | Azure Advanced Security is separately licensed | Security floor unenforceable in some markets | Adapter reports what it could not enable; those repos show as partially onboarded rather than passing |

## 13. Phasing

### Phase 0 — de-risk (days, no product code)

Answer the two questions that can invalidate the design.

- **R1:** open one seeded PR on a real GitHub repo with current standards. Do the comments
  carry `Redline/<SEVERITY> [rule-id]`? Record the raw output.
- **R2:** determine whether an Azure pipeline can invoke the licensed assistant and post PR
  threads.
- Agree the harvest/supersede position with ai-sdlc-kit's owner (R5).
- Claim the npm package name and stand up the release pipeline (§16), so Phase 1 ships as
  a versioned package from its first merge.

**Exit:** contract compliance measured; Azure review path known or explicitly declared
out of scope for v3; no duplicate-standards conflict outstanding.

### Phase 1 — minimal shippable

`/redline-init` and `/redline-verify` on **both** hosts, plus the CLI and adapters.

- CLI skeleton, `Platform` interface, GitHub and Azure implementations
- Floor installation, menu, PR-based install, permission degradation
- Command rendering for Copilot + opencode + Claude + Cursor
- Registry and `.redline.json`
- Standards and rendering carried over from 2.1 unchanged

**Acceptance:** one GitHub repo and one Azure repo onboarded by a single command; both pass
`/redline-verify`; a partially-onboarded repo reports its `pendingAdmin` list correctly.

**Exit:** a market engineer onboards their own repo without reading a rollout document.

*Phase 1 is independently shippable: standards land, guardrails install, gate runs advisory.
No telemetry, no dashboard, no review command yet.*

### Phase 2 — the daily command

`/redline-review` and `/redline-triage`.

- Rule resolution by changed files
- Local diff review; `--pr` posting through the adapter
- Cross-host triage

**Acceptance:** `/redline-review` runs identically under Copilot and under Claude on the
same diff and produces contract-compliant findings.

### Phase 3 — evidence

Telemetry, conformance runs, dashboard, weekly drift verification — most of it already
built in 2.1, needing adapter-isation and the Azure reader.

**Acceptance:** dashboard shows both hosts; a deliberately broken rule shows up in the
tuning queue within a week.

### Phase 4 — hardening

Blocking-gate promotion flow, org-level ruleset for GitHub markets, harvested Drupal and
accessibility standards, team/project standards tier from ai-sdlc-kit's inheritance model.

## 14. Non-goals

Stated so they do not creep back:

- **No agents.** No `/refactor`, `/lint`, `/test`, `/diagnose`, `/debug`. Every assistant
  already does these and a prompt does them.
- **No audit sprawl.** No `/seo-audit`, `/geo-audit`, `/pdf`, `/analytics-audit`. Security
  and accessibility are dimensions of `/redline-review`.
- **No ticket or spec workflow.** No `/idea`, `/write-spec`, `/start-ticket`. SpecKit
  covers this for teams that want it, as a menu item.
- **Redline never approves.** A human approval is always required. This is asserted in the
  ruleset and enforced by validation.
- **Redline ships no reviewer.** It governs and measures whichever one the market licenses.

## 15. Open questions

1. **Who is the intended runner of `/redline-init`** — the repo's own engineer (assumed
   here, hence R4) or the platform team? The assumption drives the whole degradation design.
2. **Is `advisory → blocking` promotion self-service** or a platform-team decision? Affects
   whether the org can ever state a uniform guarantee.
3. **Does the Pages triage view survive** alongside `/redline-triage`, or is the terminal
   the only surface?
4. **Which market is the Phase 1 pilot on each host?** Needs one GitHub and one Azure repo
   with a willing team.

## 16. Release engineering

The redline repo publishes itself; no manual versioning, ever.

- **semantic-release on `main`.** Conventional commits drive the version. On every merge:
  version computed, `CHANGELOG.md` entry generated, npm package published (the
  `npx redline@latest` front door), single-file executables built per OS and attached to
  the GitHub Release, and `standards/manifest.json` stamped in the same run — standards
  and CLI never carry different numbers.
- **Canary on every PR.** Each PR build publishes `<next>-pr.<num>.<sha>` under the
  `pr-<num>` dist-tag, so a change is testable against a real repo with
  `npx redline@pr-42 init` before it merges. Canary dist-tags are pruned when the PR
  closes.
- **Gate before publish.** Nothing publishes unless the repo's own gate passes: render
  check, validation, and a conformance smoke against the corpus.

The npm package name is claimed in Phase 0 — plain `redline` if free, org-scoped
otherwise; the docs and this spec then adopt the real name.
