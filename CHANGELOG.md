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
