import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync } from '../plan.ts';
import type { Registry, RegistryEntry } from '../../registry/types.ts';

const entry = (repo: string, standardsVersion: string): RegistryEntry => ({
  host: 'github',
  org: 'acme',
  repo,
  defaultBranch: 'main',
  profile: 'web',
  standardsVersion,
  cliVersion: '0.0.1',
  onboardedAt: '2026-09-01T00:00:00.000Z',
  rung: 'observe',
});

const registry = (...entries: RegistryEntry[]): Registry => ({
  generatedAt: '2026-09-04T00:00:00.000Z',
  source: 'acme/redline',
  entries,
});

test('targets only the repositories behind the current standards version', () => {
  const plan = planSync(registry(entry('behind', '0.0.1'), entry('current', '0.0.2')), '0.0.2');

  assert.deepEqual(plan.targets.map((t) => t.entry.repo), ['behind']);
  assert.deepEqual(plan.skipped.map((s) => s.entry.repo), ['current']);
  assert.match(plan.skipped[0]?.reason ?? '', /already at standards v0\.0\.2/);
});

test('a target carries the version it is moving from', () => {
  const plan = planSync(registry(entry('behind', '0.0.1')), '0.0.5');

  assert.equal(plan.targets[0]?.from, '0.0.1');
  assert.equal(plan.standardsVersion, '0.0.5');
});

test('versions compare numerically, so 0.0.10 is ahead of 0.0.9', () => {
  // A string compare ranks "0.0.10" below "0.0.9" and would sync an estate
  // backwards from the tenth patch onward, forever.
  const plan = planSync(registry(entry('ten', '0.0.10')), '0.0.9');

  assert.deepEqual(plan.targets, []);
  assert.deepEqual(planSync(registry(entry('nine', '0.0.9')), '0.0.10').targets.length, 1);
});

test('a shorter recorded version is compared by position, not by length', () => {
  assert.equal(planSync(registry(entry('r', '1.0')), '1.0.1').targets.length, 1);
  assert.equal(planSync(registry(entry('r', '1.1')), '1.0.9').targets.length, 0);
});

test('an unparseable recorded version is treated as behind, not skipped', () => {
  // Hand-edited, or written by a CLI that predates the field. Syncing proposes
  // a correction; skipping would strand the repository silently.
  const plan = planSync(registry(entry('odd', 'not-a-version')), '0.0.1');

  assert.equal(plan.targets.length, 1);
});

test('--force syncs a repository already at the current version', () => {
  const plan = planSync(registry(entry('current', '0.0.2')), '0.0.2', { force: true });

  assert.equal(plan.targets.length, 1);
});

test('--repo narrows to one repository and says why the rest were skipped', () => {
  const plan = planSync(registry(entry('a', '0.0.1'), entry('b', '0.0.1')), '0.0.2', {
    repo: 'acme/b',
  });

  assert.deepEqual(plan.targets.map((t) => t.entry.repo), ['b']);
  assert.match(plan.skipped[0]?.reason ?? '', /not acme\/b/);
});

test('an empty register plans nothing rather than failing', () => {
  const plan = planSync(registry(), '0.0.2');

  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.skipped, []);
});
