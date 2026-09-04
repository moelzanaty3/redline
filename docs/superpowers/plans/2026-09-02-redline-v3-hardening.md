# Redline v3 Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Close every OPEN finding from the 2026-09-02 three-way code audit (GitHub/core, Azure, commands/release/docs) of branch `feat/redline-v3-cli` at HEAD 53f6ad7, and make `redline init` safe on **brownfield repositories** — repos that already carry their own pipelines, branch policies, CODEOWNERS, staged changes, and rulesets. Redline must coexist: it never overwrites what a human owns, and it reports what it left alone.

**Spec:** `docs/superpowers/specs/2026-09-01-redline-v3-design.md` (binding authority where it speaks; audit evidence governs otherwise).

**Prior run:** `.superpowers/sdd/2026-09-01-redline-v3-phase-1/` holds the Phase 1 ledger. Its constraints file is carried over verbatim — see Global Constraints.

## Global Constraints

Identical to `.superpowers/sdd/2026-09-01-redline-v3-phase-1/constraints.md` (npm package `redline-cli`, bin `redline`; zero runtime deps; `@types/node` + `typescript` only in devDependencies; erasable TS only; strict + noUncheckedIndexedAccess; no `any`/`@ts-ignore`; host calls only inside `cli/platforms/` with injected fetch; no secret ever written to a product repo; init always opens a PR, never pushes to a default branch; exit codes 0–4 with 3 = *total* permission failure and partial failure exiting 0 with `pendingAdmin`; shell via `execFile` argv only; never `git add -A`; never stage `docs/superpowers/` or `.superpowers/`; leave the uncommitted `sync-targets.txt` deletion untouched).

Additional constraints for this plan:

- **Brownfield first.** Any host object Redline did not create (identified by an explicit Redline marker — ruleset name `Redline`, Azure policy `displayName` prefix `Redline:`, status genre/name `redline/gate`) is never updated or deleted. When a same-purpose human object exists, Redline reports the capability as `already` with a detail naming the object, and records it in the init report. Tests must cover the coexistence path for every capability that writes host state.
- **No new exit codes.** The five-code contract is published; new failure classes map into it.
- **Every behavior change lands with a test named for the scenario it pins.**
- **CHANGELOG discipline:** each task that changes user-visible behavior appends to an `## Unreleased — hardening` section of `CHANGELOG.md` (create it in the first task that needs it). Wording: plain statements of what changed, no marketing.

## Task 1: HTTP retry idempotency

**Files:** `cli/platforms/http.ts`, `cli/platforms/__tests__/http.test.ts`

Audit: retries are method-agnostic (`http.ts:20,43-60`); a 502 after a committed `POST /pulls` or `POST /_apis/policy/configurations` duplicates the PR/policy — the same duplicate-accumulation class commit 3a358e0 fixed at a higher layer.

Requirements:
- Retry on 429 for every method (rate limiting is pre-execution).
- Retry on 5xx only for idempotent methods (GET, PUT, PATCH, DELETE, HEAD).
- POST gets no 5xx retry.
- Tests: POST + 502 → no retry, error surfaces; GET + 502 → retried; POST + 429 → retried.

## Task 2: GitHub outcome honesty — permission failures must reach pendingAdmin

**Files:** `cli/platforms/github/install.ts`, `cli/platforms/github/index.ts`, `cli/platforms/github/__tests__/install.test.ts`, `cli/platforms/github/__tests__/verify.test.ts` (repoRef case)

Audit findings:
- `install.ts:80-82` maps 404 → `unsupported`. GitHub returns 404 (not 403) on admin endpoints when a fine-grained token lacks `administration` scope on a repo we just successfully read — so real permission failures never reach `pendingAdmin` and no admin is ever nagged. The existing test at `install.test.ts:143-149` locks in the wrong behavior.
- `install.ts:209-213`: a 422 from the ruleset POST/PUT (malformed/conflicting payload — a Redline bug or a repo-settings conflict) becomes `unsupported`, `policy: null`, exit 0. Repo silently ends up with no merge policy.
- `index.ts:26-28`: 401/403 reading `/repos/{o}/{r}` throws `RedlineError('host')` (exit 4); should be `'permission'` (exit 3) — CI cannot distinguish "token lacks scope" from "GitHub is down".

Requirements:
- On **write** endpoints (`PATCH /repos`, ruleset POST/PUT, `PUT …/vulnerability-alerts`, `PUT …/automated-security-fixes`): 404 → `denied`. On read endpoints 404 stays `unsupported`. 422 stays `unsupported` **except** the ruleset POST/PUT, where 422 throws `RedlineError('host', …)` naming the endpoint — a rejected ruleset payload must be loud, not a silent no-policy repo.
- `index.ts` repoRef: 401/403 → `RedlineError('permission', …, hint naming GH_TOKEN scopes / gh auth login)`; other non-2xx stay `host`.
- Update the locked-in tests; add: write-404 → denied → appears in pendingAdmin; ruleset-422 → throws; repoRef-403 → exit-3 kind.
- Mirror the same 401/403 → `permission` mapping in `cli/platforms/azure/index.ts:29` (audit A6 residual) — one-line, include here since it is the identical decision.

## Task 3: Git safety — brownfield working trees and branch hygiene

**Files:** `cli/core/git.ts`, `cli/core/__tests__/git.test.ts`, `cli/platforms/github/install.ts` (openPullRequest region only), `cli/platforms/azure/install.ts` (openPullRequest region only), adapter tests for the changed region

Audit findings:
- Pre-**staged** index entries are swept into the onboarding commit: `git commit -m` commits the whole index (`git.ts:93-95`), defeating the `stagePaths` fix. A user with unrelated (possibly sensitive) files already staged gets them pushed into the Redline PR.
- The operator is left on `redline/onboard` after every run, success included; their next commit lands on Redline's branch.
- "nothing to commit" throws `RedlineError('failed')` (exit 1) on a path that is a legitimate no-op.
- A non-fast-forward push after a prior partial run is reported as a `permission` error ("get push access") — wrong diagnosis.
- `remoteUrl()` (`git.ts:60-62`) has no try/catch: a repo with no `origin` surfaces `redline failed unexpectedly`, exit 4, and the friendly no-remote message in `detect.ts:31-37` is unreachable.

Requirements:
- Refuse to proceed when the index already has staged entries before `stagePaths` runs (`git diff --cached --quiet` fails): `RedlineError('usage', …)` telling the user to commit or unstage first. This is the brownfield-safe choice over `commit -- <paths>` because partial-index commits surprise users in the opposite direction.
- Capture the original branch before `checkoutNewBranch`; restore it after push (and on failure, in a `finally`), keeping the existing "your commit is on redline/onboard" messaging accurate.
- "nothing to commit" returns a null-PR no-op result instead of throwing; adapters propagate `pullRequest: null`.
- Detect `non-fast-forward`/`rejected` in push stderr → `RedlineError('failed', …)` telling the user a previous `redline/onboard` branch exists (delete it or re-run after merging); keep genuine 403 push failures as `permission`.
- Wrap `remoteUrl()`; empty/no-remote flows into `parseRemote('')`'s existing friendly usage error.
- Tests for each scenario, including: staged unrelated file → refused before any branch is created; successful run ends on the original branch.

## Task 4: Azure PR gate actually runs — pipeline definition + Build Validation

**Files:** `cli/platforms/azure/install.ts`, `cli/platforms/azure/policy-types.ts`, `cli/platforms/azure/verify.ts`, `platforms/azure/gate-template.yml`, `cli/platforms/azure/__tests__/*`

Audit (critical): Azure Repos ignores YAML `pr:` triggers — the template's `pr:` block (`gate-template.yml:11-14`) never fires. `installGate` makes zero host calls; `applyPolicy` creates only minimumReviewers/comments/Status policies. Nothing registers a pipeline, nothing creates a Build Validation policy, so `redline/gate` is never published; with `--blocking`, every PR blocks forever. `$SYSTEM_PULLREQUEST_PULLREQUESTID` (`:56`) is only populated in PR-validation builds — confirming the intended path.

Requirements:
- `installGate` (after writing files) or a new install step: `GET /{proj}/_apis/build/definitions?name=redline-gate`; if absent, `POST /{proj}/_apis/build/definitions` with `process: { type: 2, yamlFilename: '.azuredevops/redline-gate.yml' }`, repository `{ id: repoId, type: 'TfsGit' }`. Reuse an existing definition matching name + yamlFilename (brownfield: a definition with the same name but a different yamlFilename is human-owned — report, don't touch).
- Add the Build policy type id (`0609b952-1397-4640-95ec-e00a01b2c241`) to `policy-types.ts` with the same runtime-resolution + GUID-fallback pattern. Create a Build Validation policy (`settings.buildDefinitionId`, `displayName: 'Redline: gate build'`, `validDuration: 0`, `queueOnSourceUpdateOnly: true`) scoped to the default branch, `isBlocking` mirroring the menu.
- Degrade to `denied`/`unsupported` CapabilityOutcomes when the caller lacks Build Administrator — never throw for permission.
- **Guard:** when the build definition could not be registered, the Status policy must not be written `isBlocking: true` — write it advisory and record the gate capability as pending, with a detail explaining why.
- `verify.ts:146-161`: derive `requiredChecks` only when `status.isBlocking === true` (mirrors GitHub `verify.ts:161-162`); add the non-blocking fixture test asserting `requiredChecks: []`. Also verify should read back the Build Validation policy's existence as part of the gate check.
- Remove the dead `pr:` block from the template (Build Validation is the trigger), keep CI comments accurate.
- CHANGELOG: describe the new host objects init creates on Azure and the degradation when Build Administrator is missing.

## Task 5: Azure brownfield safety + parity

**Files:** `cli/platforms/azure/install.ts`, `platforms/azure/gate-template.yml`, `cli/platforms/azure/__tests__/install.test.ts`

Audit findings:
- `applyPolicy` matches existing policies by type-id + repositoryId only (`install.ts:212-225`): ignores `refName`, keeps no ownership signature — a human admin's own min-reviewers policy on any branch of the repo is PUT-overwritten with Redline's settings. Existing test covers only a fixture without `refName`.
- `openPullRequest` drops `change.labels` (`install.ts:314-331`); Azure has `POST …/pullRequests/{id}/labels`. The onboarding PR misses `redline-sync`.
- `SOFT_FAIL_LABELS` is substituted into the template but nothing consumes it — the `redline-exempt`/`redline-sync` exemption mechanism does not exist on Azure at all (GitHub implements it in workflow shell, `workflows/redline-gate.yml:138,151`).
- `gate-template.yml:36` runs `redline-cli@latest` — org-wide gate behavior changes on any npm publish.
- `worstOutcome` ranks `already(1) > applied(0)`, and `policyApplied = mergePolicy.status === 'applied'` (`install.ts:229`) — any `already` zeroes `policy` to null.

Requirements:
- Policy matching: scope entry must match `repositoryId` **and** `refName` (default branch); Redline ownership = `settings.displayName` starting `Redline:` (write it on create) — for Status policies additionally genre/name match. A same-type policy on the branch without the marker: leave untouched, report `already` with a detail naming the human policy (brownfield coexistence), never PUT.
- After PR creation, apply labels via the labels API; fold non-2xx into a `labels` CapabilityOutcome (degrade, don't throw).
- Implement soft-fail in the gate template shell: fetch the PR's labels (`GET …/pullRequests/$SYSTEM_PULLREQUEST_PULLREQUESTID/labels`, SYSTEM_ACCESSTOKEN via the existing stdin `-K` pattern), and when any label is in `SOFT_FAIL_LABELS`, report the gate status as succeeded-with-warning instead of failing. Keep secrets off argv.
- Pin the npx version at install time: substitute `redline-cli@latest` → `redline-cli@${CLI_VERSION}` unless `CLI_VERSION` is `0.0.0-development` (leave `@latest` then, with a comment why).
- `policyApplied` = "no policy outcome is denied/unsupported", not `status === 'applied'`.
- Tests: human policy with refName on default branch survives untouched and is reported; labels applied; version substitution both branches; `already` no longer nulls `policy`.

## Task 6: init correctness — re-run, repair, dry-run, menu honesty

**Files:** `cli/commands/init.ts`, `cli/bin/redline.ts`, `cli/commands/__tests__/init.test.ts`, `cli/platforms/github/install.ts` + `cli/platforms/azure/install.ts` (installGate content-comparison only)

Audit findings:
- Menu rebuilt from flags every run (`init.ts:95`, `bin:83-87` always sends `blocking: false` when absent): a plain re-run demotes a `--blocking` repo to advisory — and does so **before** `alreadyOnboarded` is computed, so even a no-op re-run rewrites the live ruleset while `.redline.json` still says blocking. Same reset hits `speckit`/`accessibility`.
- Repair path: `alreadyOnboarded` (`init.ts:170-174`) ignores `gate.files`/`ownership.files`; deleted CODEOWNERS/gate workflow are rewritten to the tree but init says "already onboarded — nothing to change", exit 0, no PR.
- `installGate` rewrites its files unconditionally (no content comparison), so a menu change dirties the tree even on the alreadyOnboarded path.
- `onboardedAt` overwritten on every real run.
- `openPullRequest` failure after host mutations + writeConfig is an unhandled throw; branch already pushed; re-run then reports "nothing to change".
- `accessibility: true` for every profile (spec: web/mobile only); `--no-a11y`/`--speckit` advertised but inert.
- No `--dry-run` despite init mutating four host settings; `render({check: true})` machinery already exists.

Requirements:
- Menu precedence: `DEFAULT_MENU` ← existing config's menu ← flags the user actually typed. `bin` passes only explicitly-set flags (parseArgs `values` presence, not defaults).
- Compute the render/gate/ownership diff **before** any host mutation; a true no-op re-run makes zero host calls.
- `installGate`/`ensureReviewOwnership` write only when content differs; their `files` lists reflect actual writes; `alreadyOnboarded` includes `gate.files` and `ownership.files`. Repair scenario (deleted CODEOWNERS + workflow, re-run) must produce a PR restoring them.
- `onboardedAt: existing?.onboardedAt ?? now()`; add `lastRunAt: now()` to the schema.
- Wrap `openPullRequest` in init: on failure, report `pullRequest: null` + `pullRequestError`; bin prints "branch redline/onboard is pushed — open the pull request manually" and exits 1 (`failed`), not 4. Config still records onboarded state (host mutations are real).
- `accessibility` default derived from resolved stacks (true only when stacks include a web/mobile stack); usage text for `--no-a11y`/`--speckit` says "recorded in .redline.json for later phases; changes nothing in Phase 1".
- `--dry-run`: renders in check mode, computes gate/ownership diffs without writing, makes zero host calls, prints the full plan (files, host mutations, menu) and exits 0 (2 for usage errors as usual).
- Migration: when `migratedFrom === '2.1'`, stage removal of known 2.1-era paths (exact list: any `.github/instructions/redline-*.instructions.md` and `.cursor/rules/redline-*.mdc` orphans are already pruned by render; add `.github/workflows/redline-sync.yml` and `scripts/redline-*.sh` if present) into the same PR.
- Tests: blocking preserved on plain re-run; no-op re-run makes zero platform calls; repair opens a PR; dry-run makes zero host calls and writes nothing; onboardedAt stable.

## Task 7: verify robustness — drift causes, gate observation, pendingAdmin readback

**Files:** `cli/commands/verify.ts`, `cli/platforms/github/verify.ts`, tests for both

Audit findings:
- `readReportedCheckNames` uses the newest PR of any state (`github/verify.ts:197-202`); a healthy repo whose newest PR predates the gate reports the contract broken, exit 1. No "no gate run observed yet" outcome.
- Estate-break: `artifacts-current` re-renders from the **installed CLI's** standards; any publish that changes `standards/**` fails verify in every onboarded repo (and fails the Azure gate, which runs `verify --gate` on every PR). `config.standardsVersion` is recorded but never compared.
- `pendingAdmin` reconciliation (`verify.ts:143-147`) looks entries up in `security.outcomes`, but `readSecurityState` returns only secret-scanning + push-protection — five of seven capabilities can never be cleared.
- Deferred from Phase 1 (ledger T36): `merge-policy` check compares only `policy.blocking`; an admin disabling code-owner review or approvals doesn't surface.

Requirements:
- When the required check is missing AND no `redline-gate*` check run exists on that head SHA, emit a distinct **non-failing** finding ("no gate run observed yet — open or update a pull request to see the gate report"); the failing message fires only when a gate run exists without the required name, and its "will block every pull request" sentence only when `policy.blocking`.
- Compare `manifest.version` (installed CLI) against `config.standardsVersion`: when they differ, `artifacts-current` staleness downgrades to a non-failing "standards updated upstream (vX → vY) — re-run redline init to adopt" finding; a same-version mismatch stays a failing local-drift finding. `--gate` must not fail on upstream drift.
- Extend security readback to cover the capabilities init can defer (dependency-alerts at minimum via `GET /repos/{o}/{r}/vulnerability-alerts`), and scope the "an administrator must still enable" message to capabilities verify can actually observe, listing the unobservable ones separately ("recorded as pending; not verifiable with this token").
- Deepen `merge-policy` drift: compare approvals count, code-owner review, and thread-resolution settings recorded at install time (extend the recorded policy in `.redline.json` as needed — schema change is allowed, versioned).
- `security-floor` must not make a positive claim from no evidence. It currently counts only
  `denied` outcomes, so a token that cannot see the security block reports "security floor
  enabled". Distinguish enabled / disabled / not-visible, and name the not-visible ones
  rather than folding them into either verdict. (Handed over from Task 6 round 3.)
- `verify` does not observe the pull request template at all, so everything Task 16 fixed is
  invisible to it: a repository stuck on the pre-marker template, one that gains branch
  templates after onboarding, and one whose markers a human later mangles all look healthy
  until the next `init`. Add a finding that observes the template Redline would write to and
  reports those three states. A mangled marker pair is a failing finding — `init` now refuses
  outright on it, so `verify` saying nothing is the worse surprise. (Handed over from Task 16
  round 2 concern 3.)
- The comment justifying the `--gate` softening of `security-floor` claims the fleet
  re-verification job runs `--gate`. That job is `if: false` and never invokes the CLI, so the
  justification is false as written. Fix the comment to name the real reason, or the real
  caller. (Handed over from Task 6 round 4, Minor M1.)
- Tests for each new finding path, including the upstream-vs-local drift distinction.

## Task 8: detection correctness in monorepos

**Files:** `cli/detect/scan.ts`, `cli/detect/stack.ts`, their tests

Audit: DFS recurses into the first subtree before finishing root entries — a >5000-file first directory starves root `go.mod`/`pom.xml` and detection silently degrades. `.xcodeproj` signal is dead (directories are never emitted).

Requirements:
- Breadth-first: emit every file entry of a directory before descending into its subdirectories; root files always land within budget.
- iOS signal: track `*.xcodeproj` directory names (either emit `<name>.xcodeproj/` markers or a separate directory set) so the existing rule fires.
- Tests: synthetic tree with a huge first subtree still detects root `go.mod`; `App.xcodeproj` directory yields mobile-ios.

## Task 9: release engineering — pinned, coherent, rehearsable

**Files:** `.github/workflows/release.yml`, `.releaserc.json`, `package.json`, `README.md` (versioning section), `CHANGELOG.md`

Audit findings:
- `npx --yes semantic-release` unpinned in the one job holding `NPM_TOKEN` + `contents: write`; repo pins everything else (actions, trufflehog).
- Three-way version divergence: manifest `0.0.1` (standards axis), CHANGELOG `3.0.0`, first publish would be `1.0.0` (no tags).
- No canary/dry-run path: nothing exercises publish behavior before it hits the estate.

Requirements:
- Pin `semantic-release` to an exact major.minor.patch in `devDependencies`; release workflow runs the locked version (`npx semantic-release` resolves from the lockfile after `npm ci`).
- First-release guard step in release.yml: if `git tag -l 'v*'` is empty, fail loudly with the exact seed command (`git tag v2.1.0 <sha> && git push origin v2.1.0`) so the first computed version is 3.0.0, matching the CHANGELOG. Do NOT create or push the tag from this plan.
- Add a `pull_request` job running `npx semantic-release --dry-run` (no publish, no token exposure to forks — restrict with `if: github.event.pull_request.head.repo.full_name == github.repository`), and a `workflow_dispatch` canary job publishing with `--tag canary` dist-tag.
- README: document the two version axes explicitly — CLI version (npm/semantic-release) vs standards version (`standards/manifest.json`, human-bumped per AGENTS.md); `.redline.json` records both meanings (`version`, `standardsVersion`).
- CHANGELOG: note the release-flow changes.

## Task 10: docs honesty sweep

**Files:** `README.md`, `templates/CODEOWNERS`, `docs/superpowers/specs/2026-09-01-redline-v3-design.md` (on-disk only, never staged), `CHANGELOG.md`, `web/` pages that state the affected behaviors (check `web/app/docs/onboarding/page.tsx` and gate pages against the new init/verify behavior)

Audit findings:
- README:68-69 claims weekly estate verification; `verify-onboarding.yml` is `if: false`.
- `templates/CODEOWNERS:1` claims init installs it; init builds content in code and never reads the file (README:27 is correct).
- Spec still says `pending_admin`; code ships `pendingAdmin` (deliberate, but the spec was never updated).

Requirements:
- README: "Run it any time. Scheduled estate-wide re-verification is Phase 3 — see CHANGELOG limitations."
- `templates/CODEOWNERS` header: "Reference shape only. `redline init` builds equivalent content in code and never reads this file."
- Spec: replace `pending_admin` with `pendingAdmin` and note the decision date. (File is untracked; edit in place, never stage it.)
- **Install-command convention (product owner's decision, applies everywhere a command is shown — README, `web/`, CHANGELOG, CLI help text, PR-body templates, workflow snippets):** the published package is `redline-cli` and the binary is `redline`. `redline` on the public npm registry is an unrelated third-party package, so a bare `npx redline …` must never appear in any document or rendered output. The pattern is: `npx redline-cli init` for the zero-setup first run, immediately followed by `npm i -g redline-cli` presented as the one-time install that makes the everyday command plain `redline init` / `redline verify`. Sweep every existing occurrence of a command in the repo and the site for this, and add a short note to the README's install section stating why the package name and the binary name differ.
- Reconcile README/CHANGELOG/web copy with the behaviors changed in Tasks 4–7 (Azure Build Validation objects, soft-fail on Azure, `--dry-run`, upstream-vs-local drift, blocking-preserving re-runs). Verify claims against the code, not against this plan.
- `web/` build must pass if web copy is touched.

## Task 11: home-page value visualization

**Files:** `web/app/page.tsx` (or the home components it composes under `web/components/`), possibly a new `web/components/` file; `web/lib/` data modules already expose live rule counts (`rules.ts`, `manifest.ts`).

Requirement (from the product lead): the home page must show, visually and immediately, the value Redline delivers — not just describe it in prose. An engineer or engineering manager landing on the page should grasp within seconds what the floor is and what it buys their org.

Requirements:
- One visualization block on the home page, above the fold or immediately after the hero, communicating Redline's value. Ground it in REAL data from the repo (via the existing `web/lib/` loaders — e.g. 249+ rules across 12 stack profiles, severity distribution BLOCKER/HIGH/SUGGESTION, the onboard → gate → verify flow). No invented numbers, no fake dashboards, no fabricated metrics (nothing like "84% fewer incidents" — Phase 1 has no telemetry).
- Prefer a diagram of the mechanism (repo → `redline init` → floor installed → every PR gated → drift caught by `verify`) and/or a live-data stat strip (rules, stacks, hosts, checks) over decorative charts. Static SVG/JSX — no charting library (web/ keeps its dependency discipline; check `web/package.json` before adding anything).
- Must read correctly in light and dark themes and at mobile widths, matching the site's existing design system (read the existing components first — `web/components/sections/` — and reuse tokens/styles).
- Build passes: `pnpm build` (or the repo's script) in `web/`, all routes still green.
- Copy stays honest per the docs-honesty rules: nothing the branch cannot back.

## Task 12: home-page value proposition — problem, cost, answer

**Files:** `web/app/page.tsx`, a new component under `web/components/` (sibling to Task 11's `value-viz.tsx`), `web/app/globals.css`, `CHANGELOG.md`. Data comes from the existing `web/lib/` loaders (`rules.ts`, `manifest.ts`) — same loaders Task 11 wired.

Requirement (from the product lead, after seeing Task 11 shipped): the mechanism diagram shows *how* Redline works but never states *what problem it solves or what it saves*. A visitor reads "floor installed, every PR checked" and still asks "value proposition of what?". This task adds the missing argument.

Requirements:

- One new section on the home page, placed directly after Task 11's `ValueViz` block, that states in order: **the problem**, **what it costs today**, **Redline's answer**. Not prose paragraphs — a scannable structure (cards, or a two-column before/after), matching the existing design system.
- Content is four problem/answer pairs. Use these as the argument; wording is the implementer's, but the claims must not exceed them:
  1. **The rules live where nothing reads them.** A wiki page, an onboarding doc, and a senior reviewer's memory. The AI agent writing code in the repo has never seen any of it, so it writes to no standard at all — and the reviewer catches it after the fact, one PR at a time. *Answer:* `standards/` is rendered into every vendor format the repo's tooling reads, so the agent writing the code and the gate reviewing it apply the same rules. Anchor with the live counts (rule sets, profiles, vendor formats, both hosts).
  2. **Every reviewer draws the line somewhere else.** The same diff clears one reviewer and is blocked by the next; "important" means whatever the reviewer felt that morning, so nobody can tell which rules actually matter. *Answer:* three severities with fixed, published meanings (BLOCKER must not merge / HIGH is a deliberate acknowledged trade-off / SUGGESTION is dismissible), one finding format, and a permanent id on every rule — so findings aggregate per rule instead of dissolving into comment threads.
  3. **Config drifts the day after onboarding.** A policy gets switched off to unblock a release and never switched back; a ruleset is edited by hand; the floor is gone and nothing announces it. *Answer:* `redline verify` re-checks live host state against the recorded config and fails on drift, so the floor is a checked property, not a one-time setup.
  4. **A standard nobody can change is a standard nobody follows.** Rules that cannot be revised without editing every repo by hand either freeze or get ignored. *Answer:* the standard is versioned in one repository; a change bumps the manifest and reaches every onboarded repo as a pull request its owners review.
- **Honesty is the binding constraint, same as Task 11.** Every number rendered comes from a `web/lib/` loader or `standards/` at build time. No time-saved figure, no defect-reduction figure, no adoption count, no invented percentage, no ROI claim — Phase 1 ships no telemetry and the page must not imply it does. The value argument is made from mechanism and from real counts, never from invented outcomes. A claim you cannot point at code or `standards/` for does not go on the page.
- Do not restate Task 11's pipeline steps; this section answers "why", not "how".
- Accessibility: real heading elements in the page's outline (`<h2>` for the section, `<h3>` per pair if the structure warrants), meaning never carried by colour alone, decorative elements `aria-hidden`.
- Both themes, mobile widths, no new dependencies, `pnpm --dir web build` green.

## Task 13: the fold and the journey — before, one command, after

**Files:** `web/app/page.tsx`, `web/components/` (a new component; Task 11's `value-viz.tsx` and Task 12's `value-case.tsx` may be adjusted), `web/app/globals.css`, `CHANGELOG.md`. Source of truth for every rendered terminal line and file name: the CLI's own code under `cli/commands/` and `cli/render/`.

Product owner's verdict on the current home page: "I feel you are not utilising the above the fold the best way", and "there's no demo for the whole journey, like after and before". Both are this task.

### Part A — rebuild the above-the-fold

The current fold wastes itself. Fix these specifically:

- The subhead is a five-line paragraph that contains a **roadmap disclaimer** — "Automated review against a measurable output contract, and org-wide telemetry across both hosts, are later-phase work." Caveats about what does not exist yet do not belong above the fold. Move that sentence to the roadmap/limitations area further down the page (it must still appear somewhere — deleting it would make the page dishonest, and the CHANGELOG limitations already carry it).
- `No servers. No SaaS. No per-seat fee.` is the strongest differentiator on the page and is currently the tail of that paragraph. Give it its own line or a small strip of its own.
- Cut the subhead to one sentence a stranger understands. The `<h1>` ("AI writes the code. Redline holds the line.") is good — keep it.
- The two commands belong in the fold, in the form the reader should remember: `npm i -g redline-cli` once, then `redline init`. Keep the copy-to-clipboard affordance the current terminal has. Never render a bare `npx redline …` (the published package is `redline-cli`; `redline` on the public registry is an unrelated package).
- The demo (Part B) must begin within the first viewport on a laptop, not below it. Tighten vertical padding as needed; the fold's job is headline + one sentence + command + proof, and nothing else.

### Part B — the before → after journey

One replayable block showing what actually happens to a repository:

- **Before:** the repository as it stands — no rendered standards for the AI tools to read, no gate on pull requests, branch settings unknown. State it as the reader's current reality, not as a strawman.
- **The command:** the terminal replays `redline init` — typed, then its output.
- **After:** the files that landed (name them exactly as `redline init` writes them), the fact that they arrive as a pull request and never a direct push, and what the gate reports on the next pull request. Then `redline verify` confirming it still holds.
- Before and after must be visually comparable at a glance — the reader should see the difference, not read about it.

### Constraints (all binding)

- **Every terminal line and every file name must be a real string the CLI actually produces.** Read `cli/commands/init.ts`, `cli/commands/verify.ts` and the renderers and source them from the literal strings there. A demo that shows output the CLI does not produce is the same defect class as a fabricated metric. If a line you want does not exist, leave it out.
- No GIF, no video file, no asciinema, no animation library, **no new dependency** — CSS/JS in the page only.
- Plays on view, with a visible replay `<button>` carrying an accessible name. Honour `prefers-reduced-motion`: render the complete transcript statically, no animation. The whole thing must be readable with JavaScript disabled and before hydration — animation is an enhancement over static text, never the only way to read it.
- The transcript is real text in the DOM, never text baked into an image or produced only by script.
- Real headings in the page outline; decorative elements `aria-hidden`; meaning never carried by colour alone.
- Live numbers stay live: anything numeric still comes from the `web/lib/` loaders at build time. No time-saved, defect-reduction, adoption, or ROI claim anywhere.
- Both themes, mobile widths, `pnpm --dir web build` green with all routes still prerendered.

### Part C — tighten the value section (secondary)

Task 12's `value-case.tsx` reads well but the product owner called it "good but not the best". Same-file work, so it happens here: the `TODAY` badge repeats on all four rows and earns nothing after the first; the four rows carry equal visual weight so nothing leads; and the fact strips leave a large empty gutter at wide widths. Tighten those three without rewriting the copy — the wording passed review and the four problem/answer pairs stay as they are.

## Task 14: per-repository vendor selection — write only what the team uses

**Files:** `cli/config/redline-json.ts`, `cli/commands/init.ts`, `cli/render/standards.ts`, `cli/render/vendors.ts` (selection only — the renderers themselves stay), `cli/bin/redline.ts`, `cli/detect/*`, tests for each, `CHANGELOG.md`.

Product owner's finding, confirmed in the code: vendors are enabled **org-wide** in `standards/manifest.json` (`copilot`, `agents`, `claude` enabled; `cursor` disabled) and there is no per-repository choice. A team that uses only Copilot still gets `AGENTS.md` and `CLAUDE.md` written into their repository. Writing a file for a tool nobody uses is unrequested content in someone else's repo — the same instinct as the brownfield rule.

Requirements:

- `MenuSelections` gains a vendor selection recorded in `.redline.json`. The org manifest stays the outer bound: a repository may select a **subset** of the vendors the org has enabled, never a superset, and a vendor the org later disables stops rendering regardless of what the repo recorded.
- **Detect before asking.** `redline init` infers the default selection from what the repository already contains: `.github/copilot-instructions.md` or `.github/instructions/` → copilot; `CLAUDE.md` or `.claude/` → claude; `AGENTS.md` → agents; `.cursor/rules/` → cursor. A repository with none of them gets the org default (all enabled vendors), because that is the greenfield case the standard is written for.
- A typed flag selects explicitly and overrides detection (follow the existing flag conventions in `cli/bin/redline.ts`; the menu-precedence rule from Task 6 — `DEFAULT_MENU` ← config ← typed flags — applies unchanged).
- **Deselecting a vendor removes what Redline wrote for it, and nothing else.** Redline-owned files (`redline-`-prefixed, and the existing prune rules) are removed; the `merge: true` shared files (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`) have only their `REDLINE:BEGIN`…`REDLINE:END` block removed, leaving the rest of the file byte-identical. A shared file that contains nothing but a Redline block is deleted; one that carries the user's own content is not.
- Removal on deselect flows through the existing rendered-file diffing so it lands in a pull request like any other change, and through `--dry-run`'s plan as a removal, not a write.
- `verify`'s `artifacts-current` check compares against the repository's selection, not the org's full vendor list, so a deselected vendor is not reported as drift.
- Pin the merge-mode invariant at the source: a test asserting exactly which vendors are
  rendered with `merge: true`, with a comment naming `web/components/journey.tsx` as the
  consumer that hardcodes that list. `cli/`'s `.ts` specifiers do not resolve through Next's
  bundler, so the page cannot import it — adding a fourth merged vendor must therefore fail
  CI rather than silently falsify the page. (Handed over from Task 15 concern 1.)
  Cover the same class of mirror while you are there: `PROFILE`, `GATE_CHECK`,
  `ONBOARD_BRANCH` and `SYNC_LABEL` are hardcoded in `web/components/journey.tsx` with
  source comments for the same bundler reason. One source-side test that pins all of them
  is worth more than five comments.
- Tests: detection for each vendor and for the none-present case; subset enforced against a manifest-disabled vendor; deselect removes Redline-owned files and only the block from a shared file, preserving surrounding user content byte-for-byte; deselect surfaces in `--dry-run` as a removal; `verify` clean after a deselect.

## Task 15: make the demo explain what it is doing to the reader's repository

**Files:** `web/components/journey.tsx`, `web/app/globals.css`, possibly `web/app/docs/` copy, `CHANGELOG.md`.

Three gaps the product owner hit reading the finished demo. All are page defects — in two of the three the underlying behaviour is already correct and simply invisible.

Requirements:

- **Show that shared files are merged, not overwritten.** `CLAUDE.md`, `AGENTS.md` and `.github/copilot-instructions.md` are rendered with `merge: true` and `wrapBlock` (`cli/render/markers.ts:5`) writes only between `REDLINE:BEGIN` and `REDLINE:END`, preserving everything else in the file. The transcript currently shows a bare `write CLAUDE.md`, which reads as a clobber to anyone who already has one. Mark the merged files distinctly in the after-band and state the guarantee in one line: an existing file keeps its content; Redline owns only its marked block. This must stay true to the code — verify the marker behaviour before writing the copy, and say which files are merges and which are Redline-owned outright.
- **Say what `.redline.json` is for.** It is the record of what the repository selected and what the host was asked for, and it is the file `redline verify` reads back to detect drift. One line, in the after-band, next to where the transcript writes it.
- **Say what the prompts and commands are.** The run writes `.github/prompts/redline-*.prompt.md` and `.claude/commands/redline-*.md` and the page never says what they do or how a developer invokes them. Read `commands/` for the real content and describe them in one line each, or link the docs page that does.
- Same standards as the rest of this page: no claim the code does not back, real headings, both themes, mobile, no new dependency, `pnpm --dir web build` green.

## Task 16: the PR template must not clobber a brownfield repository's own

**Files:** `cli/platforms/github/install.ts`, `cli/platforms/azure/install.ts`, tests for both, `web/components/journey.tsx` (copy follow-through), `CHANGELOG.md`.

Found during Task 15 by reading the write paths rather than the page. `installGate` writes
`.github/pull_request_template.md` (`cli/platforms/github/install.ts:293`) and
`.azuredevops/pull_request_template.md` (`cli/platforms/azure/install.ts:651`) through
`syncFile`, which has no existence check and no marker: it compares contents and overwrites.
A repository that already has a pull request template loses it on the first `redline init`.

This is the only host-writing path in either adapter with no coexistence guard. `CODEOWNERS`
is guarded correctly (`github/install.ts:318-330` — three candidate paths, returns `already`
and leaves the file untouched). The shared instruction files are merged through
`wrapBlock`. This one is a straight overwrite, and it is exactly the failure the brownfield
constraint exists to prevent.

Leaving the file untouched is NOT the fix. `workflows/redline-gate.yml:55-64` fails any pull
request whose body has no `## Launch readiness` section, so a repository onboarded with its
own template and no Redline section would block every one of its own pull requests — a worse
outcome than the overwrite.

Requirements:

- When no template exists, write the packaged template whole, as today.
- When a template exists and contains no Redline marker block, PRESERVE it and append only
  the gated content inside `REDLINE:BEGIN`/`REDLINE:END` markers, via the same `wrapBlock`
  used for the shared instruction files. Decide from the gate workflow which sections are
  actually load-bearing (`## Launch readiness` is enforced; `## Change type` is explicitly
  not) and append only those — appending the whole packaged template would duplicate the
  user's own `# Summary` heading.
- When a template exists and already has a Redline marker block, replace only that block,
  leaving every byte outside it unchanged.
- The packaged templates under `templates/` stay the greenfield content; do not fork them.
- Both adapters, identical semantics. Report the merged case distinctly from the written
  case in the outcome detail so the run says what it did.
- Tests, per adapter: no template present → written whole; a human template present with no
  marker → user content byte-identical and the gated block appended; a template with a
  Redline block → only the block changes; `--dry-run`/`check` writes nothing on all three
  paths; a second run on an already-merged template is a no-op.
- Follow-through in `web/components/journey.tsx`: the after-band currently classes
  `pull_request_template.md` as "Replaced, the one file that is", which was accurate when it
  was written and stops being accurate here. Move it to the merged category with the rest.

## Task 17: an unreadable capability is not a denied one — Azure parity

**Files:** `cli/platforms/types.ts`, `cli/platforms/azure/verify.ts`, `cli/platforms/github/install.ts`, `cli/platforms/azure/install.ts` (`OUTCOME_RANK` only), tests.

Handed over from Task 6 round 3, which fixed this for GitHub and was fenced out of the files
needed to fix it for Azure. Azure's `readSecurityState` still maps 401/403 to `denied`. Because
`isPending` is exactly `status === 'denied'` (`cli/platforms/types.ts:35-37`), a token that can
write but cannot read Advanced Security enablement causes a re-run to overwrite a correct
`.redline.json` with a false `pendingAdmin` list, open a pull request, and exit 0. Same
data-integrity defect Task 6 closed on GitHub; same governing principle applies — an
indeterminate read is not an answer.

`unsupported` cannot carry this meaning: on Azure it already means Advanced Security is
*unlicensed*, and a deliberate test exists to keep the two apart. Conflating them would report a
licensed-but-unreadable repository as unlicensed.

Requirements:

- Add a fourth status, `'unknown'`, to `CapabilityOutcome['status']`, meaning the read gave no
  answer about this capability. Rank it in `OUTCOME_RANK` in both `install.ts` files.
- `isPending` stays exactly `status === 'denied'`. An `'unknown'` outcome must never reach
  `pendingAdmin`, and must never clear an entry already recorded there.
- Map Azure's 401/403 on the security read to `'unknown'`. A genuine refusal that the host
  reports distinguishably must still be `denied`; if Azure cannot distinguish them on a given
  endpoint, say so in the report and choose the conservative direction.
- Confirm the same audit on GitHub: Task 6 fixed the two sites it was dispatched against
  (`cli/platforms/github/verify.ts:182-183`, `:111-112`); check no other read in either adapter
  turns an unreadable state into a denial.
- Closing the status union is what lets `verify` stop failing an Azure repository that simply
  has no Advanced Security licence. Today `unsupported` cannot separate *unlicensed* from
  *unobserved*, so such a repository fails plain `redline verify` permanently with no
  operator remedy, and `verify` disagrees with `cli/commands/init.ts:407-409`. Once
  `'unknown'` exists, split them and make the unlicensed case pass again. (Handed over from
  Task 6 round 4, Important I1.)
- While you are in `install.ts` for `OUTCOME_RANK`, collapse the pull-request-template
  discovery duplication Task 7 could not reach: the candidate-folder order now exists in three
  copies (both `install.ts` files and `cli/platforms/pull-request-templates.ts`), and copies
  that can disagree mean `verify` reports a template `init` does not write. Give them one
  source. Do NOT collapse the per-adapter merge or discovery *logic* — that divergence is
  host-documented and deliberate; only the shared candidate order moves. (Handed over from
  Task 7 M2.)
- Tests per adapter: an unreadable capability does not enter `pendingAdmin`; an unreadable
  capability does not clear a recorded `pendingAdmin` entry; a genuine denial still does both;
  the unlicensed case still reports `unsupported` and not `unknown`.

## Task 18: `redline init --repair` — close the last non-converging path

**Files:** `cli/commands/init.ts`, `cli/bin/redline.ts`, `cli/commands/verify.ts`, tests.

Handed over from Task 6 round 4. With `merge-policy` correctly treated as a no-read-back
capability, one path still never converges on its own: a repository with NO ruleset and a
recorded `merge-policy` refusal. `policySettled`'s null branch calls that settled by design —
that was round 3's Critical fix, and reintroducing a re-apply there brings back the infinite
re-run — so after an administrator finally grants rights, a plain `redline init` still reports
"already onboarded" and never re-applies. `redline verify` does fail that repository's
`merge-policy` finding, so the state is loud rather than silent, but the CLI offers no
non-destructive way to act on it. The only recovery today is `rm .redline.json && redline init`,
which round 1 established is harmful: it destroys `onboardedAt`, silently reverts menu
selections the operator does not re-type, and makes `migratedFrom` come back as `'2.1'` so
`removeLegacyArtifacts` deletes `scripts/redline-*.sh` in a repository that never saw 2.1.

The same flag also answers the four other no-read-back capabilities (`labels`,
`review-ownership`, `repo-property`, `gate`, and now `dependency-alerts`), whose recorded
entries can otherwise only ever persist.

Requirements:

- `redline init --repair` skips the `alreadyOnboarded` short-circuit, re-applies every
  capability, and recomputes `pendingAdmin` from the fresh outcomes rather than from the record.
- It is NOT `rm .redline.json`: `onboardedAt` is preserved, the recorded menu is preserved
  unless a menu flag overrides it under Task 6's precedence rule, and `migratedFrom` is not
  re-derived. Pin each of those three with a test.
- `--repair` composes with `--dry-run`: the pair prints what a repair would change and writes
  nothing, making zero host mutations.
- `verify`'s `merge-policy` finding, and the `pending-admin` finding where it names capabilities
  that have no read-back, must name `redline init --repair` as the remedy. Round 1 made
  "rerun redline init to clear it" a true instruction for the capabilities that ARE read back;
  this makes it true for the ones that are not.
- Tests: the absent-ruleset-plus-recorded-refusal repository converges under `--repair` after a
  grant; a settled repository under `--repair` re-applies and reports `already` everywhere
  without changing `.redline.json` except `lastRunAt`; `--repair --dry-run` makes zero
  mutations; and the three preservation tests above.

## Task 19: repo-local rules that Redline renders and never overwrites

**Files:** `cli/render/standards.ts`, `cli/render/vendors.ts`, `cli/render/commands.ts`,
`cli/config/redline-json.ts`, `cli/commands/verify.ts`, tests, `CHANGELOG.md`. Reuses
`cli/render/markers.ts` without modifying it. Depends on Task 14 (same render files).

Asked for by the product owner: "I have a custom thing for my project — I don't need Redline to
override it." The fear as stated is unfounded and that part is a page defect, not a code one:
every path Redline writes or prunes is `redline-`-prefixed (`vendors.ts:59`, `:121`), so a
repository's own `.github/instructions/whatever.instructions.md` is never written and never
deleted. But the capability behind the request is genuinely missing.

The real gap: a repository has no way to state a rule that *overrides* an org rule. It can add
its own instructions file, which Redline leaves alone — but that file sits beside Redline's with
no stated precedence, so an AI tool reading both sees two rule sets and no way to resolve a
conflict between them. "Our repo allows X, the org standard forbids it" cannot be expressed.

Requirements:

- A repo-local rules file (e.g. `.redline/local.md`) that a human owns outright: Redline reads
  it, never writes it, never prunes it, and never fails a run because of its content.
- Its content is rendered INTO each vendor artifact, inside the Redline marker block, in a
  clearly labelled section that states the precedence in words the AI tool will act on: the
  repository's own rules win where they conflict with the org standard.
- Because it lands inside the marked block, it survives every re-render — which is the whole
  point. A human editing the marked block directly does not survive one; this does.
- The section is absent entirely when the file does not exist. No empty heading, no placeholder.
- `verify` treats a change to the local file as work to do (the artifacts are stale until the
  next render), not as drift the repository is failing at.
- Record in `.redline.json` whether a local file was present at the last run, so `verify` can
  tell "never had one" from "had one and it went away".
- Tests: absent file renders no section and no heading; present file renders inside the marked
  block for every enabled vendor; editing it makes `verify` report artifacts stale; deleting it
  removes the section on the next render and leaves the rest of the block byte-identical; the
  file itself is never written or pruned by any path, including a vendor deselect.
- **Close the command-file clobber while you are here.** `cli/render/commands.ts` writes
  `.github/prompts/<name>.prompt.md` and `.claude/commands/<name>.md`, where `<name>` is simply
  the filename in `commands/`. Nothing enforces the `redline-` prefix there and no prune rule
  covers those paths, so adding `commands/review-pr.md` to this repository would silently
  overwrite a repository's own `.claude/commands/review-pr.md` in every onboarded repo. Today's
  two command files happen to be prefixed, so this is latent rather than live — which is exactly
  when it is cheap to fix. Same defect class as the pull-request-template clobber that took five
  rounds to close; do not let this one ship on the assumption that nobody will name a command
  badly.

  **Product owner's decision, which OVERRIDES the prefix-guard approach this task originally
  proposed: do not enforce a `redline-` prefix and do not namespace the written path.** Accept
  whatever is already there — if the target file exists, merge Redline's block into it inside the
  marker block; if it does not exist, create it. This routes `commands.ts` through the same
  `wrapBlock`/`stripBlock` machinery the shared vendor files already use, so no second merge
  implementation gets written, and a later deselect strips Redline's block while leaving the
  human's bytes byte-identical.

  Carry this concern into the implementation rather than resolving it silently: a
  `.claude/commands/<name>.md` IS a single prompt body, so appending Redline's block to a team's
  own file makes `/<name>` run both texts concatenated — a different outcome from a shared
  instructions file, where concatenation is the whole point. Marker-wrapping is what makes it
  acceptable, because it stays removable and re-renderable.

  **This treatment must NOT extend to `.github/workflows/redline.yml`.** Appending to YAML
  produces a second `name:`/`on:` key and breaks the file. That path gets refuse-to-clobber
  instead: if a workflow Redline did not write already occupies it, do not write, and report it.
  Task 20's capability opt-out is the other half of that answer.
- Do NOT re-implement marker handling — reuse `cli/render/markers.ts`.

## Task 20: onboard only what the repository needs

**Files:** `cli/commands/init.ts`, `cli/bin/redline.ts`, `cli/config/redline-json.ts`,
`cli/commands/verify.ts`, `cli/platforms/*/install.ts`, tests, `CHANGELOG.md`.

Asked for by the product owner: "where's the part that makes sure I select what I need to
onboard — and if I already have pipelines wired, so I can ignore them?"

Today there is no answer. `redline init` always writes `.github/workflows/redline.yml`, always
attempts the security floor, the labels, the ruleset and the review ownership. Brownfield safety
means Redline never *takes over* a human-owned host object — but a team that already has its own
gate pipeline still gets Redline's written beside it, and a team that manages its branch
protection elsewhere still gets a ruleset applied. The only Phase 1 choice is `--blocking`;
`--no-a11y` and `--speckit` are recorded for later phases and change nothing now.

Requirements:

- Per-capability opt-out, recorded in `.redline.json` so it survives a re-run: at minimum the
  gate workflow, the merge policy, the security floor, review ownership and the labels. A
  capability the repository has opted out of is not attempted, not written, and not reported as
  missing.
- `verify` must treat an opted-out capability as a deliberate choice, not drift — it is neither a
  failure nor silence. Say plainly that it is off by choice, so the report still describes the
  whole surface and a reader can tell "off because we chose to" from "off because it broke".
- The opt-out is the repository's, and it must not become a way to quietly fall below an org
  floor. Decide and state whether any capability is non-optional; if the security floor is
  mandatory, say so in the output rather than silently ignoring an opt-out flag.
- Detection where it is cheap and unambiguous: if the repository already has a workflow or
  pipeline publishing the required check, say so during `init` and offer the opt-out in the
  output rather than writing a second one silently. Detection informs the operator; it does not
  decide for them.
- `--dry-run` shows exactly what an opt-out changes, and writes nothing.
- Flag precedence follows the existing rule: a typed flag overrides the recorded selection, an
  omitted flag keeps what `.redline.json` recorded.
- Tests: an opted-out capability is not attempted on the host and writes no file; `verify`
  reports it as off-by-choice and does not fail; a re-run without flags keeps the recorded
  opt-out; a typed flag flips it back on; `--dry-run` shows the delta and mutates nothing.

## Task 21: accessibility rules — the menu key has no content behind it

**Files:** `standards/stacks/react.md`, `react-native.md`, `kotlin.md`, `swift.md`,
`standards/manifest.json`, `CHANGELOG.md`, then `cli/commands/init.ts`.

**This is a `standards/` content change and must NOT ride in the hardening branch.** `standards/`
is the only directory a human edits, and a change there propagates to every onboarded repository
as a pull request, so it is a production change: it needs its own branch, a `manifest.json`
version bump and a `CHANGELOG.md` entry in the same pull request.

The finding: there are ZERO accessibility rules anywhere in `standards/`. Grep finds no
`accessib`, `a11y`, `aria` or `wcag` rule in `react.md`, `react-native.md`, `kotlin.md` or
`swift.md`. What exists is scaffolding with nothing behind it — `ACCESSIBILITY_STACKS` at
`cli/commands/init.ts:77` is a hardcoded list of those four stacks used only to default the
`accessibility` menu key, and `--no-a11y` records a boolean that changes nothing. The CLI help
and the docs page both say so plainly, so nothing is falsely claimed; the slot is simply empty.

Requirements:

- Author real accessibility rules for the four stacks that claim them, in the same shape as every
  other rule in the corpus: an id of the form `<stack>/<slug>`, a one-line statement of what is
  wrong, and a concrete fix. They must be reviewable defects with a describable failure — an
  interactive element with no accessible name, an image conveying meaning with no text
  alternative, a control reachable by pointer but not by keyboard, a state change announced only
  by colour. Do not write aspirational advice; the standard's own rule is that a finding you
  cannot point at a concrete failure for is not a finding.
- Place each at the severity the rest of the corpus would give it. Most accessibility defects are
  HIGH or SUGGESTION; reserve BLOCKER for a genuine exclusion, and be able to defend the choice.
- `react` and `react-native` differ — RN has no DOM, and its accessibility props are its own. Do
  not copy the web rules across.
- Then, and only then, make `ACCESSIBILITY_STACKS` derive from the manifest rather than being
  hardcoded, so the menu key's default follows which stacks actually carry accessibility rules
  instead of a list that can silently diverge. Add the test that fails when they diverge.
- Until the rules exist, leave `--no-a11y` labelled exactly as it is. An inert flag that says it
  is inert is honest; an inert flag that implies coverage is not.

## Task ordering

1 → 2 → 3 → 4 → 5 → 6 → 7, with 8 and 9 free-floating (disjoint files; may run alongside any task after 1 under the two-concurrent-implementers rule), 10 last. 2 and 3 both touch `cli/platforms/github/install.ts` — sequential. 4 and 5 both touch `cli/platforms/azure/install.ts` — sequential. 6 depends on 3 (null-PR contract) and 5 (installGate diffing spans both adapters). 7 depends on 4 (requiredChecks semantics).

## Acceptance

- `npm test` and `npm run typecheck` green; `node scripts/validate.mjs` green.
- Packed-artifact smoke: `npm run build && npm pack`, install tarball, `redline --help` exits 0, `redline init --dry-run` in a scratch repo makes zero network calls (offline) and exits cleanly.
- Brownfield suite: every host-writing capability has a coexistence test (human object present → untouched + reported).
