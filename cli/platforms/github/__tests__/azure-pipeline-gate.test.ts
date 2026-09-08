import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AZURE_PIPELINE_PATH, createGitHubInstall } from '../install.ts';
import type { GitHubClient } from '../client.ts';
import type { GateOptions, RepoRef } from '../../types.ts';

const roots: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-azpipe-'));
  roots.push(dir);
  return dir;
};
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const REF: RepoRef = {
  host: 'github',
  org: 'acme',
  repo: 'checkout',
  defaultBranch: 'main',
};

const OPTS: GateOptions = {
  pipeline: 'azure-pipelines',
  adrDiffThreshold: 300,
  failOnDependencySeverity: 'high',
  softFailLabels: ['redline-exempt', 'redline-sync'],
};

// The Azure Pipelines path must reach no host at all: there is no reusable
// workflow to resolve and no Azure Repos policy to attach, and a request here
// would make the whole path need a credential it has no use for.
const refusingClient: GitHubClient = {
  async rest(_method: string, path: string) {
    throw new Error(`no host call expected, got ${path}`);
  },
  async graphql<T>(): Promise<T> {
    throw new Error('no host call expected');
  },
};

const install = createGitHubInstall(refusingClient, () => {
  throw new Error('git not used');
});

test('an Azure Pipelines gate writes a pipeline definition, never an Actions workflow', async () => {
  const cwd = tmp();
  const result = await install.installGate(REF, cwd, OPTS);

  assert.ok(result.files.includes(AZURE_PIPELINE_PATH));
  assert.ok(!result.files.includes('.github/workflows/redline.yml'));
  assert.equal(existsSync(join(cwd, '.github/workflows/redline.yml')), false);
});

// The failure this path exists to remove: a GitHub Actions caller in a
// repository that runs no Actions gate, reported as `applied`.
test('registering the pipeline is reported as work an administrator still owes', async () => {
  const result = await install.installGate(REF, tmp(), OPTS);
  const gate = result.outcomes.find((o) => o.capability === 'gate');
  assert.equal(gate?.status, 'denied');
  assert.match(gate!.detail, /register it as a pipeline in Azure DevOps/);
});

test('the gate options are substituted into the written pipeline', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, { ...OPTS, adrDiffThreshold: 42, softFailLabels: ['skip-me'] });
  const yml = readFileSync(join(cwd, AZURE_PIPELINE_PATH), 'utf8');
  assert.match(yml, /ADR_DIFF_THRESHOLD: 42/);
  assert.match(yml, /SOFT_FAIL_LABELS: skip-me/);
  assert.match(yml, /FAIL_ON_DEPENDENCY_SEVERITY: high/);
});

// SECURITY REGRESSION GUARD. Each of these is a property the gate depends on,
// and each is a silent failure if it regresses: an unpinned scanner image is a
// supply-chain edge on every pull request, `--results=verified` is what keeps
// the unwaivable check free of false positives, and the two branches below are
// what stop a label waiving a verified credential in the diff.
test('the pipeline pins the scanner and refuses to let a label waive it', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const yml = readFileSync(join(cwd, AZURE_PIPELINE_PATH), 'utf8');

  assert.match(yml, /trufflesecurity\/trufflehog@sha256:[0-9a-f]{64} # \d+\.\d+\.\d+/);
  assert.match(yml, /--results=verified/);
  assert.match(yml, /if \[ "\$\{REDLINE_SECURITY_FAILED:-\}" = "true" \]; then/);
  // Fail-closed: an exemption that cannot be read is not an exemption.
  assert.match(yml, /if \[ -z "\$\{GH_TOKEN:-\}" \]/);
});

// A `pr:` trigger is the mechanism here and its absence would mean the pipeline
// never runs on a pull request at all. The Azure Repos template beside this one
// deliberately has none, so this is the difference worth asserting.
test('the pipeline triggers on pull requests, unlike the Azure Repos template', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const mine = readFileSync(join(cwd, AZURE_PIPELINE_PATH), 'utf8');
  assert.match(mine, /^pr:$/m);

  const azureRepos = readFileSync(
    join(import.meta.dirname, '../../../../platforms/azure/gate-template.yml'),
    'utf8'
  );
  assert.doesNotMatch(azureRepos, /^pr:$/m);
});

// The status POST addresses an Azure Repos pull request. On a GitHub-hosted
// repository that pull request does not exist, so the call would 404 forever
// while the check GitHub actually reads comes from the build result.
test('the pipeline posts no Azure Repos status', async () => {
  const cwd = tmp();
  await install.installGate(REF, cwd, OPTS);
  const yml = readFileSync(join(cwd, AZURE_PIPELINE_PATH), 'utf8');
  assert.doesNotMatch(yml, /_apis\/git\/repositories/);
  assert.doesNotMatch(yml, /statuses\?api-version/);
});

test('a check run writes nothing and reports no outcome', async () => {
  const cwd = tmp();
  const result = await install.installGate(REF, cwd, OPTS, true);
  assert.ok(result.files.includes(AZURE_PIPELINE_PATH));
  assert.deepEqual(result.outcomes, []);
  assert.equal(existsSync(join(cwd, AZURE_PIPELINE_PATH)), false);
});
