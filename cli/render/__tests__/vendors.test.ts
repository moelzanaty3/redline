import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';
import { VENDORS, type RenderContext } from '../vendors.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = loadManifest(root);

function ctx(profileName: string): RenderContext {
  const { profile, stacks } = resolveProfile(manifest, profileName);
  return { manifest, root, profile, stacks };
}

test('copilot writes a merged core file and one generated file per stack', () => {
  const out = VENDORS['copilot']!(ctx('web'));
  const paths = [...out.files.keys()].sort();
  assert.deepEqual(paths, [
    '.github/copilot-instructions.md',
    '.github/instructions/redline-javascript.instructions.md',
    '.github/instructions/redline-react.instructions.md',
  ]);
  assert.equal(out.files.get('.github/copilot-instructions.md')?.merge, true);
  assert.equal(out.files.get('.github/instructions/redline-react.instructions.md')?.merge, undefined);
});

test('copilot applyTo is a quoted comma-joined glob list', () => {
  const out = VENDORS['copilot']!(ctx('infra'));
  const body = out.files.get('.github/instructions/redline-terraform.instructions.md')?.body ?? '';
  assert.ok(body.startsWith('---\napplyTo: "**/*.tf,**/*.tfvars,**/*.hcl"\n---\n\n'));
});

test('copilot prunes only its own generated instruction files', () => {
  const [rule] = VENDORS['copilot']!(ctx('web')).prune;
  assert.equal(rule?.dir, '.github/instructions');
  assert.equal(rule?.matches('redline-react.instructions.md'), true);
  assert.equal(rule?.matches('team-owned.instructions.md'), false);
  assert.equal(rule?.matches('redline-notes.md'), false);
});

test('agents emits one merged AGENTS.md with demoted stack headings', () => {
  const out = VENDORS['agents']!(ctx('web'));
  assert.deepEqual([...out.files.keys()], ['AGENTS.md']);
  const file = out.files.get('AGENTS.md');
  assert.equal(file?.merge, true);
  assert.ok(file!.body.includes('\n# Stack rules\n'));
  assert.ok(file!.body.includes('_Applies to: `**/*.js`, `**/*.jsx`, `**/*.mjs`, `**/*.cjs`_'));
  assert.ok(file!.body.includes('## JavaScript Review Rules'));
});

test('claude emits a fixed pointer at AGENTS.md', () => {
  const out = VENDORS['claude']!(ctx('web'));
  assert.deepEqual([...out.files.keys()], ['CLAUDE.md']);
  assert.equal(
    out.files.get('CLAUDE.md')?.body,
    'Engineering standards and review rules for this repository are defined by Redline\n' +
      'and rendered into `AGENTS.md`. They are binding for all work in this repo.\n' +
      '\n' +
      '@AGENTS.md'
  );
});

test('cursor globs are unquoted and per-stack files carry no header comment', () => {
  const out = VENDORS['cursor']!(ctx('infra'));
  const body = out.files.get('.cursor/rules/redline-terraform.mdc')?.body ?? '';
  assert.ok(
    body.startsWith(
      '---\ndescription: Redline Terraform / HCL rules\nglobs: **/*.tf,**/*.tfvars,**/*.hcl\nalwaysApply: false\n---\n\n'
    )
  );
  assert.ok(!body.includes('<!-- Redline v'));
  assert.ok(out.files.get('.cursor/rules/redline-core.mdc')?.body.includes('alwaysApply: true'));
});
