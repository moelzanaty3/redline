import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exempt } from '../exempt.ts';
import { isRedlineError } from '../../core/errors.ts';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const future = new Date(NOW.getTime() + 10 * 86400000).toISOString().slice(0, 10);

function withBody(body: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'redline-exempt-'));
  try {
    const path = join(dir, 'body.md');
    writeFileSync(path, body);
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const valid = `## Redline exemption\n- reason: the upstream fix lands in v4 and we are pinned to v3 until the migration\n- until: ${future}\n- scope: checklist\n`;

test('a valid exemption applies to the check it names', () => {
  withBody(valid, (bodyFile) => {
    const report = exempt({ bodyFile, scope: 'checklist', now: NOW });
    assert.equal(report.applies, true);
    assert.match(report.messages[0] ?? '', /exempt until/);
  });
});

test('a valid exemption does not apply to a check outside its scope', () => {
  withBody(valid, (bodyFile) => {
    const report = exempt({ bodyFile, scope: 'adr', now: NOW });
    assert.equal(report.applies, false);
    assert.match(report.messages[0] ?? '', /does not cover "adr"/);
  });
});

test('a pull request with no exemption block does not exempt anything', () => {
  withBody('## Summary\n\nnothing\n', (bodyFile) => {
    const report = exempt({ bodyFile, scope: 'checklist', now: NOW });
    assert.equal(report.applies, false);
    assert.match(report.messages[0] ?? '', /a label alone no longer exempts/);
  });
});

test('an expired exemption does not apply', () => {
  withBody(
    `## Redline exemption\n- reason: this is a long enough reason to pass the length check\n- until: 2020-01-01\n`,
    (bodyFile) => {
      const report = exempt({ bodyFile, now: NOW });
      assert.equal(report.applies, false);
      assert.match(report.messages[0] ?? '', /expired/);
    }
  );
});

test('an unreadable body file is a usage error, not a silent pass', () => {
  // Failing open here would exempt every pull request whose body could not be
  // written to disk by the gate — a failure mode that reads as "the gate is
  // fine" on every repository at once.
  assert.throws(
    () => exempt({ bodyFile: '/nonexistent/body.md', now: NOW }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage'
  );
});

test('a body containing shell metacharacters is read as text, never evaluated', () => {
  withBody(
    `## Redline exemption\n- reason: fixes \`rm -rf /\` $(whoami) and other things we are not running\n- until: ${future}\n`,
    (bodyFile) => {
      const report = exempt({ bodyFile, now: NOW });
      assert.equal(report.applies, true);
      assert.match(report.exemption?.reason ?? '', /rm -rf/);
    }
  );
});
