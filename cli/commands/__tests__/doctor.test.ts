import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { doctor } from '../doctor.ts';
import { nodeSupport, unsupportedNodeHint } from '../../core/runtime.ts';

function repo(remote?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-doctor-'));
  execFileSync('git', ['init', '-q', '.'], { cwd: dir });
  if (remote !== undefined) execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: dir });
  return dir;
}

// git runs for real — these tests create real repositories and the git check is
// about this machine. Only `gh` is faked: its answer would otherwise depend on
// whoever happens to be logged in on the machine running the suite, which is
// not a property of the code under test.
const noGh = (file: string, args: readonly string[]): string => {
  if (file === 'gh') throw new Error('gh not installed');
  return execFileSync(file, [...args], { encoding: 'utf8' }).trim();
};

const withGh =
  (status: string) =>
  (file: string, args: readonly string[]): string => {
    if (file === 'gh') return status;
    return execFileSync(file, [...args], { encoding: 'utf8' }).trim();
  };

test('an old Node fails rather than warning', () => {
  const report = doctor({ cwd: repo('git@github.com:acme/widget.git'), nodeVersion: 'v18.13.0', run: noGh });
  const node = report.checks.find((c) => c.name === 'node');
  assert.equal(node?.status, 'fail');
  assert.equal(report.ok, false);
  // The escape hatches matter more than the diagnosis. A repository pinned to
  // 18 on purpose cannot act on "upgrade Node", and a fix nobody can apply is
  // indistinguishable from the tool refusing to work.
  assert.match(node?.fix ?? '', /volta run/);
  assert.match(node?.fix ?? '', /fnm exec/);
  assert.match(node?.fix ?? '', /nvm exec/);
});

test('a supported Node passes', () => {
  const report = doctor({ cwd: repo('git@github.com:acme/widget.git'), nodeVersion: 'v22.11.0', run: noGh });
  assert.equal(report.checks.find((c) => c.name === 'node')?.status, 'ok');
});

// A version string this predates must not brick every command. Redline is not
// the tool that gets to stop someone's work over a runtime format it did not
// recognise.
test('an unreadable Node version warns rather than failing', () => {
  const report = doctor({ cwd: repo('git@github.com:acme/widget.git'), nodeVersion: 'banana', run: noGh });
  assert.equal(report.checks.find((c) => c.name === 'node')?.status, 'warn');
  assert.equal(report.ok, true);
  assert.equal(nodeSupport('banana').ok, true);
});

test('a directory that is not a repository fails on the repository check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-doctor-bare-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  const report = doctor({ cwd: dir, nodeVersion: 'v22.11.0', run: noGh });
  assert.equal(report.checks.find((c) => c.name === 'repository')?.status, 'fail');
  // Not reported as a remote problem: there is no remote because there is no
  // repository, and naming the second sends the reader to the wrong fix.
  assert.equal(report.checks.find((c) => c.name === 'remote'), undefined);
});

// `remoteUrl()` returns the empty string rather than throwing when no remote is
// configured, so the no-remote case used to fall through into the
// unclassifiable-host branch and report "origin is not a remote Redline can
// classify: this repository has no git remote" — two contradictory statements
// in one line, with the fix for the wrong one.
test('a repository with no remote says so, and not that the host is unknown', () => {
  const report = doctor({ cwd: repo(), nodeVersion: 'v22.11.0', run: noGh });
  const remote = report.checks.find((c) => c.name === 'remote');
  assert.equal(remote?.status, 'fail');
  assert.match(remote?.detail ?? '', /no origin remote/);
  assert.doesNotMatch(remote?.detail ?? '', /classify|host Redline does not know/);
  assert.match(remote?.fix ?? '', /git remote add origin/);
});

// This output is written to be pasted into a ticket, and a remote can carry a
// credential in its userinfo. parseRemote's own error embeds the URL it was
// given, so forwarding that message would print the token.
test('an unknown host does not echo the remote URL', () => {
  const secret = 'ghp_notarealtokenbutshapedlikeone';
  const report = doctor({
    cwd: repo(`https://x-access-token:${secret}@gitlab.com/acme/widget.git`),
    nodeVersion: 'v22.11.0',
    run: noGh,
  });
  const remote = report.checks.find((c) => c.name === 'remote');
  assert.equal(remote?.status, 'fail');
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(report), /gitlab\.com/);
});

test('a github.com remote does not repeat the hostname, an Enterprise one does', () => {
  const plain = doctor({ cwd: repo('git@github.com:acme/widget.git'), nodeVersion: 'v22.11.0', run: noGh });
  assert.equal(plain.checks.find((c) => c.name === 'remote')?.detail, 'github — acme/widget');

  const ghes = doctor({ cwd: repo('git@github.acme.internal:acme/widget.git'), nodeVersion: 'v22.11.0', run: noGh });
  // Which GitHub is exactly what a surprising 404 turns on, so it is printed
  // when it is not the public one.
  assert.match(ghes.checks.find((c) => c.name === 'remote')?.detail ?? '', /github\.acme\.internal/);
});

test('no credential warns but does not fail — the preview commands need none', () => {
  const report = doctor({ cwd: repo('git@github.com:acme/widget.git'), nodeVersion: 'v22.11.0', run: noGh });
  const cred = report.checks.find((c) => c.name === 'credential');
  assert.equal(cred?.status, 'warn');
  assert.equal(report.ok, true);
  assert.match(cred?.fix ?? '', /--dry-run/);
});

test('a token missing a scope names the scope and the command that grants it', () => {
  const report = doctor({
    cwd: repo('git@github.com:acme/widget.git'),
    nodeVersion: 'v22.11.0',
    run: withGh("Logged in to github.com account octocat (keyring)\n  - Token scopes: 'gist', 'repo'"),
  });
  const cred = report.checks.find((c) => c.name === 'credential');
  assert.equal(cred?.status, 'warn');
  assert.match(cred?.detail ?? '', /read:org/);
  assert.match(cred?.fix ?? '', /gh auth refresh -s read:org/);
});

test('a token with every scope passes and names the account', () => {
  const report = doctor({
    cwd: repo('git@github.com:acme/widget.git'),
    nodeVersion: 'v22.11.0',
    run: withGh("Logged in to github.com account octocat (keyring)\n  - Token scopes: 'repo', 'read:org'"),
  });
  const cred = report.checks.find((c) => c.name === 'credential');
  assert.equal(cred?.status, 'ok');
  assert.match(cred?.detail ?? '', /octocat/);
});

test('an onboarded repository reports its profile and rung', () => {
  const dir = repo('git@github.com:acme/widget.git');
  writeFileSync(
    join(dir, '.redline.json'),
    JSON.stringify({
      standardsVersion: '0.1.0',
      cliVersion: '0.1.3',
      host: 'github',
      profile: 'web-react',
      vendors: ['copilot'],
      menu: {
        blockingGate: false,
        adrForLargeDiffs: true,
        accessibility: true,
        speckit: false,
        tmf: false,
        sensitivePathReviewers: false,
      },
      capabilities: { gate: true, mergePolicy: true, labels: true },
      integrations: [],
      pendingAdmin: [],
      onboardedAt: '2026-01-01T00:00:00.000Z',
      lastRunAt: '2026-01-01T00:00:00.000Z',
      rung: 'observe',
    })
  );
  const report = doctor({ cwd: dir, nodeVersion: 'v22.11.0', run: noGh });
  const onboarded = report.checks.find((c) => c.name === 'onboarded');
  assert.equal(onboarded?.status, 'ok');
  assert.match(onboarded?.detail ?? '', /web-react/);
  assert.match(onboarded?.detail ?? '', /observe/);
});

// A .redline.json that fails validation used to take doctor down with it —
// readConfig throws, and nothing caught it. That is the one command somebody
// runs *because* something here is wrong, so it has to survive the thing being
// wrong and name the file rather than die inside a parser.
test('an unreadable .redline.json is reported, not thrown', () => {
  const dir = repo('git@github.com:acme/widget.git');
  writeFileSync(join(dir, '.redline.json'), '{ "profile": "web-react" }');
  const report = doctor({ cwd: dir, nodeVersion: 'v22.11.0', run: noGh });
  const onboarded = report.checks.find((c) => c.name === 'onboarded');
  assert.equal(onboarded?.status, 'fail');
  assert.match(onboarded?.detail ?? '', /\.redline\.json is here but unreadable/);
  assert.equal(report.ok, false);
});

test('the hint names the command that was actually run', () => {
  assert.match(unsupportedNodeHint('verify'), /npx redlinegate verify/);
  assert.doesNotMatch(unsupportedNodeHint('verify'), /npx redlinegate init/);
});
