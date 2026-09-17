import type { Palette } from '../ui/tty.ts';

export interface Sink {
  out(line: string): void;
  err(line: string): void;
}

export interface Finding {
  check: string;
  ok: boolean;
  detail: string;
  // A check that never ran. Printed as its own marker rather than folded into
  // ok or FAIL: an operator scanning a report has to be able to see the
  // difference between "asserted and fine" and "not asserted".
  unknown?: boolean;
}

export interface Log {
  info(line: string): void;
  warn(line: string): void;
  error(message: string, hint?: string): void;
  report(findings: Finding[]): void;
  // Commentary about a run that is not its result. Goes to stderr so that a
  // command whose stdout is a document (--json) stays parseable.
  note(line: string): void;
}

// One palette per stream, because the two are redirected independently:
// `redline verify 2> err.log` at a terminal wants colour on stdout and none in
// the file.
export interface LogTheme {
  out: Palette;
  err: Palette;
}

const consoleSink: Sink = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export function createLog(sink: Sink = consoleSink, theme?: LogTheme): Log {
  const out = theme?.out;
  const err = theme?.err;
  return {
    info: (line) => sink.out(line),
    warn: (line) => sink.out(`${out ? out.yellow('warn') : 'warn'}  ${line}`),
    error(message, hint) {
      sink.err(`${err ? err.bold(err.red('error')) : 'error'}  ${message}`);
      if (hint) sink.err(`       ${err ? err.dim(hint) : hint}`);
    },
    report(findings) {
      for (const finding of findings) {
        const marker = finding.unknown ? '  ??' : finding.ok ? 'ok  ' : 'FAIL';
        const detail = finding.ok && !finding.unknown && out ? out.dim(finding.detail) : finding.detail;
        sink.out(`${out ? paintMarker(marker, out) : marker}  ${finding.check.padEnd(22)} ${detail}`);
      }
    },
    note: (line) => sink.err(line),
  };
}

// Padded markers are painted whole, padding included: the padding is inside
// the escape so the columns after it line up with or without colour.
export function paintMarker(marker: string, c: Palette): string {
  const word = marker.trim();
  if (word === 'ok') return c.green(marker);
  if (word === 'FAIL') return c.bold(c.red(marker));
  if (word === 'warn') return c.yellow(marker);
  return c.dim(marker);
}

// The severity word on a finding line, painted where it first appears. The
// word itself stays, so a reader without colour loses nothing.
export function paintSeverity(text: string, c: Palette): string {
  return text.replace(/\b(BLOCKER|HIGH|SUGGESTION)\b/, (severity) =>
    severity === 'BLOCKER'
      ? c.bold(c.red(severity))
      : severity === 'HIGH'
        ? c.yellow(severity)
        : c.cyan(severity)
  );
}
