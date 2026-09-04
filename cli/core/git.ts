import { execFileSync } from 'node:child_process';
import { RedlineError } from './errors.ts';

export type GitRunner = (args: string[], cwd: string) => string;

export const execGit: GitRunner = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export interface Git {
  isRepo(): boolean;
  remoteUrl(remote?: string): string;
  defaultBranch(): string;
  currentBranch(): string;
  checkoutNewBranch(name: string): void;
  checkoutBranch(name: string): void;
  stagePaths(paths: string[]): void;
  hasStagedChanges(): boolean;
  commit(message: string): void;
  push(branch: string): void;
}

// git is a real system boundary: a rejected push, a protected branch, an
// expired credential and a failing pre-commit hook are all routine, and
// execFileSync reports them as a raw "Command failed: git push …" that the
// CLI's catch-all turns into "redline failed unexpectedly". Every mutating
// call below converts that into a RedlineError whose hint says what state
// the working tree was left in.
function stderrText(error: unknown): string {
  const stderr =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)['stderr']
      : undefined;
  return typeof stderr === 'string'
    ? stderr
    : Buffer.isBuffer(stderr)
      ? stderr.toString('utf8')
      : error instanceof Error
        ? error.message
        : String(error);
}

function gitFailure(error: unknown): string {
  return (
    stderrText(error).trim().split('\n').filter(Boolean).slice(-2).join(' — ') ||
    'git reported no detail'
  );
}

// The local non-fast-forward marker is " ! [rejected]"; a server-side policy
// rejection prints " ! [remote rejected]" instead, which this deliberately
// does not match — that one really is an access problem.
const NON_FAST_FORWARD = /non-fast-forward|\[rejected\]/;

export function createGit(cwd: string, run: GitRunner = execGit): Git {
  const g = (...args: string[]): string => run(args, cwd);
  const currentBranch = (): string => {
    try {
      return g('rev-parse', '--abbrev-ref', 'HEAD');
    } catch {
      return 'HEAD';
    }
  };

  return {
    isRepo() {
      try {
        return g('rev-parse', '--is-inside-work-tree') === 'true';
      } catch {
        return false;
      }
    },
    remoteUrl(remote = 'origin') {
      // No remote configured is a routine brownfield state, not a crash:
      // the empty string flows into parseRemote(''), whose usage error
      // already tells the user to `git remote add origin <url>`.
      try {
        return g('remote', 'get-url', remote);
      } catch {
        return '';
      }
    },
    defaultBranch() {
      try {
        return g('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
      } catch {
        return 'main';
      }
    },
    currentBranch,
    checkoutNewBranch(name) {
      try {
        g('checkout', '-B', name);
      } catch (error) {
        throw new RedlineError(
          'host',
          `could not create the branch "${name}": ${gitFailure(error)}`,
          `you are still on "${currentBranch()}" and nothing was committed — resolve the git error and re-run`
        );
      }
    },
    checkoutBranch(name) {
      try {
        g('checkout', name);
      } catch (error) {
        throw new RedlineError(
          'host',
          `could not switch back to "${name}": ${gitFailure(error)}`,
          `you are on "${currentBranch()}" — switch back yourself with: git checkout ${name}`
        );
      }
    },
    stagePaths(paths) {
      if (paths.length === 0) return;
      g('add', '--', ...paths);
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
      try {
        g('commit', '-m', message);
      } catch (error) {
        throw new RedlineError(
          'host',
          `could not commit the Redline changes: ${gitFailure(error)}`,
          `the changes are still staged on "${currentBranch()}" — commit them yourself, or resolve the git error and re-run`
        );
      }
    },
    // A push that git refuses is overwhelmingly an access problem — no write
    // permission, a protected branch, an expired credential — so it maps to
    // `permission` rather than `host`: the operator needs rights, not a
    // retry. The exception is a non-fast-forward rejection: that means a
    // previous partial run already pushed this branch, and telling the
    // operator to "get push access" would be the wrong diagnosis.
    push(branch) {
      try {
        g('push', '--set-upstream', 'origin', branch);
      } catch (error) {
        if (NON_FAST_FORWARD.test(stderrText(error))) {
          throw new RedlineError(
            'failed',
            `origin already has a "${branch}" branch this push cannot fast-forward: ${gitFailure(error)}`,
            `a previous run left it behind — delete it (git push origin --delete ${branch}) or merge its open pull request, then re-run`
          );
        }
        throw new RedlineError(
          'permission',
          `could not push "${branch}" to origin: ${gitFailure(error)}`,
          `the Redline changes are committed locally on "${branch}" — push that branch and open the pull request yourself, or get push access and re-run`
        );
      }
    },
  };
}
