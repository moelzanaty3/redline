import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleReference, ruleUrl } from '../url.ts';

const BASE = 'https://redline.example.com';

test('a rule id becomes an address under the configured base', () => {
  assert.equal(ruleUrl('javascript/var-in-new-code', BASE), `${BASE}/r/javascript/var-in-new-code`);
  assert.equal(ruleUrl('core/hardcoded-secrets', BASE), `${BASE}/r/core/hardcoded-secrets`);
});

test('a trailing slash on the base does not double up', () => {
  assert.equal(ruleUrl('core/naive-clock', 'https://x.test/'), 'https://x.test/r/core/naive-clock');
  assert.equal(ruleUrl('core/naive-clock', 'https://x.test///'), 'https://x.test/r/core/naive-clock');
});

test('a docs path under the base is kept', () => {
  // An organisation that publishes the standard under a path, not at a root.
  assert.equal(
    ruleUrl('go/panic-for-expected-failure', 'https://intranet.test/eng/redline'),
    'https://intranet.test/eng/redline/r/go/panic-for-expected-failure'
  );
});

test('no base means no link, never a placeholder', () => {
  // The same reason verify reports `??` and never `ok`: a link that goes
  // nowhere costs the reader the click before they find out.
  for (const empty of ['', '   ', '\n']) {
    assert.equal(ruleUrl('core/untracked-todo', empty), null);
    assert.equal(ruleReference('core/untracked-todo', empty), '');
  }
});

test('a base that is not http(s) is refused', () => {
  // A finding is rendered into a comment on somebody else's host. A hand edit
  // to .redline.json must not be able to put an arbitrary scheme there.
  for (const hostile of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://x.test',
    '//x.test',
    'x.test',
  ]) {
    assert.equal(ruleUrl('core/hardcoded-secrets', hostile), null, hostile);
  }
});

test('the reference is one line, indented under the finding', () => {
  assert.equal(
    ruleReference('core/hardcoded-secrets', BASE),
    `\n  → ${BASE}/r/core/hardcoded-secrets`
  );
});
