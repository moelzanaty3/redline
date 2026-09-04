import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { METRICS_COMMANDS, REGISTRY_COMMAND, helpFor, resolveEnv } from '../options.ts';
import { isRedlineError } from '../../core/errors.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const roi = METRICS_COMMANDS['roi']!;
const dashboard = METRICS_COMMANDS['dashboard']!;

test('a flag becomes the environment variable the runner reads', () => {
  const env = resolveEnv(roi, { days: '30' }, {}, 'metrics roi');

  assert.equal(env['DAYS'], '30');
});

test('defaults are applied for anything not given', () => {
  const env = resolveEnv(roi, {}, {}, 'metrics roi');

  assert.equal(env['DATA_DIR'], 'data');
  assert.equal(env['SPEND_CURRENCY'], 'USD');
});

test('a flag beats the environment, and the environment beats the default', () => {
  // The environment stays honoured so a scheduled job can pass a secret without
  // putting a token on a command line, where it lands in shell history and in
  // the process table.
  assert.equal(resolveEnv(roi, { days: '5' }, { DAYS: '50' }, 'x')['DAYS'], '5');
  assert.equal(resolveEnv(roi, {}, { DAYS: '50' }, 'x')['DAYS'], '50');
  assert.equal(resolveEnv(roi, {}, {}, 'x')['DAYS'], '90');
});

test('a non-numeric number is refused by name', () => {
  // It used to become NaN and produce an empty window, silently.
  assert.throws(
    () => resolveEnv(roi, { days: 'banana' }, {}, 'metrics roi'),
    (err: unknown) => isRedlineError(err) && /--days must be a number, not "banana"/.test(err.message)
  );
});

test('a value outside an enum is refused, listing what is allowed', () => {
  // SPEND_GRAIN=per-seat silently became "unknown", which made the resulting
  // number quietly less trustworthy than it looked.
  assert.throws(
    () => resolveEnv(roi, { 'spend-grain': 'per-seat' }, {}, 'metrics roi'),
    (err: unknown) => isRedlineError(err) && /must be one of repo, org, unknown/.test(err.message)
  );
});

test('a missing required flag names itself and the variable behind it', () => {
  assert.throws(
    () => resolveEnv(dashboard, {}, {}, 'metrics dashboard'),
    (err: unknown) =>
      isRedlineError(err) &&
      err.kind === 'usage' &&
      /needs --org/.test(err.message) &&
      /set ORG/.test(err.hint ?? '')
  );
});

test('a boolean flag is set only when passed, never as "false"', () => {
  // A runner testing `if (process.env.DRY_RUN)` sees the string "false" as true,
  // which would make every run a dry run.
  const collect = METRICS_COMMANDS['collect']!;
  assert.equal(resolveEnv(collect, { org: 'a', 'dry-run': true }, {}, 'x')['DRY_RUN'], '1');
  assert.equal('DRY_RUN' in resolveEnv(collect, { org: 'a', 'dry-run': false }, {}, 'x'), false);
  assert.equal('DRY_RUN' in resolveEnv(collect, { org: 'a' }, {}, 'x'), false);
});

test('an optional flag left unset contributes nothing rather than an empty string', () => {
  const env = resolveEnv(roi, {}, {}, 'x');

  assert.equal('SPEND_TOTAL' in env, false);
});

test('help is generated from the same table that validates', () => {
  const help = helpFor('metrics roi', roi);

  assert.match(help, /--spend-grain <string>/);
  assert.match(help, /\(default: USD\)/);
  assert.match(help, /Runs in: /);
});

test('help says where a command runs, because several are org infrastructure', () => {
  // A command that does not say so wastes somebody's afternoon in a product repo.
  for (const [name, spec] of Object.entries(METRICS_COMMANDS)) {
    assert.ok(spec.runsIn.length > 0, `${name} must say where it runs`);
    assert.match(helpFor(name, spec), /Runs in: /);
  }
});

test('every command points at a runner that actually ships', () => {
  // package.json "files" includes scripts/, and the command locates them from the
  // package root. A missing one is an installation that cannot work.
  for (const [name, spec] of [...Object.entries(METRICS_COMMANDS), ['registry', REGISTRY_COMMAND] as const]) {
    assert.ok(existsSync(join(ROOT, spec.script)), `${name} -> ${spec.script}`);
  }
});

test('every option declares a help line and an environment variable', () => {
  for (const [name, spec] of [...Object.entries(METRICS_COMMANDS), ['registry', REGISTRY_COMMAND] as const]) {
    for (const [flag, option] of Object.entries(spec.options)) {
      assert.ok(option.help.length > 0, `${name} --${flag} needs help text`);
      assert.match(option.env, /^[A-Z][A-Z0-9_]*$/, `${name} --${flag} env name`);
    }
  }
});
