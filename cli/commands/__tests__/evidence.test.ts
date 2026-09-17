import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { evidenceReport, recordEvidence, formatEvidence } from '../evidence.ts';
import { readConfig, writeConfig, type RedlineConfig } from '../../config/redline-json.ts';
import { canPromote, EVIDENCE_MAX_AGE_DAYS } from '../../enforce/ladder.ts';
import { isRedlineError } from '../../core/errors.ts';

function onboarded(rung: RedlineConfig['rung'] = 'observe'): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-evidence-'));
  execFileSync('git', ['init', '-q', '.'], { cwd: dir });
  writeFileSync(
    join(dir, '.redline.json'),
    JSON.stringify({
      standardsVersion: '0.1.0',
      cliVersion: '0.1.4',
      host: 'github',
      profile: 'web-react',
      vendors: ['copilot'],
      menu: {
        blockingGate: false,
        adrForLargeDiffs: true,
        accessibility: true,
        speckit: false,
        tmf: false,
        sensitivePathReviewers: false,
      },
      capabilities: { gate: true, mergePolicy: true, labels: true },
      integrations: [],
      pendingAdmin: [],
      onboardedAt: '2026-01-01T00:00:00.000Z',
      lastRunAt: '2026-01-01T00:00:00.000Z',
      rung,
    })
  );
  return dir;
}

const FULL = {
  seedRecall: 1,
  actedOnRate: 0.9,
  sampleSize: 60,
  falsePositives: 0,
  source: 'canary run 41',
};

// The bug this whole command exists for: canPromote asked for evidence, nothing
// in the CLI ever supplied any, so every repository was refused every promotion
// and stayed advisory forever. Four rungs, none of them reachable.
test('a repository with no evidence cannot climb', () => {
  const report = evidenceReport({ cwd: onboarded() });
  assert.equal(report.recorded, null);
  assert.equal(report.eligible, false);
  assert.ok(report.blockers.length > 0);
});

test('recording evidence makes the next rung reachable', () => {
  const cwd = onboarded();
  assert.equal(evidenceReport({ cwd }).eligible, false);

  const after = recordEvidence({ cwd, ...FULL });
  assert.equal(after.eligible, true, after.blockers.join('; '));
  assert.equal(after.next, 'warn');
});

test('the record lands in .redline.json with its provenance', () => {
  const cwd = onboarded();
  recordEvidence({ cwd, ...FULL });
  const stored = readConfig(cwd)?.evidence;
  assert.equal(stored?.sampleSize, 60);
  assert.equal(stored?.source, 'canary run 41');
  // A number with no date and no source is an assertion wearing a
  // measurement's clothes.
  assert.ok(stored?.recordedAt);
  assert.ok(!Number.isNaN(Date.parse(stored.recordedAt)));
});

// Provenance is the difference between evidence and assertion, so it is the one
// field with no default.
test('a record with no source is refused', () => {
  try {
    recordEvidence({ cwd: onboarded(), ...FULL, source: '  ' });
    assert.fail('expected a refusal');
  } catch (error) {
    assert.ok(isRedlineError(error));
    assert.match(error.message, /--source is required/);
  }
});

// 94 meant as "94%" clamped to 1 would read as the perfect recall the blocking
// rungs require — a veto granted on a broken recorder.
test('a rate outside 0..1 is refused rather than clamped', () => {
  for (const bad of [94, -0.1, 1.5]) {
    try {
      recordEvidence({ cwd: onboarded(), ...FULL, seedRecall: bad });
      assert.fail(`expected ${bad} to be refused`);
    } catch (error) {
      assert.ok(isRedlineError(error));
      assert.match(error.message, /between 0 and 1/);
    }
  }
});

test('a fractional sample size is refused', () => {
  try {
    recordEvidence({ cwd: onboarded(), ...FULL, sampleSize: 12.5 });
    assert.fail('expected a refusal');
  } catch (error) {
    assert.ok(isRedlineError(error));
    assert.match(error.message, /whole number/);
  }
});

// A partially-readable measurement is worse than none: it would promote on
// whichever half survived, and that is not the half a reviewer checked.
test('a malformed record on disk reads back as no evidence at all', () => {
  const cwd = onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, {
    ...config,
    // @ts-expect-error deliberately malformed — this is the hand edit the
    // config file tells people not to make, and it must not grant anything.
    evidence: { seedRecall: 1, sampleSize: 60, source: 'x' },
  });
  assert.equal(readConfig(cwd)?.evidence, undefined);
  assert.equal(evidenceReport({ cwd }).eligible, false);
});

test('a hand-written rate above 1 is discarded on read', () => {
  const cwd = onboarded();
  const raw = JSON.parse(readFileSync(join(cwd, '.redline.json'), 'utf8')) as Record<string, unknown>;
  raw['evidence'] = { ...FULL, seedRecall: 4, recordedAt: new Date().toISOString() };
  writeFileSync(join(cwd, '.redline.json'), JSON.stringify(raw));
  assert.equal(readConfig(cwd)?.evidence, undefined);
});

// Evidence describes a reviewer, a rule set and a codebase at a moment. All
// three move, and a blocking rung held on last year's number is the guarantee
// nobody checked.
test('evidence past the freshness window stops justifying a promotion', () => {
  const stale = new Date(Date.now() - (EVIDENCE_MAX_AGE_DAYS + 1) * 86_400_000).toISOString();
  const check = canPromote('warn', 'block-blocker', {
    seedRecall: 1,
    actedOnRate: 0.9,
    sampleSize: 60,
    falsePositives: 0,
    recordedAt: stale,
  });
  assert.equal(check.eligible, false);
  assert.ok(check.blockers.some((b) => /days old/.test(b)), check.blockers.join('; '));
});

test('evidence inside the window still does', () => {
  const fresh = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const check = canPromote('warn', 'block-blocker', {
    seedRecall: 1,
    actedOnRate: 0.9,
    sampleSize: 60,
    falsePositives: 0,
    recordedAt: fresh,
  });
  assert.equal(check.eligible, true, check.blockers.join('; '));
});

// The safe direction never needs permission, fresh or otherwise.
test('stale evidence does not block a demotion', () => {
  const stale = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const check = canPromote('block-blocker', 'observe', {
    seedRecall: null,
    actedOnRate: null,
    sampleSize: 0,
    falsePositives: null,
    recordedAt: stale,
  });
  assert.equal(check.eligible, true);
});

test('the report names what the next rung asks for, not just that it refused', () => {
  const lines = formatEvidence(evidenceReport({ cwd: onboarded('warn') })).join('\n');
  assert.match(lines, /seed recall\s+>= 100%/);
  assert.match(lines, /false positives\s+<= 0/);
  assert.match(lines, new RegExp(`measured within\\s+${EVIDENCE_MAX_AGE_DAYS} days`));
});

test('the top of the ladder says so rather than offering a rung above it', () => {
  const report = evidenceReport({ cwd: onboarded('block-high') });
  assert.equal(report.next, null);
  assert.match(formatEvidence(report).join('\n'), /top of the ladder/);
});

test('a repository that is not onboarded is told to onboard, not shown an empty report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-evidence-bare-'));
  try {
    evidenceReport({ cwd: dir });
    assert.fail('expected a refusal');
  } catch (error) {
    assert.ok(isRedlineError(error));
    assert.match(error.hint ?? "", /redlinegate init/);
  }
});
