# Redline v3 Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `redline init` and `redline verify` as a published CLI that onboards one GitHub repository and one Azure DevOps repository to the Redline floor by a single command, degrading explicitly when the operator lacks admin rights.

**Architecture:** One TypeScript package (`cli/`) is the only executable. A `Platform` adapter isolates every host call so no command knows whether it is talking to GitHub or Azure DevOps; the existing, battle-tested standards renderer moves into the package unchanged rather than being rewritten. Commands do deterministic work only — Phase 1 contains no model call. All host access goes through an injected `fetch`, so every adapter is tested offline against recorded responses.

**Tech Stack:** Node 22 (native TypeScript type-stripping, `node --test`, `node:util` `parseArgs`), TypeScript for typechecking only, zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-redline-v3-design.md`

---

## Scope

This plan implements **Phase 1 only** (spec §13). Phases 2–4 (`redline review`, `redline triage`, telemetry, conformance, dashboard, blocking-gate promotion) get their own plans once Phase 1 is merged and piloted.

**Phase 0 is a prerequisite gate, not part of this plan.** It is non-code and must be closed before Task 1 begins:

- [ ] **R1** — open one seeded PR on a real GitHub repo with current standards. Record whether comments carry `Redline/<SEVERITY> [rule-id]`. Raw output pasted into `CHANGELOG.md`.
- [ ] **R2** — determine whether an Azure pipeline can invoke the licensed assistant and post PR threads. Answer recorded, or Azure platform-native review declared out of scope for v3.
- [ ] **R5** — harvest/supersede position agreed with ai-sdlc-kit's owner.
- [ ] npm package name claimed. If plain `redline` is taken, the real name replaces `redline` everywhere in this plan before Task 1.

R1 does not block Phase 1 — Phase 1 posts no findings. It blocks Phase 2. R2 likewise. They are listed here so the pilot repos are chosen with the answers already known.

**Open questions from spec §15 resolved for this plan** (change them and the affected tasks change):

| Question | Answer taken here | Affects |
| --- | --- | --- |
| Who runs `redline init`? | The repo's own engineer, who usually lacks repo admin | Task 17 degradation path |
| Is advisory → blocking self-service? | Out of scope in Phase 1 — the gate installs advisory only | Tasks 12, 15, 17 |
| Does the Pages triage view survive? | Not a Phase 1 question | — |
| Which market pilots? | One GitHub repo and one Azure repo, named before the acceptance run | Acceptance |

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch first.** The repository is a git repo currently on `main`. `main` is never committed to directly. All work in this plan happens on `feat/redline-v3-cli`, created in Task 1.
- **Node 22 or newer, ESM only.** `package.json` declares `"type": "module"` and `"engines": { "node": ">=22" }`.
- **Erasable TypeScript syntax only.** Node runs `.ts` files by stripping types; it does not transform them. `enum`, `namespace`, and constructor parameter properties are `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]` at runtime. Use `const` objects plus union types instead. `tsconfig.json` sets `"erasableSyntaxOnly": true` so `tsc` catches this at typecheck time rather than at runtime.
- **Zero runtime dependencies.** `package.json` has no `dependencies` block through the whole of Phase 1. `devDependencies` holds `typescript` and nothing else. Anything that looks like it needs a library — HTTP, argument parsing, path handling, test running — is in the Node standard library. Adding a runtime dependency requires an explicit note in the PR saying which standard-library option was tried and why it failed.
- **`strict` plus `noUncheckedIndexedAccess`.** Redline's own standard (`core/unchecked-indexed-access`) requires it; the tool that enforces the standard obeys it.
- **No `any`, no `@ts-ignore`.** `core/escape-hatch-types` and `core/type-checker-suppression` are BLOCKERs in this repo's own standard. External JSON is typed as `unknown` and narrowed by an explicit parse function.
- **Every host call goes through an adapter.** No file outside `cli/platforms/` may reference `api.github.com`, `dev.azure.com`, `gh`, or `az`. Task 16 adds a test that greps for this and fails the build.
- **Every host call takes an injected `fetch`.** Clients accept `{ fetch }` in their constructor options, defaulting to `globalThis.fetch`. No test in this plan makes a network call.
- **No secret is ever written into a product repository.** `redline init` writes `.redline.json` and rendered files; it never writes a token, and never adds a repository secret.
- **Never a direct push to a default branch.** `redline init` always opens a pull request, on both hosts.
- **Standards are not edited by this plan.** `standards/` is carried over from 0.0.1 unchanged. A task that finds itself editing a rule is out of scope — stop and report.

---

## File Structure

Files that change together live together. The adapter split is by host, not by technical layer, because a host's install and verify calls share the same client, the same auth, and the same error mapping.

### New — the CLI package

| Path | Responsibility |
| --- | --- |
| `package.json` | Package manifest. `"type": "module"`, `"bin": { "redline": "cli/bin/redline.ts" }`, `"engines": { "node": ">=22" }`, no `dependencies`. |
| `tsconfig.json` | Typecheck only (`noEmit`), `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `allowImportingTsExtensions`. |
| `.gitignore` | Root ignore file — the repo currently has none, so `node_modules/` would be committed on first `npm install`. |
| `cli/bin/redline.ts` | Entry point. Parses `argv` with `node:util` `parseArgs`, dispatches to a command, maps a thrown `RedlineError` to an exit code. Contains no business logic. |
| `cli/core/errors.ts` | The error taxonomy: `RedlineError` and its exit codes. The only place an exit code is decided. |
| `cli/core/log.ts` | Console output. Every user-visible string in the CLI is produced here, so output is testable by injecting a sink. |
| `cli/core/git.ts` | Local git, via `execFile` with an argv array — never `exec` with an interpolated string (`javascript/shell-injection`). Branch, stage, commit, push. Local only; it knows nothing about a host. |
| `cli/config/redline-json.ts` | Read, validate and write `.redline.json`. Owns the file's schema and the `pending_admin` list. |
| `cli/detect/stack.ts` | Pure: a list of repository file paths in, a ranked profile proposal out. No filesystem access. |
| `cli/detect/scan.ts` | The filesystem half of detection: walks a working tree, honours `.gitignore`-style skips, returns the path list `stack.ts` consumes. |
| `cli/render/manifest.ts` | Loads and types `standards/manifest.json`. The typed replacement for `render.mjs`'s module-scope `manifest` const. |
| `cli/render/profile.ts` | `resolveProfile` — alias substitution and transitive `extends` ordering. |
| `cli/render/markers.ts` | The `REDLINE:BEGIN` / `REDLINE:END` block merge. Isolated because its three cases are the subtlest logic being ported. |
| `cli/render/vendors.ts` | The four vendor renderers (copilot, agents, claude, cursor). |
| `cli/render/standards.ts` | `render()` — plan, write, prune, check. Orchestrates the four files above. |
| `cli/render/commands.ts` | Renders `commands/*.md` sources into per-host command files. |
| `cli/platforms/types.ts` | `Platform` and every type it names. The single boundary of the system. |
| `cli/platforms/detect.ts` | Pure: a git remote URL in, `'github' \| 'azure'` out. |
| `cli/platforms/resolve.ts` | Reads the working tree's git remote and returns a constructed `Platform`. The only factory. |
| `cli/platforms/http.ts` | Shared HTTP concerns: injected `fetch`, retry on 429/5xx, JSON parsing, mapping status codes to `RedlineError`. Host-agnostic. |
| `cli/platforms/github/client.ts` | GitHub REST + GraphQL transport and token resolution. |
| `cli/platforms/github/install.ts` | `installGate`, `applyPolicy`, `enableSecurityFloor`, `ensureReviewOwnership`, `openPullRequest`. |
| `cli/platforms/github/verify.ts` | `readPolicy`, `readReportedCheckNames`, `readSecurityState`. |
| `cli/platforms/github/index.ts` | Composes the above into a `Platform`. |
| `cli/platforms/azure/client.ts` | Azure DevOps REST transport and token resolution. |
| `cli/platforms/azure/install.ts` | The same five install methods against branch policies and required-reviewer policies. |
| `cli/platforms/azure/verify.ts` | The same three verify methods. |
| `cli/platforms/azure/index.ts` | Composes the above into a `Platform`. |
| `cli/commands/init.ts` | Orchestration only: detect, propose, render, install, register, report. Every host call goes through the adapter it was handed. |
| `cli/commands/verify.ts` | Compares live host state against `.redline.json` and returns a typed report. |
| `commands/redline-init.md` | Command source — the text a host renders. Thin: it explains what the command does and shells to the CLI. |
| `commands/redline-verify.md` | As above. |
| `platforms/azure/gate-template.yml` | The Azure Pipelines equivalent of `workflows/redline-gate.yml`. |
| `templates/azure/pull_request_template.md` | Azure's PR template location differs from GitHub's. |

### Tests

Tests sit beside nothing — they mirror the source tree under `cli/**/__tests__/`, so a file and its test are one directory apart and `node --test` finds them by glob.

| Path | Covers |
| --- | --- |
| `cli/**/__tests__/*.test.ts` | Unit tests, one file per source file. |
| `cli/platforms/__tests__/fixtures/` | Recorded host responses as JSON. No test makes a network call. |
| `cli/render/__tests__/golden.test.ts` | The port safety net: renders all 12 profiles × 4 vendors through the new TypeScript renderer and byte-compares against `scripts/render.mjs`. |

### Modified

| Path | Change |
| --- | --- |
| `.github/workflows/ci.yml` | Add `npm run typecheck` and `npm test`; keep every existing check. |
| `README.md` | The eight-step rollout is deleted and replaced by the `npx` one-liner (spec §9). |
| `standards/manifest.json` | `version` only, and only by the release job. Rules untouched. |

### Deleted at the end of the plan, not the start

`scripts/setup-repo.sh` and `scripts/sync.sh` stay on disk and working until the CLI replaces them, task by task. They are removed in Task 21, after `redline init` and `redline verify` pass against a real repository. Deleting them earlier would leave the estate with no onboarding path mid-plan.

`scripts/render.mjs` is deleted in the same task, once the golden test in Task 6 has proven the TypeScript renderer byte-identical. Until then it is the oracle the port is tested against, so it cannot be touched.

---

## Exit codes

Decided once, in `cli/core/errors.ts`, and used by every command. Task 2 builds this; every later task depends on it.

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | The thing being checked is wrong — verification failed, drift found, rendered output stale |
| `2` | Usage error — bad flag, unknown profile, not a git repository |
| `3` | Permission denied — the operator lacks the rights, and nothing could be done at all |
| `4` | Host or network error — the host API was unreachable or returned an unexpected shape |

Note `3` is for *total* failure. Partial permission failure is the normal path and exits `0` with a `pendingAdmin` report — see Task 17.

---

## Task 1: Package scaffold and the test harness

Nothing else in this plan can be tested until `node --test` runs. This task ends with one real, passing test, and CI running it.

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `cli/core/version.ts`
- Test: `cli/core/__tests__/version.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: nothing.
- Produces: `npm test` runs every `cli/**/*.test.ts`. `npm run typecheck` runs `tsc --noEmit`. `export const CLI_VERSION: string` from `cli/core/version.ts`.

**Background you need:** Node 22 executes `.ts` files directly by *stripping* type annotations. It does not transform them. `enum`, `namespace`, and constructor parameter properties fail at runtime with `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]`. `"erasableSyntaxOnly": true` makes `tsc` reject them at typecheck time instead, which is where you want to find out. There is no build step and no bundler in Phase 1.

- [ ] **Step 1: Create the feature branch**

The repository is on `main`. Never commit to it.

```bash
git checkout -b feat/redline-v3-cli
```

- [ ] **Step 2: Write the failing test**

Create `cli/core/__tests__/version.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLI_VERSION } from '../version.ts';

test('CLI_VERSION matches package.json', () => {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.ok(typeof pkg === 'object' && pkg !== null && 'version' in pkg);
  assert.equal(CLI_VERSION, (pkg as { version: string }).version);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `node --test cli/core/__tests__/version.test.ts`
Expected: FAIL — `Cannot find module` for `../version.ts` (and for `package.json`).

- [ ] **Step 4: Create the package manifest**

Create `package.json`:

```json
{
  "name": "redline",
  "version": "0.0.0-development",
  "description": "Engineering control plane: standards, merge gates and evidence across GitHub and Azure DevOps",
  "type": "module",
  "license": "UNLICENSED",
  "private": false,
  "engines": { "node": ">=22" },
  "bin": { "redline": "./cli/bin/redline.ts" },
  "files": ["cli/", "standards/", "commands/", "templates/", "platforms/", "workflows/", "rulesets/"],
  "scripts": {
    "test": "node --test 'cli/**/__tests__/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": { "typescript": "^5.7.0" }
}
```

`version` is `0.0.0-development` because semantic-release computes the real one at publish time (Task 21). Do not hand-edit it.

If Phase 0 found the name `redline` taken on npm, change `name` here and everywhere in this plan before continuing.

- [ ] **Step 5: Create the TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["cli/**/*.ts"]
}
```

`noUncheckedIndexedAccess` is not optional taste — Redline's own `core/unchecked-indexed-access` is a BLOCKER, and the tool that enforces the standard obeys it.

- [ ] **Step 6: Create the root ignore file**

The repository has no root `.gitignore`, so `npm install` would commit `node_modules/`.

Create `.gitignore`:

```
node_modules/
*.tsbuildinfo
.redline-tmp/
```

- [ ] **Step 7: Write the minimal implementation**

Create `cli/core/version.ts`:

```ts
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export const CLI_VERSION: string = pkg.version;
```

- [ ] **Step 8: Install and run**

```bash
npm install
npm test
npm run typecheck
```

Expected: the test passes; `tsc` reports no errors.

- [ ] **Step 9: Add the CLI to CI**

In `.github/workflows/ci.yml`, in the `validate` job, after the `actions/setup-node@v4` step and before `Every rule carries an id`, insert:

```yaml
      - name: Install
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm test
```

Change nothing else in the file. Every existing check stays.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore cli/ .github/workflows/ci.yml
git commit -m "feat(cli): package scaffold with native TypeScript tests"
```

---

## Task 2: The error taxonomy

One place decides exit codes. Without it, every later task invents its own.

**Files:**

- Create: `cli/core/errors.ts`
- Test: `cli/core/__tests__/errors.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type RedlineErrorKind = 'usage' | 'failed' | 'permission' | 'host'`
  - `class RedlineError extends Error { readonly kind: RedlineErrorKind; readonly exitCode: number; readonly hint?: string }`
  - `function exitCodeFor(kind: RedlineErrorKind): number`
  - `function isRedlineError(e: unknown): e is RedlineError`

- [ ] **Step 1: Write the failing test**

Create `cli/core/__tests__/errors.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedlineError, exitCodeFor, isRedlineError } from '../errors.ts';

test('each kind maps to its documented exit code', () => {
  assert.equal(exitCodeFor('failed'), 1);
  assert.equal(exitCodeFor('usage'), 2);
  assert.equal(exitCodeFor('permission'), 3);
  assert.equal(exitCodeFor('host'), 4);
});

test('the error carries its own exit code and hint', () => {
  const err = new RedlineError('usage', 'unknown profile "nope"', 'run redline init --help');
  assert.equal(err.exitCode, 2);
  assert.equal(err.kind, 'usage');
  assert.equal(err.message, 'unknown profile "nope"');
  assert.equal(err.hint, 'run redline init --help');
  assert.equal(err.name, 'RedlineError');
});

test('isRedlineError narrows and rejects a plain Error', () => {
  assert.equal(isRedlineError(new RedlineError('host', 'boom')), true);
  assert.equal(isRedlineError(new Error('boom')), false);
  assert.equal(isRedlineError('boom'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/core/__tests__/errors.test.ts`
Expected: FAIL — `Cannot find module '../errors.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/core/errors.ts`:

```ts
export type RedlineErrorKind = 'usage' | 'failed' | 'permission' | 'host';

const EXIT_CODES: Record<RedlineErrorKind, number> = {
  failed: 1,
  usage: 2,
  permission: 3,
  host: 4,
};

export function exitCodeFor(kind: RedlineErrorKind): number {
  return EXIT_CODES[kind];
}

export class RedlineError extends Error {
  readonly kind: RedlineErrorKind;
  readonly exitCode: number;
  readonly hint: string | undefined;

  constructor(kind: RedlineErrorKind, message: string, hint?: string) {
    super(message);
    this.name = 'RedlineError';
    this.kind = kind;
    this.exitCode = EXIT_CODES[kind];
    this.hint = hint;
  }
}

export function isRedlineError(e: unknown): e is RedlineError {
  return e instanceof RedlineError;
}
```

Note `EXIT_CODES` is a `const` object with a `Record` type, not an `enum` — `enum` is unsupported at runtime under type stripping.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test cli/core/__tests__/errors.test.ts && npm run typecheck`
Expected: 3 passing tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add cli/core/errors.ts cli/core/__tests__/errors.test.ts
git commit -m "feat(cli): error taxonomy with fixed exit codes"
```

---

## Task 3: Manifest loading and profile resolution

The first half of the renderer port. `standards/manifest.json` becomes typed; `resolveProfile` moves to TypeScript with its error messages preserved byte-for-byte, because `scripts/setup-repo.sh` and CI both match on them today.

**Files:**
- Create: `cli/render/manifest.ts`
- Create: `cli/render/profile.ts`
- Test: `cli/render/__tests__/manifest.test.ts`
- Test: `cli/render/__tests__/profile.test.ts`

**Interfaces:**
- Consumes: `RedlineError` from `cli/core/errors.ts`.
- Produces:
  - `interface StackDef { title: string; source: string; globs: string[]; extends?: string[] }`
  - `interface CoreDef { title: string; source: string }`
  - `interface VendorDef { title: string; enabled: boolean }`
  - `interface Manifest { version: string; core: CoreDef; stacks: Record<string, StackDef>; profiles: Record<string, string[]>; profileAliases: Record<string, string>; vendors: Record<string, VendorDef> }`
  - `function loadManifest(root: string): Manifest`
  - `interface ResolvedProfile { profile: string; stacks: string[] }`
  - `function resolveProfile(manifest: Manifest, name: string): ResolvedProfile`

**Background:** `manifest.json` carries `$comment`, `$profileComment` and `$aliasComment` keys that are documentation, not data. The type does not model them and must not reject them. `resolveProfile` walks `extends` depth-first so a parent stack always appears before its child — `mobile-rn` resolves to `['javascript', 'react', 'react-native']` because `react-native` extends `react`.

- [ ] **Step 1: Write the failing tests**

Create `cli/render/__tests__/manifest.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('loads the real manifest', () => {
  const m = loadManifest(ROOT);
  assert.equal(typeof m.version, 'string');
  assert.equal(m.core.source, 'standards/core.md');
  assert.ok(m.stacks['react']);
  assert.deepEqual(m.stacks['react-native']?.extends, ['react']);
  assert.deepEqual(m.profiles['web'], ['javascript', 'react']);
  assert.equal(m.profileAliases['mobile'], 'mobile-rn');
  assert.equal(m.vendors['cursor']?.enabled, false);
});

test('a missing manifest is a host-independent usage failure', () => {
  assert.throws(() => loadManifest('/nonexistent-root'), /manifest/i);
});
```

Create `cli/render/__tests__/profile.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';

const manifest = loadManifest(fileURLToPath(new URL('../../../', import.meta.url)));

test('resolves a plain profile in manifest order', () => {
  assert.deepEqual(resolveProfile(manifest, 'web'), { profile: 'web', stacks: ['javascript', 'react'] });
});

test('resolves an alias to its target key', () => {
  const r = resolveProfile(manifest, 'mobile');
  assert.equal(r.profile, 'mobile-rn');
});

test('a parent stack always precedes the child that extends it', () => {
  const { stacks } = resolveProfile(manifest, 'mobile-rn');
  assert.deepEqual(stacks, ['javascript', 'react', 'react-native']);
});

test('a stack is listed once even when reached twice', () => {
  const { stacks } = resolveProfile(manifest, 'fullstack-node');
  assert.equal(new Set(stacks).size, stacks.length);
});

test('an unknown profile names the known ones', () => {
  assert.throws(
    () => resolveProfile(manifest, 'nope'),
    /^Error: unknown profile "nope"\. Known: tooling, web, /
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test 'cli/render/__tests__/*.test.ts'`
Expected: FAIL — `Cannot find module '../manifest.ts'`.

- [ ] **Step 3: Write `cli/render/manifest.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RedlineError } from '../core/errors.ts';

export interface StackDef {
  title: string;
  source: string;
  globs: string[];
  extends?: string[];
}

export interface CoreDef {
  title: string;
  source: string;
}

export interface VendorDef {
  title: string;
  enabled: boolean;
}

export interface Manifest {
  version: string;
  core: CoreDef;
  stacks: Record<string, StackDef>;
  profiles: Record<string, string[]>;
  profileAliases: Record<string, string>;
  vendors: Record<string, VendorDef>;
}

export function loadManifest(root: string): Manifest {
  const path = join(root, 'standards/manifest.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new RedlineError('usage', `cannot read the standards manifest at ${path}`);
  }
  return JSON.parse(raw) as Manifest;
}
```

The manifest ships inside the package and is authored by this repository, so it is trusted internal data — it is parsed, not schema-validated. `scripts/validate.mjs` already enforces its shape in CI, which is the real boundary (`core/unreachable-defensive-guard`).

- [ ] **Step 4: Write `cli/render/profile.ts`**

```ts
import type { Manifest } from './manifest.ts';

export interface ResolvedProfile {
  profile: string;
  stacks: string[];
}

export function resolveProfile(manifest: Manifest, name: string): ResolvedProfile {
  const key = manifest.profileAliases[name] ?? name;
  const stacks = manifest.profiles[key];
  if (!stacks) {
    throw new Error(
      `unknown profile "${name}". Known: ${Object.keys(manifest.profiles).join(', ')} ` +
        `(aliases: ${Object.keys(manifest.profileAliases).join(', ')})`
    );
  }
  const out: string[] = [];
  const visit = (id: string): void => {
    const stack = manifest.stacks[id];
    if (!stack) throw new Error(`profile "${key}" references unknown stack "${id}"`);
    for (const parent of stack.extends ?? []) visit(parent);
    if (!out.includes(id)) out.push(id);
  };
  stacks.forEach(visit);
  return { profile: key, stacks: out };
}
```

The two `throw new Error` messages are copied verbatim from `scripts/render.mjs`. Do not reword them and do not convert them to `RedlineError` — Task 6 compares this renderer's behaviour against `scripts/render.mjs` and `.github/workflows/ci.yml` asserts on the unknown-profile failure. They become `RedlineError` only once `scripts/render.mjs` is deleted in Task 21.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test 'cli/render/__tests__/*.test.ts' && npm run typecheck`
Expected: 7 passing tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/render/manifest.ts cli/render/profile.ts cli/render/__tests__/
git commit -m "feat(cli): typed manifest loading and profile resolution"
```

---

## Task 4: The marker block merge

The subtlest logic in the renderer, and the one with the worst failure mode: get it wrong and a sync PR silently eats content a repository owns.

**Files:**
- Create: `cli/render/markers.ts`
- Test: `cli/render/__tests__/markers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const BEGIN: string`
  - `const END: string`
  - `function wrapBlock(existing: string | null, body: string): string`

**The marker strings must not change.** `BEGIN` contains the literal text `generated by scripts/render.mjs`, and `scripts/render.mjs` is deleted later in this plan. Keep the string byte-identical anyway. Two reasons: any repository already carrying a marker block would get a *second* block appended rather than its existing one replaced, and Task 6 compares this renderer byte-for-byte against `scripts/render.mjs`, which is impossible if the marker text differs. Rewording the marker is a Phase 4 migration that must recognise both forms; it is not a Phase 1 tidy-up.

Note also that `BEGIN` contains an em dash (`—`, U+2014) and `wrapBlock` takes the existing file *contents* rather than a path, so it is pure and testable without a filesystem.

- [ ] **Step 1: Write the failing test**

Create `cli/render/__tests__/markers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEGIN, END, wrapBlock } from '../markers.ts';

test('the marker strings are byte-exact', () => {
  assert.equal(
    BEGIN,
    '<!-- REDLINE:BEGIN — generated by scripts/render.mjs. Do not edit inside this block. -->'
  );
  assert.equal(END, '<!-- REDLINE:END -->');
});

test('no existing file yields the block alone', () => {
  assert.equal(wrapBlock(null, 'rules'), `${BEGIN}\n\nrules\n\n${END}\n`);
});

test('an existing file without markers keeps its content and gains the block', () => {
  const out = wrapBlock('# My repo\n\nHand-written.\n', 'rules');
  assert.equal(out, `# My repo\n\nHand-written.\n\n${BEGIN}\n\nrules\n\n${END}\n`);
});

test('an existing block is replaced and surrounding content preserved', () => {
  const existing = `before\n\n${BEGIN}\n\nOLD\n\n${END}\n\nafter\n`;
  const out = wrapBlock(existing, 'NEW');
  assert.equal(out, `before\n\n${BEGIN}\n\nNEW\n\n${END}\n\nafter\n`);
  assert.ok(out.includes('before'));
  assert.ok(out.includes('after'));
  assert.ok(!out.includes('OLD'));
});

test('content after the end marker survives verbatim, including a second heading', () => {
  const existing = `${BEGIN}\n\nOLD\n\n${END}\n\n## Repo-owned section\n\nkeep me\n`;
  assert.match(wrapBlock(existing, 'NEW'), /## Repo-owned section\n\nkeep me\n$/);
});

test('a half-open block (BEGIN with no END) is treated as no markers at all', () => {
  const existing = `stuff\n\n${BEGIN}\n\ntruncated\n`;
  const out = wrapBlock(existing, 'NEW');
  assert.ok(out.endsWith(`${BEGIN}\n\nNEW\n\n${END}\n`));
  assert.ok(out.includes('truncated'));
});

test('the body is right-trimmed before wrapping', () => {
  assert.equal(wrapBlock(null, 'rules\n\n\n'), `${BEGIN}\n\nrules\n\n${END}\n`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/render/__tests__/markers.test.ts`
Expected: FAIL — `Cannot find module '../markers.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/render/markers.ts`:

```ts
export const BEGIN =
  '<!-- REDLINE:BEGIN — generated by scripts/render.mjs. Do not edit inside this block. -->';
export const END = '<!-- REDLINE:END -->';

export function wrapBlock(existing: string | null, body: string): string {
  const block = `${BEGIN}\n\n${body.trimEnd()}\n\n${END}\n`;
  if (existing === null) return block;
  const start = existing.indexOf(BEGIN);
  const stop = existing.indexOf(END);
  if (start === -1 || stop === -1) return `${existing.trimEnd()}\n\n${block}`;
  return existing.slice(0, start) + block.trimEnd() + existing.slice(stop + END.length);
}
```

The splice case drops the block's own trailing newline (`block.trimEnd()`) and then re-attaches whatever followed `END` in the original — that is what preserves a repo-owned section that sits after the block, and it is why the last test asserts on the exact tail.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/render/__tests__/markers.test.ts && npm run typecheck`
Expected: 7 passing tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add cli/render/markers.ts cli/render/__tests__/markers.test.ts
git commit -m "feat(cli): marker block merge preserving repo-owned content"
```

---

## Task 5: The four vendor renderers

Each vendor turns a resolved profile into a set of files. No vendor touches the filesystem — they return content, and Task 6 writes it. That is what makes them testable without temp directories.

**Files:**
- Create: `cli/render/vendors.ts`
- Test: `cli/render/__tests__/vendors.test.ts`

**Interfaces:**
- Consumes: `Manifest` from `cli/render/manifest.ts`.
- Produces:
  - `interface RenderContext { manifest: Manifest; root: string; profile: string; stacks: string[] }`
  - `interface RenderedFile { body: string; merge?: boolean }`
  - `interface PruneRule { dir: string; matches: (filename: string) => boolean }`
  - `interface VendorOutput { files: Map<string, RenderedFile>; prune: PruneRule[] }`
  - `type VendorRenderer = (ctx: RenderContext) => VendorOutput`
  - `const VENDORS: Record<string, VendorRenderer>` with keys `copilot`, `agents`, `claude`, `cursor`
  - `const PREFIX: string` (`'redline-'`)

**Details that must be exact, because Task 6 byte-compares against `scripts/render.mjs`:**

- The header comment uses a middle dot: `<!-- Redline v0.0.1 · profile: web · stacks: javascript, react -->` (`·` is U+00B7).
- Reading a standards file uses `.trimEnd()`, not `.trim()`.
- Copilot's `applyTo` is `JSON.stringify(globs.join(','))` — comma-joined with **no space**, then double-quoted.
- Cursor's `globs:` is the same comma-join but **unquoted**, and the per-stack `.mdc` files carry **no** header comment (unlike Copilot's).
- `AGENTS.md` demotes headings h1–h5 by one level with `/^(#{1,5}) /gm` and joins stack sections with `\n\n---\n\n`.
- `claude` takes no context and always emits the same four lines.
- Marker-merged files: `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`. Everything under `.github/instructions/` and `.cursor/rules/` is wholly generated.

- [ ] **Step 1: Write the failing test**

Create `cli/render/__tests__/vendors.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';
import { VENDORS, type RenderContext } from '../vendors.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = loadManifest(root);

function ctx(profileName: string): RenderContext {
  const { profile, stacks } = resolveProfile(manifest, profileName);
  return { manifest, root, profile, stacks };
}

test('copilot writes a merged core file and one generated file per stack', () => {
  const out = VENDORS['copilot']!(ctx('web'));
  const paths = [...out.files.keys()].sort();
  assert.deepEqual(paths, [
    '.github/copilot-instructions.md',
    '.github/instructions/redline-javascript.instructions.md',
    '.github/instructions/redline-react.instructions.md',
  ]);
  assert.equal(out.files.get('.github/copilot-instructions.md')?.merge, true);
  assert.equal(out.files.get('.github/instructions/redline-react.instructions.md')?.merge, undefined);
});

test('copilot applyTo is a quoted comma-joined glob list', () => {
  const out = VENDORS['copilot']!(ctx('infra'));
  const body = out.files.get('.github/instructions/redline-terraform.instructions.md')?.body ?? '';
  assert.ok(body.startsWith('---\napplyTo: "**/*.tf,**/*.tfvars,**/*.hcl"\n---\n\n'));
});

test('copilot prunes only its own generated instruction files', () => {
  const [rule] = VENDORS['copilot']!(ctx('web')).prune;
  assert.equal(rule?.dir, '.github/instructions');
  assert.equal(rule?.matches('redline-react.instructions.md'), true);
  assert.equal(rule?.matches('team-owned.instructions.md'), false);
  assert.equal(rule?.matches('redline-notes.md'), false);
});

test('agents emits one merged AGENTS.md with demoted stack headings', () => {
  const out = VENDORS['agents']!(ctx('web'));
  assert.deepEqual([...out.files.keys()], ['AGENTS.md']);
  const file = out.files.get('AGENTS.md');
  assert.equal(file?.merge, true);
  assert.ok(file!.body.includes('\n# Stack rules\n'));
  assert.ok(file!.body.includes('_Applies to: `**/*.js`, `**/*.jsx`, `**/*.mjs`, `**/*.cjs`_'));
  assert.ok(file!.body.includes('## JavaScript Review Rules'));
});

test('claude emits a fixed pointer at AGENTS.md', () => {
  const out = VENDORS['claude']!(ctx('web'));
  assert.deepEqual([...out.files.keys()], ['CLAUDE.md']);
  assert.equal(
    out.files.get('CLAUDE.md')?.body,
    'Engineering standards and review rules for this repository are defined by Redline\n' +
      'and rendered into `AGENTS.md`. They are binding for all work in this repo.\n' +
      '\n' +
      '@AGENTS.md'
  );
});

test('cursor globs are unquoted and per-stack files carry no header comment', () => {
  const out = VENDORS['cursor']!(ctx('infra'));
  const body = out.files.get('.cursor/rules/redline-terraform.mdc')?.body ?? '';
  assert.ok(
    body.startsWith(
      '---\ndescription: Redline Terraform / HCL rules\nglobs: **/*.tf,**/*.tfvars,**/*.hcl\nalwaysApply: false\n---\n\n'
    )
  );
  assert.ok(!body.includes('<!-- Redline v'));
  assert.ok(out.files.get('.cursor/rules/redline-core.mdc')?.body.includes('alwaysApply: true'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/render/__tests__/vendors.test.ts`
Expected: FAIL — `Cannot find module '../vendors.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/render/vendors.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from './manifest.ts';

export const PREFIX = 'redline-';

export interface RenderContext {
  manifest: Manifest;
  root: string;
  profile: string;
  stacks: string[];
}

export interface RenderedFile {
  body: string;
  merge?: boolean;
}

export interface PruneRule {
  dir: string;
  matches: (filename: string) => boolean;
}

export interface VendorOutput {
  files: Map<string, RenderedFile>;
  prune: PruneRule[];
}

export type VendorRenderer = (ctx: RenderContext) => VendorOutput;

const read = (root: string, relPath: string): string =>
  readFileSync(join(root, relPath), 'utf8').trimEnd();

const stackBody = (ctx: RenderContext, id: string): string =>
  read(ctx.root, ctx.manifest.stacks[id]!.source);

const header = (ctx: RenderContext, stacks: string[]): string =>
  `<!-- Redline v${ctx.manifest.version} · profile: ${ctx.profile} · stacks: ${stacks.join(', ')} -->`;

const copilot: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set('.github/copilot-instructions.md', {
    merge: true,
    body: `${header(ctx, ctx.stacks)}\n\n${read(ctx.root, ctx.manifest.core.source)}`,
  });
  for (const id of ctx.stacks) {
    const stack = ctx.manifest.stacks[id]!;
    files.set(`.github/instructions/${PREFIX}${id}.instructions.md`, {
      body:
        `---\napplyTo: ${JSON.stringify(stack.globs.join(','))}\n---\n\n` +
        `${header(ctx, [id])}\n\n${stackBody(ctx, id)}`,
    });
  }
  return {
    files,
    prune: [
      {
        dir: '.github/instructions',
        matches: (f) => f.startsWith(PREFIX) && f.endsWith('.instructions.md'),
      },
    ],
  };
};

const demote = (md: string): string => md.replace(/^(#{1,5}) /gm, '#$1 ');

const agents: VendorRenderer = (ctx) => {
  const sections = ctx.stacks.map((id) => {
    const scope = ctx.manifest.stacks[id]!.globs.map((g) => `\`${g}\``).join(', ');
    return `${demote(stackBody(ctx, id))}\n\n_Applies to: ${scope}_`;
  });
  const body = [
    header(ctx, ctx.stacks),
    '',
    read(ctx.root, ctx.manifest.core.source),
    '',
    '---',
    '',
    '# Stack rules',
    '',
    sections.join('\n\n---\n\n'),
  ].join('\n');
  return { files: new Map([['AGENTS.md', { merge: true, body }]]), prune: [] };
};

const claude: VendorRenderer = () => ({
  files: new Map([
    [
      'CLAUDE.md',
      {
        merge: true,
        body: [
          'Engineering standards and review rules for this repository are defined by Redline',
          'and rendered into `AGENTS.md`. They are binding for all work in this repo.',
          '',
          '@AGENTS.md',
        ].join('\n'),
      },
    ],
  ]),
  prune: [],
});

const cursor: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set(`.cursor/rules/${PREFIX}core.mdc`, {
    body:
      `---\ndescription: Redline core standards\nalwaysApply: true\n---\n\n` +
      `${header(ctx, ctx.stacks)}\n\n${read(ctx.root, ctx.manifest.core.source)}`,
  });
  for (const id of ctx.stacks) {
    const stack = ctx.manifest.stacks[id]!;
    files.set(`.cursor/rules/${PREFIX}${id}.mdc`, {
      body:
        `---\ndescription: Redline ${stack.title} rules\nglobs: ${stack.globs.join(',')}\n` +
        `alwaysApply: false\n---\n\n${stackBody(ctx, id)}`,
    });
  }
  return {
    files,
    prune: [{ dir: '.cursor/rules', matches: (f) => f.startsWith(PREFIX) && f.endsWith('.mdc') }],
  };
};

export const VENDORS: Record<string, VendorRenderer> = { copilot, agents, claude, cursor };
```

The non-null assertions on `ctx.manifest.stacks[id]` are safe because `resolveProfile` already threw on any stack id absent from the manifest; asserting here rather than re-checking is `core/unreachable-defensive-guard`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/render/__tests__/vendors.test.ts && npm run typecheck`
Expected: 6 passing tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add cli/render/vendors.ts cli/render/__tests__/vendors.test.ts
git commit -m "feat(cli): vendor renderers for copilot, agents, claude and cursor"
```

---

## Task 6: `render()` and the golden test that proves the port

This is the task that makes the whole port safe. The new renderer must produce **byte-identical** output to `scripts/render.mjs` for every profile and every vendor. If it does not, the port is wrong and there is no argument about it.

**Files:**
- Create: `cli/render/standards.ts`
- Test: `cli/render/__tests__/standards.test.ts`
- Test: `cli/render/__tests__/golden.test.ts`

**Interfaces:**
- Consumes: `loadManifest`, `resolveProfile`, `wrapBlock`, `VENDORS`.
- Produces:
  - `interface RenderOptions { root: string; profile: string; out: string; vendors?: string[]; check?: boolean }`
  - `interface RenderResult { profile: string; stacks: string[]; written: string[]; removed: string[]; stale: string[]; managed: string[] }`
  - `function render(opts: RenderOptions): RenderResult`

**Semantics carried over exactly:**
- `vendors` omitted → every vendor whose manifest entry has `enabled: true` (today: `copilot`, `agents`, `claude` — **not** `cursor`).
- Later vendors overwrite an earlier vendor's entry for the same path.
- A file is written only when its full contents differ; non-merged files always end with exactly one trailing newline.
- `check: true` writes and deletes nothing; differing paths go into `stale`, and a prunable leftover is recorded as `` `${path} (stale, should be removed)` ``.
- An unknown vendor throws `` `unknown vendor "${name}". Known: copilot, agents, claude, cursor` ``.
- All returned paths are relative to `out`.

- [ ] **Step 1: Write the failing unit test**

Create `cli/render/__tests__/standards.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../standards.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tmp = (): string => mkdtempSync(join(tmpdir(), 'redline-render-'));

test('defaults to the manifest-enabled vendors only', () => {
  const out = tmp();
  const r = render({ root, profile: 'web', out });
  assert.ok(r.managed.includes('AGENTS.md'));
  assert.ok(r.managed.includes('CLAUDE.md'));
  assert.ok(r.managed.includes('.github/copilot-instructions.md'));
  assert.ok(!r.managed.some((p) => p.startsWith('.cursor/')));
});

test('a second render of an unchanged tree writes nothing', () => {
  const out = tmp();
  render({ root, profile: 'web', out });
  const again = render({ root, profile: 'web', out });
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.removed, []);
});

test('check mode reports stale paths and writes nothing', () => {
  const out = tmp();
  const r = render({ root, profile: 'web', out, check: true });
  assert.ok(r.stale.length > 0);
  assert.deepEqual(r.written, []);
  assert.equal(existsSync(join(out, 'AGENTS.md')), false);
});

test('narrowing a profile prunes the stack file it no longer includes', () => {
  const out = tmp();
  render({ root, profile: 'web', out, vendors: ['copilot'] });
  const orphan = '.github/instructions/redline-react.instructions.md';
  assert.ok(existsSync(join(out, orphan)));
  const r = render({ root, profile: 'tooling', out, vendors: ['copilot'] });
  assert.ok(r.removed.includes(orphan));
  assert.equal(existsSync(join(out, orphan)), false);
});

test('a repo-owned instruction file is never pruned', () => {
  const out = tmp();
  mkdirSync(join(out, '.github/instructions'), { recursive: true });
  writeFileSync(join(out, '.github/instructions/team.instructions.md'), 'ours\n');
  render({ root, profile: 'tooling', out, vendors: ['copilot'] });
  assert.equal(readFileSync(join(out, '.github/instructions/team.instructions.md'), 'utf8'), 'ours\n');
});

test('content outside the markers is preserved across a re-render', () => {
  const out = tmp();
  render({ root, profile: 'web', out, vendors: ['agents'] });
  const withTail = readFileSync(join(out, 'AGENTS.md'), 'utf8') + '\n## Repo notes\n\nkeep me\n';
  writeFileSync(join(out, 'AGENTS.md'), withTail);
  render({ root, profile: 'tooling', out, vendors: ['agents'] });
  assert.match(readFileSync(join(out, 'AGENTS.md'), 'utf8'), /## Repo notes\n\nkeep me\n$/);
});

test('an unknown vendor is rejected by name', () => {
  assert.throws(
    () => render({ root, profile: 'web', out: tmp(), vendors: ['copilot', 'nope'] }),
    /unknown vendor "nope"\. Known: copilot, agents, claude, cursor/
  );
});
```

- [ ] **Step 2: Write the failing golden test**

Create `cli/render/__tests__/golden.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { render } from '../standards.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = loadManifest(root);
const VENDORS = ['copilot', 'agents', 'claude', 'cursor'];

function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const abs = join(current, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.set(relative(dir, abs).split(sep).join('/'), readFileSync(abs, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

for (const profile of Object.keys(manifest.profiles)) {
  test(`profile ${profile} renders byte-identically to scripts/render.mjs`, () => {
    const oracle = mkdtempSync(join(tmpdir(), 'redline-oracle-'));
    const ported = mkdtempSync(join(tmpdir(), 'redline-ported-'));

    execFileSync(
      process.execPath,
      ['scripts/render.mjs', '--profile', profile, '--out', oracle, '--vendors', VENDORS.join(',')],
      { cwd: root, stdio: 'pipe' }
    );
    render({ root, profile, out: ported, vendors: VENDORS });

    const a = snapshot(oracle);
    const b = snapshot(ported);
    assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort(), `file set differs for ${profile}`);
    for (const [path, contents] of a) {
      assert.equal(b.get(path), contents, `contents differ for ${profile} → ${path}`);
    }
  });
}
```

This test is the reason `scripts/render.mjs` stays on disk until Task 21. It is deleted together with this test in the same commit.

- [ ] **Step 3: Run both to verify they fail**

Run: `node --test 'cli/render/__tests__/*.test.ts'`
Expected: FAIL — `Cannot find module '../standards.ts'`.

- [ ] **Step 4: Write minimal implementation**

Create `cli/render/standards.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadManifest } from './manifest.ts';
import { resolveProfile } from './profile.ts';
import { wrapBlock } from './markers.ts';
import { VENDORS, type PruneRule, type RenderedFile } from './vendors.ts';

export interface RenderOptions {
  root: string;
  profile: string;
  out: string;
  vendors?: string[];
  check?: boolean;
}

export interface RenderResult {
  profile: string;
  stacks: string[];
  written: string[];
  removed: string[];
  stale: string[];
  managed: string[];
}

export function render(opts: RenderOptions): RenderResult {
  const { root, out, check = false } = opts;
  const manifest = loadManifest(root);
  const resolved = resolveProfile(manifest, opts.profile);

  const selected =
    opts.vendors ??
    Object.entries(manifest.vendors)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);

  const planned = new Map<string, RenderedFile>();
  const prunes: PruneRule[] = [];
  for (const name of selected) {
    const renderer = VENDORS[name];
    if (!renderer) {
      throw new Error(`unknown vendor "${name}". Known: ${Object.keys(VENDORS).join(', ')}`);
    }
    const result = renderer({ manifest, root, profile: resolved.profile, stacks: resolved.stacks });
    for (const [path, file] of result.files) planned.set(path, file);
    prunes.push(...result.prune);
  }

  const written: string[] = [];
  const removed: string[] = [];
  const stale: string[] = [];

  for (const [relPath, spec] of planned) {
    const target = join(out, relPath);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const next = spec.merge ? wrapBlock(current, spec.body) : `${spec.body.trimEnd()}\n`;
    if (current === next) continue;
    if (check) {
      stale.push(relPath);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
    written.push(relPath);
  }

  for (const rule of prunes) {
    const abs = join(out, rule.dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!rule.matches(file)) continue;
      const relPath = join(rule.dir, file);
      if (planned.has(relPath)) continue;
      if (check) {
        stale.push(`${relPath} (stale, should be removed)`);
        continue;
      }
      rmSync(join(abs, file));
      removed.push(relPath);
    }
  }

  return { ...resolved, written, removed, stale, managed: [...planned.keys()] };
}
```

Note the one deliberate difference from `scripts/render.mjs`: it read the existing file twice (once inside `wrap`, once for the comparison). Here `current` is read once and passed in. Behaviour is identical; the golden test proves it.

- [ ] **Step 5: Run both tests to verify they pass**

Run: `node --test 'cli/render/__tests__/*.test.ts' && npm run typecheck`
Expected: 7 unit tests plus 12 golden tests (one per profile) passing.

If a golden test fails, the diff message names the profile and the file. Fix the port, never the oracle.

- [ ] **Step 6: Commit**

```bash
git add cli/render/standards.ts cli/render/__tests__/standards.test.ts cli/render/__tests__/golden.test.ts
git commit -m "feat(cli): TypeScript standards renderer, byte-identical to render.mjs"
```

---

## Task 7: Stack detection

`redline init` proposes a profile; the user confirms it. The proposal must be deterministic and explainable — an engineer who disagrees needs to see *why* it guessed, and override it with one flag.

**Files:**
- Create: `cli/detect/stack.ts`
- Create: `cli/detect/scan.ts`
- Test: `cli/detect/__tests__/stack.test.ts`
- Test: `cli/detect/__tests__/scan.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PackageManifest { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }`
  - `interface DetectInput { paths: string[]; packageJson?: PackageManifest }`
  - `interface Proposal { profile: string; confidence: 'high' | 'low'; evidence: string[] }`
  - `function proposeProfile(input: DetectInput): Proposal`
  - `function scanRepo(cwd: string): DetectInput`

**Design:** `proposeProfile` is pure — a list of repo-relative POSIX paths in, a proposal out. No filesystem, so every case is a one-line test. `scanRepo` is the only part that touches disk, and it does nothing but produce `DetectInput`. The signals are checked in a fixed order and the **first** match wins; `tooling` is the floor when nothing matches, because a repo with no recognised stack still gets the core standard.

Every profile name returned must exist in `standards/manifest.json`. A test asserts that.

- [ ] **Step 1: Write the failing test for the pure half**

Create `cli/detect/__tests__/stack.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../../render/manifest.ts';
import { proposeProfile } from '../stack.ts';

const manifest = loadManifest(fileURLToPath(new URL('../../../', import.meta.url)));

test('an empty repo falls back to tooling with low confidence', () => {
  const p = proposeProfile({ paths: [] });
  assert.equal(p.profile, 'tooling');
  assert.equal(p.confidence, 'low');
});

test('go.mod means a go service', () => {
  const p = proposeProfile({ paths: ['go.mod', 'cmd/api/main.go'] });
  assert.equal(p.profile, 'service-go');
  assert.equal(p.confidence, 'high');
  assert.ok(p.evidence.includes('go.mod'));
});

test('react-native in dependencies beats plain react', () => {
  const p = proposeProfile({
    paths: ['package.json', 'src/App.tsx'],
    packageJson: { dependencies: { react: '19.0.0', 'react-native': '0.76.0' } },
  });
  assert.equal(p.profile, 'mobile-rn');
});

test('nest plus react in one repo is fullstack-node', () => {
  const p = proposeProfile({
    paths: ['package.json', 'apps/web/src/App.tsx', 'apps/api/src/main.ts', 'apps/api/nest-cli.json'],
    packageJson: { dependencies: { react: '19.0.0', '@nestjs/core': '11.0.0' } },
  });
  assert.equal(p.profile, 'fullstack-node');
});

test('nest without react is a node service', () => {
  const p = proposeProfile({
    paths: ['package.json', 'nest-cli.json', 'src/main.ts'],
    packageJson: { dependencies: { '@nestjs/core': '11.0.0' } },
  });
  assert.equal(p.profile, 'service-node');
});

test('tsx without a framework dependency is web', () => {
  const p = proposeProfile({
    paths: ['package.json', 'src/App.tsx'],
    packageJson: { dependencies: { react: '19.0.0' } },
  });
  assert.equal(p.profile, 'web');
});

test('maven and java sources mean a java service', () => {
  const p = proposeProfile({ paths: ['pom.xml', 'src/main/java/com/acme/App.java'] });
  assert.equal(p.profile, 'service-java');
});

test('an android manifest with kotlin means mobile-android', () => {
  const p = proposeProfile({
    paths: ['build.gradle.kts', 'app/src/main/AndroidManifest.xml', 'app/src/main/java/A.kt'],
  });
  assert.equal(p.profile, 'mobile-android');
});

test('Package.swift means mobile-ios', () => {
  const p = proposeProfile({ paths: ['Package.swift', 'Sources/App/App.swift'] });
  assert.equal(p.profile, 'mobile-ios');
});

test('terraform alone means infra', () => {
  const p = proposeProfile({ paths: ['main.tf', 'variables.tf'] });
  assert.equal(p.profile, 'infra');
});

test('a csproj means a dotnet service', () => {
  const p = proposeProfile({ paths: ['Acme.Api/Acme.Api.csproj', 'Acme.Api/Program.cs'] });
  assert.equal(p.profile, 'service-dotnet');
});

test('pyproject means a python service', () => {
  const p = proposeProfile({ paths: ['pyproject.toml', 'src/app/main.py'] });
  assert.equal(p.profile, 'service-python');
});

test('every proposable profile exists in the manifest', () => {
  const inputs: DetectInputList = [
    { paths: [] },
    { paths: ['go.mod'] },
    { paths: ['pom.xml', 'A.java'] },
    { paths: ['pyproject.toml'] },
    { paths: ['a.csproj'] },
    { paths: ['Package.swift'] },
    { paths: ['build.gradle.kts', 'AndroidManifest.xml', 'A.kt'] },
    { paths: ['main.tf'] },
    { paths: ['package.json', 'a.tsx'], packageJson: { dependencies: { react: '1' } } },
    { paths: ['package.json'], packageJson: { dependencies: { 'react-native': '1' } } },
    { paths: ['package.json'], packageJson: { dependencies: { '@nestjs/core': '1' } } },
    {
      paths: ['package.json', 'a.tsx'],
      packageJson: { dependencies: { react: '1', '@nestjs/core': '1' } },
    },
  ];
  for (const input of inputs) {
    const { profile } = proposeProfile(input);
    assert.ok(manifest.profiles[profile], `proposed unknown profile "${profile}"`);
  }
});

type DetectInputList = Parameters<typeof proposeProfile>[0][];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/detect/__tests__/stack.test.ts`
Expected: FAIL — `Cannot find module '../stack.ts'`.

- [ ] **Step 3: Write `cli/detect/stack.ts`**

```ts
export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface DetectInput {
  paths: string[];
  packageJson?: PackageManifest;
}

export interface Proposal {
  profile: string;
  confidence: 'high' | 'low';
  evidence: string[];
}

interface Signals {
  has: (name: string) => boolean;
  ext: (suffix: string) => boolean;
  dep: (name: string) => boolean;
}

interface Rule {
  profile: string;
  when: (s: Signals) => string[] | null;
}

const RULES: Rule[] = [
  {
    profile: 'mobile-rn',
    when: (s) =>
      s.dep('react-native') || s.has('metro.config.js') || s.has('metro.config.cjs')
        ? ['react-native dependency or metro config']
        : null,
  },
  {
    profile: 'fullstack-node',
    when: (s) =>
      (s.dep('@nestjs/core') || s.has('nest-cli.json')) && (s.dep('react') || s.ext('.tsx'))
        ? ['nest and react in one repository']
        : null,
  },
  {
    profile: 'service-node',
    when: (s) => (s.dep('@nestjs/core') || s.has('nest-cli.json') ? ['nest-cli.json'] : null),
  },
  {
    profile: 'mobile-android',
    when: (s) =>
      s.has('AndroidManifest.xml') && (s.ext('.kt') || s.has('build.gradle.kts'))
        ? ['AndroidManifest.xml with kotlin sources']
        : null,
  },
  {
    profile: 'mobile-ios',
    when: (s) =>
      s.has('Package.swift') || s.ext('.xcodeproj') || s.ext('.swift')
        ? ['swift package or sources']
        : null,
  },
  {
    profile: 'service-java',
    when: (s) =>
      s.has('pom.xml') || s.has('build.gradle') ? ['maven or gradle build file'] : null,
  },
  { profile: 'service-go', when: (s) => (s.has('go.mod') ? ['go.mod'] : null) },
  {
    profile: 'service-python',
    when: (s) =>
      s.has('pyproject.toml') || s.has('requirements.txt') || s.has('setup.py')
        ? ['python project file']
        : null,
  },
  {
    profile: 'service-dotnet',
    when: (s) => (s.ext('.csproj') || s.ext('.sln') ? ['dotnet project file'] : null),
  },
  {
    profile: 'web',
    when: (s) => (s.dep('react') || s.ext('.tsx') || s.ext('.jsx') ? ['react sources'] : null),
  },
  { profile: 'infra', when: (s) => (s.ext('.tf') ? ['terraform sources'] : null) },
];

export function proposeProfile(input: DetectInput): Proposal {
  const names = new Set(input.paths.map((p) => p.split('/').at(-1) ?? p));
  const deps = {
    ...(input.packageJson?.dependencies ?? {}),
    ...(input.packageJson?.devDependencies ?? {}),
  };
  const signals: Signals = {
    has: (name) => names.has(name),
    ext: (suffix) => input.paths.some((p) => p.endsWith(suffix)),
    dep: (name) => name in deps,
  };

  for (const rule of RULES) {
    const evidence = rule.when(signals);
    if (evidence) return { profile: rule.profile, confidence: 'high', evidence };
  }
  return { profile: 'tooling', confidence: 'low', evidence: ['no recognised stack signal'] };
}
```

Rule order is the whole design. `mobile-rn` is checked before `web` because a React Native repository also contains `.tsx`; `fullstack-node` before `service-node` because a monorepo matches both. Reordering this array changes what every repository in the estate gets, so it is covered by the tests above.

- [ ] **Step 4: Write the failing test for the filesystem half**

Create `cli/detect/__tests__/scan.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRepo } from '../scan.ts';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'node_modules/react'), { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '19.0.0' } }));
  writeFileSync(join(dir, 'src/App.tsx'), 'export {}');
  writeFileSync(join(dir, 'node_modules/react/index.js'), '');
  writeFileSync(join(dir, '.git/config'), '');
  return dir;
}

test('returns repo-relative posix paths', () => {
  const { paths } = scanRepo(fixture());
  assert.ok(paths.includes('src/App.tsx'));
  assert.ok(paths.includes('package.json'));
});

test('skips node_modules and .git', () => {
  const { paths } = scanRepo(fixture());
  assert.ok(!paths.some((p) => p.startsWith('node_modules/')));
  assert.ok(!paths.some((p) => p.startsWith('.git/')));
});

test('reads package.json when present', () => {
  const { packageJson } = scanRepo(fixture());
  assert.equal(packageJson?.dependencies?.['react'], '19.0.0');
});

test('a malformed package.json is ignored rather than fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-scan-bad-'));
  writeFileSync(join(dir, 'package.json'), '{ not json');
  assert.equal(scanRepo(dir).packageJson, undefined);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `node --test cli/detect/__tests__/scan.test.ts`
Expected: FAIL — `Cannot find module '../scan.ts'`.

- [ ] **Step 6: Write `cli/detect/scan.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectInput, PackageManifest } from './stack.ts';

const SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'vendor',
  'target',
  '.next',
  '.venv',
  '__pycache__',
]);

const MAX_FILES = 5000;
const MAX_DEPTH = 6;

export function scanRepo(cwd: string): DetectInput {
  const paths: string[] = [];

  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > MAX_DEPTH || paths.length >= MAX_FILES) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (paths.length >= MAX_FILES) return;
      if (SKIP.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel, depth + 1);
      else paths.push(rel);
    }
  };

  walk(cwd, '', 0);

  let packageJson: PackageManifest | undefined;
  try {
    packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as PackageManifest;
  } catch {
    packageJson = undefined;
  }

  return packageJson === undefined ? { paths } : { paths, packageJson };
}
```

`package.json` is repository content, not internal data, so a malformed one is a boundary failure that must degrade rather than crash `init` (`core/missing-boundary-error-handling`). The caps exist because a monorepo can hold hundreds of thousands of files and detection only ever needs the shallow signals.

The `packageJson === undefined ? ... : ...` return is required by `exactOptionalPropertyTypes` — assigning an explicit `undefined` to an optional property is a type error under that flag.

- [ ] **Step 7: Run all detection tests**

Run: `node --test 'cli/detect/__tests__/*.test.ts' && npm run typecheck`
Expected: 17 passing tests, no type errors.

- [ ] **Step 8: Commit**

```bash
git add cli/detect/
git commit -m "feat(cli): deterministic stack detection with explainable evidence"
```

---

## Task 8: `.redline.json`

The repository's own record of what Redline did to it. Spec §4.3 makes this the single source of truth — the central registry is a nightly-derived cache of these files, so this file's shape is a contract, not a convenience.

**Files:**
- Create: `cli/config/redline-json.ts`
- Test: `cli/config/__tests__/redline-json.test.ts`

**Interfaces:**
- Consumes: `RedlineError`, `Host` and `AdminCapability` from `cli/platforms/types.ts` (Task 9 defines them; if you are executing tasks in order, define this task's imports against the exact type names listed below — Task 9 declares them verbatim).
- Produces:
  - `const CONFIG_FILE = '.redline.json'`
  - `interface MenuSelections { blockingGate: boolean; adrForLargeDiffs: boolean; accessibility: boolean; speckit: boolean; sensitivePathReviewers: boolean }`
  - `interface RedlineConfig { standardsVersion: string; cliVersion: string; host: Host; profile: string; vendors: string[]; menu: MenuSelections; pendingAdmin: AdminCapability[]; onboardedAt: string }`
  - `function parseConfig(raw: unknown): RedlineConfig`
  - `function readConfig(cwd: string): RedlineConfig | null`
  - `function writeConfig(cwd: string, config: RedlineConfig): void`

**Two decisions worth knowing:**

1. **The spec writes `pending_admin`; this file uses `pendingAdmin`.** Every other key in the file is camelCase, and one snake_case key would be a permanent papercut in a file humans read. The spec text is the older artifact; this plan is the newer one. Nothing outside `redline-json.ts` names either form.
2. **`onboardedAt` is an ISO-8601 UTC string, produced from an injected clock.** `core/naive-clock` forbids assuming local time in new code, and a fixed clock is what makes the write test assert on exact bytes.

`.redline.json` is committed to a product repository and can be hand-edited, so it is a **real boundary** and `parseConfig` validates every field (`core/unvalidated-boundary-input`).

- [ ] **Step 1: Write the failing test**

Create `cli/config/__tests__/redline-json.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_FILE, parseConfig, readConfig, writeConfig, type RedlineConfig } from '../redline-json.ts';

const valid: RedlineConfig = {
  standardsVersion: '0.0.1',
  cliVersion: '3.0.0',
  host: 'github',
  profile: 'web',
  vendors: ['copilot', 'agents', 'claude'],
  menu: {
    blockingGate: false,
    adrForLargeDiffs: true,
    accessibility: true,
    speckit: false,
    sensitivePathReviewers: true,
  },
  pendingAdmin: ['secret-scanning'],
  onboardedAt: '2026-09-01T00:00:00.000Z',
};

test('parses a valid config', () => {
  assert.deepEqual(parseConfig(structuredClone(valid)), valid);
});

test('rejects an unknown host', () => {
  assert.throws(() => parseConfig({ ...valid, host: 'gitlab' }), /host/);
});

test('rejects a missing menu', () => {
  const { menu: _menu, ...rest } = valid;
  assert.throws(() => parseConfig(rest), /menu/);
});

test('rejects an unknown pendingAdmin entry', () => {
  assert.throws(() => parseConfig({ ...valid, pendingAdmin: ['make-tea'] }), /pendingAdmin/);
});

test('rejects a non-object', () => {
  assert.throws(() => parseConfig('nope'), /object/);
});

test('round-trips through disk with stable formatting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-cfg-'));
  writeConfig(dir, valid);
  const onDisk = readFileSync(join(dir, CONFIG_FILE), 'utf8');
  assert.ok(onDisk.endsWith('\n'), 'file must end with a newline');
  assert.equal(onDisk, `${JSON.stringify(valid, null, 2)}\n`);
  assert.deepEqual(readConfig(dir), valid);
});

test('readConfig returns null when the repo is not onboarded', () => {
  assert.equal(readConfig(mkdtempSync(join(tmpdir(), 'redline-cfg-none-'))), null);
});

test('a corrupt config is a failure, not a silent null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-cfg-bad-'));
  writeFileSync(join(dir, CONFIG_FILE), '{ not json');
  assert.throws(() => readConfig(dir), /\.redline\.json/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/config/__tests__/redline-json.test.ts`
Expected: FAIL — `Cannot find module '../redline-json.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/config/redline-json.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RedlineError } from '../core/errors.ts';
import { ADMIN_CAPABILITIES, HOSTS, type AdminCapability, type Host } from '../platforms/types.ts';

export const CONFIG_FILE = '.redline.json';

export interface MenuSelections {
  blockingGate: boolean;
  adrForLargeDiffs: boolean;
  accessibility: boolean;
  speckit: boolean;
  sensitivePathReviewers: boolean;
}

export interface RedlineConfig {
  standardsVersion: string;
  cliVersion: string;
  host: Host;
  profile: string;
  vendors: string[];
  menu: MenuSelections;
  pendingAdmin: AdminCapability[];
  onboardedAt: string;
}

const MENU_KEYS: (keyof MenuSelections)[] = [
  'blockingGate',
  'adrForLargeDiffs',
  'accessibility',
  'speckit',
  'sensitivePathReviewers',
];

const bad = (what: string): never => {
  throw new RedlineError('failed', `${CONFIG_FILE} is invalid: ${what}`);
};

export function parseConfig(raw: unknown): RedlineConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) bad('expected an object');
  const o = raw as Record<string, unknown>;

  const str = (key: string): string =>
    typeof o[key] === 'string' && o[key] !== '' ? (o[key] as string) : bad(`${key} must be a non-empty string`);

  const host = str('host');
  if (!(HOSTS as readonly string[]).includes(host)) bad(`host must be one of ${HOSTS.join(', ')}`);

  const vendors = o['vendors'];
  if (!Array.isArray(vendors) || !vendors.every((v) => typeof v === 'string')) {
    bad('vendors must be an array of strings');
  }

  const menuRaw = o['menu'];
  if (typeof menuRaw !== 'object' || menuRaw === null) bad('menu must be an object');
  const menuObj = menuRaw as Record<string, unknown>;
  const menu = {} as MenuSelections;
  for (const key of MENU_KEYS) {
    if (typeof menuObj[key] !== 'boolean') bad(`menu.${key} must be a boolean`);
    menu[key] = menuObj[key] as boolean;
  }

  const pending = o['pendingAdmin'];
  if (!Array.isArray(pending)) bad('pendingAdmin must be an array');
  for (const entry of pending as unknown[]) {
    if (typeof entry !== 'string' || !(ADMIN_CAPABILITIES as readonly string[]).includes(entry)) {
      bad(`pendingAdmin contains an unknown capability "${String(entry)}"`);
    }
  }

  return {
    standardsVersion: str('standardsVersion'),
    cliVersion: str('cliVersion'),
    host: host as Host,
    profile: str('profile'),
    vendors: vendors as string[],
    menu,
    pendingAdmin: pending as AdminCapability[],
    onboardedAt: str('onboardedAt'),
  };
}

export function readConfig(cwd: string): RedlineConfig | null {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new RedlineError('failed', `${CONFIG_FILE} is not valid JSON`, 'delete it and re-run redline init');
  }
  return parseConfig(raw);
}

export function writeConfig(cwd: string, config: RedlineConfig): void {
  writeFileSync(join(cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
}
```

`bad()` returns `never`, which is what lets it be used as the right-hand side of a ternary inside `str()` without TypeScript complaining about a missing return.

- [ ] **Step 4: Run test to verify it passes**

This test imports from `cli/platforms/types.ts`, which Task 9 creates. If you are executing strictly in order, run Task 9 first and then return here — or run them as one commit. The dependency is one-way and deliberate: the config file records what the platform layer defines.

Run: `node --test cli/config/__tests__/redline-json.test.ts && npm run typecheck`
Expected: 8 passing tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add cli/config/
git commit -m "feat(cli): validated .redline.json read and write"
```

---

## Task 9: The platform adapter interface

Spec §5 calls this "the single most important boundary in the system". Nothing outside `cli/platforms/` may know which host it is talking to. This task defines the contract; Tasks 11–15 implement it twice.

**Files:**
- Create: `cli/platforms/types.ts`
- Test: `cli/platforms/__tests__/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces every type named below. These names are used verbatim by Tasks 10–17; do not rename them.

**Three refinements of spec §5, made here and worth understanding before you write the file:**

1. **The interface is split in three.** The spec lists one `Platform` with install, verify and measure methods. Phase 1 does not implement measurement, and an interface whose methods throw `NotImplemented` is a landmine for whoever calls them. So: `PlatformInstall`, `PlatformVerify` and `PlatformMeasure` are three interfaces; `Platform` extends the first two only. `PlatformMeasure` is declared here, unimplemented, so Phase 3 inherits a settled contract rather than inventing one.

2. **`CapabilityOutcome` distinguishes `denied` from `unsupported`.** The spec's R6 notes that Azure Advanced Security is separately licensed, but the design has no way to say so. A capability the operator lacked rights for is `denied` and belongs in `pendingAdmin` — an admin can fix it. A capability the host or licence simply does not have is `unsupported` and must **not** go in `pendingAdmin`, because no admin can clear it and a dashboard that nags forever gets ignored. Without this split, every Azure repository shows as permanently partially onboarded.

3. **`ThreadOutcome` is Phase 3's type but is defined now**, because it is the one place the two hosts' models genuinely differ and the spec's §5 table is the reasoning we do not want to re-derive later.

- [ ] **Step 1: Write the failing test**

The interface has no runtime behaviour, so the test asserts on the two runtime constants and on assignability — a type error here is a test failure, caught by `npm run typecheck`.

Create `cli/platforms/__tests__/types.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_CAPABILITIES,
  HOSTS,
  isPending,
  type CapabilityOutcome,
} from '../types.ts';

test('the host list is exactly the two supported hosts', () => {
  assert.deepEqual([...HOSTS], ['github', 'azure']);
});

test('admin capabilities are unique and non-empty', () => {
  assert.ok(ADMIN_CAPABILITIES.length > 0);
  assert.equal(new Set(ADMIN_CAPABILITIES).size, ADMIN_CAPABILITIES.length);
});

test('only a denied outcome is pending admin action', () => {
  const cases: [CapabilityOutcome['status'], boolean][] = [
    ['applied', false],
    ['already', false],
    ['denied', true],
    ['unsupported', false],
  ];
  for (const [status, expected] of cases) {
    const outcome: CapabilityOutcome = { capability: 'secret-scanning', status, detail: '' };
    assert.equal(isPending(outcome), expected, `${status} should be ${expected}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cli/platforms/__tests__/types.test.ts`
Expected: FAIL — `Cannot find module '../types.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/platforms/types.ts`:

```ts
export const HOSTS = ['github', 'azure'] as const;
export type Host = (typeof HOSTS)[number];

export const ADMIN_CAPABILITIES = [
  'secret-scanning',
  'push-protection',
  'dependency-alerts',
  'merge-policy',
  'repo-property',
  'labels',
  'review-ownership',
] as const;
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export interface RepoRef {
  host: Host;
  org: string;
  project?: string;
  repo: string;
  repoId?: string;
  defaultBranch: string;
}

export interface CapabilityOutcome {
  capability: AdminCapability;
  status: 'applied' | 'already' | 'denied' | 'unsupported';
  detail: string;
}

export function isPending(outcome: CapabilityOutcome): boolean {
  return outcome.status === 'denied';
}

export interface GateOptions {
  adrDiffThreshold: number;
  failOnDependencySeverity: 'low' | 'moderate' | 'high' | 'critical';
  softFailLabels: string[];
}

export interface MergePolicy {
  requiredApprovals: number;
  dismissStaleReviews: boolean;
  requireCodeOwnerReview: boolean;
  requireThreadResolution: boolean;
  requiredChecks: string[];
  blocking: boolean;
}

export interface OwnershipRule {
  pattern: string;
  owners: string[];
}

export interface Change {
  branch: string;
  title: string;
  body: string;
  labels: string[];
}

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface InstallResult {
  files: string[];
  outcomes: CapabilityOutcome[];
}

export interface PolicyResult {
  outcomes: CapabilityOutcome[];
  policy: MergePolicy | null;
}

export interface SecurityResult {
  outcomes: CapabilityOutcome[];
}

export interface PlatformInstall {
  installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult>;
  applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult>;
  enableSecurityFloor(ref: RepoRef): Promise<SecurityResult>;
  ensureReviewOwnership(ref: RepoRef, cwd: string, rules: OwnershipRule[]): Promise<InstallResult>;
  openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef>;
}

export interface PlatformVerify {
  readPolicy(ref: RepoRef): Promise<MergePolicy | null>;
  readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]>;
  readSecurityState(ref: RepoRef): Promise<SecurityResult>;
  latestPullRequestNumber(ref: RepoRef): Promise<number | null>;
}

export type ThreadOutcome = 'acted_on' | 'dismissed' | 'ignored' | 'open';

export interface ReviewThread {
  id: string;
  outcome: ThreadOutcome;
  author: string;
  body: string;
}

export interface PullRequestSummary {
  number: number;
  repo: string;
  mergedAt: string;
}

export interface TriageItem {
  repo: string;
  number: number;
  title: string;
  reason: 'gate-failing' | 'changes-requested' | 'awaiting-review' | 'idle';
  url: string;
}

export interface PlatformMeasure {
  listMergedPullRequests(org: string, since: string): AsyncIterable<PullRequestSummary>;
  readReviewThreads(ref: RepoRef, pr: number): Promise<ReviewThread[]>;
  listNeedsAttention(org: string): Promise<TriageItem[]>;
}

export interface Platform extends PlatformInstall, PlatformVerify {
  readonly host: Host;
  repoRef(cwd: string): Promise<RepoRef>;
}
```

Two additions to the spec's method list, both because `redline verify` needs them and neither belongs in a command:

- `repoId` on `RepoRef` — Azure DevOps addresses repositories by GUID in every policy and pull-request call, so the id has to travel with the reference. GitHub leaves it `undefined`.
- `latestPullRequestNumber` — verification asserts the required check name was *actually reported* on a real PR, which means it needs one to sample. `scripts/setup-repo.sh` did this with `gh pr list --limit 1`; it becomes an adapter method because the way you find a recent PR differs per host.
- `installGate`, `ensureReviewOwnership` and `openPullRequest` take `cwd`, because the artifacts they write land in the working tree and the file *paths* are host-specific (`.github/workflows/redline.yml` versus `.azuredevops/redline-gate.yml`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/platforms/__tests__/types.test.ts && npm run typecheck`
Expected: 3 passing tests, no type errors. Task 8's tests should now pass too — run `npm test` to confirm.

- [ ] **Step 5: Commit**

```bash
git add cli/platforms/types.ts cli/platforms/__tests__/types.test.ts
git commit -m "feat(cli): platform adapter contract with denied/unsupported split"
```

---

## Task 10: Local git and host identification

Before any host API exists, `init` and `verify` need to answer two local questions: is this a git repository, and which host does its remote point at. Neither needs a network call.

**Files:**
- Create: `cli/core/git.ts`
- Create: `cli/platforms/detect.ts`
- Test: `cli/core/__tests__/git.test.ts`
- Test: `cli/platforms/__tests__/detect.test.ts`

**Interfaces:**
- Consumes: `RedlineError`, `Host`.
- Produces:
  - `type GitRunner = (args: string[], cwd: string) => string`
  - `const execGit: GitRunner`
  - `interface Git { isRepo(): boolean; remoteUrl(remote?: string): string; defaultBranch(): string; checkoutNewBranch(name: string): void; stageAll(): void; hasStagedChanges(): boolean; commit(message: string): void; push(branch: string): void }`
  - `function createGit(cwd: string, run?: GitRunner): Git`
  - `interface RemoteIdentity { host: Host; org: string; project?: string; repo: string }`
  - `function parseRemote(url: string): RemoteIdentity`

**Security note:** every git invocation uses `execFileSync` with an **argv array**. Never `exec` with an interpolated string — a branch or remote name is attacker-influenceable in a fork workflow, and `javascript/shell-injection` is a BLOCKER in this repo's own standard.

- [ ] **Step 1: Write the failing test for git**

Create `cli/core/__tests__/git.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGit, type GitRunner } from '../git.ts';

function recorder(responses: Record<string, string> = {}): { run: GitRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: GitRunner = (args) => {
    calls.push(args);
    const key = args.join(' ');
    if (key in responses) return responses[key]!;
    return '';
  };
  return { run, calls };
}

test('isRepo is true when rev-parse succeeds', () => {
  const { run } = recorder({ 'rev-parse --is-inside-work-tree': 'true' });
  assert.equal(createGit('/repo', run).isRepo(), true);
});

test('isRepo is false when rev-parse throws', () => {
  const run: GitRunner = () => {
    throw new Error('not a git repository');
  };
  assert.equal(createGit('/repo', run).isRepo(), false);
});

test('remoteUrl defaults to origin and is overridable', () => {
  const { run, calls } = recorder({
    'remote get-url origin': 'git@github.com:acme/web.git',
    'remote get-url upstream': 'https://github.com/acme/upstream.git',
  });
  const git = createGit('/repo', run);
  assert.equal(git.remoteUrl(), 'git@github.com:acme/web.git');
  assert.equal(git.remoteUrl('upstream'), 'https://github.com/acme/upstream.git');
  assert.deepEqual(calls[0], ['remote', 'get-url', 'origin']);
});

test('defaultBranch reads the remote HEAD and strips the prefix', () => {
  const { run } = recorder({
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main',
  });
  assert.equal(createGit('/repo', run).defaultBranch(), 'main');
});

test('defaultBranch falls back to main when the remote HEAD is unset', () => {
  const run: GitRunner = (args) => {
    if (args[0] === 'symbolic-ref') throw new Error('ref not a symbolic ref');
    return '';
  };
  assert.equal(createGit('/repo', run).defaultBranch(), 'main');
});

test('hasStagedChanges inverts the exit status of diff --cached --quiet', () => {
  const clean: GitRunner = () => '';
  assert.equal(createGit('/repo', clean).hasStagedChanges(), false);
  const dirty: GitRunner = (args) => {
    if (args.includes('--cached')) throw new Error('exit 1');
    return '';
  };
  assert.equal(createGit('/repo', dirty).hasStagedChanges(), true);
});

test('branch, commit and push pass their arguments as argv, never a shell string', () => {
  const { run, calls } = recorder();
  const git = createGit('/repo', run);
  git.checkoutNewBranch('redline/onboard');
  git.commit('chore(redline): onboard');
  git.push('redline/onboard');
  assert.deepEqual(calls[0], ['checkout', '-B', 'redline/onboard']);
  assert.deepEqual(calls[1]?.slice(0, 2), ['commit', '-m']);
  assert.equal(calls[1]?.[2], 'chore(redline): onboard');
  assert.deepEqual(calls[2], ['push', '--set-upstream', 'origin', 'redline/onboard']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/core/__tests__/git.test.ts`
Expected: FAIL — `Cannot find module '../git.ts'`.

- [ ] **Step 3: Write `cli/core/git.ts`**

```ts
import { execFileSync } from 'node:child_process';

export type GitRunner = (args: string[], cwd: string) => string;

export const execGit: GitRunner = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export interface Git {
  isRepo(): boolean;
  remoteUrl(remote?: string): string;
  defaultBranch(): string;
  checkoutNewBranch(name: string): void;
  stageAll(): void;
  hasStagedChanges(): boolean;
  commit(message: string): void;
  push(branch: string): void;
}

export function createGit(cwd: string, run: GitRunner = execGit): Git {
  const g = (...args: string[]): string => run(args, cwd);
  return {
    isRepo() {
      try {
        return g('rev-parse', '--is-inside-work-tree') === 'true';
      } catch {
        return false;
      }
    },
    remoteUrl(remote = 'origin') {
      return g('remote', 'get-url', remote);
    },
    defaultBranch() {
      try {
        return g('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
      } catch {
        return 'main';
      }
    },
    checkoutNewBranch(name) {
      g('checkout', '-B', name);
    },
    stageAll() {
      g('add', '-A');
    },
    hasStagedChanges() {
      try {
        g('diff', '--cached', '--quiet');
        return false;
      } catch {
        return true;
      }
    },
    commit(message) {
      g('commit', '-m', message);
    },
    push(branch) {
      g('push', '--set-upstream', 'origin', branch);
    },
  };
}
```

`defaultBranch` falling back to `main` rather than throwing is deliberate: a shallow CI checkout often has no `refs/remotes/origin/HEAD`, and failing onboarding over that would be a support ticket per repository.

- [ ] **Step 4: Write the failing test for remote parsing**

Create `cli/platforms/__tests__/detect.test.ts`:

```ts
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
```

**Note on the enterprise case:** GitHub Enterprise Server is served from a customer domain, so host identification cannot be domain matching alone. Azure DevOps is identified first by its three unambiguous domain forms; anything else with an `<org>/<repo>` path shape is treated as GitHub. That is the right default for this estate, and it fails loudly rather than silently for anything that does not parse.

- [ ] **Step 5: Run it to verify it fails**

Run: `node --test cli/platforms/__tests__/detect.test.ts`
Expected: FAIL — `Cannot find module '../detect.ts'`.

- [ ] **Step 6: Write `cli/platforms/detect.ts`**

```ts
import { RedlineError } from '../core/errors.ts';
import type { Host } from './types.ts';

export interface RemoteIdentity {
  host: Host;
  org: string;
  project?: string;
  repo: string;
}

const AZURE_HTTPS = /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
const AZURE_SSH = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const AZURE_LEGACY = /^https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
const GENERIC_HTTPS = /^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const GENERIC_SSH = /^(?:ssh:\/\/)?git@[^:/]+[:/]([^/]+)\/([^/]+?)(?:\.git)?$/;

export function parseRemote(url: string): RemoteIdentity {
  const trimmed = url.trim();
  if (trimmed === '') {
    throw new RedlineError(
      'usage',
      'this repository has no git remote',
      'add one with: git remote add origin <url>'
    );
  }

  for (const pattern of [AZURE_HTTPS, AZURE_SSH, AZURE_LEGACY]) {
    const m = pattern.exec(trimmed);
    if (m) return { host: 'azure', org: m[1]!, project: m[2]!, repo: m[3]! };
  }

  for (const pattern of [GENERIC_SSH, GENERIC_HTTPS]) {
    const m = pattern.exec(trimmed);
    if (m) return { host: 'github', org: m[1]!, repo: m[2]! };
  }

  throw new RedlineError(
    'usage',
    `cannot tell which host "${trimmed}" belongs to`,
    'redline supports github and azure devops remotes'
  );
}
```

Azure patterns are tried first because `https://dev.azure.com/acme/Payments/_git/web` also matches nothing in the generic set (four path segments), but the ordering makes the intent explicit and survives someone loosening the generic patterns later.

- [ ] **Step 7: Run both suites**

Run: `node --test 'cli/core/__tests__/*.test.ts' 'cli/platforms/__tests__/*.test.ts' && npm run typecheck`
Expected: all passing, no type errors.

- [ ] **Step 8: Commit**

```bash
git add cli/core/git.ts cli/core/__tests__/git.test.ts cli/platforms/detect.ts cli/platforms/__tests__/detect.test.ts
git commit -m "feat(cli): local git wrapper and host identification from the remote"
```

---

## Task 11: HTTP plumbing and the GitHub client

One HTTP layer, host-agnostic, with an injected `fetch`. Every adapter test in this plan runs offline because of this task.

**Files:**
- Create: `cli/platforms/http.ts`
- Create: `cli/platforms/github/client.ts`
- Test: `cli/platforms/__tests__/http.test.ts`
- Test: `cli/platforms/github/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `RedlineError`.
- Produces:
  - `type FetchLike = typeof globalThis.fetch`
  - `interface HttpResponse<T> { status: number; body: T | null }`
  - `interface HttpOptions { fetch?: FetchLike; retries?: number; sleep?: (ms: number) => Promise<void> }`
  - `function createHttp(baseUrl: string, headers: Record<string, string>, opts?: HttpOptions): Http`
  - `interface Http { request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> }`
  - `function resolveGitHubToken(env: NodeJS.ProcessEnv, readGhToken?: () => string): string`
  - `interface GitHubClient { rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>; graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> }`
  - `function createGitHubClient(opts?: GitHubClientOptions): GitHubClient`

**The central decision: `request` never throws on a 4xx.** It returns the status. Permission failures are the *normal* path for `redline init` (spec §6.1) and an exception forces every caller into a try/catch that then has to re-derive what happened. Transport failure and an exhausted retry budget do throw, because there is nothing sensible to report.

Retries apply to `429` and `5xx` only. `sleep` is injected so tests take milliseconds.

- [ ] **Step 1: Write the failing HTTP test**

Create `cli/platforms/__tests__/http.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, type FetchLike } from '../http.ts';

const noSleep = async (): Promise<void> => {};

function stub(responses: Response[]): { fetch: FetchLike; seen: Request[] } {
  const seen: Request[] = [];
  let i = 0;
  const fetch: FetchLike = async (input, init) => {
    seen.push(new Request(input as RequestInfo, init));
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return next.clone();
  };
  return { fetch, seen };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('returns the parsed body and status on success', async () => {
  const { fetch } = stub([json(200, { name: 'web' })]);
  const http = createHttp('https://api.example', { authorization: 'token x' }, { fetch, sleep: noSleep });
  const res = await http.request<{ name: string }>('GET', '/repos/acme/web');
  assert.equal(res.status, 200);
  assert.equal(res.body?.name, 'web');
});

test('sends the configured headers and a JSON body', async () => {
  const { fetch, seen } = stub([json(201, {})]);
  const http = createHttp('https://api.example', { authorization: 'token x' }, { fetch, sleep: noSleep });
  await http.request('POST', '/repos/acme/web/labels', { name: 'no-adr' });
  const req = seen[0]!;
  assert.equal(req.method, 'POST');
  assert.equal(req.url, 'https://api.example/repos/acme/web/labels');
  assert.equal(req.headers.get('authorization'), 'token x');
  assert.equal(req.headers.get('content-type'), 'application/json');
  assert.equal(await req.text(), '{"name":"no-adr"}');
});

test('a 403 is returned, not thrown', async () => {
  const { fetch } = stub([json(403, { message: 'Resource not accessible' })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep });
  const res = await http.request('PUT', '/repos/acme/web/rulesets/1');
  assert.equal(res.status, 403);
});

test('a 204 yields a null body', async () => {
  const { fetch } = stub([new Response(null, { status: 204 })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep });
  const res = await http.request('PUT', '/repos/acme/web/vulnerability-alerts');
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
});

test('retries a 429 and succeeds', async () => {
  const { fetch, seen } = stub([json(429, {}), json(200, { ok: true })]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 2 });
  const res = await http.request<{ ok: boolean }>('GET', '/x');
  assert.equal(res.status, 200);
  assert.equal(seen.length, 2);
});

test('an exhausted retry budget on 500 is a host error', async () => {
  const { fetch } = stub([json(500, {})]);
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 2 });
  await assert.rejects(http.request('GET', '/x'), /500/);
});

test('a transport failure is a host error naming the url', async () => {
  const fetch: FetchLike = async () => {
    throw new TypeError('fetch failed');
  };
  const http = createHttp('https://api.example', {}, { fetch, sleep: noSleep, retries: 1 });
  await assert.rejects(http.request('GET', '/x'), /api\.example/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/platforms/__tests__/http.test.ts`
Expected: FAIL — `Cannot find module '../http.ts'`.

- [ ] **Step 3: Write `cli/platforms/http.ts`**

```ts
import { RedlineError } from '../core/errors.ts';

export type FetchLike = typeof globalThis.fetch;

export interface HttpResponse<T> {
  status: number;
  body: T | null;
}

export interface HttpOptions {
  fetch?: FetchLike;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Http {
  request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>;
}

const RETRYABLE = (status: number): boolean => status === 429 || status >= 500;

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createHttp(
  baseUrl: string,
  headers: Record<string, string>,
  opts: HttpOptions = {}
): Http {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;

  return {
    async request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
      const init: RequestInit = { method, headers: { ...headers } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = { ...headers, 'content-type': 'application/json' };
      }

      let lastStatus = 0;
      for (let attempt = 0; attempt < retries; attempt += 1) {
        let response: Response;
        try {
          response = await doFetch(url, init);
        } catch (cause) {
          if (attempt === retries - 1) {
            throw new RedlineError('host', `request to ${url} failed: ${String(cause)}`);
          }
          await sleep(2 ** attempt * 200);
          continue;
        }

        if (RETRYABLE(response.status)) {
          lastStatus = response.status;
          if (attempt === retries - 1) break;
          await sleep(2 ** attempt * 200);
          continue;
        }

        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return { status: response.status, body: null };
        }
        const text = await response.text();
        return { status: response.status, body: text === '' ? null : (JSON.parse(text) as T) };
      }

      throw new RedlineError('host', `request to ${url} kept returning ${lastStatus}`);
    },
  };
}
```

- [ ] **Step 4: Write the failing GitHub client test**

Create `cli/platforms/github/__tests__/client.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, resolveGitHubToken } from '../client.ts';
import type { FetchLike } from '../../http.ts';

test('token precedence is GH_TOKEN, GITHUB_TOKEN, then gh auth token', () => {
  assert.equal(resolveGitHubToken({ GH_TOKEN: 'a', GITHUB_TOKEN: 'b' }, () => 'c'), 'a');
  assert.equal(resolveGitHubToken({ GITHUB_TOKEN: 'b' }, () => 'c'), 'b');
  assert.equal(resolveGitHubToken({}, () => 'c'), 'c');
});

test('no token anywhere is a permission error with an actionable hint', () => {
  assert.throws(
    () =>
      resolveGitHubToken({}, () => {
        throw new Error('gh not installed');
      }),
    /gh auth login/
  );
});

test('rest calls carry the api version and bearer token', async () => {
  const seen: Request[] = [];
  const fetch: FetchLike = async (input, init) => {
    seen.push(new Request(input as RequestInfo, init));
    return new Response(JSON.stringify({ default_branch: 'main' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createGitHubClient({ token: 'tok', fetch, sleep: async () => {} });
  const res = await client.rest<{ default_branch: string }>('GET', '/repos/acme/web');
  assert.equal(res.body?.default_branch, 'main');
  const req = seen[0]!;
  assert.equal(req.url, 'https://api.github.com/repos/acme/web');
  assert.equal(req.headers.get('authorization'), 'Bearer tok');
  assert.equal(req.headers.get('x-github-api-version'), '2022-11-28');
  assert.equal(req.headers.get('accept'), 'application/vnd.github+json');
});

test('graphql unwraps data and turns errors into a host failure', async () => {
  const ok: FetchLike = async () =>
    new Response(JSON.stringify({ data: { viewer: { login: 'x' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const client = createGitHubClient({ token: 'tok', fetch: ok, sleep: async () => {} });
  assert.deepEqual(await client.graphql('query{viewer{login}}', {}), { viewer: { login: 'x' } });

  const bad: FetchLike = async () =>
    new Response(JSON.stringify({ errors: [{ message: 'Bad credentials' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const failing = createGitHubClient({ token: 'tok', fetch: bad, sleep: async () => {} });
  await assert.rejects(failing.graphql('query{x}', {}), /Bad credentials/);
});

test('GITHUB_API_URL overrides the base url for enterprise', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createGitHubClient({
    token: 'tok',
    fetch,
    sleep: async () => {},
    env: { GITHUB_API_URL: 'https://github.acme-corp.net/api/v3' },
  });
  await client.rest('GET', '/repos/acme/web');
  assert.equal(seen[0], 'https://github.acme-corp.net/api/v3/repos/acme/web');
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `node --test cli/platforms/github/__tests__/client.test.ts`
Expected: FAIL — `Cannot find module '../client.ts'`.

- [ ] **Step 6: Write `cli/platforms/github/client.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { RedlineError } from '../../core/errors.ts';
import { createHttp, type FetchLike, type HttpResponse } from '../http.ts';

export interface GitHubClientOptions {
  token?: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface GitHubClient {
  rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

const readGhTokenFromCli = (): string =>
  execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function resolveGitHubToken(
  env: NodeJS.ProcessEnv,
  readGhToken: () => string = readGhTokenFromCli
): string {
  const fromEnv = env['GH_TOKEN'] ?? env['GITHUB_TOKEN'];
  if (fromEnv) return fromEnv;
  try {
    const token = readGhToken();
    if (token) return token;
  } catch {
    // fall through to the error below
  }
  throw new RedlineError(
    'permission',
    'no GitHub credentials found',
    'run: gh auth login — or set GH_TOKEN'
  );
}

export function createGitHubClient(opts: GitHubClientOptions = {}): GitHubClient {
  const env = opts.env ?? process.env;
  const token = opts.token ?? resolveGitHubToken(env);
  const baseUrl = env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'redlinegate',
  };
  const httpOptions = {
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  };
  const http = createHttp(baseUrl, headers, httpOptions);
  const graphqlUrl = `${baseUrl.replace(/\/api\/v3$/, '/api')}/graphql`;

  return {
    rest: (method, path, body) => http.request(method, path, body),
    async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const res = await http.request<{ data?: T; errors?: { message: string }[] }>(
        'POST',
        graphqlUrl,
        { query, variables }
      );
      const errors = res.body?.errors;
      if (errors?.length) {
        throw new RedlineError('host', `GitHub GraphQL: ${errors.map((e) => e.message).join('; ')}`);
      }
      if (!res.body?.data) throw new RedlineError('host', 'GitHub GraphQL returned no data');
      return res.body.data;
    },
  };
}
```

The conditional spread on `httpOptions` is required by `exactOptionalPropertyTypes` — passing `fetch: undefined` explicitly is a type error where the property is declared optional.

- [ ] **Step 7: Run both suites**

Run: `node --test 'cli/platforms/__tests__/*.test.ts' 'cli/platforms/github/__tests__/*.test.ts' && npm run typecheck`
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add cli/platforms/http.ts cli/platforms/__tests__/http.test.ts cli/platforms/github/
git commit -m "feat(cli): injectable http layer and github rest/graphql client"
```

---

## Task 12: GitHub install

The port of `scripts/setup-repo.sh`, with the thing it got wrong fixed: every call degrades explicitly instead of some aborting the run mid-onboarding.

**Files:**
- Create: `cli/platforms/github/install.ts`
- Create: `cli/platforms/__tests__/fake-client.ts`
- Test: `cli/platforms/github/__tests__/install.test.ts`

**Interfaces:**
- Consumes: `GitHubClient`, `Git`, everything in `cli/platforms/types.ts`.
- Produces:
  - `function createGitHubInstall(client: GitHubClient, git: (cwd: string) => Git): PlatformInstall`
  - `const RULESET_NAME = 'Redline'`
  - `const REQUIRED_CHECK = 'redline-gate / gate'`

**What `setup-repo.sh` did, and what changes:**

| `setup-repo.sh` | Here |
|---|---|
| `PATCH /repos/{o}/{r}` with `security_and_analysis` — `\|\| WARN` | `enableSecurityFloor` → `denied` outcome |
| `PUT /repos/{o}/{r}/vulnerability-alerts` — `\|\| WARN` | `enableSecurityFloor` → `denied` outcome |
| `PUT /repos/{o}/{r}/automated-security-fixes` — `\|\| WARN` | `enableSecurityFloor` → `denied` outcome |
| `GET /repos/{o}/{r}/rulesets` then `PUT`/`POST` — **unguarded, aborts the script** | `applyPolicy` → `denied` outcome, onboarding continues |
| `gh label create` ×3 — **unguarded, aborts the script** | `installGate` → `denied` outcome, onboarding continues |
| `PATCH /repos/{o}/{r}/properties/values` — `\|\| WARN` | `applyPolicy` → `denied` outcome |

**The advisory/blocking split.** `setup-repo.sh` always installed the ruleset from `rulesets/redline-ruleset.json`, which includes the `required_status_checks` rule — so onboarding was always blocking. Spec §6.1 makes the floor advisory and promotion deliberate. This adapter therefore **builds the ruleset payload from the `MergePolicy`** rather than posting the JSON file verbatim: `blocking: false` omits the `required_status_checks` rule entirely, so the gate still runs and reports but does not block a merge. Promotion to blocking is re-running `applyPolicy` with `blocking: true`. `rulesets/redline-ruleset.json` remains in the repository as the reference document for what the blocking policy looks like.

- [ ] **Step 1: Write the shared fake client**

Create `cli/platforms/__tests__/fake-client.ts`:

```ts
import type { HttpResponse } from '../http.ts';
import type { GitHubClient } from '../github/client.ts';

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeClient extends GitHubClient {
  calls: RecordedCall[];
}

/**
 * Scripted GitHub client. `routes` maps "METHOD /path" to a status and body.
 * An unlisted route answers 200 with an empty object, so a test only declares
 * the calls it actually cares about.
 */
export function fakeGitHubClient(
  routes: Record<string, { status: number; body?: unknown }> = {}
): FakeClient {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async rest<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      calls.push({ method, path, body });
      const route = routes[`${method} ${path}`] ?? { status: 200, body: {} };
      return { status: route.status, body: (route.body ?? null) as T | null };
    },
    async graphql<T>(): Promise<T> {
      throw new Error('graphql not used by these tests');
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `cli/platforms/github/__tests__/install.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { createGitHubInstall, REQUIRED_CHECK, RULESET_NAME } from '../install.ts';
import type { GateOptions, MergePolicy, RepoRef } from '../../types.ts';

const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web', defaultBranch: 'main' };
const gateOpts: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt', 'redline-sync'],
};
const advisory: MergePolicy = {
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [REQUIRED_CHECK],
  blocking: false,
};

const noopGit: GitRunner = () => '';
const gitFor = (cwd: string) => createGit(cwd, noopGit);
const tmp = (): string => mkdtempSync(join(tmpdir(), 'redline-install-'));

test('the security floor makes three calls and reports each applied', async () => {
  const client = fakeGitHubClient();
  const install = createGitHubInstall(client, gitFor);
  const result = await install.enableSecurityFloor(ref);

  assert.deepEqual(
    client.calls.map((c) => `${c.method} ${c.path}`),
    [
      'PATCH /repos/acme/web',
      'PUT /repos/acme/web/vulnerability-alerts',
      'PUT /repos/acme/web/automated-security-fixes',
    ]
  );
  assert.deepEqual(
    result.outcomes.map((o) => [o.capability, o.status]),
    [
      ['secret-scanning', 'applied'],
      ['push-protection', 'applied'],
      ['dependency-alerts', 'applied'],
    ]
  );
});

test('a 403 on the security floor is denied, not thrown, and the later calls still run', async () => {
  const client = fakeGitHubClient({ 'PATCH /repos/acme/web': { status: 403 } });
  const result = await createGitHubInstall(client, gitFor).enableSecurityFloor(ref);
  assert.equal(result.outcomes[0]?.status, 'denied');
  assert.equal(result.outcomes[2]?.status, 'applied');
  assert.equal(client.calls.length, 3);
});

test('a 422 from an unlicensed org is unsupported, so it never becomes pending admin', async () => {
  const client = fakeGitHubClient({ 'PATCH /repos/acme/web': { status: 422 } });
  const result = await createGitHubInstall(client, gitFor).enableSecurityFloor(ref);
  assert.equal(result.outcomes[0]?.status, 'unsupported');
});

test('an advisory policy omits the required status check rule', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);

  const create = client.calls.find((c) => c.method === 'POST' && c.path === '/repos/acme/web/rulesets');
  const rules = (create?.body as { rules: { type: string }[] }).rules;
  assert.ok(!rules.some((r) => r.type === 'required_status_checks'));
  assert.ok(rules.some((r) => r.type === 'pull_request'));
});

test('a blocking policy requires exactly the reported check name', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, { ...advisory, blocking: true });

  const create = client.calls.find((c) => c.method === 'POST')!;
  const rules = (create.body as { name: string; rules: { type: string; parameters?: unknown }[] });
  assert.equal(rules.name, RULESET_NAME);
  const checks = rules.rules.find((r) => r.type === 'required_status_checks');
  assert.deepEqual((checks?.parameters as { required_status_checks: { context: string }[] }).required_status_checks, [
    { context: 'redline-gate / gate' },
  ]);
});

test('an existing Redline ruleset is updated in place, never duplicated', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
  });
  await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.ok(client.calls.some((c) => c.method === 'PUT' && c.path === '/repos/acme/web/rulesets/42'));
  assert.ok(!client.calls.some((c) => c.method === 'POST' && c.path === '/repos/acme/web/rulesets'));
});

test('a denied ruleset write is reported, and the custom property is still attempted', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [] },
    'POST /repos/acme/web/rulesets': { status: 403 },
  });
  const result = await createGitHubInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.equal(result.outcomes.find((o) => o.capability === 'merge-policy')?.status, 'denied');
  assert.ok(client.calls.some((c) => c.path === '/repos/acme/web/properties/values'));
});

test('installGate writes the caller workflow and the PR template into the working tree', async () => {
  const cwd = tmp();
  const client = fakeGitHubClient();
  const result = await createGitHubInstall(client, gitFor).installGate(ref, cwd, gateOpts);

  assert.ok(result.files.includes('.github/workflows/redline.yml'));
  assert.ok(result.files.includes('.github/pull_request_template.md'));
  const yml = readFileSync(join(cwd, '.github/workflows/redline.yml'), 'utf8');
  assert.match(yml, /^ {2}redline-gate:$/m, 'the caller job id must be redline-gate');
  assert.match(yml, /uses: acme\/\.github\/\.github\/workflows\/redline-gate\.yml@main/);
  assert.match(yml, /adr-diff-threshold: 300/);
  assert.ok(!yml.includes('<org>'), 'the org placeholder must be substituted');
});

test('installGate creates the three labels the gate depends on', async () => {
  const client = fakeGitHubClient();
  await createGitHubInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  const created = client.calls
    .filter((c) => c.path === '/repos/acme/web/labels')
    .map((c) => (c.body as { name: string }).name);
  assert.deepEqual(created, ['no-adr', 'redline-exempt', 'redline-sync']);
});

test('a label that already exists is not an error', async () => {
  const client = fakeGitHubClient({ 'POST /repos/acme/web/labels': { status: 422 } });
  const result = await createGitHubInstall(client, gitFor).installGate(ref, tmp(), gateOpts);
  assert.equal(result.outcomes.find((o) => o.capability === 'labels')?.status, 'already');
});

test('ensureReviewOwnership seeds CODEOWNERS once and never overwrites an existing one', async () => {
  const cwd = tmp();
  const install = createGitHubInstall(fakeGitHubClient(), gitFor);
  const rules = [{ pattern: '/.github/workflows/', owners: ['@acme/platform-engineering'] }];

  const first = await install.ensureReviewOwnership(ref, cwd, rules);
  assert.deepEqual(first.files, ['.github/CODEOWNERS']);
  assert.match(readFileSync(join(cwd, '.github/CODEOWNERS'), 'utf8'), /@acme\/platform-engineering/);

  const second = await install.ensureReviewOwnership(ref, cwd, rules);
  assert.deepEqual(second.files, []);
});

test('openPullRequest commits, pushes and opens a PR against the default branch', async () => {
  const client = fakeGitHubClient({
    'POST /repos/acme/web/pulls': { status: 201, body: { number: 7, html_url: 'https://x/7' } },
  });
  const gitCalls: string[][] = [];
  const recording = (cwd: string) =>
    createGit(cwd, (args) => {
      gitCalls.push(args);
      if (args[0] === 'diff') throw new Error('staged changes exist');
      return '';
    });

  const pr = await createGitHubInstall(client, recording).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: ['redline-sync'],
  });

  assert.deepEqual(pr, { number: 7, url: 'https://x/7' });
  assert.deepEqual(gitCalls[0], ['checkout', '-B', 'redline/onboard']);
  assert.deepEqual(gitCalls[1], ['add', '-A']);
  const create = client.calls.find((c) => c.path === '/repos/acme/web/pulls')!;
  assert.deepEqual(create.body, {
    title: 'chore(redline): onboard',
    body: 'body',
    head: 'redline/onboard',
    base: 'main',
  });
  assert.ok(client.calls.some((c) => c.path === '/repos/acme/web/issues/7/labels'));
});

test('nothing to commit means no push and no pull request', async () => {
  const client = fakeGitHubClient();
  const clean = (cwd: string) => createGit(cwd, () => '');
  await assert.rejects(
    createGitHubInstall(client, clean).openPullRequest(ref, tmp(), {
      branch: 'redline/onboard',
      title: 't',
      body: 'b',
      labels: [],
    }),
    /nothing to commit/
  );
  assert.equal(client.calls.length, 0);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test cli/platforms/github/__tests__/install.test.ts`
Expected: FAIL — `Cannot find module '../install.ts'`.

- [ ] **Step 4: Write `cli/platforms/github/install.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RedlineError } from '../../core/errors.ts';
import type { Git } from '../../core/git.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  PlatformInstall,
  PolicyResult,
  PullRequestRef,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { GitHubClient } from './client.ts';

export const RULESET_NAME = 'Redline';
export const REQUIRED_CHECK = 'redline-gate / gate';

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const GATE_LABELS = [
  { name: 'no-adr', color: 'ededed', description: 'PR intentionally ships without an ADR' },
  {
    name: 'redline-exempt',
    color: 'fbca04',
    description: 'Gate process checks soft-failed with reviewer sign-off',
  },
  {
    name: 'redline-sync',
    color: '0e8a16',
    description: 'Automated standards sync from the Redline source repo',
  },
];

function outcome(
  capability: AdminCapability,
  status: number,
  detail: string
): CapabilityOutcome {
  if (status >= 200 && status < 300) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs repository admin)` };
  }
  if (status === 404 || status === 422) {
    return { capability, status: 'unsupported', detail: `${detail} (not available on this repository)` };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

function writeFile(cwd: string, relPath: string, contents: string): void {
  const target = join(cwd, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function buildRules(policy: MergePolicy): unknown[] {
  const rules: unknown[] = [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: policy.requiredApprovals,
        dismiss_stale_reviews_on_push: policy.dismissStaleReviews,
        require_code_owner_review: policy.requireCodeOwnerReview,
        require_last_push_approval: true,
        required_review_thread_resolution: policy.requireThreadResolution,
        automatic_copilot_code_review_enabled: true,
        allowed_merge_methods: ['squash', 'merge'],
      },
    },
  ];
  if (policy.blocking) {
    rules.push({
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        do_not_enforce_on_create: false,
        required_status_checks: policy.requiredChecks.map((context) => ({ context })),
      },
    });
  }
  return rules;
}

export function createGitHubInstall(
  client: GitHubClient,
  gitFor: (cwd: string) => Git
): PlatformInstall {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  return {
    async enableSecurityFloor(ref: RepoRef): Promise<SecurityResult> {
      const scanning = await client.rest('PATCH', repoPath(ref), {
        security_and_analysis: {
          secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'enabled' },
        },
      });
      const alerts = await client.rest('PUT', `${repoPath(ref)}/vulnerability-alerts`);
      const fixes = await client.rest('PUT', `${repoPath(ref)}/automated-security-fixes`);

      return {
        outcomes: [
          outcome('secret-scanning', scanning.status, 'secret scanning'),
          outcome('push-protection', scanning.status, 'secret scanning push protection'),
          outcome('dependency-alerts', Math.max(alerts.status, fixes.status), 'dependabot alerts'),
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const existing = await client.rest<{ id: number; name: string }[]>(
        'GET',
        `${repoPath(ref)}/rulesets`
      );
      const mine = (existing.body ?? []).find((r) => r.name === RULESET_NAME);
      const payload = {
        name: RULESET_NAME,
        target: 'branch',
        enforcement: 'active',
        bypass_actors: [],
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: buildRules(policy),
      };

      const applied = mine
        ? await client.rest('PUT', `${repoPath(ref)}/rulesets/${mine.id}`, payload)
        : await client.rest('POST', `${repoPath(ref)}/rulesets`, payload);

      const property = await client.rest('PATCH', `${repoPath(ref)}/properties/values`, {
        properties: [{ property_name: 'redline', value: 'onboarded' }],
      });

      return {
        outcomes: [
          outcome('merge-policy', applied.status, 'branch ruleset'),
          outcome('repo-property', property.status, 'repository property "redline=onboarded"'),
        ],
        policy: applied.status < 300 ? policy : null,
      };
    },

    async installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult> {
      const caller = readFileSync(join(PACKAGE_ROOT, 'templates/redline.yml'), 'utf8')
        .replaceAll('<org>', ref.org)
        .replace(/adr-diff-threshold: \d+/, `adr-diff-threshold: ${opts.adrDiffThreshold}`)
        .replace(
          /fail-on-dependency-severity: \w+/,
          `fail-on-dependency-severity: ${opts.failOnDependencySeverity}`
        );
      writeFile(cwd, '.github/workflows/redline.yml', caller);

      const template = readFileSync(
        join(PACKAGE_ROOT, '.github/pull_request_template.md'),
        'utf8'
      );
      writeFile(cwd, '.github/pull_request_template.md', template);

      let worst = 200;
      for (const label of GATE_LABELS) {
        const res = await client.rest('POST', `${repoPath(ref)}/labels`, label);
        if (res.status !== 201 && res.status !== 200) worst = Math.max(worst, res.status);
      }
      const labels: CapabilityOutcome =
        worst === 422
          ? { capability: 'labels', status: 'already', detail: 'gate labels already exist' }
          : outcome('labels', worst, 'gate labels');

      return {
        files: ['.github/workflows/redline.yml', '.github/pull_request_template.md'],
        outcomes: [labels],
      };
    },

    async ensureReviewOwnership(
      ref: RepoRef,
      cwd: string,
      rules: OwnershipRule[]
    ): Promise<InstallResult> {
      const candidates = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
      if (candidates.some((p) => existsSync(join(cwd, p)))) {
        return {
          files: [],
          outcomes: [
            {
              capability: 'review-ownership',
              status: 'already',
              detail: 'this repository already has a CODEOWNERS file — left untouched',
            },
          ],
        };
      }
      const body = rules.map((r) => `${r.pattern} ${r.owners.join(' ')}`).join('\n');
      writeFile(cwd, '.github/CODEOWNERS', `# Managed by Redline.\n\n${body}\n`);
      return {
        files: ['.github/CODEOWNERS'],
        outcomes: [
          { capability: 'review-ownership', status: 'applied', detail: 'seeded .github/CODEOWNERS' },
        ],
      };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef> {
      const git = gitFor(cwd);
      git.checkoutNewBranch(change.branch);
      git.stageAll();
      if (!git.hasStagedChanges()) {
        throw new RedlineError('failed', 'nothing to commit — this repository is already onboarded');
      }
      git.commit(change.title);
      git.push(change.branch);

      const created = await client.rest<{ number: number; html_url: string }>(
        'POST',
        `${repoPath(ref)}/pulls`,
        { title: change.title, body: change.body, head: change.branch, base: ref.defaultBranch }
      );
      if (!created.body) {
        throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      }
      if (change.labels.length > 0) {
        await client.rest('POST', `${repoPath(ref)}/issues/${created.body.number}/labels`, {
          labels: change.labels,
        });
      }
      return { number: created.body.number, url: created.body.html_url };
    },
  };
}
```

Note `enableSecurityFloor` reports `secret-scanning` and `push-protection` from the same call's status, because GitHub sets both in one `PATCH`. They are separate capabilities because Azure enables them separately.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test cli/platforms/github/__tests__/install.test.ts && npm run typecheck`
Expected: 13 passing tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/platforms/github/install.ts cli/platforms/github/__tests__/install.test.ts cli/platforms/__tests__/fake-client.ts
git commit -m "feat(cli): github install adapter with explicit permission degradation"
```

---

## Task 13: GitHub verify, and the composed platform

`redline verify` answers one question `setup-repo.sh --verify` answered well and one it could not: is the required check name *actually reported* by a real run, and does the live policy still match what the repo chose.

**Files:**
- Create: `cli/platforms/github/verify.ts`
- Create: `cli/platforms/github/index.ts`
- Test: `cli/platforms/github/__tests__/verify.test.ts`

**Interfaces:**
- Consumes: `GitHubClient`, `Git`, `parseRemote`.
- Produces:
  - `function createGitHubVerify(client: GitHubClient): PlatformVerify`
  - `interface GitHubPlatformOptions { client: GitHubClient; gitFor?: (cwd: string) => Git }`
  - `function createGitHubPlatform(opts: GitHubPlatformOptions): Platform`

**The check-name trap, restated because it is the single most expensive mistake in this system.** A reusable workflow reports its check runs as `<caller job id> / <called job id>`. `templates/redline.yml` names the caller job `redline-gate` and the aggregate job in `workflows/redline-gate.yml` is `gate`, so the context is exactly `redline-gate / gate`. Requiring any other string makes the check unreportable, which blocks every pull request in the repository — silently, because a never-reported required check simply sits pending forever. `readReportedCheckNames` exists to catch that against reality rather than against a config file.

- [ ] **Step 1: Write the failing test**

Create `cli/platforms/github/__tests__/verify.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHubClient } from '../../__tests__/fake-client.ts';
import { createGitHubVerify } from '../verify.ts';
import { createGitHubPlatform } from '../index.ts';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { REQUIRED_CHECK } from '../install.ts';
import type { RepoRef } from '../../types.ts';

const ref: RepoRef = { host: 'github', org: 'acme', repo: 'web', defaultBranch: 'main' };

test('readPolicy maps a blocking ruleset back to a MergePolicy', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: {
        rules: [
          {
            type: 'pull_request',
            parameters: {
              required_approving_review_count: 2,
              dismiss_stale_reviews_on_push: true,
              require_code_owner_review: true,
              required_review_thread_resolution: true,
            },
          },
          {
            type: 'required_status_checks',
            parameters: { required_status_checks: [{ context: REQUIRED_CHECK }] },
          },
        ],
      },
    },
  });

  const policy = await createGitHubVerify(client).readPolicy(ref);
  assert.equal(policy?.requiredApprovals, 2);
  assert.equal(policy?.blocking, true);
  assert.deepEqual(policy?.requiredChecks, [REQUIRED_CHECK]);
});

test('a ruleset with no status-check rule reads back as advisory', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [{ id: 42, name: 'Redline' }] },
    'GET /repos/acme/web/rulesets/42': {
      status: 200,
      body: { rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 1 } }] },
    },
  });
  const policy = await createGitHubVerify(client).readPolicy(ref);
  assert.equal(policy?.blocking, false);
  assert.deepEqual(policy?.requiredChecks, []);
});

test('no Redline ruleset reads back as null, not as an empty policy', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 200, body: [] } });
  assert.equal(await createGitHubVerify(client).readPolicy(ref), null);
});

test('readReportedCheckNames resolves the head sha then lists check runs', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/pulls/12': { status: 200, body: { head: { sha: 'abc123' } } },
    'GET /repos/acme/web/commits/abc123/check-runs?per_page=100': {
      status: 200,
      body: { check_runs: [{ name: 'redline-gate / gate' }, { name: 'build' }] },
    },
  });
  const names = await createGitHubVerify(client).readReportedCheckNames(ref, 12);
  assert.deepEqual(names.sort(), ['build', 'redline-gate / gate']);
});

test('readSecurityState reports each capability from security_and_analysis', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': {
      status: 200,
      body: {
        security_and_analysis: {
          secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'disabled' },
        },
      },
    },
  });
  const state = await createGitHubVerify(client).readSecurityState(ref);
  assert.equal(state.outcomes.find((o) => o.capability === 'secret-scanning')?.status, 'applied');
  assert.equal(state.outcomes.find((o) => o.capability === 'push-protection')?.status, 'denied');
});

test('latestPullRequestNumber returns null on a repo with no pull requests', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/pulls?state=all&per_page=1': { status: 200, body: [] },
  });
  assert.equal(await createGitHubVerify(client).latestPullRequestNumber(ref), null);
});

test('repoRef derives org, repo and default branch from the remote plus one api call', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web': { status: 200, body: { default_branch: 'trunk' } },
  });
  const gitFor: (cwd: string) => ReturnType<typeof createGit> = (cwd) => {
    const run: GitRunner = (args) =>
      args[0] === 'remote' ? 'git@github.com:acme/web.git' : args[0] === 'rev-parse' ? 'true' : '';
    return createGit(cwd, run);
  };
  const platform = createGitHubPlatform({ client, gitFor });
  assert.deepEqual(await platform.repoRef('/anywhere'), {
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'trunk',
  });
  assert.equal(platform.host, 'github');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/platforms/github/__tests__/verify.test.ts`
Expected: FAIL — `Cannot find module '../verify.ts'`.

- [ ] **Step 3: Write `cli/platforms/github/verify.ts`**

```ts
import type {
  CapabilityOutcome,
  MergePolicy,
  PlatformVerify,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { GitHubClient } from './client.ts';
import { RULESET_NAME } from './install.ts';

interface RulesetRule {
  type: string;
  parameters?: Record<string, unknown>;
}

const bool = (v: unknown): boolean => v === true;

export function createGitHubVerify(client: GitHubClient): PlatformVerify {
  const repoPath = (ref: RepoRef): string => `/repos/${ref.org}/${ref.repo}`;

  return {
    async readPolicy(ref: RepoRef): Promise<MergePolicy | null> {
      const list = await client.rest<{ id: number; name: string }[]>(
        'GET',
        `${repoPath(ref)}/rulesets`
      );
      const mine = (list.body ?? []).find((r) => r.name === RULESET_NAME);
      if (!mine) return null;

      const detail = await client.rest<{ rules: RulesetRule[] }>(
        'GET',
        `${repoPath(ref)}/rulesets/${mine.id}`
      );
      const rules = detail.body?.rules ?? [];
      const pr = rules.find((r) => r.type === 'pull_request')?.parameters ?? {};
      const checksRule = rules.find((r) => r.type === 'required_status_checks');
      const contexts =
        ((checksRule?.parameters?.['required_status_checks'] as { context: string }[]) ?? []).map(
          (c) => c.context
        );

      return {
        requiredApprovals: Number(pr['required_approving_review_count'] ?? 0),
        dismissStaleReviews: bool(pr['dismiss_stale_reviews_on_push']),
        requireCodeOwnerReview: bool(pr['require_code_owner_review']),
        requireThreadResolution: bool(pr['required_review_thread_resolution']),
        requiredChecks: contexts,
        blocking: checksRule !== undefined,
      };
    },

    async readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]> {
      const detail = await client.rest<{ head: { sha: string } }>(
        'GET',
        `${repoPath(ref)}/pulls/${pr}`
      );
      const sha = detail.body?.head.sha;
      if (!sha) return [];
      const runs = await client.rest<{ check_runs: { name: string }[] }>(
        'GET',
        `${repoPath(ref)}/commits/${sha}/check-runs?per_page=100`
      );
      return (runs.body?.check_runs ?? []).map((r) => r.name);
    },

    async readSecurityState(ref: RepoRef): Promise<SecurityResult> {
      const repo = await client.rest<{
        security_and_analysis?: Record<string, { status: string }>;
      }>('GET', repoPath(ref));
      const analysis = repo.body?.security_and_analysis ?? {};
      const state = (key: string): CapabilityOutcome['status'] =>
        analysis[key]?.status === 'enabled' ? 'applied' : 'denied';

      return {
        outcomes: [
          {
            capability: 'secret-scanning',
            status: state('secret_scanning'),
            detail: 'secret scanning',
          },
          {
            capability: 'push-protection',
            status: state('secret_scanning_push_protection'),
            detail: 'secret scanning push protection',
          },
        ],
      };
    },

    async latestPullRequestNumber(ref: RepoRef): Promise<number | null> {
      const list = await client.rest<{ number: number }[]>(
        'GET',
        `${repoPath(ref)}/pulls?state=all&per_page=1`
      );
      return list.body?.[0]?.number ?? null;
    },
  };
}
```

- [ ] **Step 4: Write `cli/platforms/github/index.ts`**

```ts
import { createGit, type Git } from '../../core/git.ts';
import { parseRemote } from '../detect.ts';
import type { Platform, RepoRef } from '../types.ts';
import type { GitHubClient } from './client.ts';
import { createGitHubInstall } from './install.ts';
import { createGitHubVerify } from './verify.ts';

export interface GitHubPlatformOptions {
  client: GitHubClient;
  gitFor?: (cwd: string) => Git;
}

export function createGitHubPlatform(opts: GitHubPlatformOptions): Platform {
  const gitFor = opts.gitFor ?? ((cwd: string) => createGit(cwd));
  const install = createGitHubInstall(opts.client, gitFor);
  const verify = createGitHubVerify(opts.client);

  return {
    host: 'github',
    async repoRef(cwd: string): Promise<RepoRef> {
      const identity = parseRemote(gitFor(cwd).remoteUrl());
      const repo = await opts.client.rest<{ default_branch: string }>(
        'GET',
        `/repos/${identity.org}/${identity.repo}`
      );
      return {
        host: 'github',
        org: identity.org,
        repo: identity.repo,
        defaultBranch: repo.body?.default_branch ?? 'main',
      };
    },
    ...install,
    ...verify,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test cli/platforms/github/__tests__/verify.test.ts && npm run typecheck`
Expected: 7 passing tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/platforms/github/verify.ts cli/platforms/github/index.ts cli/platforms/github/__tests__/verify.test.ts
git commit -m "feat(cli): github verify adapter and composed platform"
```

---

## Task 14: The Azure DevOps client

Same shape as the GitHub client, three real differences: Basic auth from a PAT, a mandatory `api-version` on every request, and a per-service host.

**Files:**
- Create: `cli/platforms/azure/client.ts`
- Test: `cli/platforms/azure/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `createHttp`, `RedlineError`.
- Produces:
  - `interface AzureCredential { scheme: 'Basic' | 'Bearer'; value: string }`
  - `function resolveAzureCredential(env: NodeJS.ProcessEnv, readAzToken?: () => string): AzureCredential`
  - `interface AzureClient { request<T>(method: string, path: string, body?: unknown, opts?: { host?: 'core' | 'advsec'; apiVersion?: string }): Promise<HttpResponse<T>> }`
  - `function createAzureClient(org: string, opts?: AzureClientOptions): AzureClient`
  - `const DEFAULT_API_VERSION = '7.1'`

**Credential precedence and why:**

| Source | Scheme | When |
|---|---|---|
| `AZURE_DEVOPS_EXT_PAT` | `Basic` (empty username, PAT as password) | developer terminal, `az devops` convention |
| `SYSTEM_ACCESSTOKEN` | `Bearer` | inside an Azure Pipelines job |
| `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798` | `Bearer` | a signed-in developer with no PAT |

`499b84ac-1321-427f-aa17-267ca6975798` is the fixed Azure DevOps resource id. It is not a secret; it is the same for every tenant.

**Two hosts.** Everything lives under `https://dev.azure.com/{org}` except Advanced Security, which is served from `https://advsec.dev.azure.com/{org}`. The `host` option selects between them so the caller never builds a URL.

- [ ] **Step 1: Write the failing test**

Create `cli/platforms/azure/__tests__/client.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAzureClient, resolveAzureCredential } from '../client.ts';
import type { FetchLike } from '../../http.ts';

test('a PAT becomes basic auth with an empty username', () => {
  const cred = resolveAzureCredential({ AZURE_DEVOPS_EXT_PAT: 'secret-pat' });
  assert.equal(cred.scheme, 'Basic');
  assert.equal(Buffer.from(cred.value, 'base64').toString('utf8'), ':secret-pat');
});

test('a pipeline system access token becomes bearer auth', () => {
  const cred = resolveAzureCredential({ SYSTEM_ACCESSTOKEN: 'pipeline-token' });
  assert.deepEqual(cred, { scheme: 'Bearer', value: 'pipeline-token' });
});

test('the PAT wins over the pipeline token', () => {
  const cred = resolveAzureCredential({ AZURE_DEVOPS_EXT_PAT: 'pat', SYSTEM_ACCESSTOKEN: 'sys' });
  assert.equal(cred.scheme, 'Basic');
});

test('falling back to az yields a bearer token', () => {
  assert.deepEqual(resolveAzureCredential({}, () => 'az-token'), {
    scheme: 'Bearer',
    value: 'az-token',
  });
});

test('no credential at all is a permission error naming both options', () => {
  assert.throws(
    () =>
      resolveAzureCredential({}, () => {
        throw new Error('az not installed');
      }),
    /AZURE_DEVOPS_EXT_PAT|az login/
  );
});

test('every request carries the api-version and the org in the path', async () => {
  const seen: Request[] = [];
  const fetch: FetchLike = async (input, init) => {
    seen.push(new Request(input as RequestInfo, init));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  await client.request('GET', '/Payments/_apis/git/repositories/web');
  assert.equal(
    seen[0]?.url,
    'https://dev.azure.com/acme/Payments/_apis/git/repositories/web?api-version=7.1'
  );
  assert.equal(seen[0]?.headers.get('authorization'), 'Bearer tok');
});

test('an existing query string gets the api-version appended with an ampersand', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  await client.request('GET', '/_apis/policy/configurations?scope=x');
  assert.equal(seen[0], 'https://dev.azure.com/acme/_apis/policy/configurations?scope=x&api-version=7.1');
});

test('the advsec host is used for advanced security calls', async () => {
  const seen: string[] = [];
  const fetch: FetchLike = async (input) => {
    seen.push(String(input));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createAzureClient('acme', {
    credential: { scheme: 'Bearer', value: 'tok' },
    fetch,
    sleep: async () => {},
  });
  await client.request('PATCH', '/Payments/_apis/management/repositories/web/enablement', {}, {
    host: 'advsec',
    apiVersion: '7.2-preview.1',
  });
  assert.equal(
    seen[0],
    'https://advsec.dev.azure.com/acme/Payments/_apis/management/repositories/web/enablement?api-version=7.2-preview.1'
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/platforms/azure/__tests__/client.test.ts`
Expected: FAIL — `Cannot find module '../client.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/platforms/azure/client.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { RedlineError } from '../../core/errors.ts';
import { createHttp, type FetchLike, type HttpResponse } from '../http.ts';

export const DEFAULT_API_VERSION = '7.1';
const AZURE_DEVOPS_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';

export interface AzureCredential {
  scheme: 'Basic' | 'Bearer';
  value: string;
}

const readAzTokenFromCli = (): string => {
  const raw = execFileSync(
    'az',
    ['account', 'get-access-token', '--resource', AZURE_DEVOPS_RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return raw.trim();
};

export function resolveAzureCredential(
  env: NodeJS.ProcessEnv,
  readAzToken: () => string = readAzTokenFromCli
): AzureCredential {
  const pat = env['AZURE_DEVOPS_EXT_PAT'];
  if (pat) return { scheme: 'Basic', value: Buffer.from(`:${pat}`, 'utf8').toString('base64') };

  const system = env['SYSTEM_ACCESSTOKEN'];
  if (system) return { scheme: 'Bearer', value: system };

  try {
    const token = readAzToken();
    if (token) return { scheme: 'Bearer', value: token };
  } catch {
    // fall through to the error below
  }

  throw new RedlineError(
    'permission',
    'no Azure DevOps credentials found',
    'set AZURE_DEVOPS_EXT_PAT, or run: az login'
  );
}

export interface AzureRequestOptions {
  host?: 'core' | 'advsec';
  apiVersion?: string;
}

export interface AzureClient {
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: AzureRequestOptions
  ): Promise<HttpResponse<T>>;
}

export interface AzureClientOptions {
  credential?: AzureCredential;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export function createAzureClient(org: string, opts: AzureClientOptions = {}): AzureClient {
  const env = opts.env ?? process.env;
  const credential = opts.credential ?? resolveAzureCredential(env);
  const headers = {
    authorization: `${credential.scheme} ${credential.value}`,
    accept: 'application/json',
    'user-agent': 'redlinegate',
  };
  const httpOptions = {
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
  };
  const hosts = {
    core: createHttp(`https://dev.azure.com/${org}`, headers, httpOptions),
    advsec: createHttp(`https://advsec.dev.azure.com/${org}`, headers, httpOptions),
  };

  return {
    request<T>(method: string, path: string, body?: unknown, requestOpts: AzureRequestOptions = {}) {
      const version = requestOpts.apiVersion ?? DEFAULT_API_VERSION;
      const separator = path.includes('?') ? '&' : '?';
      return hosts[requestOpts.host ?? 'core'].request<T>(
        method,
        `${path}${separator}api-version=${version}`,
        body
      );
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/platforms/azure/__tests__/client.test.ts && npm run typecheck`
Expected: 8 passing tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add cli/platforms/azure/client.ts cli/platforms/azure/__tests__/client.test.ts
git commit -m "feat(cli): azure devops client with PAT, pipeline and az credentials"
```

---

## Task 15: The Azure gate pipeline and the Azure install adapter

Spec §3 commits to Azure DevOps at full parity from v1. This is the task that makes that true or exposes it as false.

**Files:**
- Create: `platforms/azure/gate-template.yml`
- Create: `templates/azure/pull_request_template.md`
- Create: `cli/platforms/azure/policy-types.ts`
- Create: `cli/platforms/azure/install.ts`
- Test: `cli/platforms/azure/__tests__/install.test.ts`

**Interfaces:**
- Consumes: `AzureClient`, `Git`, `cli/platforms/types.ts`.
- Produces:
  - `const AZURE_STATUS_GENRE = 'redline'`, `const AZURE_STATUS_NAME = 'gate'`
  - `const POLICY_TYPE_NAMES` and `const POLICY_TYPE_FALLBACK: Record<string, string>`
  - `function resolvePolicyTypeIds(client: AzureClient, project: string): Promise<Record<string, string>>`
  - `function createAzureInstall(client: AzureClient, gitFor: (cwd: string) => Git): PlatformInstall`

**The Azure gate contract.** GitHub's is a check-run name derived from two job ids (`redline-gate / gate`). Azure has no such derivation, so Redline defines its own and it is simpler: **the gate pipeline publishes a pull-request status with genre `redline` and name `gate`**, and the branch policy is a *Status* policy requiring exactly that. Nothing is derived from a job name, so Azure cannot suffer the silent-unreportable-check failure GitHub can. The two contracts are:

| Host | Contract | Set by |
|---|---|---|
| GitHub | check run named `redline-gate / gate` | caller job id + aggregate job id |
| Azure DevOps | PR status `redline/gate` | the gate pipeline's final step |

**Advisory versus blocking is native on Azure.** Every policy configuration has `isBlocking`. Advisory is `isBlocking: false` — the policy evaluates and shows, and does not prevent completion. No rule needs omitting, unlike GitHub.

**Policy type ids are resolved at runtime, not hardcoded.** `GET /{project}/_apis/policy/types` returns each type with its `displayName`. Redline looks types up by name and falls back to the well-known GUIDs only if the lookup fails. Hardcoding alone would be a silent breakage on any tenant where the ids differ; looking up alone would fail on a tenant that restricts the endpoint. Both, in that order, is correct.

- [ ] **Step 1: Write the Azure gate pipeline**

Create `platforms/azure/gate-template.yml`:

```yaml
# Redline merge gate for Azure DevOps.
#
# CONTRACT: the final step publishes a pull-request status with genre `redline`
# and name `gate`. The branch policy installed by `redline init` requires exactly
# that status. Renaming either value makes the policy unsatisfiable and every pull
# request in this repository will sit blocked. `redline verify` checks the live
# status name against this contract.

trigger: none

pr:
  branches:
    include:
      - '*'

pool:
  vmImage: ubuntu-latest

variables:
  ADR_DIFF_THRESHOLD: 300
  SOFT_FAIL_LABELS: redline-exempt,redline-sync

steps:
  - checkout: self
    fetchDepth: 0

  - task: NodeTool@0
    displayName: Node 22
    inputs:
      versionSpec: '22.x'

  - script: npx --yes redline@latest verify --gate
    displayName: Redline gate
    name: gate
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
      ADR_DIFF_THRESHOLD: $(ADR_DIFF_THRESHOLD)
      SOFT_FAIL_LABELS: $(SOFT_FAIL_LABELS)

  - script: |
      set -euo pipefail
      state="succeeded"
      if [ "$AGENT_JOBSTATUS" != "Succeeded" ]; then state="failed"; fi
      curl -sS --fail-with-body -X POST \
        -H "Authorization: Bearer $SYSTEM_ACCESSTOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"state\":\"$state\",\"description\":\"Redline merge gate\",\"context\":{\"name\":\"gate\",\"genre\":\"redline\"},\"targetUrl\":\"$SYSTEM_TEAMFOUNDATIONCOLLECTIONURI$SYSTEM_TEAMPROJECT/_build/results?buildId=$BUILD_BUILDID\"}" \
        "$SYSTEM_TEAMFOUNDATIONCOLLECTIONURI$SYSTEM_TEAMPROJECT/_apis/git/repositories/$BUILD_REPOSITORY_ID/pullRequests/$SYSTEM_PULLREQUEST_PULLREQUESTID/statuses?api-version=7.1"
    displayName: Publish redline/gate status
    condition: always()
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

`condition: always()` is what makes the status appear on failure as well as success — without it a failing gate reports nothing and the policy waits forever, which is the Azure equivalent of the GitHub trap this whole contract exists to avoid.

`redline verify --gate` is the gate mode of the verify command, built in Task 18.

- [ ] **Step 2: Write the Azure PR template**

Create `templates/azure/pull_request_template.md` by copying `.github/pull_request_template.md` verbatim, then changing only the trailing comment, which names a GitHub label mechanism:

```markdown
<!--
Gate stuck on a process check you cannot satisfy? Add the `redline-exempt` label to
this pull request and leave a comment explaining why. That downgrades the checklist
and ADR checks to warnings. It does NOT bypass dependency review or the secret scan —
those never soft-fail.
-->
```

Keep the `## Launch readiness` heading byte-identical — the gate's checklist parser matches on it, and a divergence between hosts would mean two parsers.

- [ ] **Step 3: Write the failing test**

Create `cli/platforms/azure/__tests__/install.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit, type GitRunner } from '../../../core/git.ts';
import { createAzureInstall } from '../install.ts';
import { AZURE_STATUS_GENRE, AZURE_STATUS_NAME, POLICY_TYPE_FALLBACK } from '../policy-types.ts';
import type { AzureClient } from '../client.ts';
import type { HttpResponse } from '../../http.ts';
import type { GateOptions, MergePolicy, RepoRef } from '../../types.ts';

const ref: RepoRef = {
  host: 'azure',
  org: 'acme',
  project: 'Payments',
  repo: 'web',
  repoId: 'repo-guid',
  defaultBranch: 'main',
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function fakeAzure(routes: Record<string, { status: number; body?: unknown }> = {}): AzureClient & {
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    async request<T>(method: string, path: string, body?: unknown): Promise<HttpResponse<T>> {
      calls.push({ method, path, body });
      const route = routes[`${method} ${path}`] ?? { status: 200, body: {} };
      return { status: route.status, body: (route.body ?? null) as T | null };
    },
  };
}

const typesRoute = {
  'GET /Payments/_apis/policy/types': {
    status: 200,
    body: {
      value: [
        { id: 'min-rev-id', displayName: 'Minimum number of reviewers' },
        { id: 'comments-id', displayName: 'Comment requirements' },
        { id: 'status-id', displayName: 'Status' },
        { id: 'required-rev-id', displayName: 'Required reviewers' },
      ],
    },
  },
};

const advisory: MergePolicy = {
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [`${AZURE_STATUS_GENRE}/${AZURE_STATUS_NAME}`],
  blocking: false,
};

const gateOpts: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt'],
};

const noopGit: GitRunner = () => '';
const gitFor = (cwd: string) => createGit(cwd, noopGit);
const tmp = (): string => mkdtempSync(join(tmpdir(), 'redline-azure-'));

test('policy type ids come from the live lookup when it succeeds', async () => {
  const client = fakeAzure({ ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const created = client.calls.filter((c) => c.method === 'POST' && c.path === '/Payments/_apis/policy/configurations');
  const typeIds = created.map((c) => (c.body as { type: { id: string } }).type.id);
  assert.ok(typeIds.includes('status-id'));
  assert.ok(typeIds.includes('min-rev-id'));
});

test('a failed type lookup falls back to the well-known guids', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 403 },
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const created = client.calls.filter((c) => c.method === 'POST');
  const typeIds = created.map((c) => (c.body as { type: { id: string } }).type.id);
  assert.ok(typeIds.includes(POLICY_TYPE_FALLBACK['Status']!));
});

test('advisory sets isBlocking false on the status policy; blocking sets it true', async () => {
  const routes = { ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } };

  const a = fakeAzure(routes);
  await createAzureInstall(a, gitFor).applyPolicy(ref, advisory);
  const advisoryStatus = a.calls.find(
    (c) => c.method === 'POST' && (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  assert.equal((advisoryStatus?.body as { isBlocking: boolean }).isBlocking, false);

  const b = fakeAzure(routes);
  await createAzureInstall(b, gitFor).applyPolicy(ref, { ...advisory, blocking: true });
  const blockingStatus = b.calls.find(
    (c) => c.method === 'POST' && (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  assert.equal((blockingStatus?.body as { isBlocking: boolean }).isBlocking, true);
});

test('the status policy names exactly the genre and name the pipeline publishes', async () => {
  const client = fakeAzure({ ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const statusPolicy = client.calls.find(
    (c) => c.method === 'POST' && (c.body as { type: { id: string } }).type.id === 'status-id'
  );
  const settings = (statusPolicy?.body as { settings: Record<string, unknown> }).settings;
  assert.equal(settings['statusGenre'], 'redline');
  assert.equal(settings['statusName'], 'gate');
});

test('an existing redline policy is updated in place rather than duplicated', async () => {
  const client = fakeAzure({
    ...typesRoute,
    'GET /Payments/_apis/policy/configurations': {
      status: 200,
      body: {
        value: [
          {
            id: 99,
            type: { id: 'status-id' },
            settings: { statusGenre: 'redline', statusName: 'gate', scope: [{ repositoryId: 'repo-guid' }] },
          },
        ],
      },
    },
  });
  await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  assert.ok(client.calls.some((c) => c.method === 'PUT' && c.path === '/Payments/_apis/policy/configurations/99'));
});

test('the repository property capability is unsupported on azure, never denied', async () => {
  const client = fakeAzure({ ...typesRoute, 'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } } });
  const result = await createAzureInstall(client, gitFor).applyPolicy(ref, advisory);
  const property = result.outcomes.find((o) => o.capability === 'repo-property');
  assert.equal(property?.status, 'unsupported');
});

test('advanced security not licensed reads as unsupported, so it never becomes pending admin', async () => {
  const client = fakeAzure({
    'PATCH /Payments/_apis/management/repositories/repo-guid/enablement': { status: 404 },
  });
  const result = await createAzureInstall(client, gitFor).enableSecurityFloor(ref);
  assert.ok(result.outcomes.every((o) => o.status === 'unsupported'));
});

test('advanced security denied by permissions is denied, so it does become pending admin', async () => {
  const client = fakeAzure({
    'PATCH /Payments/_apis/management/repositories/repo-guid/enablement': { status: 403 },
  });
  const result = await createAzureInstall(client, gitFor).enableSecurityFloor(ref);
  assert.ok(result.outcomes.every((o) => o.status === 'denied'));
});

test('installGate writes the azure pipeline and PR template, and labels are unsupported', async () => {
  const cwd = tmp();
  const result = await createAzureInstall(fakeAzure(), gitFor).installGate(ref, cwd, gateOpts);
  assert.deepEqual(result.files, ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md']);
  const yml = readFileSync(join(cwd, '.azuredevops/redline-gate.yml'), 'utf8');
  assert.match(yml, /ADR_DIFF_THRESHOLD: 300/);
  assert.match(yml, /genre[^\n]*redline/);
  assert.equal(result.outcomes.find((o) => o.capability === 'labels')?.status, 'unsupported');
});

test('openPullRequest uses full ref names and returns the azure pull request id', async () => {
  const client = fakeAzure({
    'POST /Payments/_apis/git/repositories/repo-guid/pullrequests': {
      status: 201,
      body: { pullRequestId: 31 },
    },
  });
  const dirty = (cwd: string) =>
    createGit(cwd, (args) => {
      if (args[0] === 'diff') throw new Error('staged changes exist');
      return '';
    });
  const pr = await createAzureInstall(client, dirty).openPullRequest(ref, tmp(), {
    branch: 'redline/onboard',
    title: 'chore(redline): onboard',
    body: 'body',
    labels: [],
  });
  assert.equal(pr.number, 31);
  assert.equal(pr.url, 'https://dev.azure.com/acme/Payments/_git/web/pullrequest/31');
  const create = client.calls.find((c) => c.method === 'POST')!;
  assert.deepEqual(create.body, {
    sourceRefName: 'refs/heads/redline/onboard',
    targetRefName: 'refs/heads/main',
    title: 'chore(redline): onboard',
    description: 'body',
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node --test cli/platforms/azure/__tests__/install.test.ts`
Expected: FAIL — `Cannot find module '../policy-types.ts'`.

- [ ] **Step 5: Write `cli/platforms/azure/policy-types.ts`**

```ts
import type { AzureClient } from './client.ts';

export const AZURE_STATUS_GENRE = 'redline';
export const AZURE_STATUS_NAME = 'gate';

export const POLICY_TYPE_NAMES = {
  minimumReviewers: 'Minimum number of reviewers',
  comments: 'Comment requirements',
  status: 'Status',
  requiredReviewers: 'Required reviewers',
} as const;

/**
 * Well-known Azure DevOps policy type ids, used only when the live lookup is
 * unavailable. Verify these against `GET {project}/_apis/policy/types` on the
 * pilot organisation before relying on the fallback path.
 */
export const POLICY_TYPE_FALLBACK: Record<string, string> = {
  'Minimum number of reviewers': 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd',
  'Comment requirements': 'c6a1889d-b943-4856-b76f-9e46bb6b0df2',
  Status: 'cbdc66da-9728-4af8-aada-9a5a32e4a226',
  'Required reviewers': 'fd2167ab-b0be-447a-8ec8-39368250530e',
};

export async function resolvePolicyTypeIds(
  client: AzureClient,
  project: string
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = { ...POLICY_TYPE_FALLBACK };
  const res = await client.request<{ value: { id: string; displayName: string }[] }>(
    'GET',
    `/${project}/_apis/policy/types`
  );
  for (const type of res.body?.value ?? []) {
    if (type.displayName in resolved) resolved[type.displayName] = type.id;
  }
  return resolved;
}
```

- [ ] **Step 6: Write `cli/platforms/azure/install.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RedlineError } from '../../core/errors.ts';
import type { Git } from '../../core/git.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  PlatformInstall,
  PolicyResult,
  PullRequestRef,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { AzureClient } from './client.ts';
import {
  AZURE_STATUS_GENRE,
  AZURE_STATUS_NAME,
  POLICY_TYPE_NAMES,
  resolvePolicyTypeIds,
} from './policy-types.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ADVSEC = { host: 'advsec', apiVersion: '7.2-preview.1' } as const;

interface PolicyConfiguration {
  id: number;
  type: { id: string };
  settings: Record<string, unknown>;
}

function outcome(capability: AdminCapability, status: number, detail: string): CapabilityOutcome {
  if (status >= 200 && status < 300) return { capability, status: 'applied', detail };
  if (status === 401 || status === 403) {
    return { capability, status: 'denied', detail: `${detail} (needs project administrator)` };
  }
  if (status === 404) {
    return {
      capability,
      status: 'unsupported',
      detail: `${detail} (not available — Advanced Security is licensed separately)`,
    };
  }
  return { capability, status: 'denied', detail: `${detail} (HTTP ${status})` };
}

function writeFile(cwd: string, relPath: string, contents: string): void {
  const target = join(cwd, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function createAzureInstall(
  client: AzureClient,
  gitFor: (cwd: string) => Git
): PlatformInstall {
  const project = (ref: RepoRef): string => {
    if (!ref.project) throw new RedlineError('usage', 'an Azure DevOps repository needs a project');
    return ref.project;
  };
  const repoId = (ref: RepoRef): string => {
    if (!ref.repoId) throw new RedlineError('usage', 'an Azure DevOps repository needs its id');
    return ref.repoId;
  };

  return {
    async enableSecurityFloor(ref: RepoRef): Promise<SecurityResult> {
      const res = await client.request(
        'PATCH',
        `/${project(ref)}/_apis/management/repositories/${repoId(ref)}/enablement`,
        { advSecEnabled: true, blockPushes: true },
        ADVSEC
      );
      return {
        outcomes: [
          outcome('secret-scanning', res.status, 'advanced security secret scanning'),
          outcome('push-protection', res.status, 'advanced security push protection'),
          outcome('dependency-alerts', res.status, 'advanced security dependency scanning'),
        ],
      };
    },

    async applyPolicy(ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      const proj = project(ref);
      const types = await resolvePolicyTypeIds(client, proj);
      const scope = [
        { repositoryId: repoId(ref), refName: `refs/heads/${ref.defaultBranch}`, matchKind: 'exact' },
      ];

      const wanted = [
        {
          type: { id: types[POLICY_TYPE_NAMES.minimumReviewers]! },
          isEnabled: true,
          isBlocking: true,
          settings: {
            minimumApproverCount: policy.requiredApprovals,
            creatorVoteCounts: false,
            resetOnSourcePush: policy.dismissStaleReviews,
            blockLastPusherVote: true,
            scope,
          },
        },
        {
          type: { id: types[POLICY_TYPE_NAMES.comments]! },
          isEnabled: policy.requireThreadResolution,
          isBlocking: policy.requireThreadResolution,
          settings: { scope },
        },
        {
          type: { id: types[POLICY_TYPE_NAMES.status]! },
          isEnabled: true,
          isBlocking: policy.blocking,
          settings: {
            statusName: AZURE_STATUS_NAME,
            statusGenre: AZURE_STATUS_GENRE,
            authorId: null,
            invalidateOnSourceUpdate: true,
            scope,
          },
        },
      ];

      const existing = await client.request<{ value: PolicyConfiguration[] }>(
        'GET',
        `/${proj}/_apis/policy/configurations`
      );
      const mine = (existing.body?.value ?? []).filter((c) =>
        (c.settings['scope'] as { repositoryId?: string }[] | undefined)?.some(
          (s) => s.repositoryId === repoId(ref)
        )
      );

      let worst = 200;
      for (const config of wanted) {
        const match = mine.find((c) => c.type.id === config.type.id);
        const res = match
          ? await client.request('PUT', `/${proj}/_apis/policy/configurations/${match.id}`, config)
          : await client.request('POST', `/${proj}/_apis/policy/configurations`, config);
        if (res.status >= 300) worst = Math.max(worst, res.status);
      }

      return {
        outcomes: [
          outcome('merge-policy', worst, 'branch policies'),
          {
            capability: 'repo-property',
            status: 'unsupported',
            detail: 'Azure DevOps has no repository properties — the central registry tracks this repo instead',
          },
        ],
        policy: worst < 300 ? policy : null,
      };
    },

    async installGate(ref: RepoRef, cwd: string, opts: GateOptions): Promise<InstallResult> {
      const pipeline = readFileSync(join(PACKAGE_ROOT, 'platforms/azure/gate-template.yml'), 'utf8')
        .replace(/ADR_DIFF_THRESHOLD: \d+/, `ADR_DIFF_THRESHOLD: ${opts.adrDiffThreshold}`)
        .replace(/SOFT_FAIL_LABELS: .*/, `SOFT_FAIL_LABELS: ${opts.softFailLabels.join(',')}`);
      writeFile(cwd, '.azuredevops/redline-gate.yml', pipeline);

      const template = readFileSync(
        join(PACKAGE_ROOT, 'templates/azure/pull_request_template.md'),
        'utf8'
      );
      writeFile(cwd, '.azuredevops/pull_request_template.md', template);

      return {
        files: ['.azuredevops/redline-gate.yml', '.azuredevops/pull_request_template.md'],
        outcomes: [
          {
            capability: 'labels',
            status: 'unsupported',
            detail: 'Azure DevOps pull request labels are created on use, not pre-declared',
          },
        ],
      };
    },

    async ensureReviewOwnership(
      ref: RepoRef,
      _cwd: string,
      rules: OwnershipRule[]
    ): Promise<InstallResult> {
      const proj = project(ref);
      const types = await resolvePolicyTypeIds(client, proj);
      let worst = 200;
      for (const rule of rules) {
        const res = await client.request('POST', `/${proj}/_apis/policy/configurations`, {
          type: { id: types[POLICY_TYPE_NAMES.requiredReviewers]! },
          isEnabled: true,
          isBlocking: true,
          settings: {
            requiredReviewerIds: rule.owners,
            filenamePatterns: [rule.pattern],
            scope: [
              {
                repositoryId: repoId(ref),
                refName: `refs/heads/${ref.defaultBranch}`,
                matchKind: 'exact',
              },
            ],
          },
        });
        if (res.status >= 300) worst = Math.max(worst, res.status);
      }
      return { files: [], outcomes: [outcome('review-ownership', worst, 'required reviewer policy')] };
    },

    async openPullRequest(ref: RepoRef, cwd: string, change: Change): Promise<PullRequestRef> {
      const git = gitFor(cwd);
      git.checkoutNewBranch(change.branch);
      git.stageAll();
      if (!git.hasStagedChanges()) {
        throw new RedlineError('failed', 'nothing to commit — this repository is already onboarded');
      }
      git.commit(change.title);
      git.push(change.branch);

      const created = await client.request<{ pullRequestId: number }>(
        'POST',
        `/${project(ref)}/_apis/git/repositories/${repoId(ref)}/pullrequests`,
        {
          sourceRefName: `refs/heads/${change.branch}`,
          targetRefName: `refs/heads/${ref.defaultBranch}`,
          title: change.title,
          description: change.body,
        }
      );
      const id = created.body?.pullRequestId;
      if (!id) throw new RedlineError('host', `could not open a pull request (HTTP ${created.status})`);
      return {
        number: id,
        url: `https://dev.azure.com/${ref.org}/${project(ref)}/_git/${ref.repo}/pullrequest/${id}`,
      };
    },
  };
}
```

**`ensureReviewOwnership` is the one place the two hosts genuinely diverge.** GitHub takes team *slugs* in a `CODEOWNERS` file; Azure takes reviewer *identity GUIDs* in a policy. `OwnershipRule.owners` therefore carries whatever the host understands, and resolving a team name to an Azure identity GUID is **out of scope for Phase 1** — `redline init` on Azure installs the sensitive-path policy only when the operator supplies identity ids in the menu answer, and otherwise records `review-ownership` as `denied` with a hint. Task 17 handles that branch.

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test cli/platforms/azure/__tests__/install.test.ts && npm run typecheck`
Expected: 10 passing tests, no type errors.

- [ ] **Step 8: Commit**

```bash
git add platforms/azure/ templates/azure/ cli/platforms/azure/policy-types.ts cli/platforms/azure/install.ts cli/platforms/azure/__tests__/install.test.ts
git commit -m "feat(cli): azure gate pipeline and install adapter with native advisory policies"
```

---

## Task 16: Azure verify, and the one platform factory

After this task the rest of the CLI never mentions a host again.

**Files:**
- Create: `cli/platforms/azure/verify.ts`
- Create: `cli/platforms/azure/index.ts`
- Create: `cli/platforms/resolve.ts`
- Test: `cli/platforms/azure/__tests__/verify.test.ts`
- Test: `cli/platforms/__tests__/resolve.test.ts`
- Test: `cli/platforms/__tests__/boundary.test.ts`

**Interfaces:**
- Consumes: `AzureClient`, `parseRemote`, `createGitHubPlatform`.
- Produces:
  - `function createAzureVerify(client: AzureClient): PlatformVerify`
  - `function createAzurePlatform(opts: { client: AzureClient; gitFor?: (cwd: string) => Git }): Platform`
  - `function resolvePlatform(cwd: string, deps?: ResolveDeps): Promise<Platform>`

**The boundary test.** Global constraint: no file outside `cli/platforms/` may reference `api.github.com`, `dev.azure.com`, `gh` or `az`. This task adds the test that enforces it, because from here on every new file is a chance to break it.

- [ ] **Step 1: Write the failing Azure verify test**

Create `cli/platforms/azure/__tests__/verify.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAzureVerify } from '../verify.ts';
import type { AzureClient } from '../client.ts';
import type { HttpResponse } from '../../http.ts';
import type { RepoRef } from '../../types.ts';

const ref: RepoRef = {
  host: 'azure',
  org: 'acme',
  project: 'Payments',
  repo: 'web',
  repoId: 'repo-guid',
  defaultBranch: 'main',
};

function fakeAzure(routes: Record<string, { status: number; body?: unknown }>): AzureClient {
  return {
    async request<T>(method: string, path: string): Promise<HttpResponse<T>> {
      const route = routes[`${method} ${path}`] ?? { status: 200, body: {} };
      return { status: route.status, body: (route.body ?? null) as T | null };
    },
  };
}

const configurations = (isBlocking: boolean) => ({
  'GET /Payments/_apis/policy/types': {
    status: 200,
    body: {
      value: [
        { id: 'min-rev-id', displayName: 'Minimum number of reviewers' },
        { id: 'comments-id', displayName: 'Comment requirements' },
        { id: 'status-id', displayName: 'Status' },
      ],
    },
  },
  'GET /Payments/_apis/policy/configurations': {
    status: 200,
    body: {
      value: [
        {
          id: 1,
          isEnabled: true,
          isBlocking: true,
          type: { id: 'min-rev-id' },
          settings: {
            minimumApproverCount: 2,
            resetOnSourcePush: true,
            scope: [{ repositoryId: 'repo-guid' }],
          },
        },
        {
          id: 2,
          isEnabled: true,
          isBlocking: true,
          type: { id: 'comments-id' },
          settings: { scope: [{ repositoryId: 'repo-guid' }] },
        },
        {
          id: 3,
          isEnabled: true,
          isBlocking,
          type: { id: 'status-id' },
          settings: {
            statusGenre: 'redline',
            statusName: 'gate',
            scope: [{ repositoryId: 'repo-guid' }],
          },
        },
      ],
    },
  },
});

test('readPolicy maps branch policies back to a MergePolicy', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(true))).readPolicy(ref);
  assert.equal(policy?.requiredApprovals, 2);
  assert.equal(policy?.dismissStaleReviews, true);
  assert.equal(policy?.requireThreadResolution, true);
  assert.equal(policy?.blocking, true);
  assert.deepEqual(policy?.requiredChecks, ['redline/gate']);
});

test('a non-blocking status policy reads back as advisory', async () => {
  const policy = await createAzureVerify(fakeAzure(configurations(false))).readPolicy(ref);
  assert.equal(policy?.blocking, false);
});

test('no policies scoped to this repository reads back as null', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/policy/types': { status: 200, body: { value: [] } },
    'GET /Payments/_apis/policy/configurations': { status: 200, body: { value: [] } },
  });
  assert.equal(await createAzureVerify(client).readPolicy(ref), null);
});

test('reported status names are genre/name, matching the pipeline contract', async () => {
  const client = fakeAzure({
    'GET /Payments/_apis/git/repositories/repo-guid/pullRequests/31/statuses': {
      status: 200,
      body: { value: [{ context: { genre: 'redline', name: 'gate' } }, { context: { name: 'build' } }] },
    },
  });
  const names = await createAzureVerify(client).readReportedCheckNames(ref, 31);
  assert.deepEqual(names, ['redline/gate', 'build']);
});

test('security state reflects advanced security enablement', async () => {
  const enabled = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': {
      status: 200,
      body: { advSecEnabled: true, blockPushes: true },
    },
  });
  const state = await createAzureVerify(enabled).readSecurityState(ref);
  assert.ok(state.outcomes.every((o) => o.status === 'applied'));

  const unlicensed = fakeAzure({
    'GET /Payments/_apis/management/repositories/repo-guid/enablement': { status: 404 },
  });
  const off = await createAzureVerify(unlicensed).readSecurityState(ref);
  assert.ok(off.outcomes.every((o) => o.status === 'unsupported'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/platforms/azure/__tests__/verify.test.ts`
Expected: FAIL — `Cannot find module '../verify.ts'`.

- [ ] **Step 3: Write `cli/platforms/azure/verify.ts`**

```ts
import type {
  CapabilityOutcome,
  MergePolicy,
  PlatformVerify,
  RepoRef,
  SecurityResult,
} from '../types.ts';
import type { AzureClient } from './client.ts';
import { POLICY_TYPE_NAMES, resolvePolicyTypeIds } from './policy-types.ts';

interface PolicyConfiguration {
  id: number;
  isEnabled: boolean;
  isBlocking: boolean;
  type: { id: string };
  settings: Record<string, unknown>;
}

export function createAzureVerify(client: AzureClient): PlatformVerify {
  const proj = (ref: RepoRef): string => ref.project ?? '';
  const repo = (ref: RepoRef): string => ref.repoId ?? ref.repo;

  return {
    async readPolicy(ref: RepoRef): Promise<MergePolicy | null> {
      const types = await resolvePolicyTypeIds(client, proj(ref));
      const res = await client.request<{ value: PolicyConfiguration[] }>(
        'GET',
        `/${proj(ref)}/_apis/policy/configurations`
      );
      const mine = (res.body?.value ?? []).filter((c) =>
        (c.settings['scope'] as { repositoryId?: string }[] | undefined)?.some(
          (s) => s.repositoryId === repo(ref)
        )
      );
      if (mine.length === 0) return null;

      const byType = (name: string): PolicyConfiguration | undefined =>
        mine.find((c) => c.type.id === types[name]);

      const reviewers = byType(POLICY_TYPE_NAMES.minimumReviewers);
      const comments = byType(POLICY_TYPE_NAMES.comments);
      const status = byType(POLICY_TYPE_NAMES.status);
      const genre = status?.settings['statusGenre'];
      const statusName = status?.settings['statusName'];

      return {
        requiredApprovals: Number(reviewers?.settings['minimumApproverCount'] ?? 0),
        dismissStaleReviews: reviewers?.settings['resetOnSourcePush'] === true,
        requireCodeOwnerReview: byType(POLICY_TYPE_NAMES.requiredReviewers) !== undefined,
        requireThreadResolution: comments?.isEnabled === true,
        requiredChecks: status ? [`${String(genre)}/${String(statusName)}`] : [],
        blocking: status?.isBlocking === true,
      };
    },

    async readReportedCheckNames(ref: RepoRef, pr: number): Promise<string[]> {
      const res = await client.request<{
        value: { context: { genre?: string; name: string } }[];
      }>('GET', `/${proj(ref)}/_apis/git/repositories/${repo(ref)}/pullRequests/${pr}/statuses`);
      return (res.body?.value ?? []).map((s) =>
        s.context.genre ? `${s.context.genre}/${s.context.name}` : s.context.name
      );
    },

    async readSecurityState(ref: RepoRef): Promise<SecurityResult> {
      const res = await client.request<{ advSecEnabled?: boolean; blockPushes?: boolean }>(
        'GET',
        `/${proj(ref)}/_apis/management/repositories/${repo(ref)}/enablement`,
        undefined,
        { host: 'advsec', apiVersion: '7.2-preview.1' }
      );
      const status = (on: boolean | undefined): CapabilityOutcome['status'] => {
        if (res.status === 404) return 'unsupported';
        if (res.status === 401 || res.status === 403) return 'denied';
        return on === true ? 'applied' : 'denied';
      };
      return {
        outcomes: [
          {
            capability: 'secret-scanning',
            status: status(res.body?.advSecEnabled),
            detail: 'advanced security secret scanning',
          },
          {
            capability: 'push-protection',
            status: status(res.body?.blockPushes),
            detail: 'advanced security push protection',
          },
        ],
      };
    },

    async latestPullRequestNumber(ref: RepoRef): Promise<number | null> {
      const res = await client.request<{ value: { pullRequestId: number }[] }>(
        'GET',
        `/${proj(ref)}/_apis/git/repositories/${repo(ref)}/pullrequests?searchCriteria.status=all&$top=1`
      );
      return res.body?.value?.[0]?.pullRequestId ?? null;
    },
  };
}
```

- [ ] **Step 4: Write `cli/platforms/azure/index.ts`**

```ts
import { createGit, type Git } from '../../core/git.ts';
import { RedlineError } from '../../core/errors.ts';
import { parseRemote } from '../detect.ts';
import type { Platform, RepoRef } from '../types.ts';
import type { AzureClient } from './client.ts';
import { createAzureInstall } from './install.ts';
import { createAzureVerify } from './verify.ts';

export interface AzurePlatformOptions {
  client: AzureClient;
  gitFor?: (cwd: string) => Git;
}

export function createAzurePlatform(opts: AzurePlatformOptions): Platform {
  const gitFor = opts.gitFor ?? ((cwd: string) => createGit(cwd));
  const install = createAzureInstall(opts.client, gitFor);
  const verify = createAzureVerify(opts.client);

  return {
    host: 'azure',
    async repoRef(cwd: string): Promise<RepoRef> {
      const identity = parseRemote(gitFor(cwd).remoteUrl());
      if (!identity.project) {
        throw new RedlineError('usage', 'could not read the Azure DevOps project from the git remote');
      }
      const repo = await opts.client.request<{ id: string; defaultBranch?: string }>(
        'GET',
        `/${identity.project}/_apis/git/repositories/${identity.repo}`
      );
      return {
        host: 'azure',
        org: identity.org,
        project: identity.project,
        repo: identity.repo,
        repoId: repo.body?.id ?? '',
        defaultBranch: (repo.body?.defaultBranch ?? 'refs/heads/main').replace('refs/heads/', ''),
      };
    },
    ...install,
    ...verify,
  };
}
```

- [ ] **Step 5: Write the failing factory and boundary tests**

Create `cli/platforms/__tests__/resolve.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGit, type GitRunner } from '../../core/git.ts';
import { resolvePlatform } from '../resolve.ts';

const gitWith = (remote: string): ((cwd: string) => ReturnType<typeof createGit>) => {
  const run: GitRunner = (args) => {
    if (args[0] === 'rev-parse') return 'true';
    if (args[0] === 'remote') return remote;
    return '';
  };
  return (cwd) => createGit(cwd, run);
};

const stubbed = {
  makeGitHubClient: () => ({ rest: async () => ({ status: 200, body: {} }), graphql: async () => ({}) }),
  makeAzureClient: () => ({ request: async () => ({ status: 200, body: {} }) }),
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
```

Create `cli/platforms/__tests__/boundary.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../', import.meta.url));
const FORBIDDEN = [/api\.github\.com/, /dev\.azure\.com/, /\bexecFileSync\(\s*['"]gh['"]/, /\bexecFileSync\(\s*['"]az['"]/];

function sourceFilesOutsidePlatforms(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      if (entry === 'platforms' && dir === CLI) continue;
      sourceFilesOutsidePlatforms(abs, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      acc.push(abs);
    }
  }
  return acc;
}

test('no file outside cli/platforms/ knows which host it is talking to', () => {
  const offenders: string[] = [];
  for (const file of sourceFilesOutsidePlatforms(CLI)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(source)) offenders.push(`${file.replace(CLI, 'cli/')} matches ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], `host details leaked outside the adapter:\n${offenders.join('\n')}`);
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `node --test cli/platforms/__tests__/resolve.test.ts`
Expected: FAIL — `Cannot find module '../resolve.ts'`.

- [ ] **Step 7: Write `cli/platforms/resolve.ts`**

```ts
import { createGit, type Git } from '../core/git.ts';
import { RedlineError } from '../core/errors.ts';
import { parseRemote } from './detect.ts';
import { createGitHubClient, type GitHubClient } from './github/client.ts';
import { createGitHubPlatform } from './github/index.ts';
import { createAzureClient, type AzureClient } from './azure/client.ts';
import { createAzurePlatform } from './azure/index.ts';
import type { Platform } from './types.ts';

export interface ResolveDeps {
  gitFor?: (cwd: string) => Git;
  makeGitHubClient?: () => GitHubClient;
  makeAzureClient?: (org: string) => AzureClient;
}

export async function resolvePlatform(cwd: string, deps: ResolveDeps = {}): Promise<Platform> {
  const gitFor = deps.gitFor ?? ((dir: string) => createGit(dir));
  const git = gitFor(cwd);
  if (!git.isRepo()) {
    throw new RedlineError('usage', `${cwd} is not a git repository`, 'run redline from inside your repo');
  }

  const identity = parseRemote(git.remoteUrl());
  if (identity.host === 'github') {
    const client = (deps.makeGitHubClient ?? (() => createGitHubClient()))();
    return createGitHubPlatform({ client, gitFor });
  }
  const client = (deps.makeAzureClient ?? ((org: string) => createAzureClient(org)))(identity.org);
  return createAzurePlatform({ client, gitFor });
}
```

- [ ] **Step 8: Run every test**

Run: `npm test && npm run typecheck`
Expected: everything green, including the boundary test.

- [ ] **Step 9: Commit**

```bash
git add cli/platforms/azure/verify.ts cli/platforms/azure/index.ts cli/platforms/resolve.ts cli/platforms/azure/__tests__/verify.test.ts cli/platforms/__tests__/resolve.test.ts cli/platforms/__tests__/boundary.test.ts
git commit -m "feat(cli): azure verify adapter, platform factory and the host boundary test"
```

---

## Task 17: `redline init`

Orchestration only. Every host call goes through the `Platform` it is handed, so this file is testable against a fake platform with no network and no filesystem host.

**Files:**
- Create: `cli/commands/init.ts`
- Test: `cli/commands/__tests__/init.test.ts`
- Test: `cli/commands/__tests__/fake-platform.ts`

**Interfaces:**
- Consumes: `Platform`, `render`, `scanRepo`, `proposeProfile`, `writeConfig`, `readConfig`.
- Produces:
  - `const DEFAULT_MENU: MenuSelections`
  - `const FLOOR_GATE: GateOptions`
  - `const SENSITIVE_PATHS: OwnershipRule[]`
  - `interface InitOptions { cwd: string; root: string; profile?: string; vendors?: string[]; menu?: Partial<MenuSelections>; now?: () => Date }`
  - `interface InitReport { profile: string; files: string[]; outcomes: CapabilityOutcome[]; pendingAdmin: AdminCapability[]; pullRequest: PullRequestRef | null; migratedFrom: string | null; alreadyOnboarded: boolean }`
  - `function init(platform: Platform, opts: InitOptions): Promise<InitReport>`

**The floor, from spec §6.1, installed with no prompt:** rendered standards for the detected profile; the security floor; the merge-readiness template and the gate running **advisory**; and `.redline.json`, which is what makes the repo visible to central telemetry.

**Permission degradation is the normal path, not the error path.** `init` never aborts part-way. Every capability outcome is collected; `denied` ones become `pendingAdmin`; `unsupported` ones do not. The pull request is opened regardless, so the file-level work is never lost.

- [ ] **Step 1: Write the fake platform**

Create `cli/commands/__tests__/fake-platform.ts`:

```ts
import type {
  CapabilityOutcome,
  Change,
  GateOptions,
  InstallResult,
  MergePolicy,
  OwnershipRule,
  Platform,
  PolicyResult,
  PullRequestRef,
  RepoRef,
  SecurityResult,
} from '../../platforms/types.ts';

export interface FakePlatformOptions {
  ref?: RepoRef;
  security?: CapabilityOutcome[];
  policy?: CapabilityOutcome[];
  gateFiles?: string[];
  failPullRequest?: boolean;
}

export interface FakePlatform extends Platform {
  applied: string[];
  lastPolicy: MergePolicy | null;
}

/**
 * The policy a repository has after a default `init`. `readPolicy` returns this
 * until `applyPolicy` overwrites it, so a fresh fake stands in for an already
 * onboarded repository — which is what the verify tests need.
 */
const ADVISORY: MergePolicy = {
  requiredApprovals: 1,
  dismissStaleReviews: true,
  requireCodeOwnerReview: true,
  requireThreadResolution: true,
  requiredChecks: [],
  blocking: false,
};

const ok = (capability: CapabilityOutcome['capability']): CapabilityOutcome => ({
  capability,
  status: 'applied',
  detail: capability,
});

export function fakePlatform(opts: FakePlatformOptions = {}): FakePlatform {
  const applied: string[] = [];
  const ref: RepoRef = opts.ref ?? {
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'main',
  };
  const platform: FakePlatform = {
    host: ref.host,
    applied,
    lastPolicy: ADVISORY,
    async repoRef(): Promise<RepoRef> {
      return ref;
    },
    async installGate(_ref: RepoRef, _cwd: string, _opts: GateOptions): Promise<InstallResult> {
      applied.push('installGate');
      return { files: opts.gateFiles ?? ['.github/workflows/redline.yml'], outcomes: [ok('labels')] };
    },
    async applyPolicy(_ref: RepoRef, policy: MergePolicy): Promise<PolicyResult> {
      applied.push('applyPolicy');
      platform.lastPolicy = policy;
      return { outcomes: opts.policy ?? [ok('merge-policy'), ok('repo-property')], policy };
    },
    async enableSecurityFloor(): Promise<SecurityResult> {
      applied.push('enableSecurityFloor');
      return {
        outcomes: opts.security ?? [ok('secret-scanning'), ok('push-protection'), ok('dependency-alerts')],
      };
    },
    async ensureReviewOwnership(
      _ref: RepoRef,
      _cwd: string,
      _rules: OwnershipRule[]
    ): Promise<InstallResult> {
      applied.push('ensureReviewOwnership');
      return { files: ['.github/CODEOWNERS'], outcomes: [ok('review-ownership')] };
    },
    async openPullRequest(_ref: RepoRef, _cwd: string, _change: Change): Promise<PullRequestRef> {
      applied.push('openPullRequest');
      if (opts.failPullRequest) throw new Error('nothing to commit');
      return { number: 1, url: 'https://example/pr/1' };
    },
    async readPolicy(): Promise<MergePolicy | null> {
      return platform.lastPolicy;
    },
    async readReportedCheckNames(): Promise<string[]> {
      return ['redline-gate / gate'];
    },
    async readSecurityState(): Promise<SecurityResult> {
      return { outcomes: opts.security ?? [ok('secret-scanning'), ok('push-protection')] };
    },
    async latestPullRequestNumber(): Promise<number | null> {
      return 1;
    },
  };
  return platform;
}
```

- [ ] **Step 2: Write the failing test**

Create `cli/commands/__tests__/init.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform } from './fake-platform.ts';
import { init } from '../init.ts';
import { readConfig } from '../../config/redline-json.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = (): Date => new Date('2026-09-01T00:00:00.000Z');

function repo(files: Record<string, string> = { 'package.json': '{"dependencies":{"react":"19"}}' }): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-init-'));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

test('installs the floor in order and opens a pull request', async () => {
  const platform = fakePlatform();
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.deepEqual(platform.applied, [
    'installGate',
    'ensureReviewOwnership',
    'enableSecurityFloor',
    'applyPolicy',
    'openPullRequest',
  ]);
  assert.equal(report.pullRequest?.number, 1);
});

test('the gate is advisory by default', async () => {
  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now });
  assert.equal(platform.lastPolicy?.blocking, false);
});

test('the menu can promote the gate to blocking', async () => {
  const platform = fakePlatform();
  await init(platform, { cwd: repo(), root, now, menu: { blockingGate: true } });
  assert.equal(platform.lastPolicy?.blocking, true);
});

test('the detected profile is used and recorded', async () => {
  const cwd = repo();
  const report = await init(fakePlatform(), { cwd, root, now });
  assert.equal(report.profile, 'web');
  assert.equal(readConfig(cwd)?.profile, 'web');
});

test('an explicit profile overrides detection', async () => {
  const cwd = repo();
  const report = await init(fakePlatform(), { cwd, root, now, profile: 'infra' });
  assert.equal(report.profile, 'infra');
});

test('an unknown explicit profile fails before anything is written', async () => {
  const cwd = repo();
  const platform = fakePlatform();
  await assert.rejects(init(platform, { cwd, root, now, profile: 'nope' }), /unknown profile/);
  assert.deepEqual(platform.applied, []);
  assert.equal(existsSync(join(cwd, '.redline.json')), false);
});

test('standards are rendered into the working tree', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  assert.ok(existsSync(join(cwd, 'AGENTS.md')));
  assert.ok(existsSync(join(cwd, 'CLAUDE.md')));
  assert.ok(existsSync(join(cwd, '.github/copilot-instructions.md')));
  assert.match(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), /REDLINE:BEGIN/);
});

test('denied capabilities become pendingAdmin and the run still completes', async () => {
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'denied', detail: 'needs admin' },
      { capability: 'push-protection', status: 'denied', detail: 'needs admin' },
      { capability: 'dependency-alerts', status: 'applied', detail: '' },
    ],
  });
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });

  assert.deepEqual(report.pendingAdmin, ['secret-scanning', 'push-protection']);
  assert.deepEqual(readConfig(cwd)?.pendingAdmin, ['secret-scanning', 'push-protection']);
  assert.equal(report.pullRequest?.number, 1, 'the PR must still be opened');
});

test('unsupported capabilities never become pendingAdmin', async () => {
  const platform = fakePlatform({
    policy: [
      { capability: 'merge-policy', status: 'applied', detail: '' },
      { capability: 'repo-property', status: 'unsupported', detail: 'azure has none' },
    ],
  });
  const cwd = repo();
  const report = await init(platform, { cwd, root, now });
  assert.ok(!report.pendingAdmin.includes('repo-property'));
});

test('a repo with 2.1 artifacts and no config is reported as a migration', async () => {
  const cwd = repo({
    'package.json': '{}',
    '.github/workflows/redline.yml': 'name: Redline\n',
  });
  const report = await init(fakePlatform(), { cwd, root, now });
  assert.equal(report.migratedFrom, '2.1');
});

test('re-running on an onboarded repo is a no-op report, not a second pull request', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });

  const second = fakePlatform({ failPullRequest: true });
  const report = await init(second, { cwd, root, now });
  assert.equal(report.alreadyOnboarded, true);
  assert.equal(report.pullRequest, null);
  assert.ok(!second.applied.includes('openPullRequest'));
});

test('.redline.json records the versions that produced it', async () => {
  const cwd = repo();
  await init(fakePlatform(), { cwd, root, now });
  const config = readConfig(cwd)!;
  assert.equal(config.host, 'github');
  assert.equal(config.onboardedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(typeof config.standardsVersion, 'string');
  assert.equal(typeof config.cliVersion, 'string');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test cli/commands/__tests__/init.test.ts`
Expected: FAIL — `Cannot find module '../init.ts'`.

- [ ] **Step 4: Write minimal implementation**

Create `cli/commands/init.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_VERSION } from '../core/version.ts';
import { readConfig, writeConfig, type MenuSelections } from '../config/redline-json.ts';
import { proposeProfile } from '../detect/stack.ts';
import { scanRepo } from '../detect/scan.ts';
import { loadManifest } from '../render/manifest.ts';
import { resolveProfile } from '../render/profile.ts';
import { render } from '../render/standards.ts';
import { isPending } from '../platforms/types.ts';
import type {
  AdminCapability,
  CapabilityOutcome,
  GateOptions,
  OwnershipRule,
  Platform,
  PullRequestRef,
} from '../platforms/types.ts';

export const DEFAULT_MENU: MenuSelections = {
  blockingGate: false,
  adrForLargeDiffs: true,
  accessibility: true,
  speckit: false,
  sensitivePathReviewers: true,
};

export const FLOOR_GATE: GateOptions = {
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt', 'redline-sync'],
};

export const SENSITIVE_PATHS: OwnershipRule[] = [
  { pattern: '/.github/workflows/', owners: ['@platform-engineering'] },
  { pattern: '/.github/CODEOWNERS', owners: ['@platform-engineering'] },
  { pattern: '/infra/', owners: ['@platform-engineering'] },
  { pattern: '/terraform/', owners: ['@platform-engineering'] },
  { pattern: 'Dockerfile', owners: ['@platform-engineering'] },
];

const ONBOARD_BRANCH = 'redline/onboard';

export interface InitOptions {
  cwd: string;
  root: string;
  profile?: string;
  vendors?: string[];
  menu?: Partial<MenuSelections>;
  now?: () => Date;
}

export interface InitReport {
  profile: string;
  files: string[];
  outcomes: CapabilityOutcome[];
  pendingAdmin: AdminCapability[];
  pullRequest: PullRequestRef | null;
  migratedFrom: string | null;
  alreadyOnboarded: boolean;
}

export async function init(platform: Platform, opts: InitOptions): Promise<InitReport> {
  const { cwd, root } = opts;
  const manifest = loadManifest(root);
  const menu = { ...DEFAULT_MENU, ...opts.menu };
  const now = opts.now ?? (() => new Date());

  const detected = opts.profile ?? proposeProfile(scanRepo(cwd)).profile;
  const { profile } = resolveProfile(manifest, detected);

  const existing = readConfig(cwd);
  const migratedFrom =
    existing === null && existsSync(join(cwd, '.github/workflows/redline.yml')) ? '2.1' : null;

  const ref = await platform.repoRef(cwd);
  const vendors = opts.vendors ?? Object.entries(manifest.vendors)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k);

  const rendered = render({ root, profile, out: cwd, vendors });

  const gate = await platform.installGate(ref, cwd, {
    ...FLOOR_GATE,
    ...(menu.adrForLargeDiffs ? {} : { adrDiffThreshold: Number.MAX_SAFE_INTEGER }),
  });

  const ownership = menu.sensitivePathReviewers
    ? await platform.ensureReviewOwnership(ref, cwd, SENSITIVE_PATHS)
    : { files: [], outcomes: [] };

  const security = await platform.enableSecurityFloor(ref);

  const policy = await platform.applyPolicy(ref, {
    requiredApprovals: 1,
    dismissStaleReviews: true,
    requireCodeOwnerReview: menu.sensitivePathReviewers,
    requireThreadResolution: true,
    requiredChecks: [],
    blocking: menu.blockingGate,
  });

  const outcomes = [
    ...gate.outcomes,
    ...ownership.outcomes,
    ...security.outcomes,
    ...policy.outcomes,
  ];
  const pendingAdmin = outcomes.filter(isPending).map((o) => o.capability);
  const files = [...rendered.written, ...gate.files, ...ownership.files];

  writeConfig(cwd, {
    standardsVersion: manifest.version,
    cliVersion: CLI_VERSION,
    host: platform.host,
    profile,
    vendors,
    menu,
    pendingAdmin,
    onboardedAt: now().toISOString(),
  });

  const alreadyOnboarded = existing !== null && rendered.written.length === 0;
  const pullRequest = alreadyOnboarded
    ? null
    : await platform.openPullRequest(ref, cwd, {
        branch: ONBOARD_BRANCH,
        title: `chore(redline): onboard to standards v${manifest.version}`,
        body: onboardBody(profile, manifest.version, pendingAdmin),
        labels: ['redline-sync'],
      });

  return { profile, files, outcomes, pendingAdmin, pullRequest, migratedFrom, alreadyOnboarded };
}

function onboardBody(profile: string, version: string, pendingAdmin: AdminCapability[]): string {
  const pending =
    pendingAdmin.length === 0
      ? 'Everything that needed repository settings was applied.'
      : `A repository administrator still needs to enable: ${pendingAdmin.join(', ')}. ` +
        `Until then this repository shows as partially onboarded.`;

  return [
    `Onboards this repository to Redline standards \`v${version}\` (profile: \`${profile}\`).`,
    '',
    'The merge gate runs **advisory** — it reports, it does not block. Promotion to blocking is a',
    'deliberate second step after a soak period.',
    '',
    'Generated content sits inside `<!-- REDLINE:BEGIN -->` markers; anything outside them is yours',
    'and was preserved. If a rule is wrong for this repository, raise it in the Redline source repo',
    'rather than editing it here, so every repository benefits.',
    '',
    pending,
  ].join('\n');
}
```

Note the order: files first, then host settings, then the pull request. Anything that can fail on permissions happens *after* the working tree is correct, so a denied call never costs the file-level work.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test cli/commands/__tests__/init.test.ts && npm run typecheck`
Expected: 12 passing tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/commands/init.ts cli/commands/__tests__/
git commit -m "feat(cli): redline init with floor, menu and permission degradation"
```

---

## Task 18: `redline verify`

Reads live state and compares it against what `.redline.json` claims. Also the gate's own implementation — `--gate` is the same checks, run inside CI, exiting non-zero on failure.

**Files:**
- Create: `cli/commands/verify.ts`
- Test: `cli/commands/__tests__/verify.test.ts`

**Interfaces:**
- Consumes: `Platform`, `readConfig`, `loadManifest`, `render`.
- Produces:
  - `interface VerifyFinding { check: string; ok: boolean; detail: string }`
  - `interface VerifyReport { findings: VerifyFinding[]; ok: boolean }`
  - `function verify(platform: Platform, opts: { cwd: string; root: string }): Promise<VerifyReport>`

**The five checks, from spec §6.4:**

1. The repository is onboarded at all (`.redline.json` present and parseable).
2. The required check name is one the host has **actually reported** on a real pull request.
3. The live merge policy matches the menu the repo chose.
4. The security floor is still enabled.
5. Rendered artifacts are not stale relative to the current standards version, and `pendingAdmin` is empty.

Check 2 **skips rather than fails** when the repository has no pull request yet — that is `setup-repo.sh`'s behaviour and it is right, because a fresh repo is not drifted, it is just new.

- [ ] **Step 1: Write the failing test**

Create `cli/commands/__tests__/verify.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform } from './fake-platform.ts';
import { init } from '../init.ts';
import { verify } from '../verify.ts';
import { CONFIG_FILE, readConfig, writeConfig } from '../../config/redline-json.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = (): Date => new Date('2026-09-01T00:00:00.000Z');

async function onboarded(): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), 'redline-verify-'));
  writeFileSync(join(cwd, 'package.json'), '{"dependencies":{"react":"19"}}');
  await init(fakePlatform(), { cwd, root, now });
  return cwd;
}

const find = (report: { findings: { check: string; ok: boolean }[] }, check: string) =>
  report.findings.find((f) => f.check === check);

test('a freshly onboarded repository verifies clean', async () => {
  const cwd = await onboarded();
  const report = await verify(fakePlatform(), { cwd, root });
  assert.equal(report.ok, true, JSON.stringify(report.findings, null, 2));
});

test('a repository with no .redline.json fails the onboarding check and stops', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'redline-verify-none-'));
  const report = await verify(fakePlatform(), { cwd, root });
  assert.equal(report.ok, false);
  assert.equal(find(report, 'onboarded')?.ok, false);
  assert.equal(report.findings.length, 1, 'nothing else is worth checking');
});

test('a required check the host has never reported is a failure', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, menu: { ...config.menu, blockingGate: true } });

  const platform = fakePlatform();
  await platform.applyPolicy(await platform.repoRef(cwd), {
    requiredApprovals: 1,
    dismissStaleReviews: true,
    requireCodeOwnerReview: true,
    requireThreadResolution: true,
    requiredChecks: ['redline-gate / typo'],
    blocking: true,
  });

  const report = await verify(platform, { cwd, root });
  assert.equal(find(report, 'check-name-reported')?.ok, false);
  assert.match(find(report, 'check-name-reported')?.detail ?? '', /never reported/);
});

test('a repository with no pull request yet skips the check-name check rather than failing', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform();
  platform.latestPullRequestNumber = async () => null;
  const report = await verify(platform, { cwd, root });
  assert.equal(report.ok, true);
  assert.match(find(report, 'check-name-reported')?.detail ?? '', /no pull request yet/);
});

test('a disabled security floor is a failure', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    security: [
      { capability: 'secret-scanning', status: 'applied', detail: '' },
      { capability: 'push-protection', status: 'denied', detail: 'off' },
    ],
  });
  const report = await verify(platform, { cwd, root });
  assert.equal(find(report, 'security-floor')?.ok, false);
});

test('a non-empty pendingAdmin means partially onboarded, not verified', async () => {
  const cwd = await onboarded();
  const config = readConfig(cwd)!;
  writeConfig(cwd, { ...config, pendingAdmin: ['secret-scanning'] });
  const report = await verify(fakePlatform(), { cwd, root });
  assert.equal(find(report, 'pending-admin')?.ok, false);
  assert.match(find(report, 'pending-admin')?.detail ?? '', /partially onboarded/);
});

test('stale rendered artifacts are drift', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, 'AGENTS.md'), 'someone deleted the block\n');
  const report = await verify(fakePlatform(), { cwd, root });
  assert.equal(find(report, 'artifacts-current')?.ok, false);
});

test('a corrupt config surfaces as a failed onboarding check, not a crash', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, CONFIG_FILE), '{ not json');
  const report = await verify(fakePlatform(), { cwd, root });
  assert.equal(report.ok, false);
  assert.equal(find(report, 'onboarded')?.ok, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/commands/__tests__/verify.test.ts`
Expected: FAIL — `Cannot find module '../verify.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `cli/commands/verify.ts`:

```ts
import { isRedlineError } from '../core/errors.ts';
import { readConfig, type RedlineConfig } from '../config/redline-json.ts';
import { loadManifest } from '../render/manifest.ts';
import { render } from '../render/standards.ts';
import type { Platform } from '../platforms/types.ts';

export interface VerifyFinding {
  check: string;
  ok: boolean;
  detail: string;
}

export interface VerifyReport {
  findings: VerifyFinding[];
  ok: boolean;
}

export interface VerifyOptions {
  cwd: string;
  root: string;
}

export async function verify(platform: Platform, opts: VerifyOptions): Promise<VerifyReport> {
  const findings: VerifyFinding[] = [];
  const add = (check: string, ok: boolean, detail: string): void => {
    findings.push({ check, ok, detail });
  };

  let config: RedlineConfig | null;
  try {
    config = readConfig(opts.cwd);
  } catch (error) {
    const message = isRedlineError(error) ? error.message : String(error);
    add('onboarded', false, message);
    return { findings, ok: false };
  }
  if (!config) {
    add('onboarded', false, 'no .redline.json — run: npx redline init');
    return { findings, ok: false };
  }
  add('onboarded', true, `profile ${config.profile}, standards v${config.standardsVersion}`);

  const ref = await platform.repoRef(opts.cwd);
  const policy = await platform.readPolicy(ref);

  add(
    'merge-policy',
    policy !== null && policy.blocking === config.menu.blockingGate,
    policy === null
      ? 'no Redline merge policy found on the host'
      : `policy is ${policy.blocking ? 'blocking' : 'advisory'}, config says ${
          config.menu.blockingGate ? 'blocking' : 'advisory'
        }`
  );

  const required = policy?.requiredChecks ?? [];
  if (required.length === 0) {
    add('check-name-reported', true, 'advisory gate — no required check to verify');
  } else {
    const pr = await platform.latestPullRequestNumber(ref);
    if (pr === null) {
      add('check-name-reported', true, 'no pull request yet — open one to confirm the check reports');
    } else {
      const reported = await platform.readReportedCheckNames(ref, pr);
      const missing = required.filter((name) => !reported.includes(name));
      add(
        'check-name-reported',
        missing.length === 0,
        missing.length === 0
          ? `required checks reported on PR #${pr}`
          : `${missing.join(', ')} was never reported on PR #${pr} — the policy will block every pull request`
      );
    }
  }

  const security = await platform.readSecurityState(ref);
  const off = security.outcomes.filter((o) => o.status === 'denied').map((o) => o.capability);
  add(
    'security-floor',
    off.length === 0,
    off.length === 0 ? 'security floor enabled' : `disabled: ${off.join(', ')}`
  );

  const manifest = loadManifest(opts.root);
  const stale = render({
    root: opts.root,
    profile: config.profile,
    out: opts.cwd,
    vendors: config.vendors,
    check: true,
  }).stale;
  add(
    'artifacts-current',
    stale.length === 0,
    stale.length === 0
      ? `rendered artifacts match standards v${manifest.version}`
      : `stale: ${stale.join(', ')}`
  );

  add(
    'pending-admin',
    config.pendingAdmin.length === 0,
    config.pendingAdmin.length === 0
      ? 'nothing awaiting an administrator'
      : `partially onboarded — an administrator must still enable: ${config.pendingAdmin.join(', ')}`
  );

  return { findings, ok: findings.every((f) => f.ok) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/commands/__tests__/verify.test.ts && npm run typecheck`
Expected: 8 passing tests, no type errors.

- [ ] **Step 5: Commit**

```bash
git add cli/commands/verify.ts cli/commands/__tests__/verify.test.ts
git commit -m "feat(cli): redline verify against live host state"
```

---

## Task 19: The CLI entry point

Argument parsing, output, exit codes. No business logic — if a decision is made here, it is in the wrong file.

**Files:**
- Create: `cli/core/log.ts`
- Create: `cli/bin/redline.ts`
- Test: `cli/core/__tests__/log.test.ts`
- Test: `cli/bin/__tests__/redline.test.ts`

**Interfaces:**
- Consumes: `init`, `verify`, `resolvePlatform`, `RedlineError`.
- Produces:
  - `interface Sink { out(line: string): void; err(line: string): void }`
  - `function createLog(sink?: Sink): Log` with `info`, `warn`, `error`, `report(findings)`
  - `function run(argv: string[], deps?: RunDeps): Promise<number>` — returns an exit code, never calls `process.exit`

**`run` returns an exit code rather than exiting.** That is what makes the whole CLI testable in-process. Only the last two lines of the file touch `process`.

- [ ] **Step 1: Write the failing tests**

Create `cli/core/__tests__/log.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLog } from '../log.ts';

function capture(): { sink: { out(l: string): void; err(l: string): void }; lines: string[] } {
  const lines: string[] = [];
  return { sink: { out: (l) => lines.push(l), err: (l) => lines.push(`ERR ${l}`) }, lines };
}

test('findings render with a pass or fail marker and their detail', () => {
  const { sink, lines } = capture();
  createLog(sink).report([
    { check: 'onboarded', ok: true, detail: 'profile web' },
    { check: 'security-floor', ok: false, detail: 'disabled: push-protection' },
  ]);
  assert.match(lines[0] ?? '', /^ok {2}onboarded {2}·? ?profile web$|onboarded/);
  assert.ok(lines.some((l) => l.includes('FAIL') && l.includes('security-floor')));
  assert.ok(lines.some((l) => l.includes('disabled: push-protection')));
});

test('errors carry their hint on a second line', () => {
  const { sink, lines } = capture();
  createLog(sink).error('no credentials found', 'run: gh auth login');
  assert.ok(lines[0]?.startsWith('ERR '));
  assert.ok(lines.some((l) => l.includes('gh auth login')));
});
```

Create `cli/bin/__tests__/redline.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../redline.ts';
import { fakePlatform } from '../../commands/__tests__/fake-platform.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function deps(cwd: string) {
  const lines: string[] = [];
  return {
    lines,
    opts: {
      cwd,
      root,
      sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
      resolvePlatform: async () => fakePlatform(),
    },
  };
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-bin-'));
  writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"19"}}');
  return dir;
}

test('no command prints usage and exits 2', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run([], opts), 2);
  assert.ok(lines.some((l) => l.includes('redline init')));
});

test('an unknown command exits 2 and names it', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['refactor'], opts), 2);
  assert.ok(lines.some((l) => l.includes('refactor')));
});

test('--version prints the version and exits 0', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['--version'], opts), 0);
  assert.equal(lines.length, 1);
});

test('init onboards and exits 0', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init'], opts), 0);
  assert.ok(lines.some((l) => l.includes('web')));
});

test('init --profile passes the override through', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--profile', 'infra'], opts), 0);
  assert.ok(lines.some((l) => l.includes('infra')));
});

test('init --blocking promotes the gate', async () => {
  const cwd = repo();
  const { opts } = deps(cwd);
  assert.equal(await run(['init', '--blocking'], opts), 0);
});

test('verify on a repo that was never onboarded exits 1', async () => {
  const { opts } = deps(mkdtempSync(join(tmpdir(), 'redline-bin-bare-')));
  assert.equal(await run(['verify'], opts), 1);
});

test('verify after init exits 0', async () => {
  const cwd = repo();
  const { opts } = deps(cwd);
  await run(['init'], opts);
  assert.equal(await run(['verify'], opts), 0);
});

test('a RedlineError maps to its own exit code and prints its hint', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  const failing = {
    ...opts,
    resolvePlatform: async () => {
      const { RedlineError } = await import('../../core/errors.ts');
      throw new RedlineError('permission', 'no credentials', 'run: gh auth login');
    },
  };
  assert.equal(await run(['init'], failing), 3);
  assert.ok(lines.some((l) => l.includes('gh auth login')));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test cli/core/__tests__/log.test.ts cli/bin/__tests__/redline.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `cli/core/log.ts`**

```ts
export interface Sink {
  out(line: string): void;
  err(line: string): void;
}

export interface Finding {
  check: string;
  ok: boolean;
  detail: string;
}

export interface Log {
  info(line: string): void;
  warn(line: string): void;
  error(message: string, hint?: string): void;
  report(findings: Finding[]): void;
}

const consoleSink: Sink = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export function createLog(sink: Sink = consoleSink): Log {
  return {
    info: (line) => sink.out(line),
    warn: (line) => sink.out(`warn  ${line}`),
    error(message, hint) {
      sink.err(`error  ${message}`);
      if (hint) sink.err(`       ${hint}`);
    },
    report(findings) {
      for (const finding of findings) {
        const marker = finding.ok ? 'ok  ' : 'FAIL';
        sink.out(`${marker}  ${finding.check.padEnd(22)} ${finding.detail}`);
      }
    },
  };
}
```

- [ ] **Step 4: Write `cli/bin/redline.ts`**

```ts
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLI_VERSION } from '../core/version.ts';
import { createLog, type Sink } from '../core/log.ts';
import { exitCodeFor, isRedlineError } from '../core/errors.ts';
import { resolvePlatform as defaultResolvePlatform } from '../platforms/resolve.ts';
import { init } from '../commands/init.ts';
import { verify } from '../commands/verify.ts';
import type { Platform } from '../platforms/types.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const USAGE = [
  'redline — engineering control plane',
  '',
  '  redline init [--profile <name>] [--blocking] [--no-a11y] [--speckit]',
  '      onboard this repository: standards, security floor, merge gate (advisory), registration',
  '',
  '  redline verify [--gate]',
  '      check this repository still matches what .redline.json claims',
  '',
  '  redline --version',
].join('\n');

export interface RunDeps {
  cwd?: string;
  root?: string;
  sink?: Sink;
  resolvePlatform?: (cwd: string) => Promise<Platform>;
}

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const root = deps.root ?? PACKAGE_ROOT;
  const log = createLog(deps.sink);
  const resolve = deps.resolvePlatform ?? ((dir: string) => defaultResolvePlatform(dir));

  const [command, ...rest] = argv;

  if (command === '--version' || command === '-v') {
    log.info(CLI_VERSION);
    return 0;
  }
  if (command === undefined || command === '--help' || command === '-h') {
    log.info(USAGE);
    return command === undefined ? 2 : 0;
  }

  try {
    if (command === 'init') {
      const { values } = parseArgs({
        args: rest,
        options: {
          profile: { type: 'string' },
          blocking: { type: 'boolean', default: false },
          'no-a11y': { type: 'boolean', default: false },
          speckit: { type: 'boolean', default: false },
        },
        allowPositionals: false,
      });

      const platform = await resolve(cwd);
      const report = await init(platform, {
        cwd,
        root,
        ...(values.profile ? { profile: values.profile } : {}),
        menu: {
          blockingGate: values.blocking === true,
          accessibility: values['no-a11y'] !== true,
          speckit: values.speckit === true,
        },
      });

      log.info(`profile ${report.profile}`);
      if (report.migratedFrom) log.info(`migrated from ${report.migratedFrom}`);
      for (const file of report.files) log.info(`  write  ${file}`);
      for (const outcome of report.outcomes) {
        log.info(`  ${outcome.status.padEnd(11)} ${outcome.capability}  ${outcome.detail}`);
      }
      if (report.pendingAdmin.length > 0) {
        log.warn(
          `partially onboarded — an administrator must still enable: ${report.pendingAdmin.join(', ')}`
        );
      }
      if (report.pullRequest) log.info(`pull request: ${report.pullRequest.url}`);
      else if (report.alreadyOnboarded) log.info('already onboarded — nothing to change');
      return 0;
    }

    if (command === 'verify') {
      const { values } = parseArgs({
        args: rest,
        options: { gate: { type: 'boolean', default: false } },
        allowPositionals: false,
      });
      const platform = await resolve(cwd);
      const report = await verify(platform, { cwd, root });
      log.report(report.findings);
      if (values.gate === true) {
        log.info(report.ok ? 'Redline gate passed.' : 'Redline gate failed.');
      }
      return report.ok ? 0 : 1;
    }

    log.error(`unknown command "${command}"`, 'run: redline --help');
    return 2;
  } catch (error) {
    if (isRedlineError(error)) {
      log.error(error.message, error.hint);
      return error.exitCode;
    }
    log.error(error instanceof Error ? error.message : String(error));
    return exitCodeFor('host');
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  process.exitCode = await run(process.argv.slice(2));
}
```

The `verify` branch accepts `--gate` because `platforms/azure/gate-template.yml` calls `redline verify --gate` from CI. In Phase 1 the flag changes nothing but the closing line, so the pipeline template never needs editing when Phase 2 gives the gate more to do.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: everything green.

- [ ] **Step 6: Commit**

```bash
git add cli/core/log.ts cli/bin/redline.ts cli/core/__tests__/log.test.ts cli/bin/__tests__/redline.test.ts
git commit -m "feat(cli): entry point with parseArgs, exit codes and testable output"
```

---

## Task 20: Command rendering per host

The slash commands are thin wrappers. Logic never lives in markdown, because four commands times four hosts is sixteen copies that drift silently (spec §4.2).

**Files:**
- Create: `commands/redline-init.md`
- Create: `commands/redline-verify.md`
- Create: `cli/render/commands.ts`
- Test: `cli/render/__tests__/commands.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except `RedlineError`.
- Produces:
  - `interface CommandSource { name: string; description: string; body: string }`
  - `function loadCommands(root: string): CommandSource[]`
  - `function renderCommands(opts: { root: string; out: string; hosts: string[] }): string[]`
  - `const COMMAND_HOSTS: Record<string, (cmd: CommandSource) => { path: string; body: string }>`

**Host layouts:**

| Host | Path | Frontmatter |
|---|---|---|
| `copilot` | `.github/prompts/<name>.prompt.md` | `mode: agent` + `description` |
| `claude` | `.claude/commands/<name>.md` | `description` |
| `opencode` | `.opencode/command/<name>.md` | `description` |
| `cursor` | `.cursor/commands/<name>.md` | none |

- [ ] **Step 1: Write the command sources**

Create `commands/redline-init.md`:

```markdown
---
description: Onboard this repository to Redline — standards, security floor and merge gate
---

Run `npx redline@latest init` in the repository root and report what it printed.

The command is not interactive by default. If the engineer asked for something specific,
pass it through:

- a stack override: `--profile <name>`
- a blocking rather than advisory gate: `--blocking`
- skip the accessibility standard: `--no-a11y`
- scaffold SpecKit: `--speckit`

When it finishes, tell them three things and nothing else:

1. which profile was detected and what was written
2. the pull request URL
3. anything under `partially onboarded` — that list needs a repository administrator, and
   until it is cleared this repository is not fully onboarded

Do not edit the files it generated. Content inside `<!-- REDLINE:BEGIN -->` markers is
owned by Redline and is replaced on the next sync.
```

Create `commands/redline-verify.md`:

```markdown
---
description: Check this repository still matches the standards and guardrails it claims
---

Run `npx redline@latest verify` in the repository root and report the findings table.

Each line is a check. For any `FAIL`, explain what it means and what fixes it:

- `onboarded` — the repository has no `.redline.json`. Run `redline init`.
- `merge-policy` — the live branch policy no longer matches `.redline.json`. Re-run
  `redline init` to reapply it.
- `check-name-reported` — the required check name has never been reported by a real run.
  This blocks every pull request in the repository. Fix the caller job id, or the policy.
- `security-floor` — secret scanning or push protection has been turned off.
- `artifacts-current` — the rendered standards are stale. Merge the open sync pull request.
- `pending-admin` — a repository administrator still has work to do.

Do not attempt to fix host settings yourself. Report and stop.
```

- [ ] **Step 2: Write the failing test**

Create `cli/render/__tests__/commands.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands, renderCommands } from '../commands.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tmp = (): string => mkdtempSync(join(tmpdir(), 'redline-commands-'));

test('both command sources load with a name and description', () => {
  const commands = loadCommands(root).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(
    commands.map((c) => c.name),
    ['redline-init', 'redline-verify']
  );
  assert.ok(commands[0]!.description.length > 0);
  assert.ok(!commands[0]!.body.startsWith('---'), 'frontmatter must be stripped from the body');
});

test('copilot prompts land in .github/prompts with agent mode', () => {
  const out = tmp();
  const written = renderCommands({ root, out, hosts: ['copilot'] });
  assert.ok(written.includes('.github/prompts/redline-init.prompt.md'));
  const body = readFileSync(join(out, '.github/prompts/redline-init.prompt.md'), 'utf8');
  assert.ok(body.startsWith('---\nmode: agent\ndescription: '));
});

test('claude, opencode and cursor each get their own layout', () => {
  const out = tmp();
  const written = renderCommands({ root, out, hosts: ['claude', 'opencode', 'cursor'] });
  assert.ok(written.includes('.claude/commands/redline-verify.md'));
  assert.ok(written.includes('.opencode/command/redline-verify.md'));
  assert.ok(written.includes('.cursor/commands/redline-verify.md'));
  assert.ok(!readFileSync(join(out, '.cursor/commands/redline-verify.md'), 'utf8').startsWith('---'));
});

test('every rendered command body is identical across hosts', () => {
  const out = tmp();
  renderCommands({ root, out, hosts: ['claude', 'cursor'] });
  const strip = (s: string): string => s.replace(/^---\n[\s\S]*?\n---\n\n/, '');
  assert.equal(
    strip(readFileSync(join(out, '.claude/commands/redline-init.md'), 'utf8')),
    strip(readFileSync(join(out, '.cursor/commands/redline-init.md'), 'utf8'))
  );
});

test('an unknown host is rejected by name', () => {
  assert.throws(() => renderCommands({ root, out: tmp(), hosts: ['emacs'] }), /unknown command host "emacs"/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test cli/render/__tests__/commands.test.ts`
Expected: FAIL — `Cannot find module '../commands.ts'`.

- [ ] **Step 4: Write `cli/render/commands.ts`**

```ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RedlineError } from '../core/errors.ts';

export interface CommandSource {
  name: string;
  description: string;
  body: string;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function loadCommands(root: string): CommandSource[] {
  const dir = join(root, 'commands');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const raw = readFileSync(join(dir, file), 'utf8');
      const match = FRONTMATTER.exec(raw);
      const description = /description:\s*(.+)/.exec(match?.[1] ?? '')?.[1]?.trim() ?? '';
      return {
        name: file.replace(/\.md$/, ''),
        description,
        body: raw.slice(match?.[0].length ?? 0).trimStart(),
      };
    });
}

type HostRenderer = (cmd: CommandSource) => { path: string; body: string };

export const COMMAND_HOSTS: Record<string, HostRenderer> = {
  copilot: (cmd) => ({
    path: `.github/prompts/${cmd.name}.prompt.md`,
    body: `---\nmode: agent\ndescription: ${cmd.description}\n---\n\n${cmd.body}`,
  }),
  claude: (cmd) => ({
    path: `.claude/commands/${cmd.name}.md`,
    body: `---\ndescription: ${cmd.description}\n---\n\n${cmd.body}`,
  }),
  opencode: (cmd) => ({
    path: `.opencode/command/${cmd.name}.md`,
    body: `---\ndescription: ${cmd.description}\n---\n\n${cmd.body}`,
  }),
  cursor: (cmd) => ({ path: `.cursor/commands/${cmd.name}.md`, body: cmd.body }),
};

export interface RenderCommandsOptions {
  root: string;
  out: string;
  hosts: string[];
}

export function renderCommands(opts: RenderCommandsOptions): string[] {
  const commands = loadCommands(opts.root);
  const written: string[] = [];

  for (const host of opts.hosts) {
    const renderer = COMMAND_HOSTS[host];
    if (!renderer) {
      throw new RedlineError(
        'usage',
        `unknown command host "${host}". Known: ${Object.keys(COMMAND_HOSTS).join(', ')}`
      );
    }
    for (const command of commands) {
      const { path, body } = renderer(command);
      const target = join(opts.out, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${body.trimEnd()}\n`);
      written.push(path);
    }
  }
  return written;
}
```

- [ ] **Step 5: Wire command rendering into `init`**

In `cli/commands/init.ts`, after the `render({ ... })` call, add:

```ts
  const commandFiles = renderCommands({
    root,
    out: cwd,
    hosts: vendors.flatMap((v) => (v in COMMAND_HOSTS ? [v] : [])),
  });
```

Import `renderCommands` and `COMMAND_HOSTS` from `../render/commands.ts`, and include `commandFiles` in the `files` array:

```ts
  const files = [...rendered.written, ...commandFiles, ...gate.files, ...ownership.files];
```

The `flatMap` filter is deliberate: `agents` is a standards vendor with no command surface, and `opencode` is a command host with no standards surface. The two lists are not the same set.

- [ ] **Step 6: Run every test**

Run: `npm test && npm run typecheck`
Expected: everything green, including Task 17's tests with the extra files in the report.

- [ ] **Step 7: Commit**

```bash
git add commands/ cli/render/commands.ts cli/render/__tests__/commands.test.ts cli/commands/init.ts
git commit -m "feat(cli): slash commands rendered per host as thin CLI wrappers"
```

---

## Task 21: Retire the shell scripts, rewrite the front door, ship it

Only now, with the CLI proven, do the scripts it replaces come out.

**Files:**
- Delete: `scripts/setup-repo.sh`, `scripts/sync.sh`, `scripts/render.mjs`
- Delete: `cli/render/__tests__/golden.test.ts`
- Modify: `scripts/validate.mjs`, `scripts/score-seeds.mjs`, `scripts/collect-telemetry.mjs`, `scripts/build-dashboard.mjs` (import path only)
- Modify: `cli/render/profile.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Create: `.releaserc.json`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Confirm the port before deleting the oracle**

```bash
npm test
```

Every golden test must pass. If any fails, stop — the port is not done and nothing below may proceed.

- [ ] **Step 2: Delete the replaced scripts and the golden test**

```bash
git rm scripts/setup-repo.sh scripts/sync.sh scripts/render.mjs cli/render/__tests__/golden.test.ts
```

The golden test goes with its oracle. What replaces it as the port's safety net is `cli/render/__tests__/standards.test.ts`, which is behavioural rather than comparative.

- [ ] **Step 3: Repoint the remaining scripts**

`scripts/validate.mjs` and the other `.mjs` scripts import from `scripts/lib/rules.mjs`, which does not move. Only `scripts/validate.mjs` referenced `render.mjs`. Search and fix:

```bash
grep -rn "render\.mjs\|setup-repo\.sh\|sync\.sh" scripts/ workflows/ .github/ README.md
```

Every hit must be replaced with the CLI equivalent:

| Was | Now |
|---|---|
| `node scripts/render.mjs --self` | `node cli/bin/redline.ts render --self` — **not built in Phase 1**; instead call `render({ root, profile: 'tooling', out: root })` from a three-line `scripts/render-self.mjs` shim |
| `node scripts/render.mjs --self --check` | the same shim with `check: true`, exiting 1 on stale |
| `bash scripts/setup-repo.sh <repo>` | `npx redline init` |
| `bash scripts/setup-repo.sh <repo> --verify` | `npx redline verify` |
| `bash scripts/sync.sh` | not replaced in Phase 1 — see the note below |

Create `scripts/render-self.mjs`:

```js
#!/usr/bin/env node
// Renders this repository's own standards artifacts. The estate-wide renderer lives
// in cli/render/standards.ts; this is the two-line shim CI calls.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../cli/render/standards.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const result = render({ root, profile: 'tooling', out: root, check });

if (result.stale.length) {
  console.error(`Rendered output is stale. Run: node scripts/render-self.mjs\n  ${result.stale.join('\n  ')}`);
  process.exit(1);
}
result.written.forEach((f) => console.log(`  write  ${f}`));
result.removed.forEach((f) => console.log(`  prune  ${f}`));
if (!result.written.length && !result.removed.length) console.log('  up to date');
```

**`scripts/sync.sh` is deleted but not replaced in Phase 1.** Spec §9 makes `redline sync` a CLI command, but sync is a *control-plane* concern — it pushes to hundreds of repositories and belongs with the telemetry work in Phase 3, not with onboarding. Deleting it here without a replacement means the estate has no automated standards distribution between Phase 1 and Phase 3. **That is a real gap and must be an explicit decision, not a side effect.** If Phase 3 is not immediately following Phase 1, keep `scripts/sync.sh` on disk and delete it in the Phase 3 plan instead. Note which you chose in `CHANGELOG.md`.

- [ ] **Step 4: Convert the renderer's errors now the oracle is gone**

In `cli/render/profile.ts`, the two `throw new Error(...)` calls existed to match `scripts/render.mjs` byte-for-byte. That constraint is gone. Convert them:

```ts
    throw new RedlineError(
      'usage',
      `unknown profile "${name}". Known: ${Object.keys(manifest.profiles).join(', ')} ` +
        `(aliases: ${Object.keys(manifest.profileAliases).join(', ')})`
    );
```

and

```ts
    if (!stack) {
      throw new RedlineError('usage', `profile "${key}" references unknown stack "${id}"`);
    }
```

Add `import { RedlineError } from '../core/errors.ts';`. `cli/render/__tests__/profile.test.ts` asserts on the message with `/^Error: unknown profile/` — change that assertion to `/unknown profile "nope"/` and re-run.

- [ ] **Step 5: Update CI**

In `.github/workflows/ci.yml`:

- replace `node scripts/render.mjs --self --check` with `node scripts/render-self.mjs --check`
- replace the "Every profile renders cleanly" step's `node scripts/render.mjs --profile "$profile" --out "$out"` with `node cli/bin/redline.ts --version >/dev/null` plus a small node script calling `render` per profile, or simply delete the step — `cli/render/__tests__/standards.test.ts` covers it and `npm test` already runs
- delete the "Unknown profile fails loudly" step for the same reason
- in the `lint` job, remove `scripts/*.sh` from the `shellcheck` line if no `.sh` files remain, and remove `templates/redline.yml` from `actionlint` only if you deleted it (you did not — keep it)

- [ ] **Step 6: Rewrite the README front door**

Replace the eight-step rollout in `README.md` with:

```markdown
## Onboard a repository

```sh
cd your-repo
npx redline@latest init
```

That is the whole procedure. It detects your stack, renders the standards for it, installs
the merge-readiness template and the gate (advisory — it reports, it does not block),
turns on the security floor, and opens a pull request. Anything that needed repository
admin rights you do not have is listed at the end for an administrator to run.

```sh
npx redline@latest verify
```

Checks the repository still matches what it claims. Run it any time; the control plane runs
it across the estate weekly.

Both GitHub and Azure DevOps are supported. Redline detects which from your git remote.
```

Keep everything in the README about what the standards are and how measurement works. Delete only the rollout procedure.

- [ ] **Step 7: Add the release pipeline**

Create `.releaserc.json`:

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    "@semantic-release/npm",
    ["@semantic-release/github", { "assets": [{ "path": "dist/redline-*", "label": "redline CLI" }] }],
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md", "package.json", "standards/manifest.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]"
      }
    ]
  ]
}
```

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org

      - run: npm ci

      - name: Gate before publish
        run: |
          set -euo pipefail
          npm run typecheck
          npm test
          node scripts/assign-rule-ids.mjs --check
          node scripts/validate.mjs
          node scripts/render-self.mjs --check

      - name: Stamp the standards version
        run: |
          node -e "
            const fs = require('node:fs');
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const manifest = JSON.parse(fs.readFileSync('standards/manifest.json', 'utf8'));
            manifest.version = pkg.version;
            fs.writeFileSync('standards/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
          "

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx --yes semantic-release
```

**The single-file executables (spec §16, R3) are not built here.** A cross-OS SEA build matrix is its own task with its own failure modes, and Phase 1 ships with the `npx` front door only. `platforms/azure/gate-template.yml` therefore uses `npx --yes redline@latest`, which requires the build agent to reach npm. **If any Azure market has air-gapped agents, that market cannot run the gate until the executables ship** — record it in `CHANGELOG.md` as a known limitation rather than discovering it during the pilot.

- [ ] **Step 8: Update the changelog**

Add a `## 3.0.0` entry to `CHANGELOG.md` describing: the CLI, both hosts, the advisory-by-default gate, `pendingAdmin` and partial onboarding, and the two known limitations above (no sync replacement yet; no offline executables yet). Keep the "Not yet measured" section — Phase 1 changes nothing about measurement.

- [ ] **Step 9: Run everything one last time**

```bash
npm test
npm run typecheck
node scripts/assign-rule-ids.mjs --check
node scripts/validate.mjs
node scripts/render-self.mjs --check
```

All five must pass.

- [ ] **Step 10: Commit and open the pull request**

```bash
git add -A
git commit -m "feat(cli)!: replace the shell rollout with redline init and redline verify

BREAKING CHANGE: scripts/setup-repo.sh and scripts/render.mjs are removed. Onboarding is
now npx redline@latest init, on GitHub and Azure DevOps."
git push --set-upstream origin feat/redline-v3-cli
gh pr create --fill
```

---

## Deliberate gaps in Phase 1

Three things the spec puts in Phase 1 that this plan knowingly does not deliver. Each is a
decision, not an oversight, and each is called out so it cannot be mistaken for done.

**1. The registry is not built.** Spec §13 lists "Registry and `.redline.json`" in Phase 1.
This plan delivers `.redline.json` only. The registry is a *derived* nightly scan of both
hosts for repositories carrying that file (spec §4.3), which makes it control-plane work
sitting alongside telemetry — Phase 3. Delivering `.redline.json` first is the right order:
the derived cache cannot exist before the thing it derives from. Until Phase 3, the list of
onboarded repositories is whatever `sync-targets.txt` says, maintained by hand.

**2. `--speckit` is recorded, not scaffolded.** The flag is accepted and stored in
`.redline.json`, so a repository's choice is captured from day one and the later scaffolding
task knows where to look. Seeding `.specify/` templates lands in Phase 4 with the rest of the
optional menu. A repository that passes `--speckit` in Phase 1 gets the record and no files.

**3. `--no-a11y` toggles a standard that does not exist yet.** The accessibility rules are
harvested from ai-sdlc-kit in Phase 4 (spec §9), pending R5. The flag is wired now so the
menu shape is stable and no repository has to be re-onboarded to gain the option. In Phase 1
it changes the recorded config and nothing else.

All three follow the same rule: **record the decision in Phase 1, act on it later.** The
alternative — adding menu items in a later phase — would mean every already-onboarded
repository has a config missing keys the parser expects, which is a migration for no reason.

---

## Acceptance for Phase 1

From spec §13, checked against reality rather than against this document:

- [ ] One **GitHub** repository onboarded by a single command, by an engineer who did not read a rollout document.
- [ ] One **Azure DevOps** repository onboarded by the same command.
- [ ] Both pass `redline verify`.
- [ ] A repository where the operator lacks admin rights completes onboarding, opens its pull request, and reports its `pendingAdmin` list correctly.
- [ ] `redline verify` on a repository whose required check name was deliberately broken reports `check-name-reported` as FAIL.

**Exit:** a market engineer onboards their own repository without reading a rollout document.
