---
description: Check this repository still matches the standards and guardrails it claims
---

Run `npx --package=redline-cli@latest redline verify` in the repository root and report the
findings table. Do not run plain `npx redline` — that resolves to an unrelated package on the
public registry. Add `--gate` if the engineer wants an explicit pass/fail summary line printed
after the table, such as when running this by hand to mirror what CI's gate check sees.

Each line is a check. For any `FAIL`, explain what it means and what fixes it:

- `onboarded` — the repository has no `.redline.json`. Run `redline init`.
- `merge-policy` — the live branch policy no longer matches `.redline.json`. Re-run
  `redline init` to reapply it.
- `check-name-reported` — a gate run published a name the policy does not require. Where the
  policy blocks, this blocks every pull request in the repository. Fix the caller job id, or
  the policy. "No gate run observed yet" is not a failure: nothing has run on that pull
  request's head commit, so there is nothing to compare.
- `security-floor` — secret scanning, push protection or dependency alerts has been turned off.
  A capability nothing could observe is named as unconfirmed, never counted as enabled.
- `artifacts-current` — the rendered standards are stale against the version this repository
  recorded. A newer standards version upstream is reported without failing: adopting it is
  `redline init`, not drift.
- `pull-request-template` — the template the host actually serves is gone, has a broken
  `REDLINE:BEGIN`/`REDLINE:END` pair, or is missing a section the gate checks for, so the gate
  fails pull requests opened from it. Re-run `redline init` — but a mangled marker pair has to
  be repaired by hand first, because `init` refuses to write to it.
- `pending-admin` — a repository administrator still has work to do. Entries no read can
  answer (labels, review ownership, the repo property, the gate, the merge policy) are listed
  separately as recorded-but-unverifiable rather than as work to chase.

A capability the host reports as **unsupported** — for example Azure DevOps Advanced Security
when it isn't licensed on this repository — is not the same as **denied**: it never counts
against `pending-admin`, because there is no administrator action that would change it.

Do not attempt to fix host settings yourself. Report and stop.
