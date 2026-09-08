import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';
import { VENDORS, type RenderContext } from '../vendors.ts';
import { ONBOARD_BRANCH, SYNC_LABEL } from '../../commands/init.ts';
import { verify } from '../../commands/verify.ts';
import { REQUIRED_CHECK } from '../../platforms/github/install.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const journeyPath = fileURLToPath(new URL('../../../web/components/journey.tsx', import.meta.url));
const manifest = loadManifest(root);

function ctx(profileName: string): RenderContext {
  const { profile, stacks } = resolveProfile(manifest, profileName);
  return { manifest, root, profile, stacks, contexts: [], local: null };
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

// web/components/journey.tsx hardcodes several CLI constants with source
// comments, because cli/'s .ts specifiers do not resolve through Next's
// bundler and the page cannot import them. This pins the source side of that
// mirror, so a change here fails CI instead of silently falsifying the page.
// A wrong implementation that renders a fourth vendor with `merge: true` —
// or changes any of the other three literals — trips this without anyone
// having to notice the drift by eye in the rendered page.
test('web/components/journey.tsx mirrors these CLI constants verbatim', () => {
  const PROFILE = 'web';
  // Pins that PROFILE stays a profile the manifest can actually resolve —
  // resolveProfile throws otherwise, exactly as it would for the page's own
  // build-time resolveStacks(manifest, PROFILE).
  assert.doesNotThrow(() => resolveProfile(manifest, PROFILE));

  const mergedVendors = Object.keys(VENDORS)
    .filter((name) => [...VENDORS[name]!(ctx(PROFILE)).files.values()].some((f) => f.merge === true))
    .sort();
  assert.deepEqual(mergedVendors, ['agents', 'claude', 'copilot']);

  assert.equal(REQUIRED_CHECK, 'redline-gate / gate');
  assert.equal(ONBOARD_BRANCH, 'redline/onboard');
  assert.equal(SYNC_LABEL, 'redline-sync');
});

// The journey page used to carry a "before" probe showing `redline verify`'s
// literal "not onboarded" hint. It no longer renders one — the home page was cut
// back to the transcript alone — so this pins the invariant rather than the
// layout: *if* the page quotes that hint, it must be the sentence verify()
// actually prints. The hint is not an exported constant (verify.ts builds it
// inline from opts.cwd), so it is derived by running verify() against an empty
// repo and substituting the page's illustrative cwd. Written this way the guard
// survives the page being restructured, and still fails the moment someone
// re-adds the probe with drifted wording — which is the drift it exists to catch.
// Hardcoding the sentence in both files would only move that drift somewhere else.
test('web/components/journey.tsx quotes the "not onboarded" hint verbatim, if at all', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'redline-journey-hint-'));
  try {
    const report = await verify(
      () => {
        throw new Error('unreachable: no .redline.json short-circuits before the platform resolves');
      },
      { cwd, root }
    );
    const detail = report.findings.find((f) => f.check === 'onboarded')?.detail ?? '';
    const prefix = `no ${cwd}`;
    assert.ok(detail.startsWith(prefix), detail);
    const expected = `no /src/checkout-service${detail.slice(prefix.length)}`;

    const journeySource = readFileSync(journeyPath, 'utf8');
    // The illustrative path is the tell. Its absence means the page makes no
    // claim about this hint at all, which is the state today and is fine; its
    // presence means the page is quoting verify() and owes an exact match.
    if (!journeySource.includes('/src/checkout-service')) return;
    assert.ok(
      journeySource.includes(expected),
      `journey.tsx quotes the "not onboarded" hint but not as verify() prints it.\nexpected: ${expected}`
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
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
