import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverGitHub } from '../discover.ts';

const config = (profile: string) =>
  JSON.stringify({
    standardsVersion: '0.0.1',
    cliVersion: '0.0.1',
    host: 'github',
    profile,
    vendors: ['claude'],
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
  });

const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  repositoryOwner: {
    repositories: { nodes, pageInfo: { hasNextPage, endCursor } },
  },
});

const fakeClient = (pages: unknown[]) => {
  let call = 0;
  return {
    graphql: async <T>(): Promise<T> => pages[call++] as T,
  };
};

test('returns one entry per repository carrying a .redline.json', async () => {
  const client = fakeClient([
    page([
      { name: 'web-app', defaultBranchRef: { name: 'main' }, object: { text: config('web') } },
      { name: 'no-redline', defaultBranchRef: { name: 'main' }, object: null },
    ]),
  ]);

  const result = await discoverGitHub(client, 'acme');

  assert.equal(result.problems.length, 0);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], {
    host: 'github',
    org: 'acme',
    repo: 'web-app',
    defaultBranch: 'main',
    profile: 'web',
    standardsVersion: '0.0.1',
    cliVersion: '0.0.1',
    onboardedAt: '2026-09-01T00:00:00.000Z',
  });
});

test('skips a repository with no default branch rather than crashing', async () => {
  const client = fakeClient([
    page([{ name: 'empty-repo', defaultBranchRef: null, object: { text: config('web') } }]),
  ]);

  const result = await discoverGitHub(client, 'acme');

  assert.equal(result.entries.length, 0);
  assert.match(result.problems[0] ?? '', /empty-repo/);
});

test('follows pagination until hasNextPage is false', async () => {
  const client = fakeClient([
    page(
      [{ name: 'one', defaultBranchRef: { name: 'main' }, object: { text: config('web') } }],
      true,
      'CUR1',
    ),
    page(
      [{ name: 'two', defaultBranchRef: { name: 'main' }, object: { text: config('infra') } }],
      false,
      null,
    ),
  ]);

  const result = await discoverGitHub(client, 'acme');

  assert.deepEqual(
    result.entries.map((e) => e.repo),
    ['one', 'two'],
  );
});

test('passes the endCursor of each page as the next cursor', async () => {
  const cursors: (string | null)[] = [];
  let call = 0;
  const pages = [
    page(
      [{ name: 'one', defaultBranchRef: { name: 'main' }, object: { text: config('web') } }],
      true,
      'CUR1',
    ),
    page(
      [{ name: 'two', defaultBranchRef: { name: 'main' }, object: { text: config('web') } }],
      false,
      null,
    ),
  ];
  const client = {
    graphql: async <T>(_q: string, vars: Record<string, unknown>): Promise<T> => {
      cursors.push(vars['cursor'] as string | null);
      return pages[call++] as T;
    },
  };

  await discoverGitHub(client, 'acme');

  assert.deepEqual(cursors, [null, 'CUR1']);
});

test('reports a problem when the owner cannot be read', async () => {
  const client = fakeClient([{ repositoryOwner: null }]);

  const result = await discoverGitHub(client, 'acme');

  assert.equal(result.entries.length, 0);
  assert.match(result.problems[0] ?? '', /acme/);
});

test('a host that never stops paginating is bounded, and says the register is short', async () => {
  let calls = 0;
  const client = {
    graphql: async <T>(): Promise<T> => {
      calls += 1;
      return page(
        [
          {
            name: `repo-${calls}`,
            defaultBranchRef: { name: 'main' },
            object: { text: config('web') },
          },
        ],
        true,
        `CUR${calls}`,
      ) as T;
    },
  };

  const result = await discoverGitHub(client, 'acme');

  assert.equal(calls, 200);
  assert.match(result.problems.at(-1) ?? '', /stopped after 200 pages/);
});

test('a repository with unparseable .redline.json is reported, not fatal', async () => {
  const client = fakeClient([
    page([
      { name: 'broken', defaultBranchRef: { name: 'main' }, object: { text: '{ not json' } },
      { name: 'good', defaultBranchRef: { name: 'main' }, object: { text: config('web') } },
    ]),
  ]);

  const result = await discoverGitHub(client, 'acme');

  assert.deepEqual(
    result.entries.map((e) => e.repo),
    ['good'],
  );
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0] ?? '', /acme\/broken/);
});

test('a repository with a schema-invalid .redline.json is reported, not fatal', async () => {
  const client = fakeClient([
    page([
      { name: 'invalid', defaultBranchRef: { name: 'main' }, object: { text: '{"host":"gitlab"}' } },
      { name: 'good', defaultBranchRef: { name: 'main' }, object: { text: config('web') } },
    ]),
  ]);

  const result = await discoverGitHub(client, 'acme');

  assert.deepEqual(
    result.entries.map((e) => e.repo),
    ['good'],
  );
  assert.match(result.problems[0] ?? '', /acme\/invalid/);
});
