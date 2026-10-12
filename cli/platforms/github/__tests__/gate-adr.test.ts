import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

// The `adr` job's script, exactly as it ships: the lines indented under its
// `run: |`. Running the real text, not a copy of its logic, is the point — the
// bug this guards against was in the grep, not in anything a re-implementation
// would have reproduced.
function adrScript(): string {
  const lines = readFileSync(`${ROOT}workflows/redline-gate.yml`, 'utf8').split('\n');
  const job = lines.findIndex((line) => line === '  adr:');
  const run = lines.findIndex((line, i) => i > job && line.trim() === 'run: |');
  const indent = (lines[run + 1] ?? '').search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== '' && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

interface PullRequest {
  readonly additions: number;
  readonly body: string;
  readonly labels?: readonly string[];
}

// `gh` is replaced by a script that prints the pull request this case describes,
// so the job runs offline against a known body.
function runAdrJob(pr: PullRequest) {
  const dir = mkdtempSync(join(tmpdir(), 'redline-adr-'));
  const json = JSON.stringify({
    additions: pr.additions,
    deletions: 0,
    body: pr.body,
    labels: (pr.labels ?? []).map((name) => ({ name })),
  });
  writeFileSync(join(dir, 'pr.json'), json);
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash\ncat "${join(dir, 'pr.json')}"\n`);
  chmodSync(join(dir, 'gh'), 0o755);
  return spawnSync('bash', ['-c', adrScript()], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, PR: '1', REPO: 'acme/app', THRESHOLD: '300' },
  });
}

const TEMPLATE = readFileSync(`${ROOT}templates/github/pull_request_template.md`, 'utf8');

// The template prompts with `docs/adr/NNNN-*.md`. Counting any `docs/adr/` as a
// link meant every pull request opened from the template passed the check
// without a record, so the job never fired on the changes it exists for.
test('the template placeholder is not an ADR link', () => {
  assert.ok(TEMPLATE.includes('docs/adr/NNNN-*.md'), 'the template still carries the placeholder');
  const result = runAdrJob({ additions: 400, body: TEMPLATE });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /adr-links=0/);
});

test('a link to a real record passes, as a path or as a URL', () => {
  for (const link of [
    'docs/adr/0001-use-postgres.md',
    'docs/adr/use-postgres.md',
    'https://github.com/acme/app/blob/main/docs/adr/0012-queue-per-tenant.md',
  ]) {
    const body = TEMPLATE.replace('docs/adr/NNNN-*.md', link);
    const result = runAdrJob({ additions: 400, body });
    assert.equal(result.status, 0, `${link}\n${result.stdout}`);
  }
});

test('the no-adr label and a small diff still pass without a link', () => {
  assert.equal(runAdrJob({ additions: 400, body: TEMPLATE, labels: ['no-adr'] }).status, 0);
  assert.equal(runAdrJob({ additions: 300, body: TEMPLATE }).status, 0);
});
