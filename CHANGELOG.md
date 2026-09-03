# Changelog

Standards versions follow `standards/manifest.json` → `version`. Sync PRs quote it, so a
repo's rendered artifacts always name the version they came from.

Record seed scores here. A standards change with no measurement is an opinion.

## Unreleased — hardening

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
  tag exists — the history must be seeded with `v2.1.0` once so the first computed
  release is 3.0.0, matching this file — and prints the exact seed command. Same-repo
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
- "Settled" is now decided against the host, not only against the working tree. The plan
  phase makes two reads — the merge policy and the security state — and no writes. A
  ruleset an administrator loosened or deleted by hand no longer reads as "already
  onboarded — nothing to change" from `redline init` *or* from `redline init --blocking`
  (the recorded menu already said blocking, so nothing looked changed); it is re-applied.
  The only recovery that used to exist was deleting `.redline.json`, which destroys
  `onboardedAt`, silently reverts every unrecorded menu selection, and makes the next run
  look like a 2.1 migration. `redline verify` also tells the operator "<capability> now
  granted — rerun redline init to clear it from `.redline.json`"; a recorded pending-admin
  list the host now contradicts is treated as work to do, so that instruction is true.
  Where the re-run does short-circuit, the pending-admin line is marked
  "(as recorded at the last run)" rather than asserted as this run's finding.
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

## 3.0.0 — 2026-09-02

The shell rollout is retired. Onboarding a repository is one command:

```sh
npx --package=redline-cli@latest redline init
```

- **`redline` CLI**, published as the `redline-cli` npm package (`redline` alone is taken
  on the public registry by an unrelated package — every invocation is
  `npx --package=redline-cli@latest redline <command>`, never `npx redline@latest`).
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
   re-running `redline init` by hand. `sync-targets.txt` also lost its only writer in this
   task: `scripts/setup-repo.sh` used to append to it on each onboarding, and `redline init`
   does not. `workflows/dashboard.yml` still reads it to compute the coverage figure on the
   telemetry dashboard, so that figure is now frozen at whatever the register held before
   this task, regardless of how many repos actually onboard — not just paused pending
   Phase 3, but silently wrong in the meantime.
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
   (`cli/render/commands.ts`) only ever writes; it has no `check` mode, unlike `render()`
   for the standards artifacts. It also has no prune step: disabling a vendor in
   `standards/manifest.json` after a repo has already onboarded leaves that vendor's
   `commands/*.md` files behind, undetected and unremoved. Both a check mode and a prune
   step are Phase 2.
7. **Azure DevOps Server (on-premises) is unreachable.** `cli/platforms/azure/client.ts`
   hardcodes `dev.azure.com`, with no environment-variable override — unlike
   `cli/platforms/github/client.ts`, which honours `GITHUB_API_URL` for GitHub Enterprise
   Server. There is no way to point Redline at an on-premises Azure DevOps Server instance
   in Phase 1.

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
