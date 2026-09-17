import { appendFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Where onboarding gets abandoned, recorded locally and only if asked.
//
// The question this answers is the one nobody could answer about this CLI: of
// the people who ran `redline init`, how many finished, and where did the rest
// stop? Every fix in this tool so far came from watching one person's terminal
// over their shoulder, which does not scale past the people sitting near me.
//
// The constraints are not negotiable and are the repository's own standard
// turned on itself:
//
//   - OFF unless switched on. No "anonymous usage data" default, no prompt on
//     first run that most people accept without reading.
//   - No network. Ever. There is no endpoint in this file and no dependency
//     that could acquire one. The record is a file on the machine that wrote
//     it, and moving it anywhere is a person's deliberate act.
//   - No customer data, no repository identity, no paths, no arguments. A
//     command name, an outcome, a duration, an error code. `core/
//     customer-data-in-logs` applies to us first.
//
// What it cannot do is as important as what it can: it cannot tell you which
// repository struggled, so it cannot be used to performance-manage anyone. That
// is a deliberate limit, not an omission.

export const TELEMETRY_ENV = 'REDLINE_TELEMETRY';

export interface FunnelEvent {
  at: string;
  command: string;
  outcome: 'ok' | 'usage' | 'failed' | 'host' | 'permission';
  ms: number;
  /** The RedlineError kind, never its message — a message can carry a path. */
  code?: string;
}

export function telemetryPath(home: string = homedir()): string {
  return join(home, '.redline', 'funnel.jsonl');
}

export function telemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[TELEMETRY_ENV]?.trim().toLowerCase();
  return value === '1' || value === 'on' || value === 'true';
}

// Silent on failure, deliberately. A full disk, a read-only home or a
// permission problem must never turn a successful onboarding into an error: the
// measurement is worth strictly less than the thing being measured.
export function record(event: FunnelEvent, path: string = telemetryPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Nothing. See above.
  }
}

export interface FunnelSummary {
  total: number;
  byCommand: Array<{ command: string; runs: number; ok: number; failed: number; medianMs: number }>;
  topErrors: Array<{ code: string; count: number }>;
}

export function summarise(path: string = telemetryPath()): FunnelSummary {
  if (!existsSync(path)) return { total: 0, byCommand: [], topErrors: [] };

  const events: FunnelEvent[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      // A half-written last line is normal on an append-only log that a process
      // was killed during; skip it rather than refusing to report at all.
      if (isEvent(parsed)) events.push(parsed);
    } catch {
      continue;
    }
  }

  const grouped = new Map<string, FunnelEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.command);
    if (list) list.push(event);
    else grouped.set(event.command, [event]);
  }

  const errors = new Map<string, number>();
  for (const event of events) {
    if (event.outcome === 'ok') continue;
    const code = event.code ?? event.outcome;
    errors.set(code, (errors.get(code) ?? 0) + 1);
  }

  return {
    total: events.length,
    byCommand: [...grouped.entries()]
      .map(([command, list]) => ({
        command,
        runs: list.length,
        ok: list.filter((event) => event.outcome === 'ok').length,
        failed: list.filter((event) => event.outcome !== 'ok').length,
        medianMs: median(list.map((event) => event.ms)),
      }))
      .sort((a, b) => b.runs - a.runs),
    topErrors: [...errors.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function clear(path: string = telemetryPath()): boolean {
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

function isEvent(value: unknown): value is FunnelEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event['at'] === 'string' &&
    typeof event['command'] === 'string' &&
    typeof event['outcome'] === 'string' &&
    typeof event['ms'] === 'number'
  );
}
