---
description: Onboard this repository to Redline — standards, security floor and merge gate
---

Run `npx --package=redline-cli@latest redline init` in the repository root and report what it
printed. Do not run plain `npx redline` — that resolves to an unrelated package on the public
registry.

The command is not interactive by default. If the engineer asked for something specific,
pass it through:

- a stack override: `--profile <name>`
- a blocking rather than advisory gate: `--blocking`
- the plan only, writing nothing and changing no repository setting: `--dry-run`
- `--no-a11y` and `--speckit` are recorded in `.redline.json` for later phases; they change
  nothing in Phase 1, so do not describe them to the engineer as having taken effect

Flags you do not pass keep whatever `.redline.json` already recorded — re-running without
`--blocking` on a repository onboarded with it does not demote the gate.

When it finishes, tell them three things and nothing else:

1. which profile was detected and what was written
2. the pull request URL
3. anything under `partially onboarded` — that list needs a repository administrator, and
   until it is cleared this repository is not fully onboarded

A bad flag, an unknown profile, or a host failure all exit non-zero. What exits `0` is a
**denied** capability — the operator lacks the rights, so it is recorded in `.redline.json`
under `pendingAdmin` for an administrator to grant later. A capability the host reports as
**unsupported** — for example Azure DevOps Advanced Security when it isn't licensed on this
repository — is different again: it is never pending admin work, and never appears in
`pendingAdmin`, because there is nothing an administrator here could grant.

Do not edit the files it generated. Content inside `<!-- REDLINE:BEGIN -->` markers is
owned by Redline and is replaced on the next sync.
