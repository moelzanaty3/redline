import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../standards.ts';

const REAL_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The org manifest is a hard ceiling and skills ships off, so a measurement or a
// render of it needs a root where it is on. Copying standards/ is cheap and keeps
// the real manifest untouched.
function rootWithSkills(): string {
  const root = mkdtempSync(join(tmpdir(), 'redline-skills-root-'));
  cpSync(join(REAL_ROOT, 'standards'), join(root, 'standards'), { recursive: true });
  const path = join(root, 'standards/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.vendors.skills.enabled = true;
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  return root;
}

function withRender(profile: string, fn: (out: string, root: string) => void, vendors = ['skills']): void {
  const root = rootWithSkills();
  const out = mkdtempSync(join(tmpdir(), 'redline-skills-out-'));
  try {
    render({ root, profile, out, vendors });
    fn(out, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
}

test('one skill per stack, plus core', () => {
  withRender('web', (out) => {
    const names = readdirSync(join(out, '.claude/skills')).sort();
    assert.deepEqual(names, ['redline-core', 'redline-javascript', 'redline-react']);
  });
});

test('a skill carries frontmatter naming itself and when to load', () => {
  withRender('web', (out) => {
    const body = readFileSync(join(out, '.claude/skills/redline-react/SKILL.md'), 'utf8');
    assert.match(body, /^---\nname: redline-react\n/);
    assert.match(body, /description: >-/);
    assert.match(body, /React \(web\)/);
    // The description is the whole trigger mechanism — a skill loads on it, not
    // on a glob — so it has to name the file types.
    assert.match(body, /Covers \.tsx/);
  });
});

test('the rules are the stack’s own markdown, unmodified', () => {
  // Packaging, not authoring. No Claude-shaped concept may leak backward into
  // how a rule is written, so the body must be the source file byte for byte.
  withRender('web', (out, root) => {
    const source = readFileSync(join(root, 'standards/stacks/react.md'), 'utf8').trimEnd();
    const skill = readFileSync(join(out, '.claude/skills/redline-react/SKILL.md'), 'utf8');
    assert.ok(skill.includes(source), 'the stack markdown appears verbatim in the skill');
  });
});

test('core is a skill of its own, not split across the stacks', () => {
  // It carries the output contract and the security floor and is not
  // stack-scoped. Splitting it would duplicate it per stack and let a repository
  // end up with none of it.
  withRender('web', (out) => {
    const core = readFileSync(join(out, '.claude/skills/redline-core/SKILL.md'), 'utf8');
    assert.match(core, /output contract/i);
  });
});

test('a stack leaving the profile takes its skill with it', () => {
  const root = rootWithSkills();
  const out = mkdtempSync(join(tmpdir(), 'redline-skills-out-'));
  try {
    render({ root, profile: 'web', out, vendors: ['skills'] });
    assert.ok(readdirSync(join(out, '.claude/skills')).includes('redline-react'));

    const second = render({ root, profile: 'tooling', out, vendors: ['skills'] });

    assert.deepEqual(readdirSync(join(out, '.claude/skills')).sort(), ['redline-core', 'redline-javascript']);
    assert.ok(second.removed.includes('.claude/skills/redline-react'));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('a second render of the same profile changes nothing', () => {
  const root = rootWithSkills();
  const out = mkdtempSync(join(tmpdir(), 'redline-skills-out-'));
  try {
    render({ root, profile: 'web', out, vendors: ['skills'] });
    const second = render({ root, profile: 'web', out, vendors: ['skills'] });

    assert.deepEqual(second.written, []);
    assert.deepEqual(second.removed, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('skills is off in the shipped manifest, so no repository gets it by accident', () => {
  // It renders the same rules as the claude vendor in a different shape. A
  // repository selecting both loads every stack twice, which is the opposite of
  // the point.
  const manifest = JSON.parse(readFileSync(join(REAL_ROOT, 'standards/manifest.json'), 'utf8'));
  assert.equal(manifest.vendors.skills.enabled, false);
});

test('per-stack loading is smaller than the composed standard on a multi-stack profile', () => {
  const root = rootWithSkills();
  const skillsOut = mkdtempSync(join(tmpdir(), 'sk-'));
  const composedOut = mkdtempSync(join(tmpdir(), 'cl-'));
  try {
    render({ root, profile: 'fullstack-node', out: skillsOut, vendors: ['skills'] });
    render({ root, profile: 'fullstack-node', out: composedOut, vendors: ['claude', 'agents'] });

    const dir = join(skillsOut, '.claude/skills');
    const size = (n: string) => readFileSync(join(dir, n, 'SKILL.md'), 'utf8').length;
    const oneStack = size('redline-core') + size('redline-react');
    const composed = readFileSync(join(composedOut, 'AGENTS.md'), 'utf8').length;

    assert.ok(oneStack < composed, `${oneStack} should be less than ${composed}`);
  } finally {
    for (const d of [root, skillsOut, composedOut]) rmSync(d, { recursive: true, force: true });
  }
});

test('per-stack loading is NOT smaller on a single-stack profile', () => {
  // The measured finding, pinned so it cannot be quietly forgotten during a
  // rollout: with one stack there is no second one to avoid loading, so the
  // frontmatter is pure overhead. Selecting skills there makes the repository
  // worse.
  const root = rootWithSkills();
  const skillsOut = mkdtempSync(join(tmpdir(), 'sk-'));
  const composedOut = mkdtempSync(join(tmpdir(), 'cl-'));
  try {
    render({ root, profile: 'infra', out: skillsOut, vendors: ['skills'] });
    render({ root, profile: 'infra', out: composedOut, vendors: ['claude', 'agents'] });

    const dir = join(skillsOut, '.claude/skills');
    const size = (n: string) => readFileSync(join(dir, n, 'SKILL.md'), 'utf8').length;
    const total = readdirSync(dir).reduce((a, n) => a + size(n), 0);
    const composed = readFileSync(join(composedOut, 'AGENTS.md'), 'utf8').length;

    assert.ok(total > composed, `${total} should exceed ${composed} — one stack has nothing to save`);
  } finally {
    for (const d of [root, skillsOut, composedOut]) rmSync(d, { recursive: true, force: true });
  }
});
