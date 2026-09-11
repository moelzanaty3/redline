import { execFileSync } from 'node:child_process';
import { RedlineError } from './errors.ts';

export type GitRunner = (args: string[], cwd: string) => string;

// Every git call here runs with stdin ignored and stderr captured, so anything
// git decides to ASK rather than answer has nowhere to print the question and
// nowhere to read the reply — it simply waits. A real onboarding sat on
// "committing and opening the pull request" forever because `git push` reached
// an ssh that wanted a passphrase, and the spinner kept turning over a process
// that was never going to finish.
//
// So the prompts are switched off rather than hidden: git fails immediately and
// says why, and `push()` below turns that into an error naming the branch the
// work is already committed on. An operator's own GIT_SSH_COMMAND wins — a
// repository reached through a custom ssh wrapper is a deliberate arrangement,
// and overriding it would break a working setup to fix a hanging one.
const NON_INTERACTIVE = {
  // Suppresses the username/password prompt on an HTTPS remote.
  GIT_TERMINAL_PROMPT: '0',
  // BatchMode stops ssh asking for a passphrase or an unknown host key;
  // ConnectTimeout stops a silently dropped connection replacing the prompt
  // with an equally invisible wait.
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10',
} as const;

/**
 * The environment git runs in: prompts off, unless the operator has already
 * said otherwise.
 *
 * Exported to be asserted on. Which side of the merge wins is the whole
 * decision — spread the defaults last and a custom ssh wrapper is silently
 * replaced, which breaks a working setup in order to fix a hanging one.
 */
export function gitEnv(from: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...NON_INTERACTIVE, ...from };
}

export const execGit: GitRunner = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: gitEnv(),
  }).trim();

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
  // Read-only. A diff that cannot be produced — a ref that does not exist, a
  // repository with no commits — is a usage problem the caller can act on, not
  // an internal defect.
  diff(range: string): string;
  diffStaged(): string;
  // The merge base of a ref and HEAD, so a working-tree diff can be taken
  // against it directly.
  mergeBase(ref: string): string;
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
    diff(range) {
      try {
        // No colour, no external diff tool, full context off: the output is
        // parsed and shown to a model, not to a terminal.
        return g('diff', '--no-color', '--no-ext-diff', range);
      } catch (error) {
        throw new RedlineError(
          'usage',
          `cannot diff ${range}: ${stderrText(error)}`,
          'check the ref exists — `git fetch` first if it is a branch you have not pulled'
        );
      }
    },
    mergeBase(ref) {
      try {
        return g('merge-base', ref, 'HEAD');
      } catch (error) {
        throw new RedlineError(
          'usage',
          `cannot find the merge base with ${ref}: ${stderrText(error)}`,
          'fetch the base branch first, or pass --base with one you have'
        );
      }
    },
    diffStaged() {
      try {
        return g('diff', '--no-color', '--no-ext-diff', '--cached');
      } catch (error) {
        throw new RedlineError('usage', `cannot read the staged diff: ${stderrText(error)}`);
      }
    },
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
      try {
        g('add', '--', ...paths);
      } catch (error) {
        // Reached when a caller listed a path nothing actually wrote, which
        // git reports as `fatal: pathspec ... did not match any files`. The
        // raw execFileSync message leaks the whole argv, so it is replaced
        // with the failure and where the run left the operator.
        throw new RedlineError(
          'host',
          `could not stage the Redline changes: ${gitFailure(error)}`,
          'nothing was committed and no pull request was opened — the path above was listed but never written, so re-run and report it if it recurs'
        );
      }
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
          `the Redline changes are committed locally on "${branch}" — push that branch and open the pull request yourself, or get push access and re-run. ` +
            'Redline runs ssh in batch mode so a credential prompt cannot hang the run: if the error above is about a key or a host key, ' +
            'add the key to your agent (ssh-add) or accept the host once by hand, then re-run'
        );
      }
    },
  };
}
