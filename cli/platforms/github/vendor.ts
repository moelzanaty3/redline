// Turning the org-hosted reusable gate into one a repository carries itself.
//
// The reusable workflow is already self-contained — `workflow_call` inputs, no
// organisation secrets, no cross-repository file reads, and the CLI arrives at
// run time through `npx redlinegate@<pin>` — so vendoring it is a copy plus two
// edits, not a rewrite. That is the only reason this mode is affordable: there
// is one gate definition in this repository, and local mode ships the same
// bytes rather than a second implementation that drifts.
//
// GitHub resolves `uses: ./.github/workflows/<file>` against the caller's own
// commit, and the check run is still reported as "<caller job id> / <called job
// id>". Keeping the caller's job id `redline-gate` and the aggregate's `gate`
// therefore keeps the required context exactly `redline-gate / gate` in both
// modes, which is what lets a repository move between them without touching a
// branch ruleset.
//
// Pure, and separate from install.ts, for the same reason the report renderer
// is: a string transform that decides what a security control does is only
// trustworthy if it can be asserted on directly.

export const VENDORED_GATE_PATH = '.github/workflows/redline-gate.yml';

// The reference a local caller carries in place of `<org>/.github/...@main`.
// Relative, so it resolves inside this repository; no `@ref`, because a local
// reusable workflow cannot take one — it is always the caller's own commit.
export const LOCAL_GATE_USES = `./${VENDORED_GATE_PATH}`;

const HEADER = (pin: string): string =>
  [
    '# Managed by Redline. Regenerate with `redline init --repair`; edits here are overwritten.',
    '#',
    `# A vendored copy of the Redline gate, written by redlinegate ${pin}.`,
    '#',
    "# This workflow runs from the pull request's own head commit, so a pull request",
    '# that edits this file changes the gate that is judging it — including standing',
    '# down the dependency and secret jobs, which no label can waive. Protect',
    '# .github/workflows/ with CODEOWNERS, or host the gate in the organisation',
    '# .github repository instead (`redline init --gate-source org`).',
    '',
    '',
  ].join('\n');

/**
 * Render the vendored gate workflow from the reusable one.
 *
 * `version` is stamped over every `REDLINE_CLI_VERSION` in the file. The
 * reusable copy carries a hardcoded pin because it ships in lockstep with the
 * CLI that reads it; a vendored copy does not, so it records the version that
 * wrote it. That stamp is what `verify` compares against to tell a current
 * vendored gate from one three releases behind.
 *
 * `null` leaves the reusable copy's own pin in place. That is the development
 * build: stamping `0.0.0-development` would write an `npx redlinegate@` pin to
 * a version npm has never published, which fails every pull request the gate
 * reaches — the same reason the Azure pipeline leaves `@latest` alone there.
 */
export function renderVendoredGate(reusable: string, version: string | null): string {
  const stamped =
    version === null
      ? reusable
      : reusable.replace(/REDLINE_CLI_VERSION: *'[^']*'/g, `REDLINE_CLI_VERSION: '${version}'`);
  return `${HEADER(stampedVersion(stamped) ?? 'an unknown version')}${stamped}`;
}

/**
 * Point a rendered caller workflow at the vendored gate instead of the
 * organisation's.
 *
 * Operates on the caller AFTER `<org>` substitution, so it has one shape to
 * match rather than two. A caller that carries no org reference is returned
 * unchanged rather than throwing: the only way to reach that is a hand-edited
 * template, and failing the install over it would cost the repository every
 * other artifact in the run.
 */
export function pointCallerAtLocalGate(caller: string): string {
  return caller.replace(
    /uses: *\S*\.github\/workflows\/redline-gate\.yml@\S*/,
    `uses: ${LOCAL_GATE_USES}`
  );
}

/**
 * The version stamped into a vendored gate, or null if there is none to read.
 *
 * Null means "this file is not a vendored Redline gate, or is too old to say" —
 * both of which `verify` reports as unknown rather than as stale, because
 * neither is a drift measurement.
 */
export function stampedVersion(vendored: string): string | null {
  return /REDLINE_CLI_VERSION: *'([^']*)'/.exec(vendored)?.[1] ?? null;
}
