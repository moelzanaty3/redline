import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGit, type GitRunner } from '../git.ts';
import { isRedlineError } from '../errors.ts';

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

test('remoteUrl returns an empty string when the repository has no remote', () => {
  const run: GitRunner = () => {
    throw new Error("fatal: No such remote 'origin'");
  };
  assert.equal(createGit('/repo', run).remoteUrl(), '');
});

test('currentBranch reads HEAD and falls back to "HEAD" when rev-parse fails', () => {
  const { run } = recorder({ 'rev-parse --abbrev-ref HEAD': 'feature/payments' });
  assert.equal(createGit('/repo', run).currentBranch(), 'feature/payments');
  const broken: GitRunner = () => {
    throw new Error('fatal: not a git repository');
  };
  assert.equal(createGit('/repo', broken).currentBranch(), 'HEAD');
});

test('checkoutBranch switches by argv and a failure becomes a host RedlineError naming the branch', () => {
  const { run, calls } = recorder();
  createGit('/repo', run).checkoutBranch('feature/payments');
  assert.deepEqual(calls, [['checkout', 'feature/payments']]);

  const broken: GitRunner = (args) => {
    if (args[0] === 'checkout') throw new Error('your local changes would be overwritten');
    return 'redline/onboard';
  };
  assert.throws(
    () => createGit('/repo', broken).checkoutBranch('feature/payments'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'host' &&
      err.message.includes('feature/payments') &&
      (err.hint ?? '').includes('git checkout feature/payments'),
  );
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

test('a rejected push becomes a permission RedlineError naming the branch it was left on', () => {
  const run: GitRunner = (args) => {
    if (args[0] === 'push') throw Object.assign(new Error('Command failed'), {
      stderr: 'remote: Permission to acme/web.git denied.\nfatal: unable to access repository\n',
    });
    return 'redline/onboard';
  };
  assert.throws(
    () => createGit('/repo', run).push('redline/onboard'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'permission' &&
      err.message.includes('Permission to acme/web.git denied.') &&
      (err.hint ?? '').includes('redline/onboard'),
  );
});

test('a non-fast-forward push becomes a failed RedlineError blaming the stale onboarding branch', () => {
  const run: GitRunner = (args) => {
    if (args[0] === 'push') throw Object.assign(new Error('Command failed'), {
      stderr:
        " ! [rejected]        redline/onboard -> redline/onboard (non-fast-forward)\n" +
        "error: failed to push some refs to 'github.com:acme/web.git'\n",
    });
    return 'redline/onboard';
  };
  assert.throws(
    () => createGit('/repo', run).push('redline/onboard'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'failed' &&
      err.message.includes('redline/onboard') &&
      (err.hint ?? '').includes('git push origin --delete redline/onboard'),
  );
});

test('a failed commit becomes a host RedlineError saying the changes are still staged', () => {
  const run: GitRunner = (args) => {
    if (args[0] === 'commit') throw new Error('pre-commit hook failed');
    return 'redline/onboard';
  };
  assert.throws(
    () => createGit('/repo', run).commit('chore(redline): onboard'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'host' &&
      err.message.includes('pre-commit hook failed') &&
      (err.hint ?? '').includes('still staged on "redline/onboard"'),
  );
});

test('a failed branch checkout becomes a host RedlineError and reports nothing was committed', () => {
  const run: GitRunner = (args) => {
    if (args[0] === 'checkout') throw new Error('your local changes would be overwritten');
    return 'main';
  };
  assert.throws(
    () => createGit('/repo', run).checkoutNewBranch('redline/onboard'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'host' &&
      (err.hint ?? '').includes('nothing was committed'),
  );
});
