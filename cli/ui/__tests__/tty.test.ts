import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colorEnabled,
  firstEnabled,
  frame,
  glyphs,
  move,
  palette,
  readKey,
  reduceList,
  type Choice,
  type ListState,
} from '../tty.ts';

const CHOICES: Choice<string>[] = [
  { value: 'a', label: 'alpha', hint: 'the first' },
  { value: 'b', label: 'bravo', hint: 'the second' },
  { value: 'c', label: 'charlie' },
];

const state = (cursor: number, selected: number[] = []): ListState => ({
  cursor,
  selected: new Set(selected),
});

const plainFrame = (opts: Partial<Parameters<typeof frame>[0]> = {}): string =>
  frame({
    title: 'Pick one',
    choices: CHOICES,
    state: state(0),
    multi: false,
    palette: palette(false),
    glyphs: glyphs({ LANG: 'en_GB.UTF-8' }, 'linux'),
    width: 80,
    ...opts,
  });

test('NO_COLOR wins whatever its value, including empty', () => {
  assert.equal(colorEnabled({ NO_COLOR: '' }, true), false);
  assert.equal(colorEnabled({ NO_COLOR: '0' }, true), false);
});

test('FORCE_COLOR paints even without a tty, but FORCE_COLOR=0 does not', () => {
  assert.equal(colorEnabled({ FORCE_COLOR: '1' }, false), true);
  assert.equal(colorEnabled({ FORCE_COLOR: '0' }, true), false);
});

test('a non-tty is not painted', () => {
  assert.equal(colorEnabled({}, false), false);
  assert.equal(colorEnabled({}, true), true);
  assert.equal(colorEnabled({ TERM: 'dumb' }, true), false);
});

// The point of the ASCII fallback is a console that cannot render the box
// drawing at all. Getting this wrong shows the operator a screen of replacement
// characters, which reads as a broken install rather than a menu.
test('a non-UTF-8 locale falls back to ASCII glyphs', () => {
  assert.equal(glyphs({ LANG: 'C' }, 'linux').bar, '|');
  assert.equal(glyphs({ LANG: 'en_GB.UTF-8' }, 'linux').bar, '│');
  assert.equal(glyphs({}, 'linux').bar, '│');
});

test('the legacy Windows console gets ASCII, Windows Terminal does not', () => {
  assert.equal(glyphs({}, 'win32').bar, '|');
  assert.equal(glyphs({ WT_SESSION: 'x' }, 'win32').bar, '│');
});

test('unrecognised input is ignored rather than treated as a keystroke', () => {
  // A focus event, a mouse report and a bracketed paste all arrive on stdin.
  assert.equal(readKey('\x1b[I'), null);
  assert.equal(readKey('\x1b[<0;1;1M'), null);
  assert.equal(readKey('x'), null);
});

test('Ctrl-C reaches the reducer as cancel — raw mode raises no SIGINT', () => {
  assert.equal(readKey('\x03'), 'cancel');
  assert.equal(readKey('\x04'), 'cancel');
  assert.equal(readKey('\x1b'), 'cancel');
});

test('movement wraps in both directions', () => {
  assert.equal(move(CHOICES, 2, 1), 0);
  assert.equal(move(CHOICES, 0, -1), 2);
});

test('movement skips a disabled row instead of landing on it', () => {
  const withDisabled: Choice<string>[] = [
    { value: 'a', label: 'alpha' },
    { value: 'b', label: 'bravo', disabled: 'not available here' },
    { value: 'c', label: 'charlie' },
  ];
  assert.equal(move(withDisabled, 0, 1), 2);
  assert.equal(firstEnabled(withDisabled), 0);
  assert.equal(firstEnabled([{ value: 'x', label: 'x', disabled: 'no' }]), 0);
});

test('space toggles in a multi-select and does nothing in a single-select', () => {
  const on = reduceList(CHOICES, state(1), 'space', true);
  assert.equal(on.kind, 'state');
  assert.deepEqual([...(on.kind === 'state' ? on.state.selected : [])], [1]);

  const off = reduceList(CHOICES, state(1, [1]), 'space', true);
  assert.deepEqual([...(off.kind === 'state' ? off.state.selected : [])], []);

  const single = reduceList(CHOICES, state(1), 'space', false);
  assert.deepEqual(single, { kind: 'state', state: state(1) });
});

// A multi-select returning nothing is a real answer — "render for no vendor" —
// and a prompt that refused to submit an empty set would make it unreachable.
test('a multi-select submits an empty selection', () => {
  assert.deepEqual(reduceList(CHOICES, state(0), 'enter', true), { kind: 'submit' });
});

test('a rendered frame names every choice and ends without a newline', () => {
  const out = plainFrame();
  for (const choice of CHOICES) assert.ok(out.includes(choice.label), choice.label);
  assert.ok(!out.endsWith('\n'));
});

// The redraw rewinds by a line count it computed itself. A frame that wrapped
// would advance the terminal by more lines than that count, and every
// subsequent redraw would eat a line of real output.
test('no rendered line exceeds the terminal width', () => {
  const long: Choice<string>[] = [
    { value: 'a', label: 'alpha', hint: 'x'.repeat(400) },
    { value: 'b', label: 'b'.repeat(60), hint: 'y'.repeat(80) },
  ];
  for (const width of [40, 60, 80, 120]) {
    for (const line of plainFrame({ choices: long, width }).split('\n')) {
      assert.ok(line.length <= width, `width ${width}: ${line.length} chars`);
    }
  }
});

test('a hint is dropped rather than squeezed into an unreadable stub', () => {
  const narrow = plainFrame({ width: 24 });
  assert.ok(!narrow.includes('the first'));
  assert.ok(narrow.includes('alpha'));
});

test('a disabled row shows its reason in place of its hint', () => {
  const out = plainFrame({
    choices: [{ value: 'a', label: 'alpha', hint: 'the first', disabled: 'no credential' }],
  });
  assert.ok(out.includes('no credential'));
  assert.ok(!out.includes('the first'));
});

test('the painted frame carries escapes and the plain one carries none', () => {
  const painted = frame({
    title: 'Pick one',
    choices: CHOICES,
    state: state(0),
    multi: false,
    palette: palette(true),
    glyphs: glyphs({ LANG: 'en_GB.UTF-8' }, 'linux'),
    width: 80,
  });
  assert.match(painted, /\x1b\[/);
  assert.doesNotMatch(plainFrame(), /\x1b\[/);
});
