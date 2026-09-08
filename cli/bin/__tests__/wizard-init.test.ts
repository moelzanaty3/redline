import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../redline.ts';
import { fakePlatform } from '../../commands/__tests__/fake-platform.ts';
import { Cancelled, type Choice, type Prompter } from '../../ui/prompt.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redline-wiz-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"19"}}');
  return dir;
}

// Answers every question with its preselected default, which is what pressing
// enter through the menu does.
function defaults(overrides: Record<string, unknown> = {}): { prompter: Prompter; seen: string[] } {
  const seen: string[] = [];
  const prompter: Prompter = {
    intro: () => {},
    outro: () => {},
    note: () => {},
    async select<T>(title: string, choices: readonly Choice<T>[], initial?: T): Promise<T> {
      seen.push(title);
      if (title in overrides) return overrides[title] as T;
      return initial !== undefined && choices.some((c) => c.value === initial)
        ? initial
        : choices[0]!.value;
    },
    async multiselect<T>(title: string, _c: readonly Choice<T>[], initial: readonly T[] = []) {
      seen.push(title);
      return (title in overrides ? overrides[title] : [...initial]) as T[];
    },
    async confirm(_t, v = true) {
      return v;
    },
  };
  return { prompter, seen };
}

function deps(cwd: string, prompter: Prompter, interactive = true) {
  const lines: string[] = [];
  return {
    lines,
    opts: {
      cwd,
      root,
      sink: { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) },
      resolvePlatform: async () => fakePlatform(),
      isInteractive: () => interactive,
      prompter: () => prompter,
    },
  };
}

test('bare `redline init` at a terminal walks the menu', async () => {
  const { prompter, seen } = defaults();
  const { opts } = deps(repo(), prompter);
  assert.equal(await run(['init'], opts), 0);
  assert.ok(seen.length >= 6, `only asked ${seen.length}: ${seen.join(' | ')}`);
});

// The whole reason the scripted path must stay reachable: a prompt in CI is a
// hang with nobody there to answer it.
test('a non-interactive run asks nothing and behaves exactly as before', async () => {
  const { prompter, seen } = defaults();
  const { opts } = deps(repo(), prompter, false);
  assert.equal(await run(['init', '--dry-run'], opts), 0);
  assert.deepEqual(seen, []);
});

// Any flag at all means the caller has already decided.
test('a flag suppresses the menu even at a terminal', async () => {
  const { prompter, seen } = defaults();
  const { opts } = deps(repo(), prompter);
  assert.equal(await run(['init', '--dry-run'], opts), 0);
  assert.deepEqual(seen, []);
});

// Offering a dry run is half the point, and it has to actually be dry.
test('choosing Dry run writes nothing and says so', async () => {
  const { prompter } = defaults({ 'Ready?': 'dry-run' });
  const { opts, lines } = deps(repo(), prompter);
  assert.equal(await run(['init'], opts), 0);
  assert.ok(lines.some((l) => l.includes('dry run — nothing was written')), lines.join('\n'));
});

test('choosing Apply runs the real onboarding', async () => {
  const { prompter } = defaults({ 'Ready?': 'apply' });
  const { opts, lines } = deps(repo(), prompter);
  assert.equal(await run(['init'], opts), 0);
  assert.ok(!lines.some((l) => l.includes('dry run')), lines.join('\n'));
});

// The run that made the operator re-run init: the pull request existed, the
// working tree was clean, and nothing said why.
test('an applied run explains why the working tree looks untouched', async () => {
  const { prompter } = defaults({ 'Ready?': 'apply' });
  const { opts, lines } = deps(repo(), prompter);
  await run(['init'], opts);
  const out = lines.join('\n');
  assert.match(out, /pull request: /);
  assert.match(out, /committed on redline\/onboard and pushed, not in your working/);
  assert.match(out, /git status` here stays clean/);
});

test('a deselected capability in the menu becomes a real skip', async () => {
  const { prompter } = defaults({
    'Ready?': 'apply',
    'What should Redline install?': ['labels'],
  });
  const { opts, lines } = deps(repo(), prompter);
  assert.equal(await run(['init'], opts), 0);
  assert.ok(
    lines.some((l) => l.startsWith('opted out:') && l.includes('gate')),
    lines.join('\n')
  );
});

// Cancelling is a decision, not a failure: no `error` line, and an exit code a
// wrapping script reads as an interrupt rather than a broken onboarding.
test('Ctrl-C at a prompt exits 130 without printing an error', async () => {
  const cancelling: Prompter = {
    intro: () => {},
    outro: () => {},
    note: () => {},
    async select<T>(): Promise<T> {
      throw new Cancelled();
    },
    async multiselect<T>(): Promise<T[]> {
      throw new Cancelled();
    },
    async confirm() {
      return true;
    },
  };
  const { opts, lines } = deps(repo(), cancelling);
  assert.equal(await run(['init'], opts), 130);
  assert.ok(!lines.some((l) => l.startsWith('error')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('cancelled — nothing was written')));
});

test('--pipeline rejects a name that is neither of the two', async () => {
  const { prompter } = defaults();
  const { opts, lines } = deps(repo(), prompter, false);
  assert.equal(await run(['init', '--pipeline', 'jenkins'], opts), 2);
  assert.ok(lines.some((l) => l.includes('github-actions or azure-pipelines')), lines.join('\n'));
});

test('--pipeline azure-pipelines is accepted on the scripted path', async () => {
  const { prompter } = defaults();
  const { opts } = deps(repo(), prompter, false);
  assert.equal(await run(['init', '--pipeline', 'azure-pipelines', '--dry-run'], opts), 0);
});
