import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadManifest } from '../manifest.ts';
import { resolveProfile } from '../profile.ts';

const manifest = loadManifest(fileURLToPath(new URL('../../../', import.meta.url)));

test('resolves a plain profile in manifest order', () => {
  assert.deepEqual(resolveProfile(manifest, 'web-react'), {
    profile: 'web-react',
    stacks: ['javascript', 'react'],
  });
});

// `web` predates the split into one profile per framework. Repositories onboarded
// before it still carry it in .redline.json, and resolving it has to keep meaning
// exactly what it meant then — react — or their next render silently changes rules.
test('the legacy web alias still resolves to react', () => {
  assert.deepEqual(resolveProfile(manifest, 'web'), {
    profile: 'web-react',
    stacks: ['javascript', 'react'],
  });
});

test('each framework profile carries javascript plus its own stack', () => {
  for (const [name, stack] of [
    ['web-angular', 'angular'],
    ['web-vue', 'vue'],
    ['web-svelte', 'svelte'],
    ['web-vanilla', 'dom'],
  ] as const) {
    assert.deepEqual(resolveProfile(manifest, name).stacks, ['javascript', stack]);
  }
});

test('resolves an alias to its target key', () => {
  const r = resolveProfile(manifest, 'mobile');
  assert.equal(r.profile, 'mobile-rn');
});

test('a parent stack always precedes the child that extends it', () => {
  const { stacks } = resolveProfile(manifest, 'mobile-rn');
  assert.deepEqual(stacks, ['javascript', 'react', 'react-native']);
});

test('a stack is listed once even when reached twice', () => {
  const { stacks } = resolveProfile(manifest, 'fullstack-node');
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
  assert.deepEqual(stacks, ['terraform', 'javascript', 'react']);
});

// `.redline.json` records one string and every reader hands it straight back
// here, so the recorded name has to be canonical. Two operators choosing the
// same two profiles in a different order must produce byte-identical artifacts,
// or verify's artifacts-current finding flaps between their runs.
test('the recorded name is sorted, so order of selection cannot matter', () => {
  const one = resolveProfile(manifest, 'web-react,infra');
  const other = resolveProfile(manifest, 'infra,web-react');
  assert.equal(one.profile, 'infra,web-react');
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
    stacks: ['javascript', 'react'],
  });
});

test('a stack two profiles share is listed once', () => {
  const { stacks } = resolveProfile(manifest, 'web,service-node');
  assert.equal(new Set(stacks).size, stacks.length);
  assert.ok(stacks.includes('react') && stacks.includes('nodejs'));
});

test('aliases resolve per element in a list', () => {
  assert.equal(resolveProfile(manifest, 'mobile,infra').profile, 'infra,mobile-rn');
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
