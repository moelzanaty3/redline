import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLog, paintSeverity } from '../log.ts';
import { palette } from '../../ui/tty.ts';

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

test('a themed log paints markers and prefixes, and an unthemed one writes plain text', () => {
  const on = palette(true, 'basic');
  const painted = capture();
  const themed = createLog(painted.sink, { out: on, err: on });
  themed.report([
    { check: 'onboarded', ok: true, detail: 'profile web' },
    { check: 'security-floor', ok: false, detail: 'disabled' },
  ]);
  themed.warn('stale');
  themed.error('broken', 'fix it');
  assert.ok(painted.lines[0]?.includes('\x1b[32mok  \x1b[39m'));
  assert.ok(painted.lines[1]?.includes('\x1b[1m\x1b[31mFAIL'));
  assert.ok(painted.lines[2]?.startsWith('\x1b[33mwarn'));
  assert.ok(painted.lines[3]?.includes('\x1b[31merror'));

  const bare = capture();
  const plain = createLog(bare.sink, { out: palette(false), err: palette(false) });
  plain.report([{ check: 'onboarded', ok: true, detail: 'profile web' }]);
  plain.warn('stale');
  assert.ok(bare.lines.every((l) => !l.includes('\x1b')));
});

test('note writes to stderr, keeping stdout for the result', () => {
  const { sink, lines } = capture();
  createLog(sink).note('provider openai');
  assert.deepEqual(lines, ['ERR provider openai']);
});

test('paintSeverity colours the severity word and keeps it', () => {
  const on = palette(true, 'basic');
  const line = paintSeverity('Redline/BLOCKER [core/x]: bad', on);
  assert.ok(line.includes('BLOCKER'));
  assert.ok(line.includes('\x1b[31m'));
  assert.equal(paintSeverity('Redline/HIGH [core/x]: bad', palette(false)), 'Redline/HIGH [core/x]: bad');
});
