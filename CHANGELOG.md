# Changelog

Standards versions follow `standards/manifest.json` → `version`. Sync PRs quote it, so a
repo's rendered artifacts always name the version they came from.

Record seed scores here. A standards change with no measurement is an opinion.

## Unreleased — hardening

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

## 3.0.0 — 2026-09-02

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
