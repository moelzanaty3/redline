import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { isRedlineError } from '../../core/errors.ts';
import { explain, loadRules, suggest } from '../catalogue.ts';
// The CI parser. Imported here and nowhere else in the CLI: this test exists to
// hold the two readers together, and importing it anywhere else would make the
// untyped module part of the shipped build.
import { loadRules as loadRulesFromScripts } from '../../../scripts/lib/rules.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Two parsers read the same markdown: this one for `redline explain`, and
// scripts/lib/rules.mjs for validate, seed scoring and the digest. If they
// disagree, the command explains a rule the gate does not enforce, or misses one
// it does — and nothing else in the repository would notice.
test('the CLI and the CI script agree on every rule in the standards', () => {
  const mine = loadRules(ROOT);
  const theirs = loadRulesFromScripts(ROOT);

  assert.deepEqual([...mine.keys()].sort(), [...theirs.keys()].sort());
  for (const [id, rule] of mine) {
    assert.equal(rule.severity, theirs.get(id)?.severity, `severity of ${id}`);
    assert.equal(rule.stack, theirs.get(id)?.stack, `stack of ${id}`);
  }
});

test('a rule carries where it is defined and who receives it', () => {
  const found = explain(ROOT, 'angular/unsubscribed-subscription');
  assert.equal(found.rule.severity, 'BLOCKER');
  assert.equal(found.rule.source, 'standards/stacks/angular.md');
  assert.ok(found.rule.line > 0);
  assert.deepEqual(found.profiles, ['web-angular']);
  assert.equal(found.deterministic, false);
});

// The core standard is not scoped to a stack, so it reaches every profile. That
// is the answer to "why am I getting this on a Terraform repository".
test('a core rule reaches every profile and is scoped to no globs', () => {
  const found = explain(ROOT, 'core/hardcoded-secrets');
  assert.equal(found.globs.length, 0);
  assert.ok(found.profiles.includes('infra'));
  assert.ok(found.profiles.includes('web-react'));
});

test('a rule a checker decides says so', () => {
  assert.equal(explain(ROOT, 'core/untracked-todo').deterministic, true);
  assert.equal(explain(ROOT, 'javascript/var-in-new-code').deterministic, true);
});

test('an unknown id fails as usage, with candidates when there are any', () => {
  assert.throws(
    () => explain(ROOT, 'angular/unsubscribe'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'usage' &&
      /did you mean: angular\/unsubscribed-subscription/.test(err.hint ?? '')
  );
});

// A list of rules that merely share a stack with the typo is worse than no
// list: it reads as though the tool recognised something.
test('nothing close means no candidates rather than a stack full of them', () => {
  assert.deepEqual(suggest('angular/zzzzz', ['angular/missing-trackby', 'vue/v-html-sink']), []);
  assert.deepEqual(suggest('core/hardcoded-secret', ['core/hardcoded-secrets']), [
    'core/hardcoded-secrets',
  ]);
});

test('a rule bullet wrapped over several lines is read as one sentence', () => {
  const rules = loadRules(ROOT);

  // This rule's text wraps in standards/core.md. Read a line at a time it ended
  // "…including in test files," — a truncated clause, printed by `redline
  // explain`, by the stack tables and by the rule's own page.
  const secrets = rules.get('core/hardcoded-secrets');
  assert.ok(secrets, 'core/hardcoded-secrets is in the catalogue');
  assert.match(secrets.text, /fixtures, config samples, and comments\.$/);

  // Nothing may swallow the bullet that follows it: a continuation is indented,
  // and the next rule is not.
  for (const rule of rules.values()) {
    assert.ok(
      !/`[a-z-]+\/[a-z-]+`\s+—/.test(rule.text),
      `${rule.id} absorbed the rule after it: ${rule.text.slice(0, 90)}`
    );
  }

  // And no rule still ends mid-clause.
  for (const rule of rules.values()) {
    assert.ok(
      !/[,;:]$/.test(rule.text.trim()),
      `${rule.id} ends mid-clause: …${rule.text.slice(-60)}`
    );
  }
});
