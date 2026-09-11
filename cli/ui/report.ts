import type { CapabilityOutcome } from '../platforms/types.ts';
import type { Glyphs, Palette } from './tty.ts';

// What a finished `redline init` looks like.
//
// It used to be one flat column of `log.info` — every line the same weight, no
// colour, a capability's status and its detail and the fix for it all crammed
// into one string that wrapped mid-word for four lines. Everything the run did
// was in there and none of it could be found: the pull request URL, the one
// piece of output an operator actually needs, sat between two wrapped paragraphs
// about repository properties.
//
// So: sections with headings, a fixed-width status column, and the work that is
// left over pulled out of the table into a numbered list at the end. The
// rendering is pure — same report, same lines, no terminal touched — for the
// same reason tty.ts is: a layout this fiddly is only trustworthy if it can be
// asserted directly.

export interface ReportTheme {
  readonly palette: Palette;
  readonly glyphs: Glyphs;
  readonly width: number;
}

// What the renderer needs from an init report. Structural, not the whole
// InitReport: `redline remove` produces a different report with the same
// shape of answer, and a section list tied to one command's type could not be
// shared with it.
export interface ReportSummary {
  readonly profile?: string;
  readonly migratedFrom?: string | null;
  readonly optedOut?: readonly string[];
  readonly notes?: readonly string[];
  readonly files?: readonly string[];
  readonly removals?: readonly string[];
  readonly outcomes?: readonly CapabilityOutcome[];
  readonly pullRequestUrl?: string | null;
  readonly pendingAdmin?: readonly string[];
  readonly dryRun?: boolean;
  readonly hostPlan?: readonly string[];
}

const INDENT = '  ';
const BULLET = '   ';
// The status word column. `unsupported` is the longest at eleven, and a column
// sized to it keeps every detail starting at the same cell — which is the
// property that makes the block scannable rather than merely aligned.
const STATUS_WIDTH = 11;
const MIN_TEXT = 24;

/**
 * Break `text` into lines that fit `width`, never mid-word where it can be
 * helped.
 *
 * A word longer than the whole width is emitted on its own over-long line
 * rather than chopped: it is a URL or a path, and half of either is worse than
 * a line that runs on. Nothing here redraws, so an over-long line costs a soft
 * wrap in the terminal and nothing else.
 */
export function wrap(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    if (line === '') {
      line = word;
      continue;
    }
    if (line.length + 1 + word.length <= width) {
      line = `${line} ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line !== '') lines.push(line);
  return lines.length === 0 ? [''] : lines;
}

// Escape sequences have width on the wire and none on the terminal. Every
// column here is measured after they are stripped, because a marker painted
// green is eleven bytes and one cell, and an indent computed from the eleven
// puts the continuation line a third of the way across the screen.
const ANSI = /\x1b\[[0-9;]*m/g;
export const visibleWidth = (text: string): number => text.replace(ANSI, '').length;

// A block of text set under a marker, with every line after the first indented
// to sit under the text rather than under the marker. Used by every section
// here, because the alternative — letting the terminal soft-wrap — puts the
// continuation hard against the left edge and breaks the column the section
// exists to create.
function hanging(marker: string, text: string, indent: string, width: number): string[] {
  const markWidth = visibleWidth(marker);
  const room = Math.max(MIN_TEXT, width - indent.length - markWidth);
  const [first, ...rest] = wrap(text, room);
  const pad = ' '.repeat(markWidth);
  return [`${indent}${marker}${first ?? ''}`, ...rest.map((line) => `${indent}${pad}${line}`)];
}

function heading(title: string, count: string, theme: ReportTheme): string[] {
  const { palette: c } = theme;
  const tail = count === '' ? '' : `  ${c.dim(count)}`;
  return ['', `${INDENT}${c.bold(title)}${tail}`];
}

// Which marker a capability's status earns, and what colour it is in.
//
// `already` is green with `applied`: the operator asked for a state, and the
// repository is in it. Whether this run or an earlier one put it there is a
// fact about Redline's history, not about the repository, and colouring it
// differently made a settled re-run look half-broken.
//
// `unsupported` and `unknown` are deliberately NOT red. Neither is a failure
// anybody can act on — one is a feature this repository does not have, the
// other is a read that gave no answer — and painting them like a denial is how
// a fully-onboarded repository came out of this report looking alarming.
function mark(status: CapabilityOutcome['status'], theme: ReportTheme): string {
  const { palette: c, glyphs: g } = theme;
  switch (status) {
    case 'applied':
    case 'already':
      return c.green(g.ok);
    case 'denied':
      return c.red(g.fail);
    default:
      return c.dim(g.skip);
  }
}

function statusWord(status: CapabilityOutcome['status'], theme: ReportTheme): string {
  const { palette: c } = theme;
  const padded = status.padEnd(STATUS_WIDTH);
  if (status === 'applied' || status === 'already') return c.green(padded);
  if (status === 'denied') return c.red(padded);
  return c.dim(padded);
}

/**
 * The whole report, as lines. Never ends in a blank line.
 *
 * Sections are emitted only when they have something in them: a run with no
 * notes must not print an empty "Notes" heading, because a heading over nothing
 * reads as a section that failed to render.
 */
export function renderReport(summary: ReportSummary, theme: ReportTheme): string[] {
  const { palette: c, glyphs: g, width } = theme;
  const out: string[] = [];
  // A plan and a record of work read differently and must say so: "17 written"
  // on a dry run is a claim about files that are not there.
  const dry = summary.dryRun === true;

  const title = [
    summary.profile === undefined ? null : `profile ${c.cyan(summary.profile)}`,
    summary.migratedFrom == null ? null : c.dim(`migrated from ${summary.migratedFrom}`),
    dry ? c.yellow('dry run') : null,
  ].filter((part): part is string => part !== null);
  if (title.length > 0) out.push(`${INDENT}${title.join(c.dim(' · '))}`);

  if (summary.optedOut !== undefined && summary.optedOut.length > 0) {
    out.push(`${INDENT}${c.dim(`opted out: ${summary.optedOut.join(', ')}`)}`);
  }

  // Notes first, and never folded into a section. Each one is the reason a
  // later line says what it says — why a gate job is missing, why a context was
  // dropped — and a reader who meets the consequence before the reason goes
  // looking for a bug.
  for (const note of summary.notes ?? []) {
    const [first, ...rest] = hanging(`${g.warn} `, note, INDENT, width);
    out.push(`${INDENT}${c.yellow(g.warn)} ${c.dim((first ?? '').slice(INDENT.length + 2))}`);
    for (const line of rest) out.push(c.dim(line));
  }

  const removals = new Set(summary.removals ?? []);
  const files = summary.files ?? [];
  if (files.length > 0) {
    const written = files.filter((f) => !removals.has(f)).length;
    const removed = files.length - written;
    const count = [
      written > 0 ? `${written} ${dry ? 'to write' : 'written'}` : null,
      removed > 0 ? `${removed} ${dry ? 'to remove' : 'removed'}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(', ');
    out.push(...heading('Files', count, theme));
    for (const file of files) {
      const gone = removals.has(file);
      const glyph = gone ? c.yellow(g.remove) : c.green(g.write);
      out.push(`${BULLET}${glyph} ${gone ? c.dim(file) : file}`);
    }
  }

  // A dry run has no outcomes — it made no host call — so it prints the plan it
  // would have applied instead. Silence there read as "Redline changes nothing
  // on the host", which is the opposite of true.
  const hostPlan = summary.hostPlan ?? [];
  if (dry && hostPlan.length > 0) {
    out.push(...heading('Repository settings', `${hostPlan.length} to apply`, theme));
    for (const step of hostPlan) {
      out.push(...hanging(`${c.dim(g.arrow)} `, step, BULLET, width));
    }
  }

  const outcomes = summary.outcomes ?? [];
  if (outcomes.length > 0) {
    const tally = (...states: CapabilityOutcome['status'][]): number =>
      outcomes.filter((o) => states.includes(o.status)).length;
    // Three separate numbers, not a fraction. `2/7` counted `unsupported`
    // against the repository — and a capability this repository cannot have is
    // not a capability it is missing.
    const count = [
      `${tally('applied', 'already')} in place`,
      tally('denied') > 0 ? `${tally('denied')} refused` : null,
      tally('unsupported', 'unknown') > 0 ? `${tally('unsupported', 'unknown')} unavailable` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
    out.push(...heading('Repository settings', count, theme));
    const nameWidth = Math.max(...outcomes.map((o) => o.capability.length));
    for (const outcome of outcomes) {
      const marker = `${mark(outcome.status, theme)} ${statusWord(outcome.status, theme)} `;
      // Measured on the raw text: a painted string carries escape bytes that
      // have width on the wire and none on the terminal, and a column padded
      // from them is a column that does not line up.
      const rawMarker = `${g.ok} ${''.padEnd(STATUS_WIDTH)} `;
      const name = outcome.capability.padEnd(nameWidth);
      const prefix = `${BULLET}${rawMarker}${name}  `;
      const room = Math.max(MIN_TEXT, width - prefix.length);
      const [first, ...rest] = wrap(outcome.detail, room);
      out.push(`${BULLET}${marker}${c.bold(name)}  ${c.dim(first ?? '')}`);
      for (const line of rest) out.push(c.dim(`${' '.repeat(prefix.length)}${line}`));
    }
  }

  if (summary.pullRequestUrl != null && summary.pullRequestUrl !== '') {
    out.push(...heading('Pull request', '', theme));
    out.push(`${BULLET}${c.cyan(summary.pullRequestUrl)}`);
  }

  // The whole point of the redesign. Everything above is a record of what
  // happened; this is the only part that asks the operator for anything, so it
  // goes last, numbered, and carries the command to run rather than the state
  // to regret.
  const left = outcomes.filter((o) => o.status === 'denied');
  if (left.length > 0) {
    out.push(...heading("What's left", `${left.length} for an administrator`, theme));
    left.forEach((outcome, index) => {
      const step = `${index + 1}.`;
      const indent = `${BULLET}${' '.repeat(step.length + 1)}`;
      // Measured off the raw first line, not off `indent`: the capability name
      // and the dash sit on it too, and wrapping to the continuation's width
      // would overshoot the terminal by exactly their length.
      const room = Math.max(MIN_TEXT, width - indent.length - outcome.capability.length - 3);
      const [first, ...rest] = wrap(outcome.detail, room);
      out.push(`${BULLET}${c.red(step)} ${c.bold(outcome.capability)} ${c.dim('—')} ${first ?? ''}`);
      for (const line of rest) out.push(`${indent}${line}`);
      const fix = outcome.hint;
      if (fix !== undefined && fix !== '') {
        out.push(...hanging(`${g.arrow} `, fix, indent, width).map((line) => c.dim(line)));
      }
    });
  }

  return out;
}
