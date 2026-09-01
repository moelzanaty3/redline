import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_CAPABILITIES,
  HOSTS,
  isPending,
  type CapabilityOutcome,
} from '../types.ts';

test('the host list is exactly the two supported hosts', () => {
  assert.deepEqual([...HOSTS], ['github', 'azure']);
});

test('admin capabilities are unique and non-empty', () => {
  assert.ok(ADMIN_CAPABILITIES.length > 0);
  assert.equal(new Set(ADMIN_CAPABILITIES).size, ADMIN_CAPABILITIES.length);
});

test('only a denied outcome is pending admin action', () => {
  const cases: [CapabilityOutcome['status'], boolean][] = [
    ['applied', false],
    ['already', false],
    ['denied', true],
    ['unsupported', false],
  ];
  for (const [status, expected] of cases) {
    const outcome: CapabilityOutcome = { capability: 'secret-scanning', status, detail: '' };
    assert.equal(isPending(outcome), expected, `${status} should be ${expected}`);
  }
});
