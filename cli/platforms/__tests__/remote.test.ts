import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemoteConfig } from '../remote.ts';
import { isRedlineError } from '../../core/errors.ts';

const valid = JSON.stringify({
  standardsVersion: '0.0.1',
  cliVersion: '0.0.1',
  host: 'github',
  profile: 'web',
  vendors: ['claude'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: false,
    speckit: false,
    sensitivePathReviewers: false,
  },
  pendingAdmin: [],
  onboardedAt: '2026-09-01T00:00:00.000Z',
  lastRunAt: '2026-09-02T00:00:00.000Z',
});

test('parses a valid remote config', () => {
  const config = parseRemoteConfig(valid, 'acme/web-app');
  assert.equal(config.profile, 'web');
  assert.deepEqual(config.vendors, ['claude']);
});

test('unparseable JSON names the repository it came from', () => {
  assert.throws(
    () => parseRemoteConfig('{ not json', 'acme/broken'),
    (err: unknown) =>
      isRedlineError(err) && /acme\/broken/.test(err.message) && /not valid JSON/.test(err.message)
  );
});

test('schema-invalid JSON names the repository it came from', () => {
  assert.throws(
    () => parseRemoteConfig('{"host":"gitlab"}', 'acme/invalid'),
    (err: unknown) =>
      isRedlineError(err) && /acme\/invalid/.test(err.message) && /is invalid/.test(err.message)
  );
});
