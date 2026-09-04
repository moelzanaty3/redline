# Registry Discovery (Phase 0.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the register of onboarded repositories as a derived artifact, discovered from `.redline.json` across the org, so `redline sync` (0.2), remote `verify` (0.3) and the dashboard's coverage figure all have a source of truth again.

**Architecture:** Pure discovery logic lives in `cli/registry/`, unit-tested against a fake GitHub client exactly as `cli/platforms/` already is. It reuses `parseConfig` from `cli/config/redline-json.ts` rather than reimplementing validation, so a malformed `.redline.json` in the estate becomes a reported problem instead of a crash. A thin `scripts/build-registry.mjs` runner imports the built output and writes `registry.json`; a nightly workflow commits it to this repository, and the dashboard reads it in place of the deleted `sync-targets.txt`. Nothing is hand-edited and `redline init` never writes it — per the v3 design decision.

**Tech Stack:** TypeScript 5.7, Node 22 (native `.ts` execution, `node --test`), no runtime dependencies. GitHub GraphQL v4.

**Spec:** `docs/superpowers/specs/2026-09-03-redline-roadmap.md` — Phase 0, item 0.1.

## Global Constraints

- **Node `>=22`.** CI pins `node-version: 22`. Local is v22.22.0.
- **Zero runtime dependencies.** `package.json` has `"dependencies": null`. Do not add any. Use `node:` builtins and the existing HTTP layer.
- **`"type": "module"`.** ESM only. Relative imports inside `cli/` carry the `.ts` extension; `tsconfig.build.json` sets `rewriteRelativeImportExtensions`, so `../config/redline-json.ts` compiles to `../config/redline-json.js`.
- **Tests:** `npm test` runs `node --test 'cli/**/__tests__/*.test.ts'`. Only files matching that glob run in CI. Anything under `scripts/` is untested by construction — that is why the logic in this plan lives in `cli/`.
- **Baseline before starting:** `npm test` reports `# pass 555`, `# fail 0`, `# skipped 2`, 557 total. Every task must leave that count at 555 passing or higher with zero failures.
- **`tsconfig.build.json`** has `"rootDir": "cli"`, `"include": ["cli/**/*.ts"]`, `"exclude": ["cli/**/__tests__/**"]`. New files under `cli/registry/` build to `dist/registry/` automatically. No config change needed.
- **Never edit generated artifacts.** `AGENTS.md`, `.github/copilot-instructions.md` and `.github/instructions/redline-*.instructions.md` are rendered from `standards/`. This plan touches none of them.
- **This plan does not change `standards/`,** so no `standards/manifest.json` version bump and no `CHANGELOG.md` standards entry is required. A `CHANGELOG.md` entry for the CLI change is still expected at the end (Task 8).

## Out of scope, deliberately

- **Azure DevOps discovery.** The roadmap's Phase 0 acceptance says sync must work on both hosts. This plan delivers the GitHub register only. Azure has no GraphQL equivalent and needs a per-project repository walk — a separate plan, and a blocker on Phase 0's exit condition that must not be forgotten. Task 1's `RegistryEntry.host` is typed to carry `azure` so the schema does not need changing later.
- **`redline sync` itself** (Phase 0.2) and **remote `verify`** (Phase 0.3). Both consume this register; neither is built here.
- **A user-facing `redline registry` command.** v3 fixes the command surface at four. Registry derivation is a control-plane job, not a user command.

---

### Task 1: Registry types and stable serialization

Stable ordering is the point of this task, not a detail. The nightly job commits `registry.json`; if entry order varies between runs the file churns every night and every diff is noise.

**Files:**
- Create: `cli/registry/types.ts`
- Create: `cli/registry/serialize.ts`
- Test: `cli/registry/__tests__/serialize.test.ts`

**Interfaces:**
- Consumes: `Host` from `cli/platforms/types.ts`.
- Produces: `RegistryEntry`, `Registry`, `serializeRegistry(registry: Registry): string`, `parseRegistry(raw: string): Registry`.

- [ ] **Step 1: Write the failing test**

Create `cli/registry/__tests__/serialize.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeRegistry, parseRegistry } from '../serialize.ts';
import type { Registry, RegistryEntry } from '../types.ts';

const entry = (org: string, repo: string): RegistryEntry => ({
  host: 'github',
  org,
  repo,
  defaultBranch: 'main',
  profile: 'web',
  standardsVersion: '0.0.1',
  cliVersion: '3.0.0',
  onboardedAt: '2026-09-01T00:00:00.000Z',
});

test('serialize orders entries by org then repo, regardless of input order', () => {
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'zebra'), entry('acme', 'alpha'), entry('abc', 'thing')],
  };
  const names = parseRegistry(serializeRegistry(registry)).entries.map((e) => `${e.org}/${e.repo}`);
  assert.deepEqual(names, ['abc/thing', 'acme/alpha', 'acme/zebra']);
});

test('serialize is byte-stable across differently ordered inputs', () => {
  const a: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'alpha'), entry('acme', 'zebra')],
  };
  const b: Registry = { ...a, entries: [entry('acme', 'zebra'), entry('acme', 'alpha')] };
  assert.equal(serializeRegistry(a), serializeRegistry(b));
});

test('serialize ends with a trailing newline', () => {
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'alpha')],
  };
  assert.equal(serializeRegistry(registry).endsWith('\n'), true);
});

test('parseRegistry round-trips what serializeRegistry produced', () => {
  const registry: Registry = {
    generatedAt: '2026-09-04T00:00:00.000Z',
    source: 'acme/redline',
    entries: [entry('acme', 'alpha')],
  };
  assert.deepEqual(parseRegistry(serializeRegistry(registry)), registry);
});

test('parseRegistry rejects a non-object payload', () => {
  assert.throws(() => parseRegistry('[]'), /registry\.json is invalid/);
});

test('parseRegistry rejects entries that are not an array', () => {
  assert.throws(
    () => parseRegistry('{"generatedAt":"x","source":"y","entries":{}}'),
    /registry\.json is invalid/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A3 "serialize"`
Expected: FAIL — cannot find module `../serialize.ts`.

- [ ] **Step 3: Write the types**

Create `cli/registry/types.ts`:

```ts
import type { Host } from '../platforms/types.ts';

// One onboarded repository, as discovered from its own .redline.json. Every
// field here is read from that file or from the host's repository record —
// nothing is inferred, so a stale entry is impossible: an entry exists only
// while the file does.
export interface RegistryEntry {
  host: Host;
  org: string;
  // Azure only: repositories live under a project. Absent on GitHub.
  project?: string;
  repo: string;
  defaultBranch: string;
  profile: string;
  standardsVersion: string;
  cliVersion: string;
  onboardedAt: string;
}

export interface Registry {
  generatedAt: string;
  // owner/name of the repository this register was generated from, so a
  // consumer can tell which estate it describes.
  source: string;
  entries: RegistryEntry[];
}
```

- [ ] **Step 4: Write the serializer**

Create `cli/registry/serialize.ts`:

```ts
import { RedlineError } from '../core/errors.ts';
import type { Registry, RegistryEntry } from './types.ts';

const byOrgThenRepo = (a: RegistryEntry, b: RegistryEntry): number =>
  a.org.localeCompare(b.org) || a.repo.localeCompare(b.repo);

// The register is committed on a schedule. Unordered entries would rewrite the
// file on every run and make each diff unreadable, so ordering is part of the
// format, not a presentation choice.
export function serializeRegistry(registry: Registry): string {
  const ordered: Registry = {
    generatedAt: registry.generatedAt,
    source: registry.source,
    entries: [...registry.entries].sort(byOrgThenRepo),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function parseRegistry(raw: string): Registry {
  const bad = (what: string): never => {
    throw new RedlineError('failed', `registry.json is invalid: ${what}`);
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return bad('not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return bad('expected an object');
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o['generatedAt'] !== 'string') return bad('generatedAt must be a string');
  if (typeof o['source'] !== 'string') return bad('source must be a string');
  if (!Array.isArray(o['entries'])) return bad('entries must be an array');

  return {
    generatedAt: o['generatedAt'],
    source: o['source'],
    entries: o['entries'] as RegistryEntry[],
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: `# fail 0`, pass count 561 or higher.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add cli/registry/types.ts cli/registry/serialize.ts cli/registry/__tests__/serialize.test.ts
git commit -m "feat(registry): add registry types and stable serialization

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 2: Discover onboarded repositories from one page of GraphQL results

**Files:**
- Create: `cli/registry/discover.ts`
- Test: `cli/registry/__tests__/discover.test.ts`

**Interfaces:**
- Consumes: `GitHubClient` from `cli/platforms/github/client.ts` (`graphql<T>(query, variables): Promise<T>`); `parseConfig` from `cli/config/redline-json.ts`; `RegistryEntry` from Task 1.
- Produces: `discoverGitHub(client: Pick<GitHubClient, 'graphql'>, org: string): Promise<DiscoveryResult>` where `DiscoveryResult = { entries: RegistryEntry[]; problems: string[] }`.

The query asks for `.redline.json` at `HEAD` on every repository in one round trip per page. A repository without the file returns `object: null` and is simply not onboarded — that is the discovery signal, and it is why nothing needs a separate register write.

- [ ] **Step 1: Write the failing test**

Create `cli/registry/__tests__/discover.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverGitHub } from '../discover.ts';

const config = (profile: string) =>
  JSON.stringify({
    standardsVersion: '0.0.1',
    cliVersion: '3.0.0',
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
    cliVersion: '3.0.0',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -c "discover"`
Expected: FAIL — cannot find module `../discover.ts`.

- [ ] **Step 3: Write the minimal implementation**

Create `cli/registry/discover.ts`:

```ts
import { parseConfig } from '../config/redline-json.ts';
import type { GitHubClient } from '../platforms/github/client.ts';
import type { RegistryEntry } from './types.ts';

export interface DiscoveryResult {
  entries: RegistryEntry[];
  // A repository the walk could not turn into an entry. Reported, never
  // thrown: one malformed .redline.json in the estate must not cost the whole
  // register.
  problems: string[];
}

interface RepoNode {
  name: string;
  defaultBranchRef: { name: string } | null;
  object: { text?: string } | null;
}

interface OrgPage {
  // repositoryOwner, not organization: the source repository may live under a
  // user account, and `organization(login:)` returns null for one. This query
  // resolves both.
  repositoryOwner: {
    repositories: {
      nodes: RepoNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

export const DISCOVERY_QUERY = `
query($org: String!, $cursor: String) {
  repositoryOwner(login: $org) {
    repositories(first: 100, after: $cursor, isArchived: false, ownerAffiliations: OWNER) {
      nodes {
        name
        defaultBranchRef { name }
        object(expression: "HEAD:.redline.json") { ... on Blob { text } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export async function discoverGitHub(
  client: Pick<GitHubClient, 'graphql'>,
  org: string
): Promise<DiscoveryResult> {
  const entries: RegistryEntry[] = [];
  const problems: string[] = [];

  const data = await client.graphql<OrgPage>(DISCOVERY_QUERY, { org, cursor: null });
  const repos = data.repositoryOwner?.repositories;
  for (const node of repos?.nodes ?? []) {
    const text = node.object?.text;
    if (!text) continue;
    if (!node.defaultBranchRef) {
      problems.push(`${org}/${node.name}: has .redline.json but no default branch`);
      continue;
    }
    const config = parseConfig(JSON.parse(text));
    entries.push({
      host: 'github',
      org,
      repo: node.name,
      defaultBranch: node.defaultBranchRef.name,
      profile: config.profile,
      standardsVersion: config.standardsVersion,
      cliVersion: config.cliVersion,
      onboardedAt: config.onboardedAt,
    });
  }

  return { entries, problems };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add cli/registry/discover.ts cli/registry/__tests__/discover.test.ts
git commit -m "feat(registry): discover onboarded repositories via GraphQL

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 3: Follow pagination across every page of repositories

An org with more than 100 repositories is the normal case here — the README records 400+ active repos. Without this task the register silently describes the first 100 and nothing reports the truncation.

**Files:**
- Modify: `cli/registry/discover.ts`
- Test: `cli/registry/__tests__/discover.test.ts` (append)

**Interfaces:**
- Produces: no signature change. `discoverGitHub` now walks every page.

- [ ] **Step 1: Write the failing test**

Append to `cli/registry/__tests__/discover.test.ts`:

```ts
test('follows pagination until hasNextPage is false', async () => {
  const client = fakeClient([
    page([{ name: 'one', defaultBranchRef: { name: 'main' }, object: { text: config('web') } }], true, 'CUR1'),
    page([{ name: 'two', defaultBranchRef: { name: 'main' }, object: { text: config('infra') } }], false, null),
  ]);

  const result = await discoverGitHub(client, 'acme');

  assert.deepEqual(
    result.entries.map((e) => e.repo),
    ['one', 'two']
  );
});

test('passes the endCursor of each page as the next cursor', async () => {
  const cursors: (string | null)[] = [];
  let call = 0;
  const pages = [
    page([{ name: 'one', defaultBranchRef: { name: 'main' }, object: { text: config('web') } }], true, 'CUR1'),
    page([{ name: 'two', defaultBranchRef: { name: 'main' }, object: { text: config('web') } }], false, null),
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test 2>&1 | tail -8`
Expected: FAIL — only the first page is walked, so `['one']` is returned where `['one','two']` is asserted.

- [ ] **Step 3: Replace the single-page walk with a loop**

In `cli/registry/discover.ts`, replace the whole `discoverGitHub` function — everything from `export async function` to its closing brace — with this. Replacing the entire function rather than patching its middle removes any ambiguity about where the new code goes:

```ts
export async function discoverGitHub(
  client: Pick<GitHubClient, 'graphql'>,
  org: string
): Promise<DiscoveryResult> {
  const entries: RegistryEntry[] = [];
  const problems: string[] = [];

  let cursor: string | null = null;
  let guard = 0;

  do {
    const data: OrgPage = await client.graphql<OrgPage>(DISCOVERY_QUERY, { org, cursor });
    const repos = data.repositoryOwner?.repositories;
    if (!repos) {
      problems.push(`${org}: owner not readable with this token`);
      break;
    }

    for (const node of repos.nodes) {
      const text = node.object?.text;
      if (!text) continue;
      if (!node.defaultBranchRef) {
        problems.push(`${org}/${node.name}: has .redline.json but no default branch`);
        continue;
      }
      const config = parseConfig(JSON.parse(text));
      entries.push({
        host: 'github',
        org,
        repo: node.name,
        defaultBranch: node.defaultBranchRef.name,
        profile: config.profile,
        standardsVersion: config.standardsVersion,
        cliVersion: config.cliVersion,
        onboardedAt: config.onboardedAt,
      });
    }

    cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
    guard += 1;
  } while (cursor !== null && guard < 200);

  return { entries, problems };
}
```

The `guard` bounds the walk at 20,000 repositories. A host that reports `hasNextPage: true` forever must not hang a nightly job.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add cli/registry/discover.ts cli/registry/__tests__/discover.test.ts
git commit -m "feat(registry): walk every page of org repositories

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 4: A malformed `.redline.json` becomes a problem, not a crash

`parseConfig` throws `RedlineError` on invalid input, and `JSON.parse` throws on unparseable text. Today either would abort the whole walk. One repository with a hand-edited config would then delete every other repository from the register — a silent, total data loss the nightly commit would happily publish.

**Files:**
- Modify: `cli/registry/discover.ts`
- Test: `cli/registry/__tests__/discover.test.ts` (append)

**Interfaces:**
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

Append to `cli/registry/__tests__/discover.test.ts`:

```ts
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
    ['good']
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
    ['good']
  );
  assert.match(result.problems[0] ?? '', /acme\/invalid/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | tail -8`
Expected: FAIL — the thrown `SyntaxError` / `RedlineError` escapes `discoverGitHub`.

- [ ] **Step 3: Wrap the per-repository parse**

In `cli/registry/discover.ts`, replace these three lines inside the `for` loop:

```ts
      const config = parseConfig(JSON.parse(text));
      entries.push({
        host: 'github',
```

with:

```ts
      let config;
      try {
        config = parseConfig(JSON.parse(text));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        problems.push(`${org}/${node.name}: ${detail}`);
        continue;
      }
      entries.push({
        host: 'github',
```

This is a real boundary — the estate's own files are external input to this walk — so the guard belongs here and nowhere else.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add cli/registry/discover.ts cli/registry/__tests__/discover.test.ts
git commit -m "fix(registry): one bad .redline.json no longer empties the register

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 5: Runner script that writes `registry.json`

**Files:**
- Create: `scripts/build-registry.mjs`

**Interfaces:**
- Consumes: `dist/registry/discover.js` and `dist/registry/serialize.js` (built by `npm run build`); `dist/platforms/github/client.js` for `createGitHubClient`.
- Produces: writes `registry.json` at the repository root. Exits 1 if discovery found no entries at all, so a broken token cannot publish an empty register over a good one.

Matches the existing `scripts/*.mjs` convention: env-configured, no argument parsing, a header comment saying where it runs.

- [ ] **Step 1: Write the script**

Create `scripts/build-registry.mjs`:

```js
#!/usr/bin/env node
// Builds registry.json: the derived register of onboarded repositories.
//
// Runs in the Redline source repo on a schedule. The register is DERIVED — it is
// discovered from .redline.json across the org, never hand-edited, and never written
// by `redline init`. An entry exists exactly as long as the repository's own file
// does, so a repository that removes Redline leaves the register on its next run.
//
// Requires `npm run build` first: it imports the compiled CLI from dist/.
//
// Env: GH_TOKEN (read access to org repos), ORG, SOURCE (owner/name of this repo),
//      [OUT=registry.json]

import { writeFileSync } from 'node:fs';
import { createGitHubClient } from '../dist/platforms/github/client.js';
import { discoverGitHub } from '../dist/registry/discover.js';
import { serializeRegistry } from '../dist/registry/serialize.js';

const { GH_TOKEN, ORG, SOURCE, OUT = 'registry.json' } = process.env;
if (!GH_TOKEN || !ORG || !SOURCE) throw new Error('GH_TOKEN, ORG and SOURCE are required');

const client = createGitHubClient({ token: GH_TOKEN });
const { entries, problems } = await discoverGitHub(client, ORG);

for (const problem of problems) console.warn(`  ${problem}`);

// An empty register is indistinguishable from a token that lost access, and
// publishing it would erase the dashboard's coverage figure and every sync
// target at once. Refuse rather than overwrite.
if (entries.length === 0) {
  console.error(`No onboarded repositories discovered in ${ORG}. Refusing to write an empty register.`);
  process.exit(1);
}

writeFileSync(
  OUT,
  serializeRegistry({ generatedAt: new Date().toISOString(), source: SOURCE, entries })
);

console.log(`${OUT}: ${entries.length} onboarded repositories, ${problems.length} problem(s)`);
```

- [ ] **Step 2: Verify it builds and the imports resolve**

Run: `npm run build && node -e "import('./dist/registry/discover.js').then(m => console.log(Object.keys(m)))"`
Expected: `[ 'DISCOVERY_QUERY', 'discoverGitHub' ]`

- [ ] **Step 3: Verify the script refuses to run without env**

Run: `node scripts/build-registry.mjs`
Expected: throws `GH_TOKEN, ORG and SOURCE are required`, exit code 1.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-registry.mjs
git commit -m "feat(registry): add build-registry runner

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 6: Nightly workflow that publishes the register

**Files:**
- Create: `.github/workflows/registry.yml`

**Interfaces:**
- Consumes: `scripts/build-registry.mjs`; secret `REDLINE_ORG_READ_TOKEN` (already used by `workflows/dashboard.yml`).
- Produces: `registry.json` committed to the default branch of this repository.

Follow this repository's actual pinning convention, which is not uniform: first-party
`actions/*` are referenced by tag (`@v4`), and only third-party actions carry a 40-character
SHA with a trailing `# vX.Y.Z` comment. `scripts/check-pins.mjs` verifies pins that already
exist — its regex matches only 40-hex refs — so a tag-referenced `actions/checkout@v4` is
correct here and is what `.github/workflows/ci.yml` uses. This task adds no third-party
action, so `check-pins.mjs` has nothing new to verify.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/registry.yml`:

```yaml
# Publishes registry.json — the derived register of onboarded repositories.
#
# The register is discovered from .redline.json across the org, so it is always a
# statement about the estate's current state rather than a list somebody maintained.
# redline sync (Phase 0.2) and verify-onboarding (Phase 0.3) both read it, and the
# dashboard reports coverage from it.
name: Redline Registry

on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: redline-registry
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install
        run: npm ci

      - name: Build CLI
        run: npm run build

      - name: Discover onboarded repositories
        env:
          GH_TOKEN: ${{ secrets.REDLINE_ORG_READ_TOKEN }}
          ORG: ${{ github.repository_owner }}
          SOURCE: ${{ github.repository }}
        run: node scripts/build-registry.mjs

      - name: Commit the register if it changed
        run: |
          set -euo pipefail
          # `git diff --quiet` reports NO change for an untracked file, so on the very
          # first run — when registry.json does not exist in the tree yet — it would
          # exit 0 and the register would never be committed at all. Ask git what it
          # actually sees instead.
          if [ -z "$(git status --porcelain -- registry.json)" ]; then
            echo "Register unchanged."
            exit 0
          fi
          git config user.name  'redline-bot'
          git config user.email 'redline-bot@users.noreply.github.com'
          git add registry.json
          git commit -m 'chore(registry): refresh onboarded repository register'
          git push
```

**Risk this task carries — read before choosing the schedule.** The job pushes `registry.json`
straight to the default branch. Verified at plan time: `moelzanaty3/redline` has zero rulesets
and `main` is unprotected, so the push succeeds today. Two ways that stops being true, and
neither is hypothetical:

- Redline installs branch rulesets on repositories it onboards. The day the source repository
  is onboarded to its own standard, this push is refused and the register silently stops
  refreshing.
- The README states the principle plainly: *"Redline never pushes to a default branch."* This
  job is a deliberate exception for a derived artifact in Redline's own repository, not a
  precedent for anything Redline does to a repository it governs. Say so in the changelog.

If either matters, the fallback is to publish the register as a workflow artifact or to the
metrics repository instead of committing it, and have the dashboard read it from there. Do not
switch to opening a pull request per refresh — a nightly PR nobody merges is worse than no
register at all.

- [ ] **Step 2: Smoke-test the query against the real host before trusting a 04:00 job**

The query below is the one `DISCOVERY_QUERY` sends. It has been validated against the live
GitHub schema — `repositoryOwner`, `ownerAffiliations: OWNER`, `isArchived: false` and
`object(expression: "HEAD:...")` all resolve, and blob `text` comes back populated. Re-run it
against the real target owner so a schema or permission problem surfaces now rather than as a
silent nightly failure:

```bash
gh api graphql -f login='<THE ORG OR USER THAT OWNS THE ESTATE>' -f query='
query($login: String!) {
  repositoryOwner(login: $login) {
    repositories(first: 5, isArchived: false, ownerAffiliations: OWNER) {
      nodes { name defaultBranchRef { name } object(expression: "HEAD:.redline.json") { ... on Blob { text } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}' --jq '.data.repositoryOwner.repositories.nodes[] | {name, onboarded: (.object != null)}'
```

Expected: one line per repository, `onboarded: true` for those carrying `.redline.json`. If
`repositoryOwner` comes back `null`, the login is wrong or the token cannot see the owner —
fix that before continuing, because `discoverGitHub` will report zero entries and the runner
will exit 1 every night.

- [ ] **Step 3: Confirm the token secret exists in THIS repository**

`REDLINE_ORG_READ_TOKEN` is referenced by `workflows/dashboard.yml`, but that workflow runs in
the metrics repository. This workflow runs in the source repository, which is a different
secret store.

Run: `gh secret list --repo "$(gh repo view --json nameWithOwner --jq .nameWithOwner)"`
Expected: `REDLINE_ORG_READ_TOKEN` present. If absent, create it with read access to org repos
before enabling the schedule — otherwise the first scheduled run fails on a missing credential.

- [ ] **Step 4: Lint the workflow**

Run: `npx --yes actionlint .github/workflows/registry.yml`
Expected: no output, exit 0. (CI runs actionlint; catching it here avoids a red build.)

- [ ] **Step 5: Verify the pin checker still passes**

Run: `GH_TOKEN=$(gh auth token) node scripts/check-pins.mjs`
Expected: exit 0. This asserts the new file broke nothing; it adds no pin of its own.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/registry.yml
git commit -m "feat(registry): publish the register nightly

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 7: Dashboard reads the register instead of `sync-targets.txt`

Restores the coverage figure the dashboard has been omitting since `sync-targets.txt` was deleted.

**Files:**
- Modify: `workflows/dashboard.yml:49-63`

**Interfaces:**
- Consumes: `registry.json` from Task 6, read from the source repo via `gh api`.
- Produces: the same `onboarded` step output `scripts/build-dashboard.mjs` already reads as `ONBOARDED`. No change to that script.

- [ ] **Step 1: Read the current block**

Run: `sed -n '44,64p' workflows/dashboard.yml`
Confirm the `coverage` step and its `sync-targets.txt` read are as described before editing.

- [ ] **Step 2: Replace the coverage step's `run:` body**

In `workflows/dashboard.yml`, replace the shell body of the coverage step (the `set -euo pipefail` through `echo "onboarded=$count" >> "$GITHUB_OUTPUT"` lines) with:

```bash
          set -euo pipefail
          # registry.json is the derived register of onboarded repositories, refreshed
          # nightly by the source repo's Redline Registry workflow. Coverage is
          # instrumented-vs-onboarded, so partial coverage cannot read as health. A
          # failed read omits the figure rather than reporting zero — absent is honest,
          # zero is a lie that looks like a finding.
          if registry=$(gh api "repos/$SOURCE/contents/registry.json" --jq '.content' 2>/dev/null | base64 -d); then
            count=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).entries.length)}catch{process.exit(1)}})' <<<"$registry")
          else
            count=""
            echo "::warning::Could not read registry.json from $SOURCE — coverage will be omitted."
          fi
          echo "onboarded=$count" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 3: Verify the counting one-liner against a real register shape**

Run:
```bash
echo '{"generatedAt":"x","source":"y","entries":[{"repo":"a"},{"repo":"b"}]}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).entries.length)}catch{process.exit(1)}})'
```
Expected: `2`

- [ ] **Step 4: Lint the workflow**

Run: `npx --yes actionlint workflows/dashboard.yml`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add workflows/dashboard.yml
git commit -m "feat(dashboard): report coverage from the derived register

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

### Task 8: Bundle self-check and changelog

`scripts/validate.mjs` is the bundle self-check CI runs. It must know the register exists so a future change cannot delete it silently — the exact failure that produced this plan.

**Files:**
- Modify: `scripts/validate.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: a validation failure if `.github/workflows/registry.yml` or `scripts/build-registry.mjs` goes missing.

- [ ] **Step 1: Read how validate.mjs asserts a file exists**

Run: `grep -n "existsSync\|required\|missing" scripts/validate.mjs | head -20`
Follow the pattern already there — do not introduce a second style.

- [ ] **Step 2: Add the two assertions**

`validate.mjs` has no single required-files list — it uses inline
`if (!existsSync(join(ROOT, <path>))) fail(<message>);` calls, each with a message saying
what breaks. Follow that idiom exactly. Add, near the other workflow assertions:

```js
if (!existsSync(join(ROOT, 'scripts/build-registry.mjs'))) {
  fail('scripts/build-registry.mjs is missing — the register cannot be derived, so redline sync has no targets and the dashboard loses its coverage figure');
}
if (!existsSync(join(ROOT, '.github/workflows/registry.yml'))) {
  fail('.github/workflows/registry.yml is missing — the register would silently stop refreshing and go stale without a single failing build');
}
```

- [ ] **Step 3: Run the self-check**

Run: `node scripts/validate.mjs`
Expected: exit 0.

- [ ] **Step 4: Prove the check actually fires**

Run:
```bash
mv scripts/build-registry.mjs /tmp/br.mjs && node scripts/validate.mjs; echo "exit=$?"
mv /tmp/br.mjs scripts/build-registry.mjs
```
Expected: non-zero exit naming `scripts/build-registry.mjs`, then restored.

- [ ] **Step 5: Add the changelog entry**

Add an entry to `CHANGELOG.md` under the unreleased heading, matching the prose style already there — what changed and why, not a bullet list of files. State that the register is derived, that `redline init` does not write it, and that Azure discovery is still outstanding.

- [ ] **Step 6: Full verification**

Run: `npm test 2>&1 | tail -8 && npm run typecheck && node scripts/validate.mjs`
Expected: `# fail 0` with pass count 568 or higher; typecheck silent; validate exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate.mjs CHANGELOG.md
git commit -m "chore(registry): assert the register survives in the bundle self-check

Claude-Session: https://claude.ai/code/session_014s4oPDA2yQiint6NCUGKL5"
```

---

## Done when

- `npm test` green, no fewer than 555 passing, zero failures.
- `npm run typecheck` silent.
- `node scripts/validate.mjs` exit 0.
- `.github/workflows/registry.yml` passes `actionlint` and `scripts/check-pins.mjs`.
- The dashboard's coverage figure is sourced from `registry.json`.
- Azure discovery is recorded as outstanding in `CHANGELOG.md` — Phase 0's exit condition is not met until it exists.
