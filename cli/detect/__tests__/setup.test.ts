import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySetup, offerable } from '../setup.ts';

const repo = (files: Record<string, string> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-setup-'));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(dir, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return dir;
};

const find = (cwd: string, stacks: string[], id: string) =>
  offerable(cwd, 'github', stacks).find((o) => o.integration.id === id);

// Azure DevOps has no dependabot.yml, no Renovate app and no CodeQL. Offering
// them there would write files that do nothing at all.
test('nothing is offered on a host where none of it runs', () => {
  const cwd = repo({ 'package.json': '{}' });
  assert.deepEqual(offerable(cwd, 'azure', ['javascript']), []);
  assert.ok(offerable(cwd, 'github', ['javascript']).length > 0);
});

// A manifest is the only evidence taken: an ecosystem guessed from a file
// extension produces a config that opens pull requests against nothing.
test('dependabot covers the ecosystems the repository actually has', () => {
  const cwd = repo({ 'package.json': '{}', 'go.mod': 'module x', 'requirements.txt': 'flask' });
  const file = find(cwd, ['javascript'], 'dependabot')?.file;

  assert.match(String(file?.contents), /package-ecosystem: "npm"/);
  assert.match(String(file?.contents), /package-ecosystem: "gomod"/);
  assert.match(String(file?.contents), /package-ecosystem: "pip"/);
  assert.doesNotMatch(String(file?.contents), /maven/);
  assert.match(String(file?.contents), /interval: "weekly"/);
  assert.match(String(file?.contents), /minor-and-patch/);
});

test('a repository with no manifest at all is offered no dependabot', () => {
  assert.equal(find(repo(), ['javascript'], 'dependabot'), undefined);
});

// The language matrix comes from the profile's stacks, so CodeQL scans what the
// standards are reviewing rather than whatever happens to be on disk.
test('codeql scans the languages the profile renders', () => {
  const cwd = repo({ 'package.json': '{}' });
  const react = find(cwd, ['javascript', 'react'], 'codeql')?.file;
  assert.match(String(react?.contents), /language: \[javascript-typescript\]/);

  const service = find(cwd, ['java', 'go'], 'codeql')?.file;
  assert.match(String(service?.contents), /language: \[java-kotlin, go\]/);

  // Terraform has no CodeQL analyser, so there is nothing to offer.
  assert.equal(find(cwd, ['terraform'], 'codeql'), undefined);
});

test('a workflow pins the action it runs', () => {
  const cwd = repo({ 'package.json': '{}' });
  const file = find(cwd, ['javascript'], 'codeql')?.file;
  assert.match(String(file?.contents), /github\/codeql-action\/init@v3/);
  assert.doesNotMatch(String(file?.contents), /@main|@master/);
});

// A repository with its own renovate.json has a considered one. Replacing it
// with a generated default is the kind of help that costs a week of tuning.
test('an existing file is never overwritten, and is reported instead', () => {
  const cwd = repo({ 'package.json': '{}', 'renovate.json': '{"extends":["local>acme/config"]}' });
  const chosen = offerable(cwd, 'github', ['javascript']).filter(
    (o) => o.integration.id === 'renovate'
  );

  const result = applySetup(cwd, chosen, false);
  assert.deepEqual(result.written, []);
  assert.deepEqual(result.skipped, ['renovate.json']);
  assert.equal(readFileSync(join(cwd, 'renovate.json'), 'utf8'), '{"extends":["local>acme/config"]}');
});

test('a dry run writes nothing but plans exactly what it would write', () => {
  const cwd = repo({ 'package.json': '{}' });
  const chosen = offerable(cwd, 'github', ['javascript']).filter(
    (o) => o.integration.id === 'dependabot'
  );

  const planned = applySetup(cwd, chosen, true);
  assert.deepEqual(planned.written, ['.github/dependabot.yml']);
  assert.throws(() => readFileSync(join(cwd, '.github/dependabot.yml'), 'utf8'));

  const applied = applySetup(cwd, chosen, false);
  assert.deepEqual(applied.written, planned.written);
  assert.ok(readFileSync(join(cwd, '.github/dependabot.yml'), 'utf8').includes('version: 2'));
});

// A second run must not report work it is not doing: identical content is a
// no-op, not a conflict.
test('re-running over its own output reports neither a write nor a conflict', () => {
  const cwd = repo({ 'package.json': '{}' });
  const chosen = offerable(cwd, 'github', ['javascript']).filter(
    (o) => o.integration.id === 'dependabot'
  );
  applySetup(cwd, chosen, false);

  const again = applySetup(cwd, chosen, false);
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.skipped, []);
});
