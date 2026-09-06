# Multi-vendor support

Redline is not a Copilot system. It is a standards system with a Copilot adapter.

## The split

| Layer | Vendor-specific? | Where |
| --- | --- | --- |
| The rules themselves | No | `standards/core.md`, `standards/stacks/*.md` |
| Which rules a repo gets | No | `standards/manifest.json` profiles |
| File format and glob syntax | **Yes** | `cli/render/vendors.ts` vendor adapters |
| Readiness gate, ruleset, CODEOWNERS | No | `workflows/`, `rulesets/`, `templates/` |
| Telemetry and scoring | No | attribute findings by reviewer login |

Only the third row is vendor-aware, and it is about 60 lines of `cli/render/vendors.ts`.

## What renders where

`npx redlinegate init` renders the detected profile for you. Programmatically, the same
entry point is `render({ root, profile, out })` from `cli/render/standards.ts` — see
`scripts/render-self.mjs` for the smallest working caller.

| Vendor | Artifact | Path scoping mechanism |
| --- | --- | --- |
| GitHub Copilot (review + chat) | `.github/copilot-instructions.md`, `.github/instructions/redline-*.instructions.md` | `applyTo:` frontmatter glob list |
| OpenAI Codex, Copilot coding agent, Jules, Devin, Cursor agent | `AGENTS.md` | none — one file, scope stated in prose per section |
| Claude Code, Claude in GitHub | `CLAUDE.md` (imports `AGENTS.md` with `@AGENTS.md`) | inherits AGENTS.md |
| Cursor rules | `.cursor/rules/redline-*.mdc` | `globs:` frontmatter |

Vendor selection is driven by `standards/manifest.json` under `vendors` — each entry's
`enabled` flag decides the org-wide default, which is a ceiling: a repository may select a
subset of what the org enables, never a superset, and a vendor the org later disables stops
rendering regardless of what a repository recorded. `redline init` resolves a per-repository
default from what the repository already contains (existing Copilot, Claude, `AGENTS.md` or
Cursor markers; the org default when none are present), a recorded `.redline.json` selection
overrides detection on a re-run, and the `--vendors <list>` flag (see `cli/bin/redline.ts`)
overrides both — e.g. `redline init --vendors copilot,agents`.

## Adding a vendor

Add one function to the `VENDORS` object in `cli/render/vendors.ts`. It receives a
`RenderContext` (`{ manifest, root, profile, stacks }`) and returns
`{ files: Map<path, { body, merge? }>, prune? }`.

- `merge: true` wraps the body in `<!-- REDLINE:BEGIN -->` markers and preserves
  everything outside them, so a repo's own context survives every sync.
- `prune` lets sync delete generated files that the current profile no longer includes.
  Generated per-stack files are prefixed `redline-` precisely so pruning can never touch
  a file a team wrote themselves.

Then add it to `manifest.vendors` and CI renders it for every profile on the next PR.

## Why glob negation is not used anywhere

The original rules used `applyTo: "src/**/*.ts,!**/*.native.*"`. Negation is not part of
Copilot's `applyTo` contract, and it has no equivalent at all in `AGENTS.md`. Relying on
it meant React rules silently firing on NestJS files.

The replacement is **profiles**. A repo installs exactly one profile, and a profile never
contains two rule sets that contradict each other. `service-node` gets the NestJS rules
and no React rules, so `src/**/*.ts` is unambiguous inside that repo. The one deliberate
overlap — `mobile-rn` installing both React and React Native — is additive by design, and
each file says so in its own text. `scripts/validate.mjs` fails the build if a negated or
brace-expanded glob is ever reintroduced.

## Vendor-neutral measurement

`scripts/collect-telemetry.mjs` and `scripts/score-seeds.mjs` classify a review comment as
automated by matching the reviewer login against a bot list, and read severity plus rule
id from the `Redline/<SEVERITY> [rule-id]:` prefix the core standard mandates. Both share
one parser, `scripts/lib/rules.mjs`. Neither knows or cares which vendor produced the
comment.

That makes an evidence-based vendor comparison a single command per candidate:

```sh
GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-copilot --pr 4 --json
GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-claude  --pr 7 --json
```

Compare `blocker_recall`, `false_positives_on_clean` and `rule_attribution` on identical
input. Nothing else in the system has to change to run that test — and
`workflows/seed-canary.yml` will run it on a schedule against as many candidate repos as
you list in `CANARY_TARGETS`.

## What does not transfer

- **`automatic_copilot_code_review_enabled`** in the branch ruleset is Copilot-specific.
  Other vendors are triggered by their own app installation or a workflow, not by a
  ruleset flag. Everything else in the ruleset is vendor-neutral.
- **Instruction size and precedence** differ per vendor. Copilot reads the core file plus
  every matching `instructions` file; AGENTS.md consumers read one concatenated file.
  Keep individual stack files focused — the concatenated `AGENTS.md` for
  `fullstack-node` is the largest artifact the renderer produces and is the one to watch.
