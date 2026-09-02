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

test('--help prints usage and exits 0', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['--help'], opts), 0);
  assert.ok(lines.some((l) => l.includes('redline init')));
});

test('an unknown flag exits 2', async () => {
  const { opts, lines } = deps(repo());
  assert.equal(await run(['init', '--nope'], opts), 2);
  assert.ok(lines.length > 0);
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

test('a host RedlineError exits 4', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  const failing = {
    ...opts,
    resolvePlatform: async () => {
      const { RedlineError } = await import('../../core/errors.ts');
      throw new RedlineError('host', 'GitHub returned HTTP 502 reading repo');
    },
  };
  assert.equal(await run(['init'], failing), 4);
  assert.ok(lines.some((l) => l.includes('GitHub returned HTTP 502')));
});

test('an unknown profile is a usage RedlineError and exits 2 without a stack trace', async () => {
  const cwd = repo();
  const { opts, lines } = deps(cwd);
  assert.equal(await run(['init', '--profile', 'not-a-real-profile'], opts), 2);
  assert.ok(lines.some((l) => l.includes('unknown profile')));
  assert.ok(!lines.some((l) => l.includes('at Object.') || l.includes('.ts:')));
});
