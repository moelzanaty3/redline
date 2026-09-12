import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemote, redactRemote } from '../detect.ts';

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

test('github enterprise host is recognised when the hostname contains "github"', () => {
  assert.deepEqual(parseRemote('https://github.acme-corp.net/platform/web.git'), {
    host: 'github',
    org: 'platform',
    repo: 'web',
  });
});

test('a self-hosted GHES on a hostname without "github" is not auto-detected', () => {
  assert.throws(() => parseRemote('https://git.internal-corp.io/platform/web.git'), /github.*azure/i);
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

// Phase 1 scope decision: an explicit SSH port (`ssh://git@host:22/org/repo`)
// is not a shape any host commonly emits by default and is not parsed. It
// must fail loudly through the same "cannot tell which host" error rather
// than being silently misparsed (the port digits could otherwise be mistaken
// for a path segment).
test('an ssh remote with an explicit port is out of scope and throws cleanly', () => {
  assert.throws(() => parseRemote('ssh://git@github.com:22/acme/web.git'), /github.*azure/i);
});

test('a repository with no remote is a usage error', () => {
  assert.throws(() => parseRemote(''), /remote/i);
});

test('redactRemote strips inline credentials from an https remote', () => {
  // What a CI checkout and a credential helper both write. The token must not
  // reach an error message a reader is told to paste into an issue.
  assert.equal(
    redactRemote('https://x-access-token:ghp_AAAABBBBCCCCDDDD@github.com/acme/web.git'),
    'https://<redacted>@github.com/acme/web.git'
  );
  assert.equal(
    redactRemote('https://someone:s3cr3t@github.acme-corp.net/acme/web.git'),
    'https://<redacted>@github.acme-corp.net/acme/web.git'
  );
});

test('redactRemote leaves a remote carrying no secret exactly as it is', () => {
  // ssh usernames are not secrets, and the ssh forms are not URLs — a parser
  // that normalised them would break the very string the reader has to compare
  // against their own `git remote -v`.
  assert.equal(redactRemote('git@github.com:acme/web.git'), 'git@github.com:acme/web.git');
  assert.equal(redactRemote('https://github.com/acme/web.git'), 'https://github.com/acme/web.git');
  assert.equal(
    redactRemote('git@ssh.dev.azure.com:v3/acme/platform/web'),
    'git@ssh.dev.azure.com:v3/acme/platform/web'
  );
});

test('an unrecognised remote is quoted back without its credentials', () => {
  // The error names the string so the reader can see what was parsed. That is
  // the one place a credentialed remote reaches a human by design, so it is the
  // one place redaction has to be wired in rather than assumed.
  assert.throws(
    () => parseRemote('https://someone:s3cr3t@gitlab.com/acme/web.git'),
    (error: Error) => error.message.includes('<redacted>') && !error.message.includes('s3cr3t')
  );
});
