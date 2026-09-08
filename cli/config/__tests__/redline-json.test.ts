import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_FILE, parseConfig, readConfig, writeConfig, type RedlineConfig } from '../redline-json.ts';

const valid: RedlineConfig = {
  standardsVersion: '0.0.1',
  cliVersion: '0.0.1',
  host: 'github',
  profile: 'web',
  vendors: ['copilot', 'agents', 'claude'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: true,
    speckit: false,
    tmf: false,
    sensitivePathReviewers: true,
  },
  pendingAdmin: ['secret-scanning'],
  onboardedAt: '2026-09-01T00:00:00.000Z',
  lastRunAt: '2026-09-02T00:00:00.000Z',
  localRules: true,
  capabilities: { gate: true, mergePolicy: true, labels: true },
  commandFiles: { '.claude/commands/redline-init.md': 'sha256:abc' },
  rung: 'observe' as const,
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
  // The `//` explainer rides on the front and is not part of the config, so the
  // round trip is over what parseConfig reads back, not over the bytes.
  assert.equal(onDisk, `${JSON.stringify({ '//': JSON.parse(onDisk)['//'], ...valid }, null, 2)}\n`);
  assert.ok(Array.isArray(JSON.parse(onDisk)['//']), 'the file explains its own keys');
  assert.deepEqual(readConfig(dir), valid, 'the explainer must not survive into the parsed config');
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


// Every repository onboarded before the operator could deselect anything chose
// all of it — that is what running `redline init` at all meant then. Reading a
// missing key as a deselection would silently stop maintaining the gate on
// every one of them.
test('a config written before capabilities existed reads back with every capability selected', () => {
  const { capabilities: _capabilities, ...rest } = valid;
  assert.deepEqual(parseConfig(rest).capabilities, { gate: true, mergePolicy: true, labels: true });
});

test('an explicitly deselected capability reads back deselected', () => {
  const parsed = parseConfig({ ...valid, capabilities: { gate: false, mergePolicy: true, labels: true } });
  assert.equal(parsed.capabilities.gate, false);
});

// Only `false` is a deselection. A key some other tool wrote, or one a hand
// edit mistyped, must not be the way a repository falls below the standard.
test('a capability that is not exactly false stays selected', () => {
  const parsed = parseConfig({ ...valid, capabilities: { gate: 'no', mergePolicy: 0, labels: null } });
  assert.deepEqual(parsed.capabilities, { gate: true, mergePolicy: true, labels: true });
});

test('command content ids read back, and are empty when the field predates them', () => {
  const { commandFiles: _commandFiles, ...rest } = valid;
  assert.deepEqual(parseConfig(rest).commandFiles, {});
  assert.deepEqual(parseConfig(structuredClone(valid)).commandFiles, {
    '.claude/commands/redline-init.md': 'sha256:abc',
  });
});

test('a config written before the ladder existed reads back at the rung that changes nothing', () => {
  const { rung: _rung, ...before } = valid;

  assert.equal(parseConfig(before).rung, 'observe');
});

test('an unrecognised rung reads back as observe rather than raising enforcement', () => {
  // A typo or a hand edit must never be able to make a repository stricter than
  // anyone chose. The failure direction for an unreadable value is the one that
  // blocks nobody.
  assert.equal(parseConfig({ ...valid, rung: 'block-everything' }).rung, 'observe');
  assert.equal(parseConfig({ ...valid, rung: 42 }).rung, 'observe');
});

test('a recorded rung is preserved', () => {
  assert.equal(parseConfig({ ...valid, rung: 'block-blocker' }).rung, 'block-blocker');
});

test('a menu key added after a repository was onboarded takes its default, not an error', () => {
  // Rejecting an absent key made every CLI upgrade invalidate the config of
  // every repository in the estate at once.
  const cwd = mkdtempSync(join(tmpdir(), 'redline-menu-'));
  const config = { ...valid, menu: { ...valid.menu } } as Record<string, unknown>;
  delete (config['menu'] as Record<string, unknown>)['tmf'];
  writeFileSync(join(cwd, CONFIG_FILE), JSON.stringify(config));

  assert.equal(readConfig(cwd)?.menu.tmf, false);
});

test('a menu key that is present and not a boolean is still a corrupt file', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'redline-menu-bad-'));
  writeFileSync(
    join(cwd, CONFIG_FILE),
    JSON.stringify({ ...valid, menu: { ...valid.menu, tmf: 'yes' } })
  );

  assert.throws(() => readConfig(cwd), /menu\.tmf must be a boolean/);
});
