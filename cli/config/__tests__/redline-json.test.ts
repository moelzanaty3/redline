import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_FILE, parseConfig, readConfig, writeConfig, type RedlineConfig } from '../redline-json.ts';

const valid: RedlineConfig = {
  standardsVersion: '0.0.1',
  cliVersion: '3.0.0',
  host: 'github',
  profile: 'web',
  vendors: ['copilot', 'agents', 'claude'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: true,
    speckit: false,
    sensitivePathReviewers: true,
  },
  pendingAdmin: ['secret-scanning'],
  onboardedAt: '2026-09-01T00:00:00.000Z',
  lastRunAt: '2026-09-02T00:00:00.000Z',
  localRules: true,
};

test('parses a valid config', () => {
  assert.deepEqual(parseConfig(structuredClone(valid)), valid);
});

test('rejects an unknown host', () => {
  assert.throws(() => parseConfig({ ...valid, host: 'gitlab' }), /host/);
});

test('rejects a missing menu', () => {
  const { menu: _menu, ...rest } = valid;
  assert.throws(() => parseConfig(rest), /menu/);
});

test('rejects an unknown pendingAdmin entry', () => {
  assert.throws(() => parseConfig({ ...valid, pendingAdmin: ['make-tea'] }), /pendingAdmin/);
});

test('rejects a non-object', () => {
  assert.throws(() => parseConfig('nope'), /object/);
});

test('round-trips through disk with stable formatting', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-cfg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeConfig(dir, valid);
  const onDisk = readFileSync(join(dir, CONFIG_FILE), 'utf8');
  assert.ok(onDisk.endsWith('\n'), 'file must end with a newline');
  assert.equal(onDisk, `${JSON.stringify(valid, null, 2)}\n`);
  assert.deepEqual(readConfig(dir), valid);
});

test('readConfig returns null when the repo is not onboarded', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-cfg-none-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(readConfig(dir), null);
});

test('a corrupt config is a failure, not a silent null', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-cfg-bad-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, CONFIG_FILE), '{ not json');
  assert.throws(() => readConfig(dir), /\.redline\.json/);
});

// Repositories onboarded before lastRunAt existed must keep re-running: the
// field is derived from onboardedAt rather than rejected as invalid.
test('a config written before lastRunAt existed parses, dating the last run to onboarding', () => {
  const { lastRunAt: _lastRunAt, ...legacy } = valid;
  assert.equal(parseConfig(legacy).lastRunAt, valid.onboardedAt);
});

// The record of whether `.redline/local.md` was there last time, which is what
// lets verify tell "never had one" from "had one and it went away". A config
// written before the field existed reads back as never having had one — the
// forgiving direction, since verify's local-rules branch only ever softens a
// finding.
test('a config written before local rules existed reads back as never having had one', () => {
  const { localRules: _localRules, ...legacy } = valid;
  assert.equal(parseConfig(legacy).localRules, false);
});

test('a non-boolean localRules is read as absent rather than failing the config', () => {
  assert.equal(parseConfig({ ...valid, localRules: 'yes' }).localRules, false);
});
