import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLog } from '../log.ts';

function capture(): { sink: { out(l: string): void; err(l: string): void }; lines: string[] } {
  const lines: string[] = [];
  return { sink: { out: (l) => lines.push(l), err: (l) => lines.push(`ERR ${l}`) }, lines };
}

test('findings render with a pass or fail marker and their detail', () => {
  const { sink, lines } = capture();
  createLog(sink).report([
    { check: 'onboarded', ok: true, detail: 'profile web' },
    { check: 'security-floor', ok: false, detail: 'disabled: push-protection' },
  ]);
  assert.match(lines[0] ?? '', /^ok {2}onboarded {2}·? ?profile web$|onboarded/);
  assert.ok(lines.some((l) => l.includes('FAIL') && l.includes('security-floor')));
  assert.ok(lines.some((l) => l.includes('disabled: push-protection')));
});

test('errors carry their hint on a second line', () => {
  const { sink, lines } = capture();
  createLog(sink).error('no credentials found', 'run: gh auth login');
  assert.ok(lines[0]?.startsWith('ERR '));
  assert.ok(lines.some((l) => l.includes('gh auth login')));
});
