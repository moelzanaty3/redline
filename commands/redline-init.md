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
- skip the accessibility standard: `--no-a11y`
- scaffold SpecKit: `--speckit`

When it finishes, tell them three things and nothing else:

1. which profile was detected and what was written
2. the pull request URL
3. anything under `partially onboarded` — that list needs a repository administrator, and
   until it is cleared this repository is not fully onboarded

Exit code `0` covers both a full onboard and a partial one — a denied capability is recorded
under `pendingAdmin` and is still success. Only total failure to reach the host exits non-zero.

Do not edit the files it generated. Content inside `<!-- REDLINE:BEGIN -->` markers is
owned by Redline and is replaced on the next sync.
