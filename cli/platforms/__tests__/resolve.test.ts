import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGit, type GitRunner } from '../../core/git.ts';
import { resolvePlatform } from '../resolve.ts';
import type { GitHubClient } from '../github/client.ts';
import type { AzureClient } from '../azure/client.ts';

const gitWith = (remote: string): ((cwd: string) => ReturnType<typeof createGit>) => {
  const run: GitRunner = (args) => {
    if (args[0] === 'rev-parse') return 'true';
    if (args[0] === 'remote') return remote;
    return '';
  };
  return (cwd) => createGit(cwd, run);
};

const fakeGitHubClient: GitHubClient = {
  rest: async <T>() => ({ status: 200, body: {} as T }),
  graphql: async <T>() => ({}) as T,
};
const fakeAzureClient: AzureClient = {
  request: async <T>() => ({ status: 200, body: {} as T }),
};
const stubbed = {
  makeGitHubClient: () => fakeGitHubClient,
  makeAzureClient: () => fakeAzureClient,
};

test('a github remote resolves to the github platform', async () => {
  const platform = await resolvePlatform('/repo', {
    gitFor: gitWith('git@github.com:acme/web.git'),
    ...stubbed,
  });
  assert.equal(platform.host, 'github');
});

test('an azure remote resolves to the azure platform', async () => {
  const platform = await resolvePlatform('/repo', {
    gitFor: gitWith('https://dev.azure.com/acme/Payments/_git/web'),
    ...stubbed,
  });
  assert.equal(platform.host, 'azure');
});

test('a directory that is not a git repository is a usage error', async () => {
  const notARepo = (cwd: string) =>
    createGit(cwd, () => {
      throw new Error('not a git repository');
    });
  await assert.rejects(resolvePlatform('/tmp', { gitFor: notARepo, ...stubbed }), /git repository/);
});
