import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { COMMANDS, completionScript, completionTree, SHELLS, type CommandName } from '../commands.ts';
import { METRICS_COMMANDS, REGISTRY_COMMAND } from '../../metrics/options.ts';

const names = Object.keys(COMMANDS) as CommandName[];

// A synopsis line lists flags; only a description line documents one.
const described = (help: readonly string[]): string =>
  help.filter((line) => !/^ {2}redline /.test(line) && !/^ {10,}\[/.test(line)).join('\n');

test('every flag a command accepts is described in its help', () => {
  const undescribed: string[] = [];
  for (const name of names) {
    const { help, options } = COMMANDS[name];
    if (help === null) continue;
    const text = described(help);
    for (const flag of Object.keys(options)) {
      if (!new RegExp(`--${flag}(?![\\w-])`).test(text)) undescribed.push(`redline ${name} --${flag}`);
    }
  }
  assert.deepEqual(undescribed, [], 'accepted but never described in --help');
});

test('every flag a command help mentions is one it accepts', () => {
  for (const name of names) {
    const { help, options } = COMMANDS[name];
    if (help === null) continue;
    for (const [, flag] of help.join('\n').matchAll(/(?<![\w-])--([a-z][\w-]*)/g)) {
      assert.ok(
        flag !== undefined && Object.hasOwn(options, flag),
        `redline ${name} --help mentions --${flag}, which redline ${name} refuses`
      );
    }
  }
});

const tree = completionTree(METRICS_COMMANDS, REGISTRY_COMMAND);

test('completion offers every command, every flag and every metrics subcommand', () => {
  for (const shell of SHELLS) {
    const script = completionScript(shell, tree);
    for (const name of names) assert.ok(script.includes(name), `${shell} completion is missing ${name}`);
    for (const flag of Object.keys(COMMANDS.init.options)) {
      assert.ok(script.includes(shell === 'fish' ? `-l ${flag}` : `--${flag}`), `${shell} is missing --${flag}`);
    }
    for (const sub of Object.keys(METRICS_COMMANDS)) assert.ok(script.includes(sub), `${shell} is missing metrics ${sub}`);
  }
});

test('an apostrophe in a summary cannot end a quoted string early', () => {
  const script = completionScript('zsh', {
    commands: [{ name: 'x', summary: "the repository's rung: now", flags: [] }],
    metrics: [],
  });
  assert.ok(script.includes(`'x:the repository'\\''s rung\\: now'`));
});

const has = (bin: string): boolean => spawnSync(bin, ['-c', 'exit 0']).status === 0;

for (const shell of SHELLS) {
  test(`the ${shell} script parses`, { skip: has(shell) ? false : `${shell} is not installed` }, () => {
    const result = spawnSync(shell, ['-n'], { input: completionScript(shell, tree), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}
