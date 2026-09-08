# Changelog

Standards versions follow `standards/manifest.json` → `version`. Sync PRs quote it, so a
repo's rendered artifacts always name the version they came from.

Record seed scores here. A standards change with no measurement is an opinion.

## Unreleased — 0.0.2

### CLI — `redline init` asks before it writes

Everything below came out of one real onboarding of a mature repository. Each item is a
defect that onboarding surfaced, not a feature anyone asked for.

- **`redline init` with no flags at a terminal now walks a menu.** Profile, host, pipeline,
  vendors, contexts, capabilities and rung, one question at a time, with the detected answer
  preselected and every term explained beside the choice that uses it. The last question is
  Dry run or Apply, defaulting to Dry run. CI, pipes and any run carrying a flag take exactly
  the path they took before: a prompt in a pipeline is a hang with nobody there to answer it.
  Zero new dependencies — the prompt kit is `node:readline` and ANSI, because a tool that runs
  via `npx` inside other organisations' CI should not hand them a supply-chain edge for a menu.

- **The gate no longer writes a workflow that cannot resolve.** `init` used to render
  `.github/workflows/redline.yml` referencing `<org>/.github/.github/workflows/redline-gate.yml@main`,
  commit it, and report `applied gate` — on an organisation with no `.github` repository. Every
  pull request in that repository then failed with "Unable to find reusable workflow". The
  reference is now resolved before the caller is written; a failure suppresses the caller only,
  keeps the pull request template and labels, and reports the gate as `denied` so it reaches
  pendingAdmin with the org-level fix named.

- **`--pipeline github-actions|azure-pipelines`, asked in the menu.** The host and the thing
  that runs the checks come apart: a repository can live on GitHub and be built entirely by
  Azure Pipelines. Deriving one from the other is what put an Actions workflow into a repository
  that runs no Actions. Choosing `azure-pipelines` on a GitHub host writes
  `.azuredevops/redline-gate.yml` — with the `pr:` trigger GitHub-hosted repositories honour, the
  same pinned diff secret scan as the other two gates, and no Azure Repos status POST, because
  on GitHub the build result is the check.

- **`verify` and `init` no longer contradict each other about the security floor.** GitHub
  includes a key in a visible `security_and_analysis` block only when the feature exists on the
  repository's plan. An omitted key now reads as `unsupported`, not `denied` — `init` said "not
  available on this repository" while `verify` said "FAIL disabled" about the same three
  settings, sending the operator to enable something no administrator of that repository can.

- **`check-name-reported` summarises.** A mature repository reports twenty-five checks, and
  printing all of them put one unreadable line in the middle of the report with a real
  security-floor failure directly underneath it.

- **An applied run says where its changes went.** Onboarding commits to `redline/onboard` and
  pushes, so `git status` stays clean; the run now says so. Without it the first real onboarding
  looked like it had done nothing, and the operator ran `init` again and was told "already
  onboarded" by a repository they believed was not.

- **Cancelling is not a failure.** Ctrl-C at a prompt exits 130 with no `error` line.

### Standards 0.0.2 — optional context sections

`standards/contexts/` carries background a reviewer needs about how a repository works,
rendered into the same artifacts the rules are and selected per repository:

- `speckit.md` — the repository works spec-first. On by default, and dropped automatically
  where the repository already runs Spec Kit, which is a separate tool with its own
  installer and templates that Redline neither creates nor edits.
- `tmf.md` — the repository implements TM Forum interfaces. Off unless `--tmf` asks for it.

Context, deliberately not rules: a rule carries a stable id that telemetry is keyed on for
the life of the estate, and these are selected per repository rather than by stack, so an
id only some repositories could ever fire would make its tuning numbers meaningless. A
finding that needs one cites `core/uncatalogued` and says which paragraph — which is also
how the org finds out a context has earned promotion to real rules. The TMF text is a
starting frame drawn from TMF630's design guidelines and wants review by someone who owns
the org's TM Forum conformance.

Selection is reversible: passing `--no-speckit` or `--no-tmf` on a later run removes a
section already rendered, because the block is regenerated rather than appended to.


### Published as `redlinegate`

The npm package is `redlinegate`, not `redline-cli`. Nothing was ever published under the
old name — the bootstrap attempts that reached the registry were unpublished, and the name
never reached a reader — so this is a rename on paper only: no installed repo points at
`redline-cli`, and no redirect is owed. Every command in the docs, the Azure gate template
and the collector workflow names the new package. The installed binary is still `redline`.

Docs are served from <https://redline-gate.vercel.app>, which `package.json` now names as
`homepage`. `repository` and `bugs` stay absent: the source repository is private, and
publishing a link nobody outside the org can open is worse than publishing none.

### Review pass — fourteen defects found before merge

- **Every exemption was rejected.** The pull request template explains each field in a
  comment that necessarily contains the words `reason:`, `until:` and `scope:`, and the
  parser read the instructions instead of the author's answer. A correctly filled exemption
  parsed `until` as the sentence describing it. Both parsers now strip HTML comments, and the
  regression test reads the real shipped template rather than a fixture — a fixture is exactly
  what would have kept passing.
- **`redline review` with no flags reviewed nothing uncommitted.** It ran
  `git diff base...HEAD`, which compares two commits and cannot see the working tree — so the
  daily command failed at the case it exists for. It now diffs against the merge base
  directly, which keeps the property three dots was chosen for and includes uncommitted work.
- **A deleted file became a phantom added line.** `+++ /dev/null` did not match the file
  header, fell through to the added-line branch, and was attributed to the *previous* file —
  so deleting a file could raise a finding on a file the change never touched. The
  `/dev/null` guard that was supposed to prevent this was unreachable.
- **Ingested scanner counts were multiplied by pull request volume.** Code-scanning alerts
  are a fact about a repository; stamping the snapshot on every merged pull request and
  summing them turned 12 alerts across 40 merges into 480. Counted once per repository now.
- **A scoped exemption waived everything.** The gate called `redline exempt` without
  `--scope`, so the field was recorded, displayed, and never evaluated.
- **`block-high` did nothing `block-blocker` did not.** The rung was never passed to
  `redline policy`, so the strictest rung on the ladder was behaviourally identical to the one
  below it.
- **An unrecognised rung enforced in the gate and observed in the CLI.** Two halves
  disagreeing meant a typo blocked every pull request in a repository the CLI reported as
  observing. Both now fail toward not enforcing.
- Smaller: a partly unreadable security floor verified as healthy; sync computed stale
  artifacts and discarded them, reporting a drifted repository as current; the deterministic
  checker flagged its own correct `parseInt` calls and fired on the word "var" inside
  comments; an exemption exactly at the 90-day maximum was refused as 91; a mistyped
  `--provider` silently became `openai`.
- **Process:** `actionlint` silently skips shell linting when `shellcheck` is absent, which it
  was in the environment this branch was developed in. Local runs reported clean on a strictly
  weaker check than CI's.

### The documentation site catches up with the product

- The reference layer was complete — 61 per-item pages, every command, every rule — and the
  conceptual layer had stopped at Phase 1. Someone importing the framework read about a merge
  gate and profiles and never learned that exemptions, an enforcement ladder, scanner
  ingestion, cost measurement, a deterministic tier, local review or a distribution loop
  existed. Seven concept pages now cover them, each leading with the decision rather than the
  mechanism.
- A **quickstart** that onboards one repository in four steps and ends with nothing blocked,
  and an **adoption path** — day one to month two — whose answer to "when do we start
  enforcing" is later than most people expect and on evidence rather than a date.
- A **what changed** page, parsed from `CHANGELOG.md` at build time so it cannot drift. A
  release-notes page maintained by hand is accurate the day it ships and misleading a month
  later.
- The homepage and the introduction stop describing Phase 1. The introduction now states the
  boundary out loud — Redline governs a change while it is still a diff, has no opinion on
  delivery or cloud spend, and its data ends at merge — and names the property that runs
  through the whole system: **it refuses rather than approximates.** A check that could not
  run reports `??`, an unmeasurable figure is absent with its reason, a correlation below its
  sample threshold is withheld.
- One homepage claim had become false and is gone: telemetry and scoring no longer "run
  outside the CLI".

### `redline metrics` — the estate runners get a front door

- Running a measurement meant cloning the metrics repo, knowing the file path, and knowing
  that `SPEND_GRAIN` existed at all. Env-var-only configuration is the genuinely
  old-fashioned part, not the file extension: there is no `--help`, so the only way to
  discover an option was to read the source. `redline metrics <command>` and
  `redline registry` own configuration now, with a flag surface declared as data — which is
  what makes it testable, and what guarantees help and validation cannot disagree, because
  they are generated from the same table.
- **Every refusal here used to be silent.** A mistyped `--spend-grain per-seat` became
  `unknown` and made the resulting number quietly less trustworthy than it looked; a
  non-numeric `--days` became `NaN` and produced an empty window; a missing token surfaced as
  a 401 halfway through an org walk. All three are now refused by name before anything runs.
- **The metrics repo no longer needs a copy of `scripts/`.** It checked itself out and ran
  `node scripts/build-dashboard.mjs`, which meant keeping the runners duplicated there. Those
  workflows call `npx redline-cli@<version> metrics …` and own nothing but their own `data/`.
  The inbox workflow, which runs in the source repo, deliberately uses the local build
  instead: a broken command there should fail before the release, not after it.
- A runner that throws is reported as a host failure with a hint, not as "redline failed
  unexpectedly" — that catch-all is for internal defects, and telling a reader the tool is
  broken when their token is wastes an afternoon.
- Credentials are never forwarded on a command line, even for the runner that parses its own
  argv. A command line is visible in the process table and lands in shell history.
- **The four build internals stay scripts** — `validate`, `assign-rule-ids`, `render-self`,
  `check-pins`. They act on this repository's own `standards/`, and a command that exists but
  cannot work on your repository is a worse promise than one that does not exist.

### Ignored-finding correlation — research, reported with its confidence

- Redline could say a rule was ignored and not that ignoring it mattered. Where a finding was
  left unresolved and the same repository later attracted a revert or a hotfix, that is
  evidence the rule earns its place — computed from merged-pull-request history alone, with no
  incident feed, which keeps it inside the roadmap's non-goals.
- **The refusal is the feature.** The roadmap calls this the most speculative item on the list
  and says to cut it without regret if the signal is too weak, so a rule below the sample
  threshold gets no rate at all — just a statement of how many ignored findings it has and how
  many are needed. Below the threshold the rate exists arithmetically and means nothing, and
  publishing it anyway is how a coincidence becomes a rule nobody can argue with.
- The output carries a verdict on the *experiment*, not only on each rule. "Not reportable" is
  the honest result of a weak sample rather than a failure, and no ignored findings at all is
  reported as a good result rather than as an empty one.
- Where a rate is reported the caveat travels with it: correlation, not causation, and a weak
  one. It is for prioritising which rules to examine, never for justifying a rule on its own.
- A remediation's own ignored findings are not attributed to anything. Counting them would let
  a single incident inflate every rule that happened to fire on the fix.

### `redline review` — the daily command, bounded to what applies

- The last of v3's four commands, and the answer to every request for "catch it before I
  push". It reviews the working tree, staged changes or any diff against **only** the rules
  that apply to the files it touches. That bound is the product: anyone can ask an assistant
  to review a diff, and a model handed the composed standard for a twelve-stack profile
  spends most of its attention on languages the change never touches — the findings get
  worse, not better.
- **Two engines, and `embedded` is the default because it calls no model at all.** It emits
  the bounded prompt for the assistant already running the command, which is the common case
  in Claude Code, Copilot or Cursor. That is the design rather than a stub: calling a second
  model from inside the first one's session pays twice for a worse answer. `--engine api`
  speaks OpenAI-compatible and Anthropic, and the OpenAI-compatible half covers the fully
  local case for free — Ollama, LM Studio and vLLM all expose it, and a local endpoint needs
  no key. A review that must send a diff to a third party is one several markets cannot run.
- **The output contract is rendered by code, never free-typed by the model.** The model
  returns JSON against a published schema; the CLI validates it and writes the
  `Redline/<SEVERITY> [rule-id]:` line itself. A model that writes that prefix will eventually
  write a severity that does not exist or an id it invented, and every aggregate keyed on that
  line becomes fiction. A finding citing a rule the prompt did not carry is discarded and the
  reason is said out loud.
- **Local findings never reach rule-tuning telemetry**, and the report says so on every run.
  A local run has no thread to resolve, no reviewer to attribute, and no way to tell a finding
  that was fixed from one the author never read — counting it would compute acted-on rate
  partly from runs nobody can verify. `scripts/validate.mjs` fails the build if that exclusion
  is ever removed.
- It always exits 0. A non-zero exit would invite someone to wire it into CI as a second gate,
  where it would enforce nothing while looking like it did — the pull request review remains
  the system of record.
- A changed file no stack covers is reported rather than dropped: that is a gap in the
  standard, and reviewing it against the core rules alone while saying nothing hides it.

### Graduated enforcement — a ladder a repository climbs on evidence

- Enforcement was binary: advisory, or blocking with `--blocking`. Neither end works across
  hundreds of repositories. Rolling blocking to all of them in one step is not achievable, and
  leaving everything advisory means the organisation can never state a guarantee about any of
  them. Four rungs now: `observe`, `warn`, `block-blocker`, `block-high`, recorded in
  `.redline.json`, carried in the register, and written into each repository's caller workflow
  so the gate needs no second source of truth.
- **Answers v3 §15 Q2: evidence-gated self-service.** A repository promotes itself when the
  recorded evidence supports it — seed BLOCKER recall at 100%, zero false positives on the
  clean corpus, an acted-on rate above the rung's threshold, and a sample large enough that
  the rate is not a coincidence. It cannot promote on assertion, it cannot skip a rung (the
  rung it would skip is where the evidence for the next one is gathered), and a refusal names
  the specific blocker rather than saying no.
- **Demotion never needs evidence.** The safe direction never needs permission: a repository
  whose gate is misfiring at 3am must be able to step back without waiting for anyone, and a
  ladder that made that hard would be switched off entirely rather than stepped down.
- **Answers open question 3: per repository, with a per-market floor.** A market may raise its
  minimum rung; it may not push a repository below the rung it has already reached. A
  repository under its market's floor is reported as out of policy rather than as drift,
  because a different person has to act.
- A run that says nothing about enforcement never changes the rung, and an unrecognised or
  hand-edited rung reads back as `observe`. Both failure directions point the same way: a typo
  must never be able to make a repository stricter than anyone chose.
- **The security floor is not on the ladder.** Dependency review and the secret scan block at
  every rung including `observe`. The ladder governs how strictly a repository's own standards
  are enforced, never whether the organisation's security minimum applies to it.
- The dashboard reports how much of the estate is actually enforcing rather than watching —
  the question the ladder exists to answer, and one no per-repository view can show. An
  unreadable register leaves it absent rather than zeroed: zero blocking repositories and an
  unreadable register look nothing alike to whoever has to act.

### Cost and DORA — what review cost against what it caught

- Redline could prove review works and could not say what it cost. `scripts/build-roi.mjs`
  now produces the page the roadmap's exit condition asks for: one page a finance stakeholder
  can read, sourced entirely from collected data. The headline is **cost per BLOCKER caught**
  — a figure nobody else in the toolchain can compute, because a cost-management tool knows
  spend and has no findings, and a DORA tool has neither.
- **Value is what was acted on, not what was reported.** A finding nobody acted on caught
  nothing, and counting it would let the return be inflated by producing more noise — the
  exact behaviour the guardrails exist to prevent.
- **Answers open question 2 by refusing to guess.** Spend carries its grain, and an org-level
  figure will not answer a per-repository question: it says to publish org-level cost against
  org-level value instead. Org spend divided by repository count and presented as
  per-repository cost looks precise, is invented, and is the number a stakeholder would act on.
- Lead time and change failure rate come from merged-pull-request data the collector already
  pulls. Deployment frequency is reported as **unknown, not zero**, where a repository does
  not use the deployments API — assuming one deploy per merge reports a trunk-based team and a
  quarterly-release team as identical, which is the exact distinction the metric draws.
- **MTTR is refused by name**, so nobody wonders whether it was forgotten. It needs an
  incident feed Redline does not have and should not acquire, and a wrong MTTR is the number
  most likely to be quoted at someone who will act on it.
- The change-failure caveat travels with the number rather than living in a doc: it is a
  floor, not the true rate, because a revert or hotfix is evidence of a failed change rather
  than proof, and a team that fixes forward without saying "hotfix" scores better than one
  that labels honestly.
- The collector now records each pull request's title and first commit timestamp, which is
  what lead time and change failure rate are derived from. A pull request whose first commit
  the API did not return is left absent rather than defaulted to the merge time, which would
  report a lead time of zero and drag the median toward a number no team achieved.

### Pre-release standards iteration — the deterministic policy tier

- A share of what the standard asserts needs no model. A ticket reference is present or it
  is not; a type-checker suppression carries one or it does not. Sending those to an LLM
  costs tokens and invites a false positive on a *fact*, which is the worst kind — an author
  cannot argue with a model about whether the word TODO appears on a line. `redline policy`
  evaluates them directly, and the gate runs it on every pull request.
- **The classification lives in `standards/manifest.json`, not in the markdown.** The roadmap
  rates this the highest-risk item because it changes the shape of the source of truth, and
  this is the change that removes most of that risk: `standards/*.md` is what a reviewer
  reads, and deleting a rule from it because a checker also covers it would narrow what the
  model considers. Every rule is classified by construction — listed means deterministic,
  absent means judgement — and **not one rule id changed**, because every historical
  telemetry record is keyed on them.
- **No rule changed meaning.** Where a check can only decide part of a rule it decides that
  part and the model still sees the whole rule. `javascript/unsafe-numeric-coercion` is
  checked for a missing `parseInt` radix; whether a `Number()` coercion is applied to user
  input is judgement and stays with the model.
- Only ADDED lines are examined, which is a rule rather than an optimisation. Flagging an
  existing `var` in a file the author merely renamed is exactly what the standard's "what NOT
  to flag" section forbids, and an author who is right to ignore one finding learns to ignore
  the next one too.
- `scripts/validate.mjs` fails the build if a rule is classified deterministic and has no
  implementation. That failure — a rule everyone believes is machine-checked and which is in
  fact checked by nobody — is worse than leaving it to the model, because the model would at
  least have looked.
- The floor is BLOCKER, not HIGH. A deterministic tier that failed merges over a missing
  ticket reference on day one would be switched off by week two, and then nothing it decides
  is enforced at all. A repository can raise it with `--fail-on`.
- `core/hardcoded-secrets` is deliberately NOT in the tier. A regex over added lines is how a
  secret scanner earns a reputation for false positives; the gate already runs a real one
  against verified secrets, and the model keeps the rule for what a scanner misses.
- Verified against the seeded corpus: the tier flags `seeded/javascript`'s SEED 8 at the
  right line, and seed recall is unaffected because nothing was removed from what the model
  is asked to consider.

### Claude skills — per-stack rules, and an honest measurement of what they cost

- A fifth render target closes a real asymmetry. Copilot gets `applyTo` globs and loads a
  stack's rules only when that stack's files are in play; Claude got `CLAUDE.md` →
  `@AGENTS.md` — the whole composed standard, every turn, for the life of every session. The
  `skills` vendor renders one `.claude/skills/redline-<stack>/SKILL.md` per stack plus a core
  skill, and a skill loads on its description, so the description names the stack and its
  file extensions.
- **`standards/` is unchanged by this work.** It is packaging, not authoring: each skill body
  is the stack's own markdown byte for byte, and no Claude-shaped concept leaks backward into
  how a rule is written.
- **The measurement, including where it loses.** `scripts/measure-context.mjs` reproduces it:
  multi-stack profiles save 19.7% to 48.3%, and **single-stack profiles cost about 5% more** —
  with one stack there is no second one to avoid loading, so the frontmatter is pure overhead.
  Both directions are pinned by tests. The roadmap makes this piece conditional on paying for
  itself, so quoting only the wins would have been marketing.
- It ships **disabled** at the org level and is selected *instead of* `claude`, never
  alongside it: the two render the same rules in different shapes, and a repository with both
  loads every stack twice. A render target that changes what every Claude session loads should
  not switch itself on across an estate in a patch release.
- `PruneRule` grew a `directories` flag, because a skill is a directory rather than a file.
  Without it every skill directory looked unplanned on every render and would have been
  deleted and rewritten each time.

### SARIF ingestion — one severity contract across every producer

- Redline was one more finding producer competing with scanners it should have been
  consuming. Its own diff secret scan and dependency review are weaker than a real scanner
  stack and always will be. The collector now ingests code-scanning alerts from repositories
  that already run one, puts them through the same three-severity contract, and reports them
  beside Redline's own — so the estate has one picture instead of five dashboards.
- **Ingested findings are always distinguishable from Redline's, everywhere.** This is the
  one way this piece could make things worse than not doing it: rule tuning reads the finding
  stream, and a view that could not tell a CodeQL finding from a Redline one would tune
  Redline's rules on another tool's noise. So an ingested finding keeps the producer's own
  rule id — never rewritten into a Redline id, which would make every rule aggregate in the
  estate fiction — carries its tool, and aggregates in its own bucket. Acted-on rate is
  computed within each source and never across: Redline's is a resolved review thread, a
  scanner's is a closed alert, and averaging two definitions describes neither.
- **Answers roadmap open question 4: ingested findings never gate a merge.** They are
  measured only. Gating on another tool's output makes Redline responsible for that tool's
  false positives, and `scripts/validate.mjs` fails the build if the gate ever starts reading
  code scanning.
- Severity mapping is configurable per repository and visible in every record. The roadmap
  names this as Phase 1's risk and it is right — it is a judgement call that will be wrong
  somewhere. So each finding carries both the mapped severity and the producer's own word, a
  severity the map does not know is reported rather than absorbed, and an unrecognised one
  falls back to SUGGESTION and never BLOCKER: a wrong BLOCKER blocks a merge and teaches
  people the gate is noise, a wrong SUGGESTION is a line in a report.
- Redline never runs a scanner and no repository is asked to change which ones it runs. A
  repository with code scanning disabled, or a token that cannot see security data, is a fact
  about that repository rather than a failed collection run.
- The dashboard gains a Finding sources view showing both catalogues side by side. When it
  is empty, that is the answer to the roadmap's open question 1 — and the signal that SARIF
  ingestion was not where the next effort belonged.

### Pre-release standards iteration — structured exemptions

- `redline-exempt` was a bare label. It downgraded the process checks to warnings and
  recorded nothing: not who accepted the failing check, not why, not until when. An
  exemption nobody has to justify and nobody revisits is not an exemption, it is an opt-out.
  The gate now reads a `## Redline exemption` block carrying a **reason** (at least 20
  characters — "needed for release" tells a later reader nothing), a **scope**, and an
  **expiry** of at most 90 days. Longer than 90 days is a standards change, not an
  exemption.
- **This is a behaviour change for every onboarded repository, and it ships behind a
  grace.** The gate's new `exemption-enforcement` input defaults to `warn`: a label without
  a valid block is accepted and told what is missing. A repository moves to `require` one
  standards version later, so nobody's open pull request is failed by a rule that did not
  exist when they opened it.
- **Unchanged, and load-bearing:** an exemption still touches the process checks only. It
  has never been able to waive dependency review or the diff secret scan, and it still
  cannot.
- Redline's own sync pull requests carry a real exemption block rather than being a special
  case in the gate — one rule for everyone is worth more than a convenience for the tool
  that wrote the rule. The generated exemption expires after 30 days, so **a sync pull
  request nobody merges starts failing its own gate**, which is exactly what should happen
  to a standards change a repository is quietly refusing.
- The pull request template gains the section, but only where Redline is already writing a
  block. A team whose own template already answers the gate keeps it untouched: no gate job
  fails for the section's absence, so it must never be the reason a marker block appears in
  a file somebody else wrote. `verify` does not report its absence as drift either.
- The collector records the parsed exemption per pull request, so standing exemptions trend
  and a team routing around the gate shows up as the same scope recurring — the guardrail
  the roadmap asks for, and one a per-pull-request view can never show. The block is parsed
  twice on purpose (the CLI enforces, the collector audits, and the collector has no build
  step to import from), and `scripts/validate.mjs` fails the build if the two ever diverge.

- `scripts/build-baseline.mjs` computes the Phase 0 baseline — the numbers every later
  roadmap phase is judged against. The roadmap says plainly that the ordering of Phases 1-4
  is a hypothesis until this exists and that the baseline is allowed to reorder them, so the
  instrument is built here even though only the owner can run it with org credentials.
- **An unmeasurable figure is `null` with its reason, never `0`.** This is the whole design
  rule. A zero that actually means "nobody measured this" reads as a finding, and makes every
  later comparison look like progress that did not happen: 0% coverage is a crisis, an
  unreadable register is a Tuesday. So a merge rate with no pull requests yet is absent
  rather than 0%, cost per BLOCKER names which half is missing rather than dividing by an
  assumption, and a repository whose workflows the token cannot list is skipped rather than
  counted as running no scanner.
- `scripts/` has unit tests for the first time. `npm test` now covers
  `scripts/**/__tests__/*.test.mjs` alongside the CLI suite, and the bundle self-check fails
  the build if the baseline instrument goes missing.

- `redline verify --repo owner/name` verifies a repository over the API, with no checkout.
  This is what `workflows/verify-onboarding.yml` was missing, and it is no longer gated off:
  the weekly sweep walks the register and opens one tracking issue — updated in place, never
  one per run — naming every repository that drifted and quoting its failing checks.
- **A check that could not run reports `??`, never `ok`.** Some assertions genuinely need a
  working tree, and a token can be structurally unable to read a setting without that being
  a refusal. Reporting either as a pass produces a false all-clear across the whole estate
  at once, which is worse than not checking. An `??` also never fails a repository on its
  own: failing on the absence of evidence trains an operator to ignore the weekly issue.
- Both verify paths parse the gate caller with the same function. Two independent answers to
  "what check does this file publish" would eventually disagree, and that disagreement is
  exactly the difference between a repository reported healthy and one reported broken.
- `--gate` and `--repo` together are refused rather than one being silently ignored: `--gate`
  publishes *this* repository's merge status and cannot speak for another one.
- `scripts/validate.mjs` fails the build if either distribution or drift detection is gated
  off again or stops calling its command. Both failures are silent by nature — a repository
  that never received a change looks exactly like one that did.
- **Azure DevOps remote verification is outstanding**, as its sync is. An Azure entry in the
  register is reported as unsupported rather than skipped silently.

- `redline sync` — the third of v3's four commands, and the one Phase 0 exists for. A
  standards change now reaches every onboarded repository as a pull request instead of
  waiting for someone to re-run `redline init` there by hand. Targets come from
  `registry.json`; each target's profile and vendors are read from its own `.redline.json`
  live rather than from the register, so a repository that changed since the last nightly
  walk is rendered correctly rather than confidently wrong.
- Three properties sync holds, each of which is a way this could have gone wrong. It seeds
  the render with the target's **current** files, so everything a team wrote above a
  `REDLINE:BEGIN` marker survives — rendering into an empty directory would have produced a
  correct-looking `AGENTS.md` that deleted every repository's own context section at once.
  It **branches from the default branch, never from a stale sync branch**, so an unmerged
  pull request from an older standards version cannot carry its changes forward. And it
  **updates an open sync pull request rather than opening a second**, because a scheduled
  job that opens a new pull request every night is one nobody reads.
- A repository already carrying the current render gets nothing — no branch, no empty pull
  request. One unreachable repository is reported and the rest of the estate still syncs,
  but the run exits non-zero: a distribution that reports success while quietly missing
  repositories is exactly how coverage rots.
- `workflows/redline-sync.yml` is no longer gated off, and `scripts/validate.mjs` fails the
  build if it is gated off again or stops calling the command. The failure it guards is
  silent by nature — the repositories that did not receive a change look exactly like the
  ones that did.
- **Azure DevOps sync is outstanding.** A registered Azure repository is reported as
  unsupported rather than skipped silently, and Phase 0's exit condition is not met until it
  exists. Sync also never merges and never pushes to a default branch: it makes the change
  available, and the dashboard's coverage figure is what makes an ignored one visible.

- Every reference item on the documentation site is its own page, listed in the sidebar under
  its category rather than reachable only through a wall of cards, and each answers the same
  four questions in the same order: how to onboard it, how to use it, what output to expect,
  and how to edit it. The edit loop is derived from the CI steps that actually guard each kind
  of file rather than restated per item, a standard's page shows the output contract filled in
  with one of its own rule ids and its real severity counts, and prev/next now walks items in
  reading order instead of skipping between categories. Templates and workflows gained an
  expected-output field they had no equivalent of — several templates are reference shapes
  that produce nothing at all, which is worth stating rather than leaving to inference.
- Three things the site had no page for: the CLI commands, documented only inside the
  onboarding walkthrough; the 13 seeded corpora that decide whether the reviewer still works;
  and the roadmap, specs and plans under `docs/`. A seed page parses its own markers, so its
  defect table and rule links are the file's current contents rather than a copy that drifts.
  `redline sync` and `redline review` are listed and marked not built — two of the four
  commands v3 fixes the surface at, and whether they exist is a question the docs should
  answer.
- The install page asks the npm registry at build time instead of asserting a version.
  `npx redline-cli init` could not resolve for any reader: the package has never been
  published, and with no `v*` tag the release workflow's own first-release guard refuses to
  publish. Published, unpublished and could-not-check are worded apart deliberately — a
  network blip must not read as a missing release — and the lookup has a timeout, never fails
  a build, and honours `REDLINE_NPM_VERSION` and `REDLINE_NPM_REGISTRY` for an air-gapped
  runner or a private mirror. This also separates the two version lines that were being
  conflated: the npm package version, which `package.json` never carries because
  semantic-release computes it at publish time, and the standards version in
  `standards/manifest.json`, which is what rendered artifacts name.
- CI builds the documentation site. It reads `standards/manifest.json`, the rule catalogue and
  `scripts/lib/rules.mjs` at build time, so a standards change can break it — and nothing in
  CI touched `web/`, so it would have broken silently.
- Two permission tests asserted nothing when the suite runs as root. Both stage an unreadable
  path with `chmod 000` and check the code degrades rather than throwing; root ignores
  permission bits, so the read succeeded, the degradation never happened, and the suite was
  red for a reason unrelated to the code under test. They now probe whether `chmod` can deny
  this process a read at all and skip with that reason when it cannot — verified as a non-root
  user, where both run and pass rather than skipping.

- A register of onboarded repositories exists again, and it is derived rather than
  maintained. `registry.json` is discovered nightly from the `.redline.json` each onboarded
  repository already carries, so an entry exists exactly as long as that file does and a
  repository that removes Redline leaves the register on the next run. Nothing hand-edits it
  and `redline init` does not write it — the previous register, `sync-targets.txt`, was
  appended to by `scripts/setup-repo.sh`, lost its only writer when that script was deleted,
  and then went with it; the dashboard's coverage figure has been absent ever since. The
  dashboard reads the register in its place, and `scripts/validate.mjs` now fails the build if
  either the runner or its workflow goes missing, so the same silent loss cannot repeat.
- The register's schema is deliberately the minimum its consumers need today — host, org,
  repo, default branch, profile, standards and CLI versions, onboarding date. Because it is
  re-derived from scratch on every run, adding a field later costs one nightly walk and no
  migration, so fields are added when a consumer needs them rather than designed ahead.
- Two caveats this does not close. **Azure DevOps discovery is outstanding**: the walk is
  GraphQL and GitHub-only, Azure has no equivalent and needs a per-project repository walk, so
  Phase 0's exit condition — sync working on both hosts — is not met until that exists.
  `RegistryEntry.host` and its optional `project` already carry the Azure shape so the schema
  will not need changing. And `workflows/dashboard.yml` runs in the metrics repo, not this one:
  until `redline sync` can distribute it, restoring the live coverage figure needs that file
  copied across by hand.
- The registry workflow commits to this repository's default branch. That is a deliberate
  exception for a derived artifact in Redline's own repository and not a precedent: Redline
  still never pushes to the default branch of a repository it governs. If this repo is ever
  onboarded to its own ruleset the push is refused and the job fails loudly rather than
  quietly ceasing to refresh.

- A deselection never deletes what an earlier run installed, so the output says what remains
  rather than describing a state the repository is not in. `redline init --skip gate` names the
  workflow still on disk and still firing, and `redline verify`'s `gate-machinery` finding says
  it is still present and what it still publishes instead of "Redline installs none at
  <path>" — a sentence that was false beside an installed gate, and that invited the operator
  to delete it by hand.
- A blocking merge policy Redline applied and then stopped maintaining is named rather than
  passed over. `--skip gate --skip merge-policy` walks past the deadlock guard, which only sees
  a policy the current run would apply, and leaves a live blocking ruleset requiring the
  Redline check. `redline init` says so on that run; `redline verify` reads the policy back for
  exactly that case and reports two different states — while something in the repository still
  publishes the check nothing is blocked and the hazard is named, and once nothing does, every
  pull request is blocked forever and the finding fails.
- `--skip gate` reports `labels` as off with it. The gate install is what creates Redline's
  labels — GitHub pre-declares the gate's soft-fail labels there, Azure creates them on use —
  so with the gate deselected nothing ever creates one. The effective state is what `init` and
  `verify` report, and both say why; `.redline.json` keeps the operator's own choice, so
  re-selecting the gate brings the labels back without a second flag.
- Per-capability selection at onboarding. `redline init --skip <list>` deselects a capability
  the repository already has its own answer for — `gate`, `merge-policy`, `labels`,
  `review-ownership` — and `--with <list>` selects one again. A deselected capability is not
  attempted, not written and not reported by `redline verify` as missing: `verify` gains a
  `capabilities` finding naming the whole selection, and the checks a deselection governs
  (`merge-policy`, `gate-machinery`, `pull-request-template`, `check-name-reported`) say
  `off by choice` instead of failing, so a reader can tell "off because we chose to" from "off
  because it broke". The selection is recorded in `.redline.json` under `capabilities` and
  survives a re-run; flag precedence is the existing rule — a typed flag overrides the record,
  an omitted flag keeps it. A config written before the field reads back with everything
  selected, and only an explicit `false` deselects, so neither a missing key nor a mistyped one
  is a way to fall below the standard. `review-ownership` maps onto the
  `menu.sensitivePathReviewers` key that was already exactly that switch rather than growing a
  second one to disagree with it.
- **The security floor is not optional.** Secret scanning, push protection and dependency
  alerts are the organisation-wide minimum, and unlike a gate pipeline or a branch policy there
  is no "we already have our own" to respect — they are additive host settings that displace
  nothing. `--skip security-floor` is refused by name with an exit 2 saying why, rather than
  recorded or quietly ignored, so an operator can never come away believing they opted out of
  it.
- `--skip gate` with a blocking merge policy is refused before any host call or write: with no
  gate machinery nothing in the repository publishes the check a blocking policy requires, and
  the result would block every pull request in the repository forever. The refusal names
  `--skip merge-policy` as the way a repository keeps both its own gate and its own policy.
- `redline init` now says what else is already in the directory this host runs pipelines from,
  before it installs its own gate there, and offers `--skip gate` — and the refusal both
  adapters raise over a gate machinery file they cannot attribute to Redline now offers
  `--skip gate` alongside `--adopt-caller`. Detection informs the operator; it does not decide
  for them, and it is only offered while Redline's own gate is still absent.
- `.redline.json` records a content identifier for each command file Redline owns whole, and a
  later run recognises its own earlier output by that identifier rather than by recomputing
  what it would write there now. This closes the residual left by the previous fix: the
  byte-exact match against the installed CLI's command text stops recognising a repository the
  moment `commands/<name>.md`'s body or description changes here, and that repository then
  takes the merge path and gets its prompt appended to itself. The byte-exact match remains as
  the fallback for repositories onboarded before the field existed. A file Redline merely
  merged its block into is never given an identifier — recording one for a human's file is how
  a later run would come to overwrite it — and gaining the field is not by itself work to do,
  so a settled repository is not given a pull request just to record a hash.

- Repository-local rules that Redline renders and never overwrites. A repository can now
  state a rule that *overrides* an org rule by writing `.redline/local.md`. Redline reads that
  file, renders it into every enabled vendor's artifact **inside** the
  `REDLINE:BEGIN`…`REDLINE:END` block under a `# Repository-local rules` heading that states
  the precedence in words the tool acts on — the repository's own rules win where they
  conflict with the org standard — and never writes, rewrites or prunes the file itself, on
  any path including a vendor deselect. Landing inside the block is the whole point: an edit a
  human makes to the block does not survive the next render, and this does. The section is
  absent entirely when the file is missing or empty — no heading, no placeholder — and
  deleting the file removes the section on the next render while leaving the rest of the block
  byte-identical. Nothing in the file can fail a run: a `REDLINE` marker line in it is escaped
  to the characters it renders as, and content that `cli/render/markers.ts` cannot read a block
  back through (an unclosed code fence, which would swallow the `END` marker) is quoted rather
  than refused — a human's file is not Redline's to validate. Readability is asked of
  `markers.ts` itself, not of a second parser. `.redline.json` records `localRules`, whether
  the file was present at the last run, so `redline verify` can tell "never had one" from "had
  one and it went away"; a config written before the field reads back as `false`.
  `redline verify` reports a changed local file as work to do rather than as drift the
  repository is failing at — `artifacts-current` stays green and names `.redline/local.md` and
  the re-run that folds it in. The excuse is bounded three ways, because an unbounded one is a
  drift bypass in the oversight product itself: it is per-path (only the four artifacts the
  section is actually rendered into can be explained by it — a hand-edited
  `.github/instructions/redline-*.instructions.md` can never carry the section and is drift),
  it must account for the *whole* stale set, and a stale removal is never explained by a rules
  file at all. A hand edit to an artifact that already carries the current section is still
  drift.
- Closed the command-file clobber. `cli/render/commands.ts` writes
  `.github/prompts/<name>.prompt.md`, `.claude/commands/<name>.md`,
  `.opencode/command/<name>.md` and `.cursor/commands/<name>.md`, where `<name>` is only the
  filename in `commands/` — nothing reserves that name in a consumer repository, so adding
  `commands/review-pr.md` here would have silently overwritten a team's own
  `.claude/commands/review-pr.md` in every onboarded repository. Today's two command files
  happen to be `redline-`-prefixed, so this was latent rather than live. Redline now merges its
  block into whatever is already at the path, reusing `wrapBlock`/`stripBlock` rather than a
  second merge implementation, and creates the file only when nothing is there. A
  `.claude/commands/<name>.md` is a single prompt body, so `/<name>` on a file a team already
  owned now runs both texts concatenated; that is the accepted cost of not destroying their
  prompt, and the markers are what keep Redline's half removable and re-renderable. The
  frontmatter header stays outside the block, because the tools that read these files parse it
  at byte zero; a file whose only content outside the block is that header is one Redline
  created, so its `description:` still tracks `commands/<name>.md`, while a header or any prose
  a human wrote is never rewritten: the header carries a `# Managed by Redline` line and that
  line, not the shape of the frontmatter, is what attributes it — a team's own command file can
  carry an identical lone `description:` key, so shape was an indeterminate read and claimed
  their bytes. A marker-less file that is byte-for-byte what the previous CLI rendered at that
  path is Redline's own earlier output and is replaced rather than appended to; without that,
  the first upgraded `redline init` in every already-onboarded repository would have appended a
  block carrying the same body and made `/<name>` run the prompt twice. Deselecting a command
  host now takes Redline's block back out — deleting a file that was only ever Redline's, and
  otherwise returning the repository's own bytes plus at most the single newline `wrapBlock`
  inserted as the block's paragraph separator, which is indistinguishable on disk from one the
  human typed and is the same documented non-inverse `stripBlock` already carries for the
  shared artifacts (a file that already ended in a blank line round-trips exactly). A file
  carrying no Redline block anywhere is never touched.
- The gate machinery files get the opposite treatment, deliberately: appending a marker block
  to YAML gives the file a second `name:`/`on:` (or `trigger:`/`steps:`) key and it stops
  running at all, so there the only honest answers are "replace Redline's own file" and "stop".
  Both adapters now refuse rather than clobber — `.github/workflows/redline.yml` and
  `.azuredevops/redline-gate.yml`, in the plan phase as well as the real run, so `--dry-run`
  cannot promise a write the run would refuse. The refusal also fires **before** the render:
  `redline init` plans the host file diffs ahead of writing a single vendor artifact or command
  file, so its "Nothing was written" is true rather than leaving a half-onboarded tree behind.
  Attribution is positive, not a substring match: a `# Managed by Redline` line (now carried by
  both templates), the reusable-workflow reference every v3 caller has, or Azure's own
  `ADR_DIFF_THRESHOLD` variable block. A workflow that merely mentions Redline — a repository's
  own `Redline lint` job at that path — is a repository's file and is refused. A Redline 2.1
  caller carries none of those and cannot be told apart from such a file by guessing, so it too
  is refused, and `redline init --adopt-caller` is the human decision that hands the path to
  Redline; the refusal names the flag.

- Final whole-branch review fixes. **`redline init` now converges whenever a security
  capability's write answer and its read answer disagree.** `pendingAdmin` records exactly one
  fact — a write `redline init` attempted was refused — and the settled path used to revise that
  record from `readSecurityState`, which answers a different question ("is the setting on?"). The
  two chased each other: the read cleared the entry, the refused write re-recorded it, and every
  run re-applied all four host mutations and pushed another commit onto the onboarding pull
  request, exiting `0` throughout, while `redline verify` told the operator to re-run. Reachable
  on both hosts — a fine-grained GitHub token with `administration: read` reads
  `GET /vulnerability-alerts` as 204 while `PUT /automated-security-fixes` answers 403; an Azure
  PAT with `vso.advsec` but no Project Administrator role reads `advSecEnabled: true` while the
  `PATCH` is refused, oscillating all three capabilities at once. No read now revises the record,
  for any capability, so the security three carry the same standing cost `merge-policy` and the
  four write-only capabilities already carried, and `redline init --repair` is the one sanctioned
  way to clear a recorded refusal. The comment that claimed `dependency-alerts` is never read back
  — the false premise the settled path's whole safety argument rested on — is corrected; both
  adapters emit it from `readSecurityState`. The settled path is one host GET lighter as a result.
- `redline verify`'s `pending-admin` finding no longer contradicts its own `security-floor`
  finding. `unsupported` and `unknown` are both "not answered" but need different *advice*, not
  just different wording: `unsupported` is definite (the feature is not licensed here, so no
  administrator action would ever clear it), while `unknown` only means the token could not see
  the setting — an administrator enabling it is exactly what clears it. On one repository state
  (`pendingAdmin: ["secret-scanning"]` plus a token that cannot see `security_and_analysis`)
  `security-floor` said "not visible to this token" while `pending-admin` said "no administrator
  action would clear it". They are now separate clauses with separate remedies.
- Azure gained GitHub's rejected-payload guard. A 400 from
  `POST/PUT _apis/policy/configurations` — Azure rejecting the Redline branch-policy payload —
  used to fold into `outcome()` as `merge-policy: denied`, printing "an administrator must still
  enable: merge-policy" and exiting `0`: a Redline defect misdiagnosed as a missing permission.
  It now throws `RedlineError('host', …)` naming the method and path, exactly as
  `cli/platforms/github/install.ts` does for a 422 on the ruleset write.
- Two untested behaviours pinned. The `notEnforcedReason` consumer in `cli/commands/verify.ts`
  had a tested producer and no test at all on the consumer side: a GitHub ruleset switched from
  `enforcement: "active"` to `"evaluate"` keeps every field readable while none of its rules
  apply, and deleting the consumer left the suite green. The rendered command files
  (`cli/render/commands.ts`) — written into every onboarded repository — had their paths,
  frontmatter prefixes and cross-host body equality asserted but never their bytes, so a changed
  trailing shape broke nothing. Both are now killed by a test.
- `renderCommands` is held to the org vendor ceiling `render()` already enforced. With
  `standards/manifest.json` as it stands (`cursor.enabled: false`), `redline init --vendors
  copilot,cursor` correctly skipped `.cursor/rules/` and still wrote `.cursor/commands/
  redline-{init,verify}.md`, delivering half of a vendor the org had switched off. The ceiling is
  applied at the call site rather than inside `renderCommands`, because `COMMAND_HOSTS` carries
  hosts the vendor manifest has no entry for at all (`opencode`) — which is not the same thing as
  a vendor the org disabled.
- Per-repository vendor selection. `redline init` used to render every org-enabled vendor
  (`standards/manifest.json` → `copilot`, `agents`, `claude`) into every repository, so a
  Copilot-only team was handed `AGENTS.md` and `CLAUDE.md` it never asked for. It now
  detects a default from what the repository already contains (`.github/copilot-instructions.md`
  or `.github/instructions/` → copilot; `CLAUDE.md` or `.claude/` → claude; `AGENTS.md` →
  agents; `.cursor/rules/` → cursor; none of them → the org default), a repository's
  recorded `.redline.json` selection overrides detection on a re-run, and a typed
  `--vendors copilot,agents` overrides both. `render()` (`cli/render/standards.ts`) enforces
  the org manifest as a ceiling on every call it makes, including `redline verify`'s: a
  repository may select a subset of what the org enables, never a superset, and a vendor the
  org later disables stops rendering regardless of what was recorded — a stale selection
  cannot resurrect it. Deselecting a vendor removes exactly what it wrote: a `redline-`-owned
  file is deleted outright (reusing the existing prune machinery, now run for every vendor
  rather than only the currently-selected ones, so a vendor dropped entirely is cleaned up
  too, not just a stack dropped within one still selected); a shared `merge: true` file
  (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`) has only its
  `REDLINE:BEGIN`…`REDLINE:END` block cut out, reusing `cli/render/markers.ts`'s `findBlock`
  rather than a second marker parser, and is deleted only when nothing but whitespace remains —
  a file carrying the team's own content keeps it byte-identical, mirroring `wrapBlock`'s own
  contract on the append path: the bytes outside the block are never trimmed or reformatted,
  and the only newline ever removed is the block's own trailing one. The removal rides out
  through the existing rendered-file diffing,
  so it lands in a pull request like any other change and prints as a removal, not a write,
  under `--dry-run`. A vendor selection change that has nothing left on disk to remove no
  longer reads as "nothing to change" on a settled repository — the same failure mode a menu
  change already had to be guarded against. `cli/render/__tests__/vendors.test.ts` now pins,
  at the source, the CLI constants `web/components/journey.tsx` hardcodes with source
  comments because its `.ts` specifiers do not resolve through Next's bundler: exactly which
  vendors render `merge: true`, that `PROFILE` stays a profile the manifest can resolve, and
  the literal values of `GATE_CHECK`, `ONBOARD_BRANCH` and `SYNC_LABEL` (newly exported from
  `cli/commands/init.ts`, replacing a duplicated literal) — so a fourth merged vendor, an
  unresolvable profile, or a changed literal fails CI instead of silently falsifying the page.
- The value-case card's "With Redline" column — proof chips, column header, per-row
  tag — now carries a restrained green accent instead of reading identically to the
  "Today" column. New `--ok-ink`/`--ok-line`/`--ok-bg` tokens carry it, defined in both
  `:root` and `[data-theme="light"]`: `--green` (`#45de83`) is not reused directly, since
  it is tuned for the dark surfaces `.tk-green` and `.gate-check .st.ok` never leave, and
  reads too pale once the light theme puts a chip on a light background. Chip text holds
  9.2:1 on the dark surface and 5.6:1 on the light one.
- `CapabilityOutcome` gained a fourth status, `unknown`, closing the Azure half of a defect
  fixed for GitHub earlier: Azure's Advanced Security enablement read mapped a 401/403 to
  `denied`, so a token that could WRITE the setting but not READ it back made a re-run
  overwrite a correct `.redline.json` with a false `pendingAdmin` list, open a pull request,
  and exit 0. It now maps to `unknown` — Azure DevOps does not document this endpoint telling
  "you cannot see this" apart from a genuine refusal — and `isPending` treats it exactly like
  `unsupported`: never entering `pendingAdmin`, never clearing an entry already recorded
  there. The same audit on GitHub found its own `unsupported` mappings (an invisible
  `security_and_analysis` block, a 403 on `vulnerability-alerts`) were the same indeterminate
  case wearing the wrong label — genuinely unlicensed and merely unobserved used to share one
  status — so both now read as `unknown` too, and `unsupported` is reserved for a definite
  "this does not exist here" (only Azure's Advanced Security-unlicensed 404 has one today).
  `redline verify`'s `security-floor` finding splits accordingly: an `unknown` capability still
  fails a plain run and reports without failing under `--gate`, exactly as `unsupported` used
  to; a genuinely `unsupported` one — no administrator remedy exists, so failing it forever was
  the bug — now passes a plain run outright. The pull-request-template candidate-folder order,
  previously three private copies in both `install.ts` files and
  `cli/platforms/pull-request-templates.ts`, now has one source; only the order moved, not the
  per-adapter discovery or merge logic.
- Stack detection scans breadth-first, so root-level manifests (`go.mod`, `pom.xml`)
  are always seen even when one large subtree alone exceeds the 5000-file scan budget.
  `.xcodeproj` directories are now emitted as path markers, so an Xcode project without
  Swift sources is detected as `mobile-ios`.
- The HTTP transport no longer retries a `POST` on a 5xx response: the request may
  already have committed on the host, and a retry could open a duplicate pull request
  or policy. 429 responses retry for every method; 5xx retries are limited to
  idempotent methods (GET, PUT, PATCH, DELETE, HEAD).
- Release flow hardened. `semantic-release` is pinned exactly (25.0.9) in
  `devDependencies`, so the publish job runs the lockfile-resolved version instead of
  whatever `npx --yes` fetches that day. The release job now fails loudly if no `v*`
  tag exists — the history must be seeded with `v0.0.0` once so the first computed
  release is 0.0.1 rather than semantic-release's default 1.0.0 — and prints the exact
  seed command. Same-repo
  pull requests run `semantic-release --dry-run` with no secrets in the job: because
  semantic-release exits early on PR context before verifying credentials, this proves
  the pinned toolchain resolves from the lockfile, no more (fork PRs are skipped
  entirely). The full publish path is rehearsed by a manual `workflow_dispatch` that
  publishes a throwaway build to the npm `canary` dist-tag without moving `latest`.
  The two version axes (CLI vs standards) are now documented in the README.
- GitHub admin **write** endpoints (repo PATCH, ruleset create/update,
  vulnerability-alerts, automated-security-fixes) now report a 404 as `denied`, so it
  reaches the pending-admin list — fine-grained tokens without the administration scope
  get 404, not 403, on a repository they can otherwise read. Read endpoints keep
  404 = unsupported.
- A 422 from the ruleset create/update now fails loudly as a host error naming the
  endpoint, instead of leaving the repository silently policy-less with exit 0.
- `redline init` is now safe on a brownfield working tree. It refuses to run (exit 2,
  with a hint) when the git index already has staged changes, because the onboarding
  commit would sweep them into the Redline PR. A successful run — and a failed one —
  returns the operator to the branch they started on instead of leaving them on
  `redline/onboard`. "Nothing to commit" is reported as an already-onboarded no-op
  instead of exiting 1. A non-fast-forward push (a previous partial run left a stale
  `redline/onboard` on origin) now says exactly that, with the delete-or-merge fix,
  instead of misdiagnosing it as missing push access. A repository with no `origin`
  remote gets the friendly "add one with: git remote add origin <url>" usage error
  instead of "redline failed unexpectedly".
- A 401/403 while resolving the repository (both GitHub and Azure DevOps) now exits 3
  (permission, with a token hint) instead of 4 (host), so CI can tell "token lacks
  scope" from "the host is down".
- The Azure merge gate now actually runs. Azure Repos ignores YAML `pr:` triggers (a
  GitHub-only feature), so writing `.azuredevops/redline-gate.yml` alone ran nothing
  and, with `--blocking`, the required `redline/gate` status would have blocked every
  pull request forever. `redline init` on Azure DevOps now creates two more host
  objects: a `redline-gate` build definition pointing at the gate YAML (an existing
  definition matching that name and YAML file is reused; one with the same name but a
  different YAML file is human-owned — reported and left untouched), and a
  "Redline: gate build" Build Validation branch policy on the default branch that
  queues the pipeline on every pull request. Build policies without the `Redline:`
  displayName marker are never written to. Without Build Administrator rights the
  registration degrades to a pending `gate` capability instead of failing the run —
  and the `redline/gate` Status policy is then written advisory, never blocking, since
  no pipeline could publish the status it would require. The dead `pr:` block is
  removed from the gate template, and `redline verify` now reads the Build Validation
  policy back as part of the gate check: required checks are derived only from a
  blocking Status policy, and the gate only counts as blocking when the Build
  Validation policy exists.
  Gate definitions are registered in their own `\Redline` pipeline folder, and a
  definition is only ever reused when its folder, name, YAML file *and* repository all
  match: build-definition names are unique per folder but the lookup filter is
  project-wide, so without this a second repository in the same project would have
  adopted the first repository's `redline-gate` definition and pointed its Build
  Validation policy at a pipeline building the wrong repository. A same-named
  definition bound to another repository is reported and left untouched.
  Two more ways the gate can fail to run are now handled without leaving a repository
  requiring a status nothing publishes: a rejected Build Validation policy write (the
  policy is written before the Status policy, and the Status policy then goes out
  advisory), and a token that cannot read build definitions on a re-run — an existing
  `Redline: gate build` policy keeps the gate blocking instead of silently downgrading
  an enforcing repository to advisory. When a blocking Status policy has no Build
  Validation policy behind it, `redline verify` now names that as the cause in the
  merge-policy finding rather than only reporting the gate as advisory.
- The web home page gained a value-visualization block after the hero: the
  onboarding mechanism (repo → `init` → floor installed → every PR checked → drift
  caught) plus a severity split of the rule catalogue and a stat strip. All numbers
  are loaded from `standards/` at build time via `web/lib` — the hardcoded stats-band
  counts were rewired to the same loaders, so they can no longer drift. The seeded-findings
  tile is counted from `seeded/` using the marker convention `scripts/score-seeds.mjs`
  parses (it read 105; the corpus holds 106), and the `100%` tile now says on its face that
  it is the target the corpus is scored against, not a measurement.
- The web home page now states the value proposition it was missing, in a section after
  the mechanism block: four problem/answer pairs (the rules never reach the AI writing
  the code; every reviewer draws the line somewhere else; a check gets switched off and
  forgotten; a standard nobody can revise is one nobody follows), each with what it costs
  today and what Redline changes. The argument is made from mechanism and real counts
  only: every figure on it (rule sets, project types, AI-tool formats, severity levels,
  rule and id totals, standards version) is read from `standards/` at build time through
  `web/lib/manifest.ts` and `web/lib/rules.ts`. No time-saved, defect-reduction or
  adoption figure appears, because Phase 1 ships no telemetry to support one.
- Azure DevOps onboarding is now brownfield-safe and at parity with the GitHub gate.
  Branch policies are matched by ownership, not by type: every policy Redline writes
  carries a `Redline:` `displayName` marker (the `redline/gate` genre/name pair serves
  the same purpose for the Status policy), and a policy of the same type without one is
  a human's — it is reported and left untouched, never PUT over. Matching also honours
  the scope's `refName`, so a `Redline:`-marked policy an operator scoped to a release
  branch is no longer adopted by the default-branch write and silently rescoped. Where
  Azure models a control as one setting per branch (minimum reviewers, comment
  resolution) Redline adds nothing beside a human's policy; where Azure runs several
  side by side (Status, Build Validation) it installs its own and leaves the neighbours
  alone. An `already` outcome — a settled branch — no longer reads as failure and zeroes
  the policy the run reports.
  The onboarding pull request now actually gets its `redline-sync` label (Azure has no
  label field on the create call, so it is a second request); a refused label degrades
  into a `labels` outcome instead of costing the pull request. The gate template gained
  the soft-fail escape hatch GitHub already had: it reads the pull request's labels and,
  when one is in `SOFT_FAIL_LABELS`, publishes `redline/gate` as succeeded with a warning
  instead of blocking — one-way, and with the access token still off argv. The template's
  `redline-cli@latest` is pinned to the installing CLI's version at write time, so an npm
  publish can no longer change gate behaviour across the org without a pull request
  anywhere; an unpublished `0.0.0-development` build keeps `@latest`, since that version
  does not exist on the registry.
- The site's home page now leads with the product instead of a caveat. The fold carries
  the headline, one sentence, `No servers. No SaaS. No per-seat fee.` on its own strip,
  the two commands a reader should remember (`npm i -g redline-cli`, then `redline init`,
  each with its own copy button) and a live proof rail; the roadmap disclaimer it used to
  contain moved to a "what is not built yet" note beside the feature grid, where it now
  also names the missing `redline sync`. A new before → command → after section replays a
  real onboarding: every terminal line and file name in it is a literal string from
  `cli/core/log.ts`, `cli/bin/redline.ts`, `cli/render/vendors.ts`, `cli/render/commands.ts`,
  `cli/commands/init.ts`, `cli/commands/verify.ts` and `cli/platforms/github/install.ts`,
  and the rendered artifact list is derived from `standards/manifest.json` at build time.
  The transcript is real text in the server-rendered HTML — the replay is an enhancement
  that never gates reading it, and `prefers-reduced-motion` gets it whole and static.
  The value section was tightened (column headers replace the badge repeated on every row,
  row 01 leads, fact strips fill their width), and its fourth claim was corrected: it said
  every repository using Redline gets a pull request when a standard changes, which is
  Phase 3 work — it now says a repository picks the change up the next time someone runs
  `redline init` there. "Count which ones keep firing" lost its implied built-in report.
- `redline init` is now honest about a re-run. The menu is resolved as defaults ← what
  `.redline.json` already recorded ← only the flags the operator actually typed, so a
  plain `redline init` on a repository onboarded with `--blocking` no longer demotes its
  live ruleset back to advisory while the config still claims blocking (the same reset
  hit `--no-a11y` and `--speckit`). The whole file diff — rendered standards, command
  files, the gate workflow and CODEOWNERS — is now computed *before* the first host
  mutation, so a settled repository re-run changes zero repository settings instead of
  rewriting four of them to discover it had nothing to do. Conversely, a repair (someone deleted
  CODEOWNERS or the gate workflow) and a CLI-version bump that repins the gate template
  now open a pull request instead of reporting "already onboarded — nothing to change"
  and leaving a modified tracked file behind: `installGate` and `ensureReviewOwnership`
  compare content before writing and report only the files that actually changed, and a
  menu change alone is a real run.
- "Settled" is now decided against the host, not only against the working tree. When a run
  has no file and no menu change of its own, the plan phase makes two reads — the merge
  policy and the security state — and no writes; a run that already has work to do makes
  neither, so a read-side outage cannot abort it. A ruleset an administrator loosened or
  deleted by hand no longer reads as "already onboarded — nothing to change" from
  `redline init` *or* from `redline init --blocking` (the recorded menu already said
  blocking, so nothing looked changed); it is re-applied. The only recovery that used to
  exist was deleting `.redline.json`, which destroys `onboardedAt`, silently reverts every
  unrecorded menu selection, and makes the next run look like a 2.1 migration.
  `redline verify` also names the capability and the command that actually clears it:
  "<capability> now granted on the host, but the record is of a refused write and no read
  clears it — run `redline init --repair` to retry the write". A plain re-run deliberately
  does not revise a recorded pending entry in either direction, so `--repair` is the true
  instruction and the one every clause gives. Where the re-run does short-circuit, the
  pending-admin line is marked "(as recorded at the last run)" rather than asserted as this
  run's finding.
- A read only changes what `.redline.json` records about a capability when it says
  something definite about that capability. Two consequences. `redline init` on a
  repository onboarded *without* repository-admin rights — the normal partial-permission
  path — now converges: the refused ruleset it never created reads back as absent, which
  is the recorded state rather than drift, so the re-run settles instead of rewriting four
  host settings, and from the second re-run a non-fast-forward push to `redline/onboard`
  no longer made `redline init` exit 1 forever. And GitHub omits `security_and_analysis`
  entirely for a requester without admin permission, which was being read as "both
  capabilities are off": a write-but-not-admin re-run overwrote a correct `.redline.json`
  with a false `pendingAdmin` list and opened a pull request, exiting 0. An absent block is
  now reported `unsupported` — "not visible to this token" — which neither files
  pending-admin work nor clears what is already recorded. A block that is present and not
  enabled is still `denied`.
- Nothing reads back whether this token may *write* the merge policy, so a recorded
  `merge-policy` refusal is never cleared by a read. `GET /rulesets` proves a ruleset
  exists; `PUT /rulesets/{id}` is the admin call that gets refused, and the two come apart
  for exactly the write-but-not-admin token above — on a repository whose ruleset an
  administrator had already created, the plan phase cleared the entry and the refused
  write re-recorded it on every run, so it never settled and `redline init` exited 1 from
  the second re-run onward. The entry now persists, like `labels`, `review-ownership`,
  `repo-property`, `gate` and `dependency-alerts`, and the already-onboarded output marks
  the list "(as recorded at the last run)". A ruleset that is absent where the record says
  it was applied, or that does not match the requested menu, is still drift and is still
  re-applied — which is also what clears the entry once an administrator grants the rights.
- `redline verify` no longer reports "security floor enabled" for a token that cannot see
  the setting. The finding has three states — enabled, disabled, and not confirmed, the
  last naming the capabilities nobody observed (GitHub omits the block for a non-admin
  token; Azure returns 404 where Advanced Security is unlicensed). Plain `redline verify`
  fails on it: an operator asking whether the floor is on must not be told yes on no
  evidence. `redline verify --gate` reports it without failing, because that flag's only
  caller is the Azure gate template, whose step runs as the build service identity — not a
  repository administrator, so the Advanced Security enablement endpoint is routinely
  invisible to it — and a gate that always fails is a gate nobody keeps. A capability that
  is present and off still fails in both modes.
- `redline verify` no longer fails a healthy repository for four different reasons.
  - A required check missing from a pull request the gate never ran on is reported as "no
    gate run observed yet", not as a broken contract: the host is asked about the newest
    pull request of any state, which is routinely one that predates the gate. The failing
    finding now needs a gate run to have published *something* on that head commit, and it
    only claims every pull request is blocked when the policy actually blocks.
  - Stale rendered artifacts are split by version. Where the installed CLI's standards
    version differs from the one `.redline.json` records, the finding reports "standards
    updated upstream (vX → vY) — re-run redline init to adopt" and does not fail; adopting
    a release is `init`'s job. A CLI pinned to an *older* standards version than the
    repository recorded is told so instead, rather than sent to re-render the repository
    backwards. Where the versions match, staleness is local drift and still fails. Publishing standards used to fail `verify` in every onboarded repository at once
    and, through the Azure gate, on every open pull request.
  - The merge-policy finding now compares the approvals count, code-owner review and thread
    resolution as well as the blocking flag, so an administrator loosening the review
    requirements is caught. Approvals are a floor, not an equality: a team requiring three
    is stricter, not drifted. A host that cannot attribute a setting to Redline names it
    (Azure applies no code-owner requirement at all, and backs off a reviewer or comment
    policy a human already owns) and `verify` reports those without comparing them.
  - The pending-admin finding scopes "an administrator must still enable" to the
    capabilities a read can actually answer, and lists the rest as "recorded as pending;
    not verifiable with this token".
- `redline verify` now observes the pull request template the host would actually serve,
  which nothing checked before: a deleted template, one whose `REDLINE:BEGIN`/`REDLINE:END`
  pair a human half-edited (which `redline init` refuses to write to), and an Azure
  branch-specific template added after onboarding are all failing findings. A marker-less
  template that answers the gate on its own is reported and left alone, because that is
  exactly what `init` does with it.
- `redline verify` observes the gate machinery itself, as a `gate-machinery` finding read from
  the local checkout. Deleting `.github/workflows/redline.yml` (or `.azuredevops/redline-gate.yml`),
  or renaming the caller job `templates/redline.yml` warns not to rename, leaves a blocking
  repository where no pull request can ever satisfy the required check — and nothing observed
  it, because `render()` covers only rendered standards artifacts. It now fails, which is also
  what makes the softened "no gate run observed yet" report safe: that path may only mean the
  gate has not run yet once the machinery that would run it is known to be in place.
- Three inputs `gate-machinery` and `merge-policy` still reported as fully green are now caught.
  An Azure blocking Status policy with no Build Validation policy to queue the pipeline fails
  `merge-policy` instead of passing while its own detail said "every pull request will sit
  blocked". The GitHub caller-job scan now anchors on the `jobs:` block structurally instead of
  taking the last two-space key seen anywhere in the file, so an inline comment, a quoted or
  differently-indented job id, or a YAML anchor on the job-id line no longer falls through to a
  key from the `on:` block and names a job that does not exist; where the scan genuinely cannot
  attribute a job id it now reports the file as unparseable rather than fabricating one. And a
  caller workflow present and correctly named but with its `pull_request` trigger removed no
  longer reports healthy — nothing can ever publish the check, so `gate-machinery` fails rather
  than telling the operator to go open a pull request. A `gate-machinery` mismatch is now three
  distinct messages (renamed job, policy no longer requiring the gate, file unreadable) instead
  of one that told a correctly-named repository to "rename the job back".
- `redline verify`'s `merge-policy` finding also catches a GitHub ruleset switched out of
  `active` enforcement — the cheapest loosening on that host, and one every field this CLI
  reads back survives unchanged — and an approvals policy that no longer dismisses stale
  approvals on push. On Azure, a Redline-owned reviewer or comment policy that has been
  DELETED is drift and fails; one a human owned all along is still reported without being
  compared. The difference is whether a policy of that type is present but unmarked (a human's,
  which `init` deliberately backed off from) or absent altogether (Redline's, removed).
- `pending-admin` no longer files capabilities nobody can act on as work for an administrator.
  A capability the host reported as unavailable — Advanced Security on an unlicensed Azure
  tenant — and one nothing reads back at all are each named in their own clause, and only a
  capability a read answered with "off" is listed as work to chase. Under `--gate`, which runs
  as a build service identity that can enable nothing, only that actionable list fails; plain
  `redline verify` still fails on any recorded entry, because an operator asking whether
  onboarding finished must be told no.
- `readSecurityState` covers dependency alerts on both hosts — GitHub through
  `GET /repos/{o}/{r}/vulnerability-alerts` (204 enabled, 404 disabled, 403 unobserved),
  Azure off the same Advanced Security flag its install writes — so the capability can be
  observed to be off, and a `dependency-alerts` entry recorded in `.redline.json` can be
  answered rather than persisting forever.
- `redline init --dry-run` prints the plan — the files it would write, the files it would
  remove, the repository settings it would change and the resolved menu — and exits 0
  having written nothing, contacted no host and required no credential. The repository
  identity it plans against is derived from the git remote and the local clone, not from a
  live read, and the host client is built lazily so the token is never resolved on this
  path: the most useful moment for a preview is before anyone has gone and got an
  admin-scoped PAT. Every other command, and a non-dry-run `init`, still resolves the
  credential up front in `resolvePlatform` and still exits 3 there with the same message.
  Deletions print as `would remove`, not as writes.
  `--no-a11y` and `--speckit` now say in the usage text what they
  really do: they are recorded in `.redline.json` for later phases and change nothing in
  Phase 1. `accessibility` defaults from the resolved stacks rather than being `true`
  everywhere, so a Terraform or Go repository no longer records a commitment to rules that
  are never rendered there.
- `.redline.json` gained `lastRunAt`, and `onboardedAt` now records when the repository
  joined rather than being overwritten on every run. A config written before `lastRunAt`
  existed still parses; the field reads back as `onboardedAt`.
- A pull request that cannot be opened after the host settings and `.redline.json` are
  already written is now reported instead of thrown: the CLI names the cause and says the
  changes are on the `redline/onboard` branch, to push it if it is not already on origin
  and open the pull request by hand, and exits 1 (`failed`) rather than 4. The hint does
  not claim the push succeeded, because the same wrap also catches a git step that failed
  before it. The onboarded state is still recorded, because the host
  mutations really happened. A dirty git index still refuses up front with exit 2.
- Migrating a 2.1 repository now stages the removal of what 2.1 left behind that v3 does
  not write — `.github/workflows/redline-sync.yml` and `scripts/redline-*.sh` — into the
  same pull request, so a 2.1 sync workflow cannot keep running against a repository that
  has moved on. Two guards keep that from destroying a human's files: the 2.1 marker
  (`.github/workflows/redline.yml`) is a path v3 writes too, so a repository is only
  treated as a migration when that file is *not* v3's own caller — otherwise a v3
  repository whose `.redline.json` was deleted would have its scripts removed — and
  `scripts/redline-*.sh` is a glob, so a script is only deleted when its content carries
  a Redline ownership marker. A hand-written `scripts/redline-deploy.sh` is left alone.
- Azure branch-policy scope matching lowercases `matchKind` before comparing: Azure echoes
  it back with the casing the object was created with, so a human's `refs/heads/`-prefix
  policy created in the portal comes back as `Prefix`, was not recognised as covering the
  default branch, and got a second Redline policy stacked beside it.
- The home page's before/after demo now explains what the run does to a repository that
  already has files. The after-band names each written path by what happens to it:
  `CLAUDE.md`, `AGENTS.md` and `.github/copilot-instructions.md` are merged (Redline owns
  only the span between its `REDLINE:BEGIN`/`END` markers, the rest of the file is kept);
  `.github/pull_request_template.md` is merged the same way, into the first template the
  host would resolve, with a template that already carries its own `## Launch readiness`
  section left untouched; the generated artifacts and `.github/workflows/redline.yml` are
  Redline's own and rewritten whole; `.github/CODEOWNERS` is seeded only when the
  repository has none. `.redline.json` is described as the record `redline verify` reads
  back, and the installed slash commands are listed with the descriptions parsed out of
  `commands/` at build time — which now fails the build rather than rendering a heading
  over an empty list. The transcript's `write` prefix is re-derived from
  `cli/bin/redline.ts:130`: `write ` is padded to the width of `remove`, so three spaces
  separate it from the path, not two, and 13 of the 33 transcript lines were previously
  one space short of what the CLI prints. The file lists in the after-band are derived
  from the same arrays the transcript is built from rather than written as `redline-*`
  globs the renderer does not enforce. Also: the lead no longer claims every transcript
  line is CLI output (one is a `#` annotation, now named), the honesty caveat moved off
  `--faint` onto `--muted` so it passes AA in both themes, and the hero proof rail reads
  `manifest.version` instead of a hardcoded site constant that could drift from it.
  Re-derived against the current CLI after the pull-request-template and verify work
  landed: the transcript gained the `gate` capability outcome `installGate` now returns
  second, and `redline verify`'s findings gained `gate-machinery` and
  `pull-request-template` and a rewritten `merge-policy` detail — eight findings, two of
  which read the local checkout rather than the host. The template row says what the
  code does now (only the gated sections the template does not already answer, and a
  template that answers both left untouched), and the merged row names the refusal path
  `wrapBlock` grew for a malformed marker pair. `web/app/page.tsx` declares
  `dynamic = "force-static"` so the page's build-time throws stay build-time.
- A repository's own pull request template is no longer destroyed. `installGate` wrote
  `.github/pull_request_template.md` / `.azuredevops/pull_request_template.md` through a
  plain content compare, so the first `redline init` on a repository that already had a
  template silently replaced it — the last host-writing path in either adapter with no
  coexistence guard. Leaving it untouched is not the fix either: `redline-gate` fails any
  pull request whose body has no `## Launch readiness` section, so an untouched template
  would block the repository's own pull requests. Now: with no template present the
  packaged one is written whole, as before; with a template present the file is kept
  byte for byte and only the gated sections (`## Launch readiness`, which the `checklist`
  job enforces, and `## Architecture decision`, which the `adr` job reads for a
  `docs/adr/` link) are appended inside `REDLINE:BEGIN`/`END` markers through the same
  `wrapBlock` the instruction files use; with markers already present only that span is
  regenerated. A template that already carries its own `## Launch readiness` section is
  left alone rather than given a second, duplicate one. Both adapters, identical
  semantics; the run reports which of the four it did, and `--dry-run` writes nothing on
  every path. This supersedes the "one shared-name file that is replaced" line above: the
  template is now merged.
- The template Redline merges into is the one the host would actually serve. Both hosts
  resolve the default pull request template from several folders and match the filename
  case-insensitively (GitHub: `.github/`, the repository root, `docs/`; Azure DevOps:
  `.azuredevops/`, `.vsts/`, `docs/`, the root). Writing the canonical lower-case path
  regardless left a repository whose template lives at `.github/PULL_REQUEST_TEMPLATE.md`
  or `docs/pull_request_template.md` with two templates and ambiguous precedence — and if
  the host served the human's, the Redline block was invisible and the gate blocked every
  one of that repository's pull requests. `installGate` now searches the candidate list in
  the host's precedence order and merges into the first file that exists, creating the
  default path only when the host would resolve none. A `PULL_REQUEST_TEMPLATE/` directory
  of alternate templates is deliberately not adopted and never written into: those are
  reachable only through a `?template=` link and are not the default body, so the default
  path is still written beside them — without it, a plain pull request there opens empty
  and fails the checklist job.
- The packaged pull request templates now ship with the gated sections already inside
  `REDLINE:BEGIN`/`END` markers, so the ownership rule is the same on every repository:
  Redline owns its marked block, everything outside it is the team's. `# Summary`,
  `## Change type` and `## Automated review` are outside the markers and are the team's to
  edit; `## Launch readiness` and `## Architecture decision` are inside and are refreshed
  on every run. Previously a greenfield repository got a marker-less file on its first run
  and was then treated as a human template forever, which meant Redline could never update
  the gated sections anywhere — not even in a repository it created the file in — and
  `redline verify` does not observe the pull request template at all, so that drift was
  silent. Accepted cost: repositories onboarded before this change keep their marker-less
  template and take the brownfield branch, so they are never rewritten and never receive
  gated-section updates. No data loss, no propagation; adding the markers by hand opts a
  repository back in.
- `wrapBlock` now locates an existing Redline block by the `<!-- REDLINE:BEGIN` prefix
  instead of the whole marker line. The rest of that line is attribution prose, and
  matching it in full made every future correction a live migration hazard: blocks already
  on disk in every onboarded repository would stop matching, and the next run would append
  a second block beside the first instead of replacing it. With the prefix match in place,
  the marker text was corrected — it claimed `generated by scripts/render.mjs`, which was
  never true of the blocks the CLI's install path writes, and now reads `generated by
  Redline`. `REDLINE:END` is unchanged.
- A file whose Redline markers are malformed is now refused instead of silently corrupted.
  `wrapBlock` splices by byte offset and never checked that `REDLINE:BEGIN` came before
  `REDLINE:END`, or that there was one of each. Two reachable states, both reproduced: with
  END before BEGIN the two slices overlapped, so the span between the markers was emitted
  twice and the file grew by a whole block on every run (measured 2 → 3 → 4 marker pairs
  over three runs); with a BEGIN and no END, the first run appended a second block and the
  second run deleted every byte between the orphan marker and it. A half-deleted marker
  line is the ordinary accident — the marker's own text tells humans to edit *around* the
  block — and `wrapBlock` writes `CLAUDE.md`, `AGENTS.md` and
  `.github/copilot-instructions.md` in every onboarded repository, so the blast radius was
  the whole estate rather than one file. Redline cannot tell which span it owns in such a
  file, so it does not guess: no silent repair, no second block, nothing deleted. The run
  fails (exit 1) with a message naming the file and what is wrong with it, and a hint
  telling the operator to restore a single pair or delete both marker lines. Each adapter's
  `marked` precondition is the same check, so the two can no longer disagree.
- A `REDLINE:BEGIN` that is quoted rather than written is no longer a splice point. A
  marker now counts only when it opens a line and is not inside a fenced code block, which
  is exactly where a document that explains the marker convention puts one on a line of its
  own. Previously the first occurrence anywhere in the file won, so a template or
  instruction file documenting Redline lost every byte between the quotation and the real
  block. Residual, stated rather than hidden: a marker written at the start of a line
  outside any fence is indistinguishable from a real one by any textual rule — that file
  now has two BEGIN markers and is refused with a message, which is the safe end of the
  trade rather than silent loss.
- Only the gated sections a template does not already provide are appended. `## Launch
  readiness` counts as present when the heading matches the way the `checklist` job's own
  awk matches it — by prefix, so `## Launch readiness checklist` is not given a competing
  second section — and `## Architecture decision` counts as present when the body already
  contains a `docs/adr/` link, which is what the `adr` job greps for. Before this, a
  brownfield template carrying its own Launch readiness section was left completely
  untouched and so never received the ADR affordance, and a pull request larger than
  `adr-diff-threshold` from that repository failed the adr job with no line in the template
  to fill in. The outcome detail names which sections were appended.
- Azure branch-specific templates are merged too. Azure DevOps serves
  `<root|.azuredevops|.vsts|docs>/pull_request_template/branches/<branch>.md` *in preference
  to* the default template, so a repository with one was getting a pull request body Redline
  had never merged into, and the checklist job failed every pull request into that branch.
  All four folders are searched (Azure searches them all, not only the first), branch names
  nested up to ten levels are followed, and both `.md` and `.txt` are recognised. This is
  deliberately not the same treatment as GitHub's `PULL_REQUEST_TEMPLATE/` directory or
  Azure's "additional" templates in `pull_request_template/`: those are opt-in through a
  `?template=` link and are never the default body, so they are neither adopted nor
  rewritten. Branch templates are automatic, so leaving them alone would leave the
  repository no better than before Redline ran.
- Candidate resolution corrected against the hosts' documentation. GitHub documents only
  `pull_request_template.md`, so `.txt` and extension-less names are no longer adopted as
  the merge target — merging into a file GitHub may not serve, while creating no `.md` at
  all, is the worse of the two failures. Azure documents `.md` and `.txt` and states that
  filenames and folder locations are not case sensitive, so both are candidates there. The
  candidate *directory* is now matched case-insensitively as well, by listing rather than
  `existsSync`, which was case-insensitive on macOS and case-sensitive on Linux — a
  `.GitHub/` checkout was missed on CI and a second template written beside the served one.
  The same listing answers `isDirectory()`, so a plain file named `docs` no longer crashes
  the run with `ENOTDIR` after the gate workflow has already been written. Where two case
  variants of the template coexist in one directory the tie-break is now deterministic
  (canonical spelling, then preferred extension, then byte order) rather than filesystem
  order.
- The append path is byte-for-byte on the existing file. `wrapBlock` no longer applies
  `trimEnd()` to the human's content; it adds only the blank-line separator needed to make
  the appended block a paragraph of its own, and an empty file gets the block with no
  leading blank lines.
- The Azure adapter reports one `gate` outcome from `installGate` instead of two. The
  pipeline definition and the pull request template are both gate machinery, and emitting
  the same capability twice was a trap for any caller that folds outcomes per capability —
  `worstOutcome` keeps one and drops the other's detail. They are folded at the source now,
  where both details survive.
- An unclosed code fence no longer hides the Redline block. CommonMark says an unterminated
  fence runs to the end of the document, so it is valid markdown rather than a mangled
  file — but it made every marker below it invisible to the fence-aware marker scan added
  above, `findBlock` reported no block, and `wrapBlock` appended a second one. Measured
  through the real renderer on an `AGENTS.md`: 10042 → 20018 → 29994 bytes, one → two →
  three marker pairs, unbounded and silent, in the same three files written in every
  onboarded repository. Reading the hidden markers as absent grows the file; reading them
  as real splices inside what renders as a code block. Both are guesses about a
  human-owned file, so the run refuses (exit 1) and names the line the fence was opened
  on. Refusal is limited to the case that is actually undecidable: when the unterminated
  region holds no marker the two readings agree, nothing is being guessed, and the file is
  written normally.
- A closing code fence carrying an info string no longer closes the fence, per CommonMark
  ("The closing code fence ... may not have an info string"). A ```` ```md ```` line inside
  an open ``` fence is content, so treating it as the close exposed markers that are really
  inside a code block, and was one of the ways a document could end in an unterminated
  fence.
- A brownfield template no longer gains a second `## Launch readiness` on the second run.
  The marked branch refreshed the block with every gated section unconditionally, so a
  template that kept its own checklist outside the block got Redline's inside it on the
  next run — and the gate's awk enforces both, meaning the repository could no longer pass
  its own gate, and `redline init` opened a second onboarding pull request for a change
  nobody asked for. The marked branch now applies the same `satisfied()` test the append
  path uses, measured against the content *outside* the block; when the file satisfies both
  gate jobs on its own, the block is left exactly as it is. Verified stable across three
  consecutive runs.
- `wrapBlock` now validates the file it is about to WRITE, not only the one it read. The
  previous guard checked whether an unterminated code fence hid any marker, and skipped the
  refusal when it hid none — on the reasoning that both readings of the fence then produce
  the same marker set. That is true of the marker set and false of the write: "no markers"
  is not a neutral observation, it is the instruction *append at end of file*, and end of
  file is inside the fence. So a five-line brownfield pull request template ending in an
  open ``` — a common idiom, and valid CommonMark — had Redline's block written inside the
  code block on the first run, after which every `redline init` and every `redline init
  --dry-run` refused in the plan pass: the repository was left less onboardable than before
  Redline ran, by Redline's own write. The result of every merge is now re-scanned and must
  come back as the one well-formed REDLINE block, at the offset it was placed at, or the
  run refuses before writing. The narrow case the old reasoning did hold for — an
  unterminated fence *below* an intact block, where the write is a replace and never enters
  the undecidable region — still writes, and is pinned by its own test.
- The same output check closes a second failure with the same root: an unbalanced code
  fence authored into `standards/` is emitted verbatim into the generated body, so the
  block Redline wrote could not be found again. Previously the first render wrote the file
  and every render afterwards refused — in every onboarded repository, with a hint naming a
  line inside Redline's own generated block that the repository owner could not act on. The
  first render now refuses instead, before writing, and the hint says that a fence inside
  the generated block means the generated content is unbalanced and its source is what
  needs fixing.
- Three fence-parser corrections. A code fence opened on a list-item line
  (`- ` + a rail) and closed at the item's content indent is now recognised as a pair,
  instead of reading the closing rail as a lone opener and refusing a document that renders
  correctly. A rail inside a multi-line HTML comment or an HTML block is no longer treated
  as a fence — CommonMark says it is literal content — which had let a pair of spurious
  fences hide a real marker block so that a second one was silently appended beside it and
  the first abandoned. HTML tracking suppresses fence detection only, never marker
  detection: not seeing a marker is the dangerous direction.
- A marker line prefixed by leading whitespace is no longer invisible to the scan. A real
  Redline block a human tab-indented — a paste, an autoformatter, a manual edit — used to
  read as absent, so the next run silently appended a second, correctly-indented block
  beside it. Detection now tolerates leading spaces or tabs before `REDLINE:BEGIN`/`END`;
  writing does not — a found indented block is replaced and re-emitted at column zero, same
  as any other replace. An indented look-alike that leaves the file ambiguous (a second
  BEGIN or END that only widened detection makes visible) is refused rather than guessed
  at, the same rule already applied to every other malformed marker pair.
- `redline init --repair` closes the last onboarding path that never converged on its own.
  `labels`, `review-ownership`, `repo-property`, `gate` and `merge-policy`'s own null branch
  (a repository refused admin rights, so no ruleset was ever created) have no read side, so a
  plain re-run treats a recorded refusal for any of them as settled by design and never tries
  again — even after an administrator grants the rights. `--repair` skips that verdict, re-applies
  every capability and recomputes `pendingAdmin` from the fresh outcomes instead of the record. It
  is not `rm .redline.json && redline init`: `onboardedAt`, the recorded menu (unless an explicit
  menu flag overrides it, same precedence as every other run) and `migratedFrom` are all untouched,
  because it still reads the existing config rather than starting from nothing. `--repair --dry-run`
  composes as everywhere else — it prints the plan and makes zero host mutations. `redline verify`'s
  `merge-policy` finding and the `pending-admin` finding now name `redline init --repair` as the
  remedy for the capabilities a read can never answer, instead of pointing at a plain `redline init`
  that would not have retried them.
- The home page's "What it did to files you already had" rows were tightened: each now
  leads with a plain sentence answering "does this touch my file", with the mechanism
  trimmed to one or two short sentences after it rather than a single dense paragraph.
  The "Redline's own — rewritten in full" row now says plainly that every instructions
  file it writes carries the `redline-` prefix (`cli/render/vendors.ts` `PREFIX`), so a
  repository's own `.github/instructions/*.instructions.md` file is never written or
  pruned by it — the prune rule matches only that prefix and extension.

## Development history — 2026-09-02 (never published)

The shell rollout is retired. Onboarding a repository is one command:

```sh
npx redline-cli init
```

- **`redline` CLI**, published as the `redline-cli` npm package (`redline` alone is taken
  on the public registry by an unrelated package — every invocation is `npx redline-cli
  <command>`, or plain `redline <command>` once installed with `npm i -g redline-cli`;
  never a bare `npx redline@latest`).
  `redline init` detects the repository's stack and host, renders the right standards
  profile, installs the merge-readiness template and gate, turns on the security floor,
  and opens a pull request — never a direct push. `redline verify` re-checks a repository
  against what it claims in `.redline.json`.
- **Both GitHub and Azure DevOps**, detected from the git remote. `platforms/` holds one
  adapter per host behind a shared interface; no file outside it calls a host API or CLI
  directly.
- **The merge gate is advisory by default.** `redline init` reports; it does not block,
  unless `--blocking` is passed. Phase 1 installs the policy in advisory mode only and
  posts no automated review findings — it onboards and verifies, nothing more.
- **`pendingAdmin` and partial onboarding.** When the operator running `redline init`
  lacks the rights to enable a capability (push protection, a branch policy, repository
  properties), onboarding still completes and opens its pull request; the capability is
  reported in a `pendingAdmin` list for an administrator to finish, rather than failing
  the whole run.
- Renderer ported to TypeScript (`cli/render/`), proven byte-identical against the retired
  `scripts/render.mjs` across all 12 profiles × 4 vendors before the oracle was deleted.
  `scripts/setup-repo.sh`, `scripts/sync.sh` and `scripts/render.mjs` are removed;
  `scripts/render-self.mjs` is the two-line shim this repo's own CI uses to re-render its
  artifacts.

### Known limitations — read before onboarding on Azure DevOps

1. **The Azure gate is materially weaker than the GitHub gate.** GitHub's
   `redline-gate / gate` aggregates four jobs — `checklist` (PR launch-readiness),
   `adr` (ADR link required above a diff-size threshold), `dependency-review`
   (`actions/dependency-review-action@v4`), and `secrets` (trufflehog v3.97.1,
   `--results=verified --fail`). Azure's entire gate is `redline verify --gate`, which
   runs none of them. **An Azure repository gets no secret scanning and no
   dependency-severity gate at the gate** — `dependency-review` and `secrets` are
   hard-fail and never label-exemptible on GitHub, which is what makes their absence on
   Azure matter; `checklist` and `adr` are soft-fail and exemptible there and are the
   lesser loss.
2. **No `redline sync`.** Standards distribution to already-onboarded repositories is
   Phase 3 work, alongside telemetry — it is control-plane, not onboarding. This task
   deletes `scripts/sync.sh` with no replacement; `workflows/redline-sync.yml` and
   `workflows/verify-onboarding.yml` are disabled (`if: false`), not deleted, so Phase 3
   has a shape to rewire. Between now and Phase 3 the estate has no automated standards
   distribution path — an already-onboarded repo picks up a standards change by
   re-running `redline init` by hand. `sync-targets.txt` is deleted. It had already lost its
   only writer in this task — `scripts/setup-repo.sh` used to append to it on each
   onboarding and `redline init` does not — so it recorded a register that had stopped
   moving. `workflows/dashboard.yml` reads it through a guarded `gh api` call, which now
   always takes the failure branch and omits the coverage figure with a warning: absent
   rather than silently wrong. Phase 3 has to reintroduce a register that `redline init`
   actually writes.
3. **No offline single-file executables.** `platforms/azure/gate-template.yml` runs the
   gate via `npx`, so the build agent must reach npm. An air-gapped Azure agent cannot run
   the gate until the Phase-1-deferred single-file executables (spec §16, R3) ship.
4. **A self-hosted GitHub Enterprise Server on a hostname not containing "github" is not
   auto-detected.** `redline init` fails cleanly and names the recognised URL shapes;
   there is no `--host` override in Phase 1.
5. **Check-name verification only asserts on GitHub when `redline init` was run
   `--blocking`.** `cli/platforms/github/install.ts` adds `redline-gate / gate` to the
   ruleset's `required_status_checks` only `if (policy.blocking)`; the default advisory
   install writes no required-check rule at all. `redline verify`'s `check-name-reported`
   finding reads `requiredChecks` back off the host and only fails when that list is
   non-empty and unsatisfied — so on a blocking install it is a real guarantee against the
   check silently going unreported, but on the (default) advisory install there is nothing
   required yet, and `verify` can only surface what the host is currently reporting, not
   assert against it.
6. **`redline verify` cannot detect drift in the rendered command files.** `renderCommands`
   (`cli/render/commands.ts`) has a `check` mode — `redline init --dry-run` uses it — but
   `verify.ts` never calls `renderCommands` at all, so it has nothing to report drift with.
   It also has no prune step: disabling a vendor in `standards/manifest.json` after a repo
   has already onboarded leaves that vendor's `commands/*.md` files behind, undetected and
   unremoved. Wiring `verify` to it and adding the prune step are Phase 2.
7. **Azure DevOps Server (on-premises) is unreachable.** `cli/platforms/azure/client.ts`
   hardcodes `dev.azure.com`, with no environment-variable override — unlike
   `cli/platforms/github/client.ts`, which honours `GITHUB_API_URL` for GitHub Enterprise
   Server. There is no way to point Redline at an on-premises Azure DevOps Server instance
   in Phase 1.
8. **Two Azure behaviours are unverified against a live tenant — confirm both during the
   pilot, before trusting the estate-wide rollout on Azure DevOps.**
   - `settings.displayName` — the field `cli/platforms/azure/install.ts` and
     `cli/platforms/azure/verify.ts` use as the `Redline:` brownfield ownership marker — is
     documented for the Build Validation policy type only. It is expected to round-trip
     unchanged as an ignored extra field on the other three policy types Redline writes
     (minimum reviewers, comment requirements, required reviewers), but this is unconfirmed.
     If the pilot tenant strips it, those three policy types lose their marker on read-back
     and every subsequent run reports the repository's own Redline policy as human-owned and
     stops writing to it. Verify by reading a written policy back with `GET
     _apis/policy/configurations/{id}` and confirming `settings.displayName` is present. The
     Status policy is unaffected — its ownership marker is the `redline`/`gate` genre/name
     pair, not `displayName`.
   - The Azure PR labels POST (`installGate`'s label call, applied after the onboarding pull
     request is created) and the gate template's own label read (`GET
     $pr_url/labels?api-version=7.1` in `platforms/azure/gate-template.yml`, used for the
     `SOFT_FAIL_LABELS` exemption) are both unconfirmed as generally available rather than
     preview-only on the pilot tenant. If labels is unavailable there: the onboarding pull
     request opens with no `redline-sync` label (degrades to a `labels` outcome rather than
     failing the run), and a repository onboarded `--blocking` blocks its own onboarding pull
     request, because the gate can never read a soft-fail label to exempt it.

## Development history — 2026-09-01 (never published)

The first body of work, and what every later section builds on.

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
