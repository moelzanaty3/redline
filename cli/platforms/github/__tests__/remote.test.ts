import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRemoteConfig, readRemoteFile } from '../remote.ts';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { isRedlineError } from '../../../core/errors.ts';
import type { RepoRef } from '../../types.ts';

const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web-app', defaultBranch: 'main' };
const path = '/repos/acme/web-app/contents/.redline.json?ref=main';

const config = {
  standardsVersion: '0.0.1',
  cliVersion: '0.0.1',
  host: 'github',
  profile: 'web',
  vendors: ['claude', 'copilot'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: false,
    speckit: false,
    sensitivePathReviewers: false,
  },
  pendingAdmin: [],
  onboardedAt: '2026-09-01T00:00:00.000Z',
  lastRunAt: '2026-09-02T00:00:00.000Z',
};

const encoded = (value: unknown) => ({
  content: Buffer.from(JSON.stringify(value), 'utf8').toString('base64'),
  encoding: 'base64',
  sha: 'abc123',
});

test('reads and parses a remote .redline.json', async () => {
  const client = fakeGitHubClient({ [`GET ${path}`]: { status: 200, body: encoded(config) } });

  const result = await readRemoteConfig(client, ref);

  assert.equal(result.config?.profile, 'web');
  assert.deepEqual(result.config?.vendors, ['claude', 'copilot']);
  assert.equal(result.ref, 'main');
});

test('a repository with no .redline.json is not onboarded, not an error', async () => {
  const client = fakeGitHubClient({ [`GET ${path}`]: { status: 404 } });

  const result = await readRemoteConfig(client, ref);

  assert.equal(result.config, null);
});

test('a non-404 failure is a host error naming the repository', async () => {
  const client = fakeGitHubClient({ [`GET ${path}`]: { status: 500 } });

  await assert.rejects(
    () => readRemoteConfig(client, ref),
    (err: unknown) => isRedlineError(err) && err.kind === 'host' && /acme\/web-app/.test(err.message)
  );
});

test('a path that is not a readable file is refused rather than decoded to empty', async () => {
  // A directory comes back as an array and a file over 1MB comes back with an
  // empty content field. Either would otherwise decode to "" and be reported as
  // a malformed config, blaming the repository for the reader's mistake.
  const client = fakeGitHubClient({ [`GET ${path}`]: { status: 200, body: { content: '', encoding: 'none' } } });

  await assert.rejects(
    () => readRemoteConfig(client, ref),
    (err: unknown) => isRedlineError(err) && /not a readable file/.test(err.message)
  );
});

test('a malformed remote config names the repository, not just the file', async () => {
  const client = fakeGitHubClient({
    [`GET ${path}`]: {
      status: 200,
      body: { content: Buffer.from('{ not json').toString('base64'), encoding: 'base64' },
    },
  });

  await assert.rejects(
    () => readRemoteConfig(client, ref),
    (err: unknown) => isRedlineError(err) && /acme\/web-app/.test(err.message)
  );
});

test('readRemoteFile reads any path, not only the config', async () => {
  const client = fakeGitHubClient({
    ['GET /repos/acme/web-app/contents/AGENTS.md?ref=main']: {
      status: 200,
      body: { content: Buffer.from('# hello').toString('base64'), encoding: 'base64', sha: 'deadbeef' },
    },
  });

  const file = await readRemoteFile(client, ref, 'AGENTS.md');

  assert.equal(file?.content, '# hello');
  assert.equal(file?.sha, 'deadbeef');
});
