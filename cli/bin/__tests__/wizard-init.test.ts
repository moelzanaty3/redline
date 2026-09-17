import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../redline.ts';
import { GATE_PIPELINES } from '../../platforms/types.ts';
import { fakePlatform } from '../../commands/__tests__/fake-platform.ts';
import { Cancelled, type Choice, type Prompter } from '../../ui/prompt.ts';
import { RedlineError } from '../../core/errors.ts';
import type { Platform } from '../../platforms/types.ts';

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
// enter through the menu does — except the profile, which no longer has one.
// Detection never ticks a row, so a run through the menu has to say which
// standards apply before anything else can happen.
const PROFILE_QUESTION = 'Which standards apply here?';

function defaults(overrides: Record<string, unknown> = {}): { prompter: Prompter; seen: string[] } {
  const seen: string[] = [];
  const prompter: Prompter = {
    intro: () => {},
    outro: () => {},
    note: () => {},
    task: () => ({ update: () => {}, done: () => {}, stop: () => {} }),
    async select<T>(title: string, choices: readonly Choice<T>[], initial?: T): Promise<T> {
      seen.push(title);
      if (title in overrides) return overrides[title] as T;
      return initial !== undefined && choices.some((c) => c.value === initial)
        ? initial
        : choices[0]!.value;
    },
    async multiselect<T>(title: string, choices: readonly Choice<T>[], initial: readonly T[] = []) {
      seen.push(title);
      if (title in overrides) return overrides[title] as T[];
      if (title === PROFILE_QUESTION && initial.length === 0) {
        const react = choices.find((c) => c.value === ('web-react' as unknown as T));
        return [(react ?? choices[0]!).value];
      }
      return [...initial] as T[];
    },
    async text(): Promise<string> {
      return '';
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
  assert.match(out, /Pull request/);
  assert.match(out, /https:\/\/example\/pr\/1/);
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
    lines.some((l) => l.trim().startsWith('opted out:') && l.includes('gate')),
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
    task: () => ({ update: () => {}, done: () => {}, stop: () => {} }),
    async select<T>(): Promise<T> {
      throw new Cancelled();
    },
    async multiselect<T>(): Promise<T[]> {
      throw new Cancelled();
    },
    async text(): Promise<string> {
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

// The message names every accepted value, read from the same list the parser
// validates against. Spelling them out here froze the error at two while a
// third was added, so the flag rejected `local-agent`'s name in its own advice.
test('--pipeline rejects an unknown name and names every one it accepts', async () => {
  const { prompter } = defaults();
  const { opts, lines } = deps(repo(), prompter, false);
  assert.equal(await run(['init', '--pipeline', 'jenkins'], opts), 2);
  const printed = lines.join('\n');
  for (const pipeline of GATE_PIPELINES) {
    assert.ok(printed.includes(pipeline), `${pipeline} missing from: ${printed}`);
  }
});

test('--pipeline local-agent is accepted on the scripted path', async () => {
  const { prompter } = defaults();
  const { opts } = deps(repo(), prompter, false);
  assert.equal(await run(['init', '--pipeline', 'local-agent', '--dry-run'], opts), 0);
});

test('--pipeline azure-pipelines is accepted on the scripted path', async () => {
  const { prompter } = defaults();
  const { opts } = deps(repo(), prompter, false);
  assert.equal(await run(['init', '--pipeline', 'azure-pipelines', '--dry-run'], opts), 0);
});

// The failure this exists to stop: ten questions answered, then a 404, and the
// answers gone with it. The check has to happen before the first question and
// its reason has to reach the menu.
test('an unreachable repository is reported before the first question', async () => {
  const order: string[] = [];
  const platform = fakePlatform();
  const unreachable: Platform = {
    ...platform,
    async repoRef(): Promise<never> {
      order.push('repoRef');
      throw new RedlineError(
        'host',
        'GitHub returned HTTP 404 reading /repos/acme/web',
        'that account cannot see it'
      );
    },
  };
  const notes: string[] = [];
  const { prompter, seen } = defaults();
  const watched: Prompter = {
    ...prompter,
    note: (message: string) => notes.push(message),
    async select<T>(title: string, choices: readonly Choice<T>[], initial?: T): Promise<T> {
      order.push(`ask:${title}`);
      return prompter.select(title, choices, initial);
    },
    async multiselect<T>(title: string, choices: readonly Choice<T>[], initial: readonly T[] = []) {
      order.push(`ask:${title}`);
      return prompter.multiselect(title, choices, initial);
    },
  };
  const { opts } = deps(repo(), watched);
  await run(['init'], { ...opts, resolvePlatform: async () => unreachable });

  assert.equal(order[0], 'repoRef', `checked after asking: ${order.slice(0, 3).join(' | ')}`);
  assert.ok(seen.length >= 6, 'the menu still runs');
  assert.ok(
    notes.some((n) => n.includes('404') && n.includes('that account cannot see it')),
    `reason not shown: ${notes.join(' | ')}`
  );
});

// The check reads what init would have read anyway, so it must hand the answer
// on rather than make the same request twice.
test('the reachability check and the run share one repository read', async () => {
  const platform = fakePlatform();
  const { prompter } = defaults({ 'Ready?': 'apply' });
  const { opts } = deps(repo(), prompter);
  assert.equal(await run(['init'], { ...opts, resolvePlatform: async () => platform }), 0);
  assert.deepEqual(
    platform.reads.filter((r) => r === 'repoRef'),
    ['repoRef']
  );
});

// A repository with no remote cannot be fixed by choosing a dry run, so it
// must keep aborting rather than become a note inside a menu.
test('a usage failure still aborts instead of opening the menu', async () => {
  const platform = fakePlatform();
  const broken: Platform = {
    ...platform,
    async repoRef(): Promise<never> {
      throw new RedlineError('usage', 'this repository has no git remote');
    },
  };
  const { prompter, seen } = defaults();
  const { opts } = deps(repo(), prompter);
  assert.equal(await run(['init'], { ...opts, resolvePlatform: async () => broken }), 2);
  assert.deepEqual(seen, []);
});
