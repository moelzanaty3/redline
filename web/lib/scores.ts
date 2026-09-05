// The seed-score history, read off disk at build time.
//
// `scripts/score-seeds.mjs` scores one already-reviewed pull request and, with
// `--history <file>`, appends the report to that file as one JSON line. The path
// is the caller's to choose: `workflows/seed-canary.yml` — which runs the whole
// cycle in the redline-metrics repo — collects each matrix run's JSON and
// appends it to `data/seed-scores.jsonl` there, and `redline metrics` defaults
// its `--seed-scores` option to the same relative path. So this module resolves
// a path rather than assuming one, and says which paths it looked at when it
// finds nothing.
//
// It is the read side and nothing else: it does not score, does not call GitHub,
// and does not know what a good number looks like.
//
// The one rule it exists to enforce: it refuses rather than approximates. No
// history file anywhere is the ordinary "never run" state, stated with the paths
// checked — not a table of zeroes. A line that will not parse is skipped *and
// reported*, so a half-written record shrinks the sample visibly instead of
// silently. Nothing here fabricates, zero-fills, interpolates or estimates a
// metric, because the entire value of this page is that its numbers were
// measured.
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { repoRoot } from "./content";

// Where the canary's `record` job appends, and what `redline metrics` defaults
// to. Relative to the repository root, and also the path the page prints so a
// reader can go and read the same file.
export const DEFAULT_SCORE_HISTORY_PATH = "data/seed-scores.jsonl";

// The escape hatch for the real deployment shape: the history is produced in the
// redline-metrics repo, so a site build that wants to publish it either commits
// the file here or points this at wherever it was fetched to. Absolute or
// relative to the repository root; the same name the CLI uses for the option.
const HISTORY_ENV_VARS = ["REDLINE_SEED_SCORES", "SEED_SCORES"] as const;

/** Every path consulted, in order, relative to the repo root or absolute. */
function candidatePaths(): string[] {
  const out: string[] = [];
  for (const name of HISTORY_ENV_VARS) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") out.push(value.trim());
  }
  out.push(DEFAULT_SCORE_HISTORY_PATH);
  return [...new Set(out)];
}

/** The reviewer a run is attributed to. */
export type Reviewer = {
  /** Matches a substring of the bot's GitHub login, lowercased. */
  key: string;
  label: string;
};

// Mirrors REVIEW_BOTS in scripts/lib/rules.mjs, which is what the scorer uses to
// decide whether a comment is automated review at all. The scorer records the
// raw logins; the mapping from login to a human name lives here because it is
// presentation. Keep the keys in step with that list — a reviewer missing from
// here is reported as unattributed rather than dropped.
export const REVIEWERS: readonly Reviewer[] = [
  { key: "copilot", label: "GitHub Copilot" },
  { key: "claude", label: "Claude" },
  { key: "codex", label: "OpenAI Codex" },
  { key: "cursor", label: "Cursor" },
  { key: "devin", label: "Devin" },
  { key: "jules", label: "Jules" },
  { key: "redline", label: "Redline CLI" },
];

/** `report.totals`, exactly as scripts/score-seeds.mjs writes it. */
export type ScoreTotals = {
  seeded: number;
  caught: number;
  recall: number;
  blockerSeeded: number;
  blockerCaught: number;
  blockerRecall: number;
  ruleAttribution: number;
  commentsPosted: number;
  findingsWithRuleId: number;
  invalidRuleIds: number;
  falsePositivesOnClean: number;
  unmatchedFindings: number;
  untaggedFindings: number;
};

export type StackScore = {
  stack: string;
  total: number;
  caught: number;
  recall: number;
  ruleAttribution: number;
};

export type FalsePositive = {
  path: string;
  line: number;
  severity: string;
  body: string;
};

/** One scored run — one line of the history file. */
export type ScoreRun = {
  repo: string;
  pr: number | null;
  scoredAt: string;
  /** The standards version under test. Absent in records written before it was recorded. */
  standardsVersion: string | null;
  /** Reviewer logins the scorer saw comments from. Empty means it saw none. */
  reviewers: string[];
  totals: ScoreTotals;
  byStack: StackScore[];
  falsePositives: FalsePositive[];
  missedCount: number;
};

/** Every run attributed to one reviewer, oldest first. */
export type ReviewerScore = {
  reviewer: Reviewer;
  /** At least one, oldest first. `latest` is the last of these. */
  history: ScoreRun[];
  latest: ScoreRun;
};

/** A history line that could not be used, and why. */
export type SkippedLine = { line: number; reason: string };

export type ScoreboardData =
  | {
      status: "scored";
      /** Sorted by BLOCKER recall descending, then overall recall. */
      scored: ReviewerScore[];
      /** Reviewers in REVIEWERS with no run in the history at all. */
      unscored: Reviewer[];
      /** Runs whose comments matched no known reviewer — usually a run with zero comments. */
      unattributed: ScoreRun[];
      /** Every usable run, oldest first. */
      runs: ScoreRun[];
      skipped: SkippedLine[];
      /**
       * The history file the runs came from, as a path worth printing: relative
       * to the repository root where it is inside it, and otherwise just the
       * file name — a build machine's absolute path means nothing to a reader
       * and is not a fact about the measurement.
       */
      path: string;
    }
  | {
      status: "never-run";
      reason: string;
      /** Non-empty when a file was found but nothing in it could be used. */
      skipped: SkippedLine[];
      /** Every path that was looked at, so the statement is checkable. */
      checked: string[];
    };

let cached: ScoreboardData | null = null;

export function scoreboard(): ScoreboardData {
  cached ??= load();
  return cached;
}

function load(): ScoreboardData {
  const checked = candidatePaths();
  const root = repoRoot();
  const found = checked.find((path) => existsSync(isAbsolute(path) ? path : join(root, path)));
  const checkedLabels = checked.map((path) => displayPath(path, root));

  if (found === undefined) {
    return {
      status: "never-run",
      reason:
        "No scored run has been published to this site. A run is produced by opening the corpus as a pull request on a repository with an automated reviewer on it, scoring the comments it posts, and appending that report to a history file — and no such file is present here.",
      skipped: [],
      checked: checkedLabels,
    };
  }

  const absolute = isAbsolute(found) ? found : join(root, found);
  let source: string;
  try {
    source = readFileSync(absolute, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "never-run",
      reason: `\`${displayPath(found, root)}\` exists but could not be read: ${detail}`,
      skipped: [],
      checked: checkedLabels,
    };
  }

  const runs: ScoreRun[] = [];
  const skipped: SkippedLine[] = [];

  source.split("\n").forEach((raw, index) => {
    const text = raw.trim();
    if (text === "") return;
    const result = parseRun(text);
    if (result.ok) runs.push(result.run);
    // A partially written last line is the common case — the canary appends
    // while a build may be reading. It is reported rather than hidden, because
    // a silently shorter series is a wrong series.
    else skipped.push({ line: index + 1, reason: result.reason });
  });

  if (runs.length === 0) {
    return {
      status: "never-run",
      reason:
        skipped.length === 0
          ? `\`${displayPath(found, root)}\` exists but is empty — no run has been appended to it yet.`
          : `\`${displayPath(found, root)}\` holds ${skipped.length} line${skipped.length === 1 ? "" : "s"}, none of which could be parsed as a score record.`,
      skipped,
      checked: checkedLabels,
    };
  }

  // Oldest first: the file is appended to, but a rebase or a merged branch can
  // reorder it, so the series is sorted on the timestamp the scorer stamped.
  runs.sort((a, b) => a.scoredAt.localeCompare(b.scoredAt));

  const byReviewer = new Map<string, ScoreRun[]>();
  const unattributed: ScoreRun[] = [];

  for (const run of runs) {
    const matched = REVIEWERS.filter((reviewer) =>
      run.reviewers.some((login) => login.toLowerCase().includes(reviewer.key)),
    );
    if (matched.length === 0) {
      // No comment from a known review bot. Kept and shown separately: "the
      // reviewer posted nothing" is a result, and hiding it would flatter it.
      unattributed.push(run);
      continue;
    }
    for (const reviewer of matched) {
      const list = byReviewer.get(reviewer.key);
      if (list === undefined) byReviewer.set(reviewer.key, [run]);
      else list.push(run);
    }
  }

  const scored: ReviewerScore[] = [];
  for (const reviewer of REVIEWERS) {
    const history = byReviewer.get(reviewer.key);
    if (history === undefined) continue;
    const latest = history[history.length - 1];
    if (latest === undefined) continue;
    scored.push({ reviewer, history, latest });
  }

  scored.sort(
    (a, b) =>
      b.latest.totals.blockerRecall - a.latest.totals.blockerRecall ||
      b.latest.totals.recall - a.latest.totals.recall ||
      a.reviewer.label.localeCompare(b.reviewer.label),
  );

  return {
    status: "scored",
    scored,
    unscored: REVIEWERS.filter((r) => !byReviewer.has(r.key)),
    unattributed,
    runs,
    skipped,
    path: displayPath(found, root),
  };
}

function displayPath(found: string, root: string): string {
  if (!isAbsolute(found)) return found;
  const inside = relative(root, found);
  return inside !== "" && !inside.startsWith("..") ? inside : basename(found);
}

// --- parsing ---------------------------------------------------------------
// Every field is checked. A record missing a metric is skipped whole rather
// than defaulted, because a defaulted metric is an invented measurement.

type ParseResult = { ok: true; run: ScoreRun } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringAt(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function parseRun(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `not valid JSON (${detail})` };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "not a JSON object" };

  const repo = stringAt(parsed, "repo");
  if (repo === null) return { ok: false, reason: "no `repo`" };

  const scoredAt = stringAt(parsed, "scored_at");
  if (scoredAt === null) return { ok: false, reason: "no `scored_at`" };
  if (Number.isNaN(Date.parse(scoredAt))) {
    return { ok: false, reason: `\`scored_at\` is not a date (${scoredAt})` };
  }

  const rawTotals = parsed["totals"];
  if (!isRecord(rawTotals)) return { ok: false, reason: "no `totals` object" };

  const required = [
    "seeded",
    "caught",
    "recall",
    "blocker_seeded",
    "blocker_caught",
    "blocker_recall",
    "rule_attribution",
    "comments_posted",
    "findings_with_rule_id",
    "invalid_rule_ids",
    "false_positives_on_clean",
    "unmatched_findings",
    "untagged_findings",
  ] as const;

  const values = new Map<string, number>();
  for (const key of required) {
    const value = numberAt(rawTotals, key);
    if (value === null) return { ok: false, reason: `\`totals.${key}\` is missing or not a number` };
    values.set(key, value);
  }
  const at = (key: (typeof required)[number]): number => values.get(key) ?? 0;

  const totals: ScoreTotals = {
    seeded: at("seeded"),
    caught: at("caught"),
    recall: at("recall"),
    blockerSeeded: at("blocker_seeded"),
    blockerCaught: at("blocker_caught"),
    blockerRecall: at("blocker_recall"),
    ruleAttribution: at("rule_attribution"),
    commentsPosted: at("comments_posted"),
    findingsWithRuleId: at("findings_with_rule_id"),
    invalidRuleIds: at("invalid_rule_ids"),
    falsePositivesOnClean: at("false_positives_on_clean"),
    unmatchedFindings: at("unmatched_findings"),
    untaggedFindings: at("untagged_findings"),
  };

  return {
    ok: true,
    run: {
      repo,
      pr: numberAt(parsed, "pr"),
      scoredAt,
      standardsVersion: stringAt(parsed, "standards_version"),
      reviewers: parseReviewers(parsed["reviewers"]),
      totals,
      byStack: parseByStack(parsed["by_stack"]),
      falsePositives: parseFalsePositives(parsed["false_positives"]),
      missedCount: Array.isArray(parsed["missed"]) ? parsed["missed"].length : 0,
    },
  };
}

function parseReviewers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

function parseByStack(value: unknown): StackScore[] {
  if (!isRecord(value)) return [];
  const out: StackScore[] = [];
  for (const [stack, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const total = numberAt(raw, "total");
    const caught = numberAt(raw, "caught");
    const recall = numberAt(raw, "recall");
    const ruleAttribution = numberAt(raw, "rule_attribution");
    if (total === null || caught === null || recall === null || ruleAttribution === null) continue;
    out.push({ stack, total, caught, recall, ruleAttribution });
  }
  return out.sort((a, b) => a.stack.localeCompare(b.stack));
}

function parseFalsePositives(value: unknown): FalsePositive[] {
  if (!Array.isArray(value)) return [];
  const out: FalsePositive[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const path = stringAt(entry, "path");
    if (path === null) continue;
    out.push({
      path,
      line: numberAt(entry, "line") ?? 0,
      severity: stringAt(entry, "severity") ?? "untagged",
      body: stringAt(entry, "body") ?? "",
    });
  }
  return out;
}

// --- formatting ------------------------------------------------------------

/** A ratio the scorer recorded, as a whole percent. Never called on a guess. */
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** The date a run was scored, in a fixed locale so the build is reproducible. */
export function scoredOn(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toISOString().slice(0, 10);
}
