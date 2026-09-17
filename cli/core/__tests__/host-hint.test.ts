import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostHint, shapeHint } from '../host-hint.ts';

// The status is the diagnosis; the caller almost never knows the remedy. These
// call sites used to report `reading acme/web returned 403` and stop, which is
// how a token missing a scope became a ticket.
test('401 names the credential to check, per host', () => {
  assert.match(hostHint(401, 'github') ?? '', /GH_TOKEN|gh auth login/);
  assert.match(hostHint(401, 'azure') ?? '', /AZURE_DEVOPS_EXT_PAT|az login/);
});

// The one that wastes the most time: it reads as "you are not allowed" when it
// is usually "this token was never granted the scope", and on a SAML
// organisation a perfectly scoped token still fails until it is authorised.
test('403 names both the scopes and the SAML authorisation', () => {
  const hint = hostHint(403, 'github') ?? '';
  assert.match(hint, /admin:org/);
  assert.match(hint, /SAML/);
});

test('404 says a private repository the token cannot see looks identical', () => {
  assert.match(hostHint(404) ?? '', /private repository gets 404, not 403/);
});

test('a failing host is not reported as something to fix', () => {
  for (const status of [500, 502, 503]) {
    assert.match(hostHint(status) ?? '', /retry/);
  }
  assert.match(hostHint(429) ?? '', /nothing is wrong with the setup/);
});

// A 200 is not a failure, and inventing advice for one would put a hint on a
// message that has no problem to solve.
test('a status with no useful advice returns nothing rather than filler', () => {
  assert.equal(hostHint(200), undefined);
  assert.equal(hostHint(302), undefined);
});

test('an unexpected body is named as this tool\u2019s bug, not the operator\u2019s', () => {
  const hint = shapeHint('the rulesets list');
  assert.match(hint, /the rulesets list/);
  assert.match(hint, /bug here/);
  assert.match(hint, /issues/);
});
