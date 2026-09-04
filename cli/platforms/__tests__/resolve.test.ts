import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGit, type GitRunner } from '../../core/git.ts';
import { RedlineError } from '../../core/errors.ts';
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

// The credential chokepoint below is deliberate: every command fails fast, in
// one place, with one message. `redline init --dry-run` is the single
// exception — it builds a Platform only to plan with and never sends a
// request, so demanding a token would make a preview require the very thing
// the preview exists to avoid. The laziness is opt-in, and both directions
// are pinned so it cannot leak.
test('lazy credentials defer the client until something actually asks the host', async () => {
  let made = 0;
  const platform = await resolvePlatform('/repo', {
    gitFor: gitWith('git@github.com:acme/web.git'),
    lazyCredentials: true,
    makeGitHubClient: () => {
      made += 1;
      return fakeGitHubClient;
    },
    makeAzureClient: () => fakeAzureClient,
  });

  assert.equal(made, 0, 'building a platform to plan with must not resolve a credential');
  await platform.readSecurityState({ host: 'github', org: 'acme', repo: 'web', defaultBranch: 'main' });
  assert.equal(made, 1, 'the first real request resolves it, with the same error it always threw');
});

test('without the flag the credential is resolved up front, as every other command needs', async () => {
  let made = 0;
  await resolvePlatform('/repo', {
    gitFor: gitWith('git@github.com:acme/web.git'),
    makeGitHubClient: () => {
      made += 1;
      return fakeGitHubClient;
    },
    makeAzureClient: () => fakeAzureClient,
  });
  assert.equal(made, 1);
});

test('an eager resolve still throws the credential error before returning a platform', async () => {
  await assert.rejects(
    resolvePlatform('/repo', {
      gitFor: gitWith('git@github.com:acme/web.git'),
      makeGitHubClient: () => {
        throw new RedlineError('permission', 'no GitHub credentials found');
      },
      makeAzureClient: () => fakeAzureClient,
    }),
    /no GitHub credentials found/
  );
});

test('lazy credentials work the same way on azure', async () => {
  let made = 0;
  const unlicensedAzure: AzureClient = {
    request: async <T>() => ({ status: 404, body: null as T | null }),
  };
  const platform = await resolvePlatform('/repo', {
    gitFor: gitWith('https://dev.azure.com/acme/Payments/_git/web'),
    lazyCredentials: true,
    makeGitHubClient: () => fakeGitHubClient,
    makeAzureClient: () => {
      made += 1;
      return unlicensedAzure;
    },
  });

  assert.equal(made, 0);
  await platform.readSecurityState({
    host: 'azure',
    org: 'acme',
    project: 'Payments',
    repo: 'web',
    repoId: 'repo-guid',
    defaultBranch: 'main',
  });
  assert.equal(made, 1);
});

// `real ??= make()` leaves the slot null when construction throws, so every
// later request retries it — for GitHub that re-spawns `gh auth token` per
// request. The failure is memoised like the success.
test('a client whose construction failed is not rebuilt on every later request', async () => {
  let made = 0;
  const platform = await resolvePlatform('/repo', {
    gitFor: gitWith('git@github.com:acme/web.git'),
    lazyCredentials: true,
    makeGitHubClient: () => {
      made += 1;
      throw new RedlineError('permission', 'no GitHub credentials found');
    },
    makeAzureClient: () => fakeAzureClient,
  });
  const ref = { host: 'github' as const, org: 'acme', repo: 'web', defaultBranch: 'main' };

  await assert.rejects(platform.readSecurityState(ref), /no GitHub credentials/);
  await assert.rejects(platform.readSecurityState(ref), /no GitHub credentials/);
  assert.equal(made, 1);
});
