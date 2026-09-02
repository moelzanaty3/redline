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
- `check-name-reported` — the required check name has never been reported by a real run.
  This blocks every pull request in the repository. Fix the caller job id, or the policy.
- `security-floor` — secret scanning or push protection has been turned off.
- `artifacts-current` — the rendered standards are stale. Merge the open sync pull request.
- `pending-admin` — a repository administrator still has work to do.

A capability the host reports as **unsupported** — for example Azure DevOps Advanced Security
when it isn't licensed on this repository — is not the same as **denied**: it never counts
against `pending-admin`, because there is no administrator action that would change it.

Do not attempt to fix host settings yourself. Report and stop.
