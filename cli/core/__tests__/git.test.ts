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

test('stagePaths adds only the named files, as argv, and is a no-op for an empty list', () => {
  const { run, calls } = recorder();
  const git = createGit('/repo', run);
  git.stagePaths(['.github/workflows/redline.yml', '.github/CODEOWNERS']);
  git.stagePaths([]);
  assert.deepEqual(calls, [
    ['add', '--', '.github/workflows/redline.yml', '.github/CODEOWNERS'],
  ]);
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
