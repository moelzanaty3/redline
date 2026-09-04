import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runMetrics, specFor } from '../run.ts';
import { isRedlineError } from '../../core/errors.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function withEnv(fn: () => Promise<void>): Promise<void> {
  const before = { ...process.env };
  return fn().finally(() => {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  });
}

test('the runner is located inside the package, not relative to dist', async () => {
  // A path relative to the compiled output breaks the moment someone installs
  // the package rather than running from a checkout.
  await withEnv(async () => {
    let loaded = '';
    await runMetrics('roi', { root: ROOT, flags: {}, env: {}, load: async (p) => void (loaded = p) });
    assert.match(loaded, /scripts\/build-roi\.mjs$/);
    assert.ok(loaded.startsWith(ROOT));
  });
});

test('validated flags reach the runner as its documented environment', async () => {
  await withEnv(async () => {
    await runMetrics('roi', {
      root: ROOT,
      flags: { days: '30', 'spend-total': '400' },
      env: {},
      load: async () => undefined,
    });
    assert.equal(process.env['DAYS'], '30');
    assert.equal(process.env['SPEND_TOTAL'], '400');
  });
});

test('an invalid flag is refused before the runner is loaded at all', async () => {
  // Rather than surfacing as a 401 halfway through an org walk.
  await withEnv(async () => {
    let loaded = false;
    await assert.rejects(
      () =>
        runMetrics('dashboard', {
          root: ROOT,
          flags: { org: 'acme', days: 'banana' },
          env: {},
          load: async () => void (loaded = true),
        }),
      (err: unknown) => isRedlineError(err) && err.kind === 'usage'
    );
    assert.equal(loaded, false, 'nothing should have been loaded');
  });
});

test('an unknown subcommand lists the ones that exist', async () => {
  assert.throws(
    () => specFor('dashbored'),
    (err: unknown) => isRedlineError(err) && /known: collect, dashboard/.test(err.hint ?? '')
  );
});

test('registry resolves to its own spec rather than a metrics one', () => {
  assert.match(specFor('registry').script, /build-registry\.mjs$/);
});
