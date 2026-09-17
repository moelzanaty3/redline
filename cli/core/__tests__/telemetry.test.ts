import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { clear, record, summarise, telemetryEnabled, telemetryPath } from '../telemetry.ts';

const fresh = (): string => join(mkdtempSync(join(tmpdir(), 'redline-funnel-')), 'funnel.jsonl');

// Off unless switched on. No "anonymous usage data" default, no first-run
// prompt most people accept without reading.
test('it is off unless explicitly switched on', () => {
  assert.equal(telemetryEnabled({}), false);
  assert.equal(telemetryEnabled({ REDLINE_TELEMETRY: '' }), false);
  assert.equal(telemetryEnabled({ REDLINE_TELEMETRY: '0' }), false);
  assert.equal(telemetryEnabled({ REDLINE_TELEMETRY: 'off' }), false);
  assert.equal(telemetryEnabled({ REDLINE_TELEMETRY: 'no' }), false);
});

test('1, on and true all switch it on', () => {
  for (const value of ['1', 'on', 'true', 'TRUE', ' on ']) {
    assert.equal(telemetryEnabled({ REDLINE_TELEMETRY: value }), true, value);
  }
});

test('the record is a file in the home directory and nowhere else', () => {
  assert.equal(telemetryPath('/home/x'), '/home/x/.redline/funnel.jsonl');
});

// There is no endpoint in the module and no dependency that could acquire one.
// This is the test that fails if somebody ever adds one.
test('nothing in the telemetry module can reach a network', () => {
  const source = readFileSync(new URL('../telemetry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\b|https?:\/\/|node:http|undici|axios/);
});

test('a run is appended and read back', () => {
  const path = fresh();
  record({ at: '2026-01-01T00:00:00.000Z', command: 'init', outcome: 'ok', ms: 120 }, path);
  record({ at: '2026-01-01T00:01:00.000Z', command: 'init', outcome: 'failed', ms: 80, code: 'host' }, path);

  const summary = summarise(path);
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.byCommand, [
    { command: 'init', runs: 2, ok: 1, failed: 1, medianMs: 100 },
  ]);
  assert.deepEqual(summary.topErrors, [{ code: 'host', count: 1 }]);
});

// The measurement is worth strictly less than the thing being measured: a
// read-only home must never turn a successful onboarding into an error.
//
// The unwritable path is built here rather than hardcoded. An earlier version
// of this test used /proc/nope, which does not exist on macOS — so it threw
// instantly and looked fine — while on Linux procfs refuses the mkdir in a way
// that sends Node's recursive mkdirSync into an infinite loop. The whole suite
// hung on CI and passed on every developer's machine. A path under a real file
// gives ENOTDIR immediately and identically everywhere.
test('an unwritable path fails silently rather than breaking the command', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'redline-funnel-')), 'not-a-directory');
  writeFileSync(file, 'x');

  assert.doesNotThrow(() =>
    record({ at: 'x', command: 'init', outcome: 'ok', ms: 1 }, join(file, 'funnel.jsonl'))
  );
});

// Normal on an append-only log a process was killed during.
test('a half-written last line does not stop the report', () => {
  const path = fresh();
  record({ at: 'a', command: 'init', outcome: 'ok', ms: 10 }, path);
  writeFileSync(path, `${readFileSync(path, 'utf8')}{"at":"b","comm`);

  assert.equal(summarise(path).total, 1);
});

test('a line that parses but is not an event is skipped', () => {
  const path = fresh();
  writeFileSync(path, '{"hello":"world"}\n[1,2,3]\n"a string"\nnull\n');
  assert.equal(summarise(path).total, 0);
});

test('no file at all reports nothing rather than failing', () => {
  const summary = summarise(join(tmpdir(), 'redline-funnel-absent', 'funnel.jsonl'));
  assert.deepEqual(summary, { total: 0, byCommand: [], topErrors: [] });
});

test('commands are ranked by how often they run', () => {
  const path = fresh();
  for (let i = 0; i < 3; i += 1) {
    record({ at: 'x', command: 'verify', outcome: 'ok', ms: 5 }, path);
  }
  record({ at: 'x', command: 'init', outcome: 'ok', ms: 5 }, path);

  assert.deepEqual(
    summarise(path).byCommand.map((row) => row.command),
    ['verify', 'init']
  );
});

test('an even number of runs takes the middle of the two', () => {
  const path = fresh();
  record({ at: 'x', command: 'init', outcome: 'ok', ms: 10 }, path);
  record({ at: 'x', command: 'init', outcome: 'ok', ms: 30 }, path);
  assert.equal(summarise(path).byCommand[0]?.medianMs, 20);
});

test('clearing removes the file, and says so when there was none', () => {
  const path = fresh();
  assert.equal(clear(path), false);
  record({ at: 'x', command: 'init', outcome: 'ok', ms: 1 }, path);
  assert.equal(clear(path), true);
  assert.equal(existsSync(path), false);
});
