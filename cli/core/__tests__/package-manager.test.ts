import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addCommand, detectRunner, pinRedline, redlineCommand, redlineCommandIn } from '../package-manager.ts';

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-pm-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

function withProject(files: Record<string, string>, check: (dir: string) => void): void {
  const dir = project(files);
  try {
    check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Go, Java, Terraform: no Node at all, so npx is the only route and nothing
// can be pinned.
test('a repository with no package.json runs Redline through npx and cannot pin it', () => {
  withProject({}, (dir) => {
    const runner = detectRunner(dir);
    assert.equal(runner.packageManager, null);
    assert.equal(redlineCommand(runner, 'init'), 'npx redlinegate init');
    assert.equal(addCommand(runner, '0.2.8'), null);
  });
});

// The case that started this: `pnpm init` writes devEngines naming pnpm, and npm
// 10.9+ then refuses to run npx in the project before Redline is downloaded.
test('a project whose devEngines names pnpm is never told to use npx', () => {
  const manifest = JSON.stringify({
    name: 'demo',
    devEngines: { packageManager: { name: 'pnpm', version: '12.11.2', onFail: 'download' } },
  });
  withProject({ 'package.json': manifest }, (dir) => {
    assert.equal(redlineCommandIn(dir, 'init'), 'pnpm dlx redlinegate init');
  });
});

test('a project that depends on Redline runs its own copy, through its own package manager', () => {
  const pinned = JSON.stringify({ devDependencies: { redlinegate: '0.2.8' } });
  withProject({ 'package.json': pinned, 'pnpm-lock.yaml': '' }, (dir) => {
    assert.equal(redlineCommandIn(dir, 'review'), 'pnpm redline review');
  });
  withProject({ 'package.json': pinned, 'yarn.lock': '' }, (dir) => {
    assert.equal(redlineCommandIn(dir, 'review'), 'yarn redline review');
  });
  withProject({ 'package.json': pinned, 'bun.lock': '' }, (dir) => {
    assert.equal(redlineCommandIn(dir, 'review'), 'bun run redline review');
  });
  // Never `npx redline`: on a clone without node_modules that fetches an
  // unrelated package called redline.
  withProject({ 'package.json': pinned, 'package-lock.json': '' }, (dir) => {
    assert.equal(redlineCommandIn(dir, 'review'), 'npx redlinegate review');
  });
});

test('the packageManager field outranks a lockfile, and a lockfile outranks the npm default', () => {
  withProject(
    { 'package.json': JSON.stringify({ packageManager: 'pnpm@12.6.0+sha512.abc' }), 'package-lock.json': '' },
    (dir) => assert.equal(detectRunner(dir).packageManager, 'pnpm')
  );
  withProject({ 'package.json': '{}', 'yarn.lock': '' }, (dir) => {
    assert.equal(detectRunner(dir).packageManager, 'yarn');
  });
  withProject({ 'package.json': '{}' }, (dir) => {
    assert.equal(detectRunner(dir).packageManager, 'npm');
  });
});

test('a package.json that does not parse is treated as no Node project, not a crash', () => {
  withProject({ 'package.json': '{ not json' }, (dir) => {
    assert.equal(detectRunner(dir).packageManager, null);
  });
});

test('the add command pins the exact version and skips install scripts', () => {
  withProject({ 'package.json': '{}', 'pnpm-lock.yaml': '' }, (dir) => {
    assert.deepEqual(addCommand(detectRunner(dir), '0.2.8'), {
      command: 'pnpm',
      args: ['add', '--save-dev', '--save-exact', '--ignore-scripts', 'redlinegate@0.2.8'],
    });
  });
  withProject({ 'package.json': '{}' }, (dir) => {
    assert.deepEqual(addCommand(detectRunner(dir), '0.2.8'), {
      command: 'npm',
      args: ['install', '--save-dev', '--save-exact', '--ignore-scripts', 'redlinegate@0.2.8'],
    });
  });
});

// `pnpm add` at a workspace root refuses without the flag; yarn classic and
// berry disagree about theirs, so a yarn workspaces root is left to the person.
test('workspace roots get the flag pnpm needs, and yarn workspaces are not guessed at', () => {
  withProject({ 'package.json': '{}', 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'packages: []' }, (dir) => {
    assert.ok(addCommand(detectRunner(dir), '0.2.8')?.args.includes('--workspace-root'));
  });
  withProject({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }), 'yarn.lock': '' }, (dir) => {
    assert.equal(addCommand(detectRunner(dir), '0.2.8'), null);
  });
});

// The package manager is faked: what matters here is that the result names
// exactly the files it changed, so the onboarding commit stages those and
// nothing that was already dirty beside them.
test('pinning reports exactly the files the package manager changed', () => {
  withProject({ 'package.json': '{}', 'pnpm-lock.yaml': 'old', 'README.md': 'dirty already' }, (dir) => {
    const result = pinRedline(dir, '0.2.8', (cwd, add) => {
      assert.equal(add.command, 'pnpm');
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { redlinegate: '0.2.8' } }));
      writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'new');
      writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'minimumReleaseAgeExclude: [redlinegate@0.2.8]');
    });
    assert.equal(result.status, 'pinned');
    assert.deepEqual(result.status === 'pinned' ? result.written : [], [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ]);
  });
});

test('a package manager that fails is reported with its last line and the command to retry', () => {
  withProject({ 'package.json': '{}' }, (dir) => {
    const result = pinRedline(dir, '0.2.8', () => {
      throw Object.assign(new Error('Command failed'), { stderr: 'npm warn something\nnpm error code E404\n' });
    });
    assert.deepEqual(result, {
      status: 'failed',
      command: 'npm install --save-dev --save-exact --ignore-scripts redlinegate@0.2.8',
      reason: 'npm error code E404',
    });
  });
});

test('nothing is run when there is no package.json, or Redline is already a dependency', () => {
  const never = (): void => assert.fail('the package manager must not run');
  withProject({}, (dir) => assert.equal(pinRedline(dir, '0.2.8', never).status, 'skipped'));
  withProject({ 'package.json': JSON.stringify({ devDependencies: { redlinegate: '0.2.7' } }) }, (dir) => {
    assert.equal(pinRedline(dir, '0.2.8', never).status, 'skipped');
  });
});

// What a package manager that cannot start looks like: a Node stack trace that
// ends with the Node version. The reason must be the line that names the error.
test('a crashed package manager is reported by its error line, not the Node version under it', () => {
  withProject({ 'package.json': '{}' }, (dir) => {
    const result = pinRedline(dir, '0.2.8', () => {
      throw Object.assign(new Error('Command failed'), {
        stderr: "node:internal/modules/cjs/loader:1568\n  throw err;\n\nError: Cannot find module '/x/pnpm.cjs'\n    at Module._resolveFilename\n\nNode.js v24.21.0\n",
      });
    });
    assert.equal(result.status === 'failed' ? result.reason : '', "Error: Cannot find module '/x/pnpm.cjs'");
  });
});
