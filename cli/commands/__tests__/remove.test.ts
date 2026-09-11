import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakePlatform } from './fake-platform.ts';
import { fakeGitHubClient } from '../../platforms/__tests__/fake-client.ts';
import { init } from '../init.ts';
import { remove, type RemoveReport } from '../remove.ts';
import { createGitHubWithdrawal, type HostWithdrawal, type WithdrawalResult } from '../../remove/host.ts';
import { CONFIG_FILE } from '../../config/redline-json.ts';
import { BEGIN, END } from '../../render/markers.ts';
import { isRedlineError } from '../../core/errors.ts';
import type { CapabilityOutcome, RepoRef } from '../../platforms/types.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const now = (): Date => new Date('2026-09-01T00:00:00.000Z');

const createdDirs: string[] = [];
after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});

function tempRepo(prefix = 'redline-remove-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

/** A repository `redline init` has already onboarded, with a React profile. */
async function onboarded(files: Record<string, string> = {}): Promise<string> {
  const cwd = tempRepo();
  writeFileSync(join(cwd, 'package.json'), '{"dependencies":{"react":"19"}}');
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), contents);
  }
  await init(fakePlatform(), { cwd, root, now });
  return cwd;
}

interface FakeWithdrawal extends HostWithdrawal {
  refs: RepoRef[];
}

function fakeWithdrawal(outcomes: CapabilityOutcome[] = [], notes: string[] = []): FakeWithdrawal {
  const refs: RepoRef[] = [];
  return {
    host: 'github',
    refs,
    async withdraw(ref: RepoRef): Promise<WithdrawalResult> {
      refs.push(ref);
      return { outcomes, notes };
    },
  };
}

function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const abs = join(dir, entry);
      return statSync(abs).isDirectory() ? walk(abs, `${prefix}${entry}/`) : [`${prefix}${entry}`];
    })
    .sort();
}

const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(walk(dir).map((path) => [path, readFileSync(join(dir, path), 'utf8')]));

const acted = (report: RemoveReport, path: string) =>
  report.actions.find((action) => action.path === path);

test('the marker block goes and every byte outside it survives', async () => {
  const cwd = await onboarded();
  // Built by hand rather than by init, so the assertion is on exact bytes: the
  // newline immediately after END belongs to the block (wrapBlock writes it),
  // and everything on either side of that is the repository's own.
  const before = '# Our own notes\n\nKeep these.\n\n';
  const behind = '## Below the block\n\nAlso ours.\n';
  writeFileSync(join(cwd, 'AGENTS.md'), `${before}${BEGIN}\n\ngenerated body\n\n${END}\n${behind}`);

  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });

  assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), before + behind);
  assert.equal(acted(report, 'AGENTS.md')?.kind, 'unmerge');
});

test('a shared file that was nothing but the Redline block is deleted', async () => {
  const cwd = await onboarded();
  // What init writes on a greenfield repository: CLAUDE.md is created by
  // Redline and holds its block and nothing else.
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), true);
  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });
  assert.equal(existsSync(join(cwd, 'CLAUDE.md')), false);
  assert.equal(acted(report, 'CLAUDE.md')?.kind, 'delete');
});

test('a file with malformed markers is left completely alone and reported', async () => {
  const cwd = await onboarded();
  const mangled = `# Ours\n\n${BEGIN}\n\none\n\n${BEGIN}\n\ntwo\n\n${END}\n`;
  writeFileSync(join(cwd, 'AGENTS.md'), mangled);

  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });

  assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), mangled);
  const action = acted(report, 'AGENTS.md');
  assert.equal(action?.kind, 'kept');
  assert.match(action?.reason ?? '', /REDLINE:BEGIN/);
  // The rest of the removal still happened: one file Redline cannot read is a
  // finding about that file, not a reason to abandon the repository half-way.
  assert.equal(existsSync(join(cwd, CONFIG_FILE)), false);
});

test('a redline- prefixed instruction file goes and a hand-written one stays', async () => {
  const cwd = await onboarded();
  const theirs = '.github/instructions/team-rules.instructions.md';
  writeFileSync(join(cwd, theirs), 'our own rules\n');
  assert.equal(existsSync(join(cwd, '.github/instructions/redline-react.instructions.md')), true);

  await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });

  assert.equal(existsSync(join(cwd, '.github/instructions/redline-react.instructions.md')), false);
  assert.equal(readFileSync(join(cwd, theirs), 'utf8'), 'our own rules\n');
});

test('a CODEOWNERS Redline seeded is removed', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, '.github/CODEOWNERS'), '# Managed by Redline.\n\n/AGENTS.md @acme/platform-engineering\n');
  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });
  assert.equal(existsSync(join(cwd, '.github/CODEOWNERS')), false);
  assert.equal(acted(report, '.github/CODEOWNERS')?.kind, 'delete');
});

test('a pre-existing CODEOWNERS is never touched', async () => {
  const cwd = await onboarded();
  const theirs = '* @acme/web-team\n/infra/ @acme/sre\n';
  writeFileSync(join(cwd, '.github/CODEOWNERS'), theirs);

  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });

  assert.equal(readFileSync(join(cwd, '.github/CODEOWNERS'), 'utf8'), theirs);
  assert.equal(acted(report, '.github/CODEOWNERS')?.kind, 'kept');
});

test('a gate workflow that carries nothing attributing it to Redline is kept', async () => {
  const cwd = await onboarded();
  const theirs = 'name: our gate\non: [pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n';
  writeFileSync(join(cwd, '.github/workflows/redline.yml'), theirs);

  // The machinery reader answers off the file on disk, so it reports the same
  // "publishes nothing" this file really would.
  const platform = fakePlatform({
    gateMachinery: {
      path: '.github/workflows/redline.yml',
      present: true,
      publishes: null,
      expected: 'redline-gate / gate',
      vendored: null,
    },
  });
  const report = await remove(platform, () => fakeWithdrawal(), { cwd, root });

  assert.equal(readFileSync(join(cwd, '.github/workflows/redline.yml'), 'utf8'), theirs);
  assert.equal(acted(report, '.github/workflows/redline.yml')?.kind, 'kept');
});

test("Redline's own gate workflow is deleted", async () => {
  const cwd = await onboarded();
  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
  assert.equal(acted(report, '.github/workflows/redline.yml')?.kind, 'delete');
});

test('--dry-run changes nothing on disk and contacts no host', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform();
  const host = fakeWithdrawal();
  const before = snapshot(cwd);

  const report = await remove(platform, () => host, { cwd, root, dryRun: true });

  assert.deepEqual(snapshot(cwd), before);
  assert.equal(report.dryRun, true);
  assert.deepEqual(host.refs, [], 'no host state was withdrawn');
  assert.deepEqual(platform.applied, [], 'no host mutation was attempted');
  assert.deepEqual(platform.reads, [], 'a dry run needs no credential, so it makes no host read');
  // A plan nobody can act on is not a plan: it has to name the files.
  assert.ok(report.files.includes(CONFIG_FILE));
  assert.ok(report.files.includes('CLAUDE.md'));
});

test('a repository that was never onboarded is a usage error, not a crash', async () => {
  const cwd = tempRepo('redline-remove-none-');
  await assert.rejects(
    remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root }),
    (error: unknown) => {
      assert.ok(isRedlineError(error), 'a plain Error would exit 4 and blame the tool');
      assert.equal(error.kind, 'usage');
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /nothing to remove/);
      return true;
    }
  );
});

test('a default run never touches the security floor', async () => {
  const cwd = await onboarded();
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': { status: 200, body: [] },
    'GET /repos/acme/web/labels/no-adr': { status: 404 },
    'GET /repos/acme/web/labels/redline-exempt': { status: 404 },
    'GET /repos/acme/web/labels/redline-sync': { status: 404 },
  });
  const platform = fakePlatform();

  const report = await remove(platform, () => createGitHubWithdrawal(client), { cwd, root });

  const floor = ['secret-scanning', 'push-protection', 'dependency-alerts'];
  assert.deepEqual(
    report.outcomes.filter((outcome) => floor.includes(outcome.capability)),
    []
  );
  // The endpoints that could turn any of it off, none of which is reachable
  // from this command at all.
  for (const call of client.calls) {
    assert.doesNotMatch(call.path, /vulnerability-alerts|automated-security-fixes/);
    assert.equal(
      JSON.stringify(call.body ?? {}).includes('secret_scanning'),
      false,
      `${call.method} ${call.path} carried a secret-scanning setting`
    );
  }
  assert.ok(report.notes.some((note) => /security floor stays on/.test(note)));
});

test('.redline.json is removed last, and the report says what that means', async () => {
  const cwd = await onboarded();
  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });

  assert.equal(report.actions.at(-1)?.path, CONFIG_FILE);
  assert.equal(report.files.at(-1), CONFIG_FILE);
  assert.equal(existsSync(join(cwd, CONFIG_FILE)), false);
  assert.ok(report.notes.some((note) => /redline verify stops recognising this repository/.test(note)));
});

test("the repository's own local rules file is never removed", async () => {
  const cwd = await onboarded({ '.redline/local.md': '# Ours\n\nNo console.log in src/.\n' });
  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });
  assert.equal(existsSync(join(cwd, '.redline/local.md')), true);
  assert.ok(report.notes.some((note) => note.includes('.redline/local.md')));
});

test('a refused host withdrawal reaches pendingAdmin and is not reported as done', async () => {
  const cwd = await onboarded();
  const host = fakeWithdrawal([
    { capability: 'merge-policy', status: 'denied', detail: 'branch ruleset (needs repository admin)' },
    { capability: 'labels', status: 'applied', detail: 'label "no-adr"' },
  ]);

  const report = await remove(fakePlatform(), () => host, { cwd, root });

  assert.deepEqual(report.pendingAdmin, ['merge-policy']);
  assert.equal(report.outcomes.find((o) => o.capability === 'merge-policy')?.status, 'denied');
});

test('the removal is staged onto its own branch, never the default one', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform();
  await remove(platform, () => fakeWithdrawal(), { cwd, root });

  assert.equal(platform.lastChange?.branch, 'redline/remove');
  // The redline-sync label is one of the labels this run deletes; asking the
  // host to apply it would fail the pull request over housekeeping.
  assert.deepEqual(platform.lastChange?.labels, []);
  assert.ok(platform.lastChange?.files.includes(CONFIG_FILE));
});

test('the GitHub withdrawal deletes only what still carries Redline attribution', async () => {
  const client = fakeGitHubClient({
    'GET /repos/acme/web/rulesets': {
      status: 200,
      body: [
        { id: 7, name: 'Redline' },
        { id: 8, name: 'Our own ruleset' },
      ],
    },
    'DELETE /repos/acme/web/rulesets/7': { status: 204 },
    'GET /repos/acme/web/labels/no-adr': {
      status: 200,
      body: { description: 'PR intentionally ships without an ADR' },
    },
    'GET /repos/acme/web/labels/redline-exempt': {
      status: 200,
      body: { description: 'our own meaning for this label' },
    },
    'GET /repos/acme/web/labels/redline-sync': { status: 404 },
    'DELETE /repos/acme/web/labels/no-adr': { status: 204 },
  });

  const result = await createGitHubWithdrawal(client).withdraw({
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'main',
  });

  const deletes = client.calls.filter((call) => call.method === 'DELETE').map((call) => call.path);
  assert.deepEqual(deletes, ['/repos/acme/web/rulesets/7', '/repos/acme/web/labels/no-adr']);
  assert.equal(result.outcomes.find((o) => o.capability === 'merge-policy')?.status, 'applied');
  // A label whose description a team has made their own is theirs now, and the
  // report says so rather than falling silent about it.
  assert.ok(result.notes.some((note) => note.includes('redline-exempt')));
});

test('a ruleset list the token cannot read is denied, never reported as removed', async () => {
  const client = fakeGitHubClient({ 'GET /repos/acme/web/rulesets': { status: 403 } });
  const result = await createGitHubWithdrawal(client).withdraw({
    host: 'github',
    org: 'acme',
    repo: 'web',
    defaultBranch: 'main',
  });
  const policy = result.outcomes.find((o) => o.capability === 'merge-policy');
  assert.equal(policy?.status, 'denied');
  assert.match(policy?.detail ?? '', /could not be read/);
  assert.equal(
    client.calls.some((call) => call.method === 'DELETE' && call.path.includes('rulesets')),
    false
  );
});

// --- the vendored gate -------------------------------------------------------

const VENDORED = '.github/workflows/redline-gate.yml';

// Deleting the caller and leaving this behind left a workflow nothing calls
// sitting in .github/workflows/ after a removal that reported itself complete.
const localGate = (cwd: string, body: string): ReturnType<typeof fakePlatform> => {
  writeFileSync(join(cwd, VENDORED), body);
  return fakePlatform({
    gateMachinery: {
      path: '.github/workflows/redline.yml',
      present: true,
      publishes: 'redline-gate / gate',
      expected: 'redline-gate / gate',
      vendored: VENDORED,
    },
  });
};

test('a vendored gate is removed along with the caller that ran it', async () => {
  const cwd = await onboarded();
  const platform = localGate(cwd, '# Managed by Redline.\non:\n  workflow_call:\njobs:\n  gate:\n');
  const report = await remove(platform, () => fakeWithdrawal(), { cwd, root });

  assert.equal(existsSync(join(cwd, VENDORED)), false);
  assert.equal(acted(report, VENDORED)?.kind, 'delete');
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
});

// Same rule the caller has always had: what init is allowed to overwrite is
// exactly what remove is allowed to delete.
test('a workflow at the vendored path that is not Redline\'s is kept', async () => {
  const cwd = await onboarded();
  const theirs = 'name: their reusable thing\non:\n  workflow_call:\njobs:\n  build:\n';
  const platform = localGate(cwd, theirs);
  const report = await remove(platform, () => fakeWithdrawal(), { cwd, root });

  assert.equal(readFileSync(join(cwd, VENDORED), 'utf8'), theirs);
  assert.equal(acted(report, VENDORED)?.kind, 'kept');
});

test('an organisation-sourced repository has no vendored gate to remove', async () => {
  const cwd = await onboarded();
  writeFileSync(join(cwd, VENDORED), '# Managed by Redline.\non:\n  workflow_call:\n');
  const report = await remove(fakePlatform(), () => fakeWithdrawal(), { cwd, root });

  // The caller never named it, so remove does not reach past what the
  // repository actually points at.
  assert.equal(acted(report, VENDORED), undefined);
  assert.equal(existsSync(join(cwd, VENDORED)), true);
});

test('a caller naming a vendored gate that is not there removes the caller anyway', async () => {
  const cwd = await onboarded();
  const platform = fakePlatform({
    gateMachinery: {
      path: '.github/workflows/redline.yml',
      present: true,
      publishes: 'redline-gate / gate',
      expected: 'redline-gate / gate',
      vendored: VENDORED,
    },
  });
  const report = await remove(platform, () => fakeWithdrawal(), { cwd, root });

  assert.equal(acted(report, VENDORED), undefined);
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
});

test('--dry-run leaves the vendored gate where it is', async () => {
  const cwd = await onboarded();
  const platform = localGate(cwd, '# Managed by Redline.\non:\n  workflow_call:\n');
  const before = snapshot(cwd);
  const report = await remove(platform, () => fakeWithdrawal(), { cwd, root, dryRun: true });

  assert.deepEqual(snapshot(cwd), before);
  assert.equal(acted(report, VENDORED)?.kind, 'delete');
});
