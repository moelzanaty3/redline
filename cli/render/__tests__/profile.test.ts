import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';

const manifest = loadManifest(fileURLToPath(new URL('../../../', import.meta.url)));

test('resolves a plain profile in manifest order', () => {
  assert.deepEqual(resolveProfile(manifest, 'web-react'), {
    profile: 'web-react',
    stacks: ['javascript', 'typescript', 'react'],
  });
});

// `web` predates the split into one profile per framework. Repositories onboarded
// before it still carry it in .redline.json, and resolving it has to keep meaning
// exactly what it meant then — react — or their next render silently changes rules.
test('the legacy web alias still resolves to react', () => {
  assert.deepEqual(resolveProfile(manifest, 'web'), {
    profile: 'web-react',
    stacks: ['javascript', 'typescript', 'react'],
  });
});

test('each framework profile carries javascript, typescript and its own stack', () => {
  for (const [name, stack] of [
    ['web-angular', 'angular'],
    ['web-vue', 'vue'],
    ['web-svelte', 'svelte'],
    ['web-typescript', 'dom'],
  ] as const) {
    assert.deepEqual(resolveProfile(manifest, name).stacks, ['javascript', 'typescript', stack]);
  }
});

// Every profile that was renamed keeps its old name as an alias, so a
// repository onboarded before the rename, and every script passing --profile,
// still resolves — and is recorded under the new name from then on.
test('every old profile name resolves to the profile it was renamed to', () => {
  for (const [old, now] of [
    ['tooling', 'typescript'],
    ['web-vanilla', 'web-typescript'],
    ['web-next', 'web-nextjs'],
    ['mobile-rn', 'mobile-react-native'],
    ['infra', 'infra-terraform'],
    ['fullstack-node', 'fullstack-react-node'],
    ['lib-effect', 'typescript-effect'],
  ] as const) {
    assert.equal(resolveProfile(manifest, old).profile, now);
  }
});

test('resolves an alias to its target key', () => {
  const r = resolveProfile(manifest, 'mobile');
  assert.equal(r.profile, 'mobile-react-native');
});

test('a parent stack always precedes the child that extends it', () => {
  const { stacks } = resolveProfile(manifest, 'mobile-react-native');
  assert.deepEqual(stacks, ['javascript', 'typescript', 'react', 'react-native']);
});

test('a stack is listed once even when reached twice', () => {
  const { stacks } = resolveProfile(manifest, 'fullstack-react-node');
  assert.equal(new Set(stacks).size, stacks.length);
});

test('an unknown profile names the known ones', () => {
  assert.throws(
    () => resolveProfile(manifest, 'nope'),
    /unknown profile "nope"/
  );
});

// A repository is routinely more than one bundle — a React application with its
// own Terraform beside it — and a single choice made it pick the half that
// fitted worst.
test('several profiles resolve to the union of their stacks', () => {
  const { stacks } = resolveProfile(manifest, 'web,infra');
  assert.deepEqual(stacks, ['terraform', 'javascript', 'typescript', 'react']);
});

// `.redline.json` records one string and every reader hands it straight back
// here, so the recorded name has to be canonical. Two operators choosing the
// same two profiles in a different order must produce byte-identical artifacts,
// or verify's artifacts-current finding flaps between their runs.
test('the recorded name is sorted, so order of selection cannot matter', () => {
  const one = resolveProfile(manifest, 'web-react,infra');
  const other = resolveProfile(manifest, 'infra-terraform,web-react');
  assert.equal(one.profile, 'infra-terraform,web-react');
  assert.deepEqual(one, other);
});

test('a profile named twice is resolved once', () => {
  assert.deepEqual(resolveProfile(manifest, 'web,web'), resolveProfile(manifest, 'web'));
});

// The alias and its target are the same profile written two ways: a repository
// that says both must not render react's rules twice.
test('an alias and its target collapse to one profile', () => {
  assert.deepEqual(resolveProfile(manifest, 'web,web-react'), {
    profile: 'web-react',
    stacks: ['javascript', 'typescript', 'react'],
  });
});

test('a stack two profiles share is listed once', () => {
  const { stacks } = resolveProfile(manifest, 'web,service-node');
  assert.equal(new Set(stacks).size, stacks.length);
  assert.ok(stacks.includes('react') && stacks.includes('nodejs'));
});

test('aliases resolve per element in a list', () => {
  assert.equal(resolveProfile(manifest, 'mobile,infra').profile, 'infra-terraform,mobile-react-native');
});

test('one bad name in a list names that name, not the whole list', () => {
  assert.throws(() => resolveProfile(manifest, 'web,nope'), /unknown profile "nope"/);
});

// A config written by an older CLI carries a bare profile name and has to keep
// resolving byte-identically — this function is what every reader of that field
// calls.
test('whitespace and empty segments are tolerated, an empty list is not', () => {
  assert.deepEqual(resolveProfile(manifest, ' web , infra ,'), resolveProfile(manifest, 'infra,web'));
  assert.throws(() => resolveProfile(manifest, ' , '), /no profile given/);
});

// typescript-effect is added on top of a base profile, and effect extends typescript,
// so the TypeScript rules arrive once and before the Effect rules that build on them.
test('typescript-effect layers on a base profile without repeating typescript', () => {
  const { stacks } = resolveProfile(manifest, 'service-node,typescript-effect');
  assert.equal(stacks.filter((s) => s === 'typescript').length, 1);
  assert.ok(stacks.indexOf('typescript') < stacks.indexOf('effect'));
  assert.ok(stacks.includes('nodejs'));
});
