import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemote } from '../detect.ts';

test('github https', () => {
  assert.deepEqual(parseRemote('https://github.com/acme/web.git'), {
    host: 'github',
    org: 'acme',
    repo: 'web',
  });
});

test('github ssh', () => {
  assert.deepEqual(parseRemote('git@github.com:acme/web.git'), {
    host: 'github',
    org: 'acme',
    repo: 'web',
  });
});

test('github https without the .git suffix', () => {
  assert.equal(parseRemote('https://github.com/acme/web').repo, 'web');
});

test('github enterprise host is recognised by path shape, not domain', () => {
  assert.deepEqual(parseRemote('https://github.acme-corp.net/platform/web.git'), {
    host: 'github',
    org: 'platform',
    repo: 'web',
  });
});

test('azure devops https carries a project', () => {
  assert.deepEqual(parseRemote('https://dev.azure.com/acme/Payments/_git/web'), {
    host: 'azure',
    org: 'acme',
    project: 'Payments',
    repo: 'web',
  });
});

test('azure devops ssh', () => {
  assert.deepEqual(parseRemote('git@ssh.dev.azure.com:v3/acme/Payments/web'), {
    host: 'azure',
    org: 'acme',
    project: 'Payments',
    repo: 'web',
  });
});

test('legacy visualstudio.com host', () => {
  assert.deepEqual(parseRemote('https://acme.visualstudio.com/Payments/_git/web'), {
    host: 'azure',
    org: 'acme',
    project: 'Payments',
    repo: 'web',
  });
});

test('an unrecognised remote is a usage error naming the two supported hosts', () => {
  assert.throws(() => parseRemote('https://gitlab.com/acme/web.git'), /github.*azure/i);
});

test('a repository with no remote is a usage error', () => {
  assert.throws(() => parseRemote(''), /remote/i);
});
