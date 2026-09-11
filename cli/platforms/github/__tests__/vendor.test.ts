import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_GATE_USES,
  VENDORED_GATE_PATH,
  pointCallerAtLocalGate,
  renderVendoredGate,
  stampedVersion,
} from '../vendor.ts';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const reusable = (): string => readFileSync(`${ROOT}workflows/redline-gate.yml`, 'utf8');
const caller = (): string =>
  readFileSync(`${ROOT}templates/redline.yml`, 'utf8').replaceAll('<org>', 'acme');

// CI runs actionlint over workflows/redline-gate.yml and never over the vendored
// copy, which only exists inside onboarded repositories. That is only safe while
// the copy is the linted file plus a comment header and a stamped pin — so that
// is asserted rather than assumed.
test('the vendored gate is the reusable one, not a second implementation of it', () => {
  const source = reusable();
  const out = renderVendoredGate(source, '9.9.9');
  const body = out.slice(out.indexOf('# Reusable readiness gate'));
  assert.equal(body, source.replace(/REDLINE_CLI_VERSION: *'[^']*'/g, "REDLINE_CLI_VERSION: '9.9.9'"));
  assert.ok(out.startsWith('# Managed by Redline'));
});

test('a vendored gate records the version that wrote it', () => {
  const out = renderVendoredGate(reusable(), '9.9.9');
  assert.equal(stampedVersion(out), '9.9.9');
  assert.ok(!out.includes("REDLINE_CLI_VERSION: '0.0.2'"));
});

// Both the policy job and the aggregate carry the pin. Stamping only the first
// would leave the two halves of one gate running different CLI versions.
test('every pin in the file is stamped, not only the first', () => {
  const out = renderVendoredGate(reusable(), '9.9.9');
  const pins = out.match(/REDLINE_CLI_VERSION: *'[^']*'/g) ?? [];
  assert.ok(pins.length >= 2, `expected more than one pin, found ${pins.length}`);
  assert.deepEqual(new Set(pins), new Set(["REDLINE_CLI_VERSION: '9.9.9'"]));
});

// A development build must not write `redlinegate@0.0.0-development` into a real
// repository: npm has never published it, so every `npx` in the gate fails and
// every pull request the gate reaches fails with it.
test('a development build leaves the shipped pin alone', () => {
  const out = renderVendoredGate(reusable(), null);
  assert.equal(stampedVersion(out), stampedVersion(reusable()));
});

test('the vendored gate says what it is and how it can be edited', () => {
  const out = renderVendoredGate(reusable(), '0.0.3');
  assert.match(out, /^# Managed by Redline\b/);
  assert.match(out, /head commit/);
  assert.match(out, /CODEOWNERS/);
});

// The header is what `refuseForeignCaller` reads to tell Redline's own output
// from a workflow that was already there. Without it the second run refuses to
// touch a file the first run wrote.
test('the header is the attribution a re-run looks for', () => {
  const out = renderVendoredGate(reusable(), '0.0.3');
  assert.ok(/^#[ \t]*Managed by Redline\b/m.test(out));
});

test('a local caller points inside the repository and carries no ref', () => {
  const out = pointCallerAtLocalGate(caller());
  assert.match(out, new RegExp(`uses: ${LOCAL_GATE_USES.replace(/[.\\/]/g, '\\$&')}$`, 'm'));
  assert.ok(!out.includes('acme/.github'));
  assert.ok(!/redline-gate\.yml@/.test(out));
});

// The required status check is built from the caller's job id and the called
// job's id. Changing either silently blocks every pull request in the
// repository, so switching gate source must change neither.
test('switching gate source does not move the required check', () => {
  const org = caller();
  const local = pointCallerAtLocalGate(org);
  const jobLine = /^ {2}redline-gate:$/m;
  assert.match(org, jobLine);
  assert.match(local, jobLine);
  assert.equal(
    org.replace(/uses: .*/, '').length,
    local.replace(/uses: .*/, '').length,
    'only the uses: line may differ between the two gate sources'
  );
});

test('the inputs the gate reads survive the rewrite', () => {
  const out = pointCallerAtLocalGate(caller());
  for (const key of ['rung:', 'stand-down:', 'soft-fail-labels:', 'adr-diff-threshold:']) {
    assert.ok(out.includes(key), `${key} was lost`);
  }
});

test('a caller with no org reference is returned untouched rather than half-rewritten', () => {
  const hand = 'name: Redline\njobs:\n  redline-gate:\n    uses: ./somewhere/else.yml\n';
  assert.equal(pointCallerAtLocalGate(hand), hand);
});

test('stampedVersion has no answer for a file that carries no pin', () => {
  assert.equal(stampedVersion('name: Redline\n'), null);
});

test('the vendored path is the one a local caller names', () => {
  assert.equal(LOCAL_GATE_USES, `./${VENDORED_GATE_PATH}`);
});
