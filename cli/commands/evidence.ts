import {
  canPromote,
  evidenceAgeDays,
  EVIDENCE_MAX_AGE_DAYS,
  nextRung,
  REQUIREMENTS,
  RUNG_INDEX,
  type Evidence,
  type Rung,
} from '../enforce/ladder.ts';
import { readConfig, writeConfig, type RecordedEvidence } from '../config/redline-json.ts';
import { RedlineError } from '../core/errors.ts';

/**
 * `redline evidence` — the measurement behind the rung, and the only thing that
 * can raise one.
 *
 * The ladder was unclimbable before this existed. `canPromote` asked for
 * evidence, nothing in the CLI ever supplied any, and so every repository was
 * refused every promotion and stayed advisory forever — which made the four
 * rungs decorative and the whole "earn your way to blocking" premise
 * unreachable. The only route up was hand-editing the file that tells you not
 * to edit it by hand.
 *
 * This is deliberately a *record*, not a measurement. The CLI cannot compute
 * seed recall or an acted-on rate: those come from the metrics plane, which
 * sees the whole estate over a window, and pretending to derive them from one
 * checkout would be inventing the number that governs enforcement. What the CLI
 * owns is the mechanism and the audit trail — validated, dated, attributed, and
 * in git where a reviewer can see it move.
 */

export interface EvidenceReport {
  readonly rung: Rung;
  readonly recorded: RecordedEvidence | null;
  /** Null at the top of the ladder. */
  readonly next: Rung | null;
  /** Empty when the next rung is reachable now. */
  readonly blockers: readonly string[];
  readonly eligible: boolean;
  readonly ageDays: number | null;
  readonly stale: boolean;
}

export interface EvidenceOptions {
  cwd: string;
  now?: Date;
}

function requireConfig(cwd: string) {
  const config = readConfig(cwd);
  if (config === null) {
    throw new RedlineError(
      'usage',
      'this repository is not onboarded, so there is no rung to raise',
      'run: npx redlinegate init'
    );
  }
  return config;
}

export function evidenceReport(opts: EvidenceOptions): EvidenceReport {
  const config = requireConfig(opts.cwd);
  const now = opts.now ?? new Date();
  const recorded = config.evidence ?? null;
  const next = nextRung(config.rung);

  const ageDays = recorded === null ? null : evidenceAgeDays(recorded.recordedAt, now);
  const stale = ageDays !== null && ageDays > EVIDENCE_MAX_AGE_DAYS;

  if (next === null) {
    return { rung: config.rung, recorded, next: null, blockers: [], eligible: false, ageDays, stale };
  }

  // No record is not zero. `sampleSize: 0` with null rates is what canPromote
  // is given, and its refusals read correctly for that case — "0 have been
  // recorded" is true of a repository nobody has measured.
  const evidence: Evidence = recorded ?? {
    seedRecall: null,
    actedOnRate: null,
    sampleSize: 0,
    falsePositives: null,
  };

  const check = canPromote(config.rung, next, evidence, 'observe', now);
  return {
    rung: config.rung,
    recorded,
    next,
    blockers: check.blockers,
    eligible: check.eligible,
    ageDays,
    stale,
  };
}

export interface RecordOptions extends EvidenceOptions {
  seedRecall: number | null;
  actedOnRate: number | null;
  sampleSize: number;
  falsePositives: number | null;
  source: string;
}

export function recordEvidence(opts: RecordOptions): EvidenceReport {
  const config = requireConfig(opts.cwd);

  // Validated here as well as on read, so a bad figure is refused at the moment
  // somebody can still fix it rather than silently discarded on the next run.
  // A rate outside 0..1 is not a rate, and a clamped 1.4 would read as the
  // perfect recall the blocking rungs require.
  const rate = (value: number | null, flag: string): number | null => {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RedlineError(
        'usage',
        `--${flag} must be a rate between 0 and 1, not ${value}`,
        '94% is 0.94. This is the figure that decides whether a repository may block a merge, so it is ' +
          'refused rather than interpreted'
      );
    }
    return value;
  };

  if (!Number.isInteger(opts.sampleSize) || opts.sampleSize < 0) {
    throw new RedlineError('usage', `--sample-size must be a whole number of pull requests, not ${opts.sampleSize}`);
  }
  if (opts.falsePositives !== null && (!Number.isInteger(opts.falsePositives) || opts.falsePositives < 0)) {
    throw new RedlineError('usage', `--false-positives must be a whole number, not ${opts.falsePositives}`);
  }
  if (opts.source.trim() === '') {
    throw new RedlineError(
      'usage',
      '--source is required: evidence with no provenance is an assertion',
      'a workflow run URL, a job name, or a person — whatever answers "where did this number come from" ' +
        'for whoever reads it next'
    );
  }

  const evidence: RecordedEvidence = {
    seedRecall: rate(opts.seedRecall, 'seed-recall'),
    actedOnRate: rate(opts.actedOnRate, 'acted-on-rate'),
    sampleSize: opts.sampleSize,
    falsePositives: opts.falsePositives,
    recordedAt: (opts.now ?? new Date()).toISOString(),
    source: opts.source.trim(),
  };

  writeConfig(opts.cwd, { ...config, evidence });
  return evidenceReport(opts);
}

export function formatEvidence(report: EvidenceReport): string[] {
  const lines: string[] = [];
  lines.push(`rung         ${report.rung}`);

  if (report.recorded === null) {
    lines.push('evidence     none recorded — nothing can raise the rung until something does');
  } else {
    const r = report.recorded;
    const pct = (v: number | null) => (v === null ? 'not measured' : `${(v * 100).toFixed(0)}%`);
    lines.push(`seed recall  ${pct(r.seedRecall)}`);
    lines.push(`acted on     ${pct(r.actedOnRate)}`);
    lines.push(`sample       ${r.sampleSize} pull request(s)`);
    lines.push(`false pos.   ${r.falsePositives === null ? 'not measured' : r.falsePositives}`);
    lines.push(
      `recorded     ${r.recordedAt.slice(0, 10)} (${report.ageDays} day(s) ago${report.stale ? ', STALE' : ''}) — ${r.source}`
    );
  }

  lines.push('');
  if (report.next === null) {
    lines.push(`${report.rung} is the top of the ladder — there is nothing above it to earn.`);
    return lines;
  }

  if (report.eligible) {
    lines.push(`eligible for ${report.next} — raise it with: redline init --rung ${report.next}`);
    return lines;
  }

  lines.push(`not yet eligible for ${report.next}:`);
  for (const blocker of report.blockers) lines.push(`  - ${blocker}`);

  const need = REQUIREMENTS[report.next];
  lines.push('');
  lines.push(`what ${report.next} asks for:`);
  if (need.minSampleSize > 0) lines.push(`  sample size      >= ${need.minSampleSize} reviewed pull requests`);
  if (need.minSeedRecall !== null) lines.push(`  seed recall      >= ${(need.minSeedRecall * 100).toFixed(0)}%`);
  if (need.minActedOnRate !== null) lines.push(`  acted-on rate    >= ${(need.minActedOnRate * 100).toFixed(0)}%`);
  if (need.maxFalsePositives !== null) lines.push(`  false positives  <= ${need.maxFalsePositives}`);
  if (RUNG_INDEX[report.next] > 0) lines.push(`  measured within  ${EVIDENCE_MAX_AGE_DAYS} days`);

  return lines;
}
