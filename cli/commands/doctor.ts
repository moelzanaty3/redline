import { execFileSync } from 'node:child_process';
import { createGit } from '../core/git.ts';
import { parseRemote } from '../platforms/detect.ts';
import { readConfig } from '../config/redline-json.ts';
import { REQUIRED_NODE_MAJOR, nodeSupport, unsupportedNodeHint } from '../core/runtime.ts';

/**
 * `redline doctor` — can this machine run Redline against this repository?
 *
 * Every question here is one that otherwise gets answered by a failure partway
 * through a run that has already asked ten questions or already written files.
 * The Node check is the reason the command exists: `npx redlinegate init` on a
 * repository pinned to Node 18 prints an npm EBADENGINE *warning* and then runs
 * anyway, so the first sign of trouble is a syntax error from inside a
 * dependency, on a repository the operator now has to inspect.
 *
 * It contacts no host and needs no credential. Reading a token's scopes is the
 * one thing that shells out, and only to `gh`, which already holds it.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** What to actually do about it. Absent when there is nothing to do. */
  readonly fix?: string;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  /** False when any check failed. Warnings never make this false. */
  readonly ok: boolean;
}

export interface DoctorOptions {
  cwd: string;
  /** Injected so the tests never depend on the machine they run on. */
  nodeVersion?: string;
  run?: (file: string, args: readonly string[]) => string;
}

const defaultRun = (file: string, args: readonly string[]): string =>
  execFileSync(file, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// The scopes `redline init` actually spends on GitHub. `repo` covers the
// contents, branch and pull request writes; `read:org` is what resolves a team
// in CODEOWNERS, without which the file installs and enforces nothing.
const WANTED_SCOPES = ['repo', 'read:org'] as const;

function checkNode(version: string): DoctorCheck {
  const support = nodeSupport(version);
  if (support.major === null) {
    return { name: 'node', status: 'warn', detail: `could not read a version number from "${version}"` };
  }
  if (support.ok) {
    return {
      name: 'node',
      status: 'ok',
      detail: `${version} — at or above the required ${REQUIRED_NODE_MAJOR}`,
    };
  }
  return {
    name: 'node',
    status: 'fail',
    detail: `${version} — Redline needs ${REQUIRED_NODE_MAJOR} or later`,
    // The same three ways out the guard prints, from the same function rather
    // than a second copy: two sets of instructions for one problem drift, and
    // the one that drifts is always the one the reader happens to hit.
    //
    // Named tools rather than "upgrade Node", because the repository is
    // usually pinned deliberately and the operator is not free to change it
    // globally. A fix nobody can apply reads as a refusal to work at all.
    fix: unsupportedNodeHint()
      .split('\n')
      .map((line) => line.replace(/^ {2}/, ''))
      .join('\n'),
  };
}

function checkGit(run: DoctorOptions['run'], cwd: string): DoctorCheck[] {
  const exec = run ?? defaultRun;
  let version: string;
  try {
    version = exec('git', ['--version']);
  } catch (error) {
    return [
      {
        name: 'git',
        status: 'fail',
        detail: `git does not run here: ${error instanceof Error ? error.message : String(error)}`,
        // The macOS shim is the common cause and the least obvious: /usr/bin/git
        // defers to the active developer directory, and an Xcode that has not
        // had its licence accepted refuses every invocation including --version.
        fix: 'on macOS this is usually the Xcode licence: sudo xcodebuild -license accept',
      },
    ];
  }

  const checks: DoctorCheck[] = [{ name: 'git', status: 'ok', detail: version }];

  if (!createGit(cwd).isRepo()) {
    checks.push({
      name: 'repository',
      status: 'fail',
      detail: 'this directory is not a git repository',
      fix: 'run Redline from the root of the repository you want to onboard',
    });
    return checks;
  }

  const remote = createGit(cwd).remoteUrl();
  if (remote === '') {
    checks.push({
      name: 'remote',
      status: 'fail',
      detail: 'no origin remote, so there is no host to onboard against',
      fix: 'git remote add origin <url>, or preview the files alone with redline init --dry-run',
    });
    return checks;
  }

  try {
    const parsed = parseRemote(remote);
    checks.push({
      name: 'remote',
      status: 'ok',
      // The hostname is printed only when it is not the public one. On
      // github.com it is noise on every line of every ordinary run; on a
      // GitHub Enterprise Server host it is the single most useful fact here,
      // because "which GitHub" is exactly what a surprising 404 turns on.
      detail: `${parsed.host} — ${parsed.org}/${parsed.repo}${
        parsed.hostname === undefined || parsed.hostname === 'github.com' ? '' : ` on ${parsed.hostname}`
      }`,
    });
  } catch {
    checks.push({
      name: 'remote',
      status: 'fail',
      // parseRemote's own message embeds the URL it was given, and this output
      // is written to be pasted into a ticket. A remote can carry a credential
      // in it — https://x-access-token:ghp_...@github.com/org/repo — so the
      // message is rewritten here rather than forwarded, and the URL is not
      // printed at all.
      detail: 'origin is on a host Redline does not know',
      fix: 'Redline onboards GitHub (including Enterprise Server) and Azure DevOps remotes',
    });
  }

  return checks;
}

function checkCredential(run: DoctorOptions['run'], hostname?: string): DoctorCheck {
  if (process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']) {
    // Scopes are not readable from a raw token without spending a request, and
    // this command contacts no host. Saying which variable is set is the useful
    // half; it is also the half that explains a later 404 nobody expected.
    const which = process.env['GH_TOKEN'] ? 'GH_TOKEN' : 'GITHUB_TOKEN';
    return { name: 'credential', status: 'ok', detail: `${which} is set — scopes not checked (no host call here)` };
  }

  const exec = run ?? defaultRun;
  try {
    const out = exec('gh', ['auth', 'status', ...(hostname === undefined ? [] : ['--hostname', hostname])]);
    const scopes = /Token scopes:\s*(.+)/.exec(out)?.[1] ?? '';
    const held = [...scopes.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    const missing = WANTED_SCOPES.filter((s) => !held.includes(s));
    const account = /account (\S+)/.exec(out)?.[1] ?? 'unknown';
    if (missing.length > 0) {
      return {
        name: 'credential',
        status: 'warn',
        detail: `gh is logged in as ${account}, without ${missing.join(', ')}`,
        fix: `gh auth refresh -s ${missing.join(',')}`,
      };
    }
    return { name: 'credential', status: 'ok', detail: `gh is logged in as ${account}` };
  } catch {
    return {
      name: 'credential',
      status: 'warn',
      detail: 'no gh login and no GH_TOKEN — the preview commands still work',
      fix: 'gh auth login — or use redline init --dry-run / --no-commit, which need no credential',
    };
  }
}

export function doctor(opts: DoctorOptions): DoctorReport {
  const checks: DoctorCheck[] = [checkNode(opts.nodeVersion ?? process.version)];

  const gitChecks = checkGit(opts.run, opts.cwd);
  checks.push(...gitChecks);

  // Only asked once a remote resolved: `gh auth status --hostname` for a host
  // nobody could identify would report on github.com, which is not necessarily
  // the host this repository lives on.
  const remoteOk = gitChecks.some((c) => c.name === 'remote' && c.status === 'ok');
  if (remoteOk) {
    let hostname: string | undefined;
    try {
      hostname = parseRemote(createGit(opts.cwd).remoteUrl()).hostname;
    } catch {
      hostname = undefined;
    }
    checks.push(checkCredential(opts.run, hostname));
  }

  // readConfig throws on a .redline.json it cannot validate. Letting that
  // escape would crash the one command somebody runs *because* something here
  // is wrong, and the stack trace would name a parser rather than the file.
  let config: ReturnType<typeof readConfig>;
  try {
    config = readConfig(opts.cwd);
  } catch (error) {
    checks.push({
      name: 'onboarded',
      status: 'fail',
      detail: `.redline.json is here but unreadable: ${error instanceof Error ? error.message : String(error)}`,
      fix: 'npx redlinegate init rewrites it — the file is written by the command, not edited by hand',
    });
    return { checks, ok: false };
  }

  checks.push(
    config === null
      ? { name: 'onboarded', status: 'warn', detail: 'no .redline.json here yet', fix: 'npx redlinegate init' }
      : {
          name: 'onboarded',
          status: 'ok',
          detail: `profile ${config.profile}, standards v${config.standardsVersion}, rung ${config.rung}`,
        }
  );

  return { checks, ok: !checks.some((c) => c.status === 'fail') };
}
