# Changelog

Standards versions follow `standards/manifest.json` → `version`. Sync PRs quote it, so a
repo's rendered artifacts always name the version they came from.

Record seed scores here. A standards change with no measurement is an opinion.

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
   re-running `redline init` by hand.
3. **No offline single-file executables.** `platforms/azure/gate-template.yml` runs the
   gate via `npx`, so the build agent must reach npm. An air-gapped Azure agent cannot run
   the gate until the Phase-1-deferred single-file executables (spec §16, R3) ship.
4. **A self-hosted GitHub Enterprise Server on a hostname not containing "github" is not
   auto-detected.** `redline init` fails cleanly and names the recognised URL shapes;
   there is no `--host` override in Phase 1.
5. **Check-name verification catches a mismatch whenever the host reports required
   checks, independent of blocking state — no stronger claim than that.** It is not a
   guarantee against drift during every advisory soak: `redline init` never populates
   `requiredChecks` in Phase 1, so what this protects against is the required-check name
   drifting out of band from what the host actually reports, not the gate silently
   becoming a no-op while advisory.

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
