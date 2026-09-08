import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findExistingPipeline } from '../facts.ts';
import { runWizard, type WizardFacts } from '../wizard.ts';
import type { Choice, Prompter } from '../prompt.ts';

const roots: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'redline-wizard-'));
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

// A prompter that answers every question with whatever the preselected default
// was, and records what it was asked. Pressing enter through the whole menu is
// the single most common way it will be used, so it is the path that has to be
// right — and asserting on the recorded defaults is how "the menu preselects
// what detection found" gets tested without a terminal.
interface Asked {
  title: string;
  labels: string[];
  hints: (string | undefined)[];
  initial: unknown;
}

function acceptDefaults(overrides: Record<string, unknown> = {}): {
  prompter: Prompter;
  asked: Asked[];
  notes: string[];
} {
  const asked: Asked[] = [];
  const notes: string[] = [];
  const prompter: Prompter = {
    intro: () => {},
    outro: () => {},
    note: (message) => notes.push(message),
    async select<T>(title: string, choices: readonly Choice<T>[], initial?: T): Promise<T> {
      asked.push({
        title,
        labels: choices.map((c) => c.label),
        hints: choices.map((c) => c.hint),
        initial,
      });
      if (title in overrides) return overrides[title] as T;
      return initial !== undefined && choices.some((c) => c.value === initial)
        ? initial
        : choices[0]!.value;
    },
    async multiselect<T>(
      title: string,
      choices: readonly Choice<T>[],
      initial: readonly T[] = []
    ): Promise<T[]> {
      asked.push({
        title,
        labels: choices.map((c) => c.label),
        hints: choices.map((c) => c.hint),
        initial,
      });
      if (title in overrides) return overrides[title] as T[];
      return [...initial];
    },
    async confirm(_title, value = true) {
      return value;
    },
  };
  return { prompter, asked, notes };
}

const FACTS: WizardFacts = {
  manifest: {
    version: '0.0.2',
    profiles: { web: ['javascript', 'react'], 'service-node': ['javascript', 'nodejs'] },
    profileAliases: {},
    stacks: {},
    vendors: {
      copilot: { title: 'GitHub Copilot code review', enabled: true },
      claude: { title: 'Claude Code', enabled: true },
      cursor: { title: 'Cursor rules', enabled: false },
    },
    core: { source: 'standards/core.md' },
  } as unknown as WizardFacts['manifest'],
  survey: { tools: [], standDown: [] },
  detectedProfile: 'web',
  profileEvidence: ['react in dependencies'],
  detectedVendors: ['copilot'],
  detectedHost: 'github',
  existingPipeline: null,
  recorded: null,
};

test('pressing enter through the menu takes every detected default', async () => {
  const { prompter } = acceptDefaults();
  const answers = await runWizard(prompter, FACTS);

  assert.equal(answers.profile, 'web');
  assert.equal(answers.host, 'github');
  assert.equal(answers.pipeline, 'github-actions');
  assert.deepEqual(answers.vendors, ['copilot']);
  assert.equal(answers.speckit, true);
  assert.equal(answers.tmf, false);
  assert.equal(answers.rung, 'observe');
});

// The whole point of offering it: a first run should be able to see the plan
// without writing anything, and it must be the default rather than the option
// you have to know to look for.
test('the default action is a dry run, not an apply', async () => {
  const { prompter, asked } = acceptDefaults();
  const answers = await runWizard(prompter, FACTS);
  assert.equal(answers.action, 'dry-run');
  const ready = asked.find((a) => a.title === 'Ready?');
  assert.deepEqual(ready?.labels, ['Dry run', 'Apply']);
});

test('a disabled vendor is never offered', async () => {
  const { prompter, asked } = acceptDefaults();
  await runWizard(prompter, FACTS);
  const vendors = asked.find((a) => a.title.startsWith('Which assistants'));
  assert.deepEqual(vendors?.labels, ['copilot', 'claude']);
});

// The failure this replaces: a GitHub-hosted repository whose real pull request
// gate is Azure Pipelines got a GitHub Actions workflow, because the pipeline
// was derived from the host instead of asked about.
test('an existing Azure pipeline defaults the pipeline question away from Actions', async () => {
  const { prompter, asked } = acceptDefaults();
  const answers = await runWizard(prompter, {
    ...FACTS,
    existingPipeline: 'cicd/pre-merge.yaml',
  });
  assert.equal(answers.pipeline, 'azure-pipelines');
  assert.equal(answers.host, 'github');
  const question = asked.find((a) => a.title.startsWith('What runs'));
  assert.ok(question?.hints.some((h) => h?.includes('cicd/pre-merge.yaml')));
});

test('every rung is offered with an explanation, not just its name', async () => {
  const { prompter, asked } = acceptDefaults();
  await runWizard(prompter, FACTS);
  const rungs = asked.find((a) => a.title.startsWith('How hard'));
  assert.deepEqual(rungs?.labels, ['observe', 'warn', 'block-blocker', 'block-high']);
  assert.ok(rungs?.hints.every((h) => h !== undefined && h.length > 0));
});

test('review-ownership is offered but off by default', async () => {
  const { prompter, asked } = acceptDefaults();
  const answers = await runWizard(prompter, FACTS);
  const caps = asked.find((a) => a.title.startsWith('What should Redline install'));
  assert.ok(caps?.labels.includes('review-ownership'));
  assert.ok(!answers.capabilities.includes('review-ownership'));
});

// Detection is advisory, and this repository's detection has been wrong on a
// real repository. It must inform the operator, never decide for them.
test('a tool the repository already runs is reported, not acted on', async () => {
  const { prompter, notes } = acceptDefaults();
  const answers = await runWizard(prompter, {
    ...FACTS,
    survey: {
      tools: [
        { id: 'sonarqube', label: 'SonarQube', evidence: 'sonar-project.properties', standsDown: 'policy' },
      ],
      standDown: ['policy'],
    },
  });
  assert.ok(answers.capabilities.includes('gate'));
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /SonarQube already covers static analysis/);
  assert.match(notes[0]!, /adds its own on top rather than replacing/);
});

test('what .redline.json recorded outranks fresh detection on a re-run', async () => {
  const { prompter } = acceptDefaults();
  const answers = await runWizard(prompter, {
    ...FACTS,
    recorded: { profile: 'service-node', vendors: ['claude'], rung: 'warn' },
  });
  assert.equal(answers.profile, 'service-node');
  assert.deepEqual(answers.vendors, ['claude']);
  assert.equal(answers.rung, 'warn');
});

test('findExistingPipeline finds a conventional Azure pull request definition', () => {
  const cwd = tmp();
  write(cwd, 'cicd/pre-merge.yaml', 'pr:\n  - main\n');
  assert.equal(findExistingPipeline(cwd), 'cicd/pre-merge.yaml');
});

// A release pipeline is not a pull request gate, and offering to add a review
// stage to one would be wrong in a way that is hard to notice in a diff.
test('findExistingPipeline ignores a pipeline that is not pull-request shaped', () => {
  const cwd = tmp();
  write(cwd, 'cicd/release.yaml', 'trigger: none\n');
  assert.equal(findExistingPipeline(cwd), null);
});

test('findExistingPipeline reports nothing for a repository with no pipelines', () => {
  assert.equal(findExistingPipeline(tmp()), null);
});
