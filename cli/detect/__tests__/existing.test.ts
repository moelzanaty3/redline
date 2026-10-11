import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { surveyRepo } from '../existing.ts';

const roots: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-survey-'));
  roots.push(dir);
  return dir;
};
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const write = (cwd: string, rel: string, body = ''): void => {
  const abs = join(cwd, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, body);
};

test('a bare repository stands nothing down', () => {
  const survey = surveyRepo(tmp());
  assert.deepEqual(survey.tools, []);
  assert.deepEqual(survey.standDown, []);
});

test('a marker file is evidence, and is quoted back', () => {
  const cwd = tmp();
  write(cwd, '.gitleaksignore');
  const survey = surveyRepo(cwd);
  assert.deepEqual(
    survey.tools.map((t) => [t.id, t.evidence]),
    [['gitleaks', '.gitleaksignore']]
  );
  assert.deepEqual(survey.standDown, ['secrets']);
});

// The shape that motivated this module: a GitHub-hosted repository whose real
// CI is Azure Pipelines under cicd/, consuming shared jobs from another
// repository by template reference. Nothing about SonarQube appears in a file
// name — only in a `template:` line — so a probe that only looked at paths
// would report this repository as having no scanner and install a second one.
test('a shared-template reference in an Azure pipeline counts as wired', () => {
  const cwd = tmp();
  write(
    cwd,
    'cicd/pre-merge.yaml',
    [
      'resources:',
      '  repositories:',
      '    - repository: yaml-pipeline-templates',
      '      name: dx-yaml-pipeline-templates',
      'stages:',
      '  - stage: Code_Quality_Analysis',
      '    jobs:',
      '      - job: Code_Quality_Analysis',
      '        steps:',
      '          - template: jobs/sonarqube.yaml@yaml-pipeline-templates',
      '            parameters:',
      '              buildBreaker: false',
    ].join('\n')
  );
  const survey = surveyRepo(cwd);
  assert.deepEqual(
    survey.tools.map((t) => t.id),
    ['sonarqube']
  );
  assert.match(survey.tools[0]!.evidence, /CI definitions/);
  assert.deepEqual(survey.standDown, ['policy']);
});

test('two tools covering the same job stand it down once', () => {
  const cwd = tmp();
  write(cwd, '.whitesource');
  write(cwd, '.snyk');
  const survey = surveyRepo(cwd);
  assert.deepEqual(survey.standDown, ['dependencies']);
});

// Renovate raises upgrade pull requests; it never fails a build on a vulnerable
// dependency entering one. Treating it as dependency coverage would silently
// remove the only check that does.
test('renovate is reported but stands nothing down', () => {
  const cwd = tmp();
  write(cwd, 'renovate.json', '{}');
  const survey = surveyRepo(cwd);
  assert.deepEqual(
    survey.tools.map((t) => t.id),
    ['renovate']
  );
  assert.deepEqual(survey.standDown, []);
});

// The failure direction has to be "offer a check the repository may already
// have" rather than "skip one it does not". A pipeline kept somewhere this
// module does not know about is therefore invisible, and the repository gets
// the full install.
test('a pipeline outside the conventional directories is not detected', () => {
  const cwd = tmp();
  write(cwd, 'build/custom/steps.yaml', '- template: jobs/sonarqube.yaml');
  assert.deepEqual(surveyRepo(cwd).tools, []);
});

test('an oversized CI file is skipped rather than read', () => {
  const cwd = tmp();
  write(cwd, 'cicd/generated.yaml', `# ${'x'.repeat(300 * 1024)}\ngitleaks`);
  assert.deepEqual(surveyRepo(cwd).tools, []);
});

// Redline's own gate runs trufflehog. Read back as "this repository already
// runs a secret scanner", it stood down the gate's own secrets job: on every
// repository with a vendored gate, the second `redline init` switched off the
// one security job no label can waive.
test("Redline's own vendored gate is not evidence of a tool the repository runs", () => {
  const cwd = tmp();
  write(
    cwd,
    '.github/workflows/redline-gate.yml',
    '# Managed by Redline. Regenerate with `redline init --repair`; edits here are overwritten.\n' +
      'jobs:\n  secrets:\n    steps:\n      - uses: trufflesecurity/trufflehog@abc\n'
  );
  write(cwd, '.azuredevops/redline-gate.yml', '# Managed by Redline; regenerate with `redline init`\n- script: trufflehog\n');
  const survey = surveyRepo(cwd);
  assert.deepEqual(survey.tools, []);
  assert.deepEqual(survey.standDown, []);
});

test("a repository's own pipeline beside Redline's gate is still detected", () => {
  const cwd = tmp();
  write(cwd, '.github/workflows/redline-gate.yml', '# Managed by Redline.\n- uses: trufflesecurity/trufflehog@abc\n');
  write(cwd, '.github/workflows/security.yml', 'jobs:\n  scan:\n    steps:\n      - uses: trufflesecurity/trufflehog@def\n');
  const survey = surveyRepo(cwd);
  assert.deepEqual(survey.tools.map((t) => t.id), ['trufflehog']);
});
