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
