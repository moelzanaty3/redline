// Pieces of /scoreboard that are worth their own file: the corpus excerpt, which
// is read off disk rather than typed out, and the trend chart, which is inline
// SVG because a benchmark page must not depend on a chart library to state a
// number.
import { readRepoFile } from "@/lib/content";
import { percent, scoredOn, type ScoreRun } from "@/lib/scores";

// The file the excerpt is taken from — printed as the caption, so a reader can
// open the same lines in the repository.
export const MARKER_FILE = "seeded/javascript/seeded-violations.js";

const MARKER = /^\s*\/\/\s*SEED\s+\d+\s*\[(?:BLOCKER|HIGH|SUGGESTION)]\s*\([^)]+\)/;

type ExcerptLine = { text: string; marker: boolean };

// The corpus header — the convention every seed in every stack is scored
// against — followed by the first two markers with the lines they mark.
//
// Located by matching content, never by line number, and every lookup throws: a
// page whose whole claim is "here is the file we publish" must fail the build
// rather than render an excerpt that has drifted from it.
function excerpt(): ExcerptLine[] {
  const lines = readRepoFile(MARKER_FILE).split("\n");
  const header = [0, 1, 2].map((i) => {
    const line = lines[i];
    if (line === undefined || !line.startsWith("//")) {
      throw new Error(`${MARKER_FILE} no longer opens with its marker-convention comment`);
    }
    return line;
  });

  const out: ExcerptLine[] = header.map((text) => ({ text, marker: false }));
  let shown = 0;
  for (let i = 3; i < lines.length && shown < 2; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line === undefined || next === undefined || !MARKER.test(line)) continue;
    out.push({ text: "", marker: false });
    out.push({ text: line, marker: true });
    out.push({ text: next, marker: false });
    shown += 1;
  }
  if (shown < 2) {
    throw new Error(
      `${MARKER_FILE} no longer carries two parseable SEED markers; /scoreboard renders them verbatim`,
    );
  }
  return out;
}

export function CorpusMarkers() {
  return (
    <figure className="sb-code">
      <pre>
        <code>
          {excerpt().map((line, i) => (
            <span className={line.marker ? "sb-code-l sb-hot" : "sb-code-l"} key={i}>
              {line.text === "" ? " " : line.text}
            </span>
          ))}
        </code>
      </pre>
      <figcaption>{MARKER_FILE}</figcaption>
    </figure>
  );
}

// --- trend -----------------------------------------------------------------

const W = 320;
const H = 64;
const PAD = 4;

// BLOCKER recall over consecutive runs for one reviewer. Plotted only where
// there is more than one run: a single point is a value, not a trend, and
// drawing it as a line would imply a history that does not exist. The axis is
// fixed 0–100% so two reviewers' charts are comparable at a glance.
export function RecallTrend({ runs, label }: { runs: ScoreRun[]; label: string }) {
  if (runs.length < 2) return null;

  const points = runs.map((run, i) => {
    const x = PAD + (i / (runs.length - 1)) * (W - PAD * 2);
    const clamped = Math.min(1, Math.max(0, run.totals.blockerRecall));
    const y = H - PAD - clamped * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const spoken = runs
    .map((run) => `${scoredOn(run.scoredAt)} ${percent(run.totals.blockerRecall)}`)
    .join(", ");

  return (
    <svg
      className="sb-trend"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} BLOCKER recall across ${runs.length} scored runs: ${spoken}. The scale runs from 0 to 100 percent.`}
    >
      <line className="sb-trend-base" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
      <line className="sb-trend-base" x1={PAD} y1={PAD} x2={W - PAD} y2={PAD} />
      <polyline className="sb-trend-line" points={points.join(" ")} />
      {points.map((point, i) => {
        const [cx, cy] = point.split(",");
        return <circle className="sb-trend-dot" cx={cx} cy={cy} r={2.5} key={i} />;
      })}
    </svg>
  );
}
