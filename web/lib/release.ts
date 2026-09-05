// The maintenance signal, read off CHANGELOG.md at build time.
//
// "Is this thing maintained?" is the first question a reader asks of a standard
// they are being asked to adopt, and the only defensible answer is the release
// record itself. semantic-release writes that record in one shape — a heading
// carrying a semver and the date it shipped — so that is what is parsed here.
//
// Three states, deliberately distinct. A changelog that carries no released
// version is not the same fact as a changelog that could not be read, and
// neither may be rendered as a version number. Nothing in here guesses: there is
// no "latest tag we saw once", no falling back to package.json, no today's date.
import { readRepoFile } from "./content";

export type ReleaseState =
  // A semantic-release heading was found: `## [1.4.0](compare-url) (2026-09-05)`.
  | { status: "released"; version: string; date: string }
  // The file parsed, and states plainly that nothing has shipped yet. That is
  // Redline's own situation today: every section is Unreleased or development
  // history marked "never published".
  | { status: "unreleased"; reason: string }
  // The file could not be read or opened. Reported, never smoothed over.
  | { status: "unknown"; reason: string };

export const CHANGELOG_PATH = "CHANGELOG.md";

// `# [1.2.0](https://…/compare/v1.1.0...v1.2.0) (2026-09-05)` and the bare
// `# 1.0.0 (2026-07-01)` first-release form semantic-release also emits.
const RELEASE_HEADING =
  /^#{1,3}\s+\[?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?(?:\([^)\s]*\))?\s*[-–—]?\s*\((\d{4}-\d{2}-\d{2})\)\s*$/;

let cached: ReleaseState | null = null;

export function latestRelease(): ReleaseState {
  cached ??= parse();
  return cached;
}

function parse(): ReleaseState {
  let source: string;
  try {
    source = readRepoFile(CHANGELOG_PATH);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "unknown", reason: `${CHANGELOG_PATH} could not be read: ${detail}` };
  }

  const lines = source.split("\n");
  let inFence = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = RELEASE_HEADING.exec(line.trim());
    const version = match?.[1];
    const date = match?.[2];
    // semantic-release writes newest first, so the first match is the latest.
    if (version !== undefined && date !== undefined) return { status: "released", version, date };
  }

  return {
    status: "unreleased",
    reason: `${CHANGELOG_PATH} carries no released version heading yet — every section is still Unreleased or development history`,
  };
}
