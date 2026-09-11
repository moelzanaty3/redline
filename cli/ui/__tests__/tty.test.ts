import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colorDepth,
  colorEnabled,
  firstEnabled,
  frame,
  glyphs,
  move,
  palette,
  intro,
  matching,
  readKey,
  reduceList,
  spinner,
  spinnerDone,
  spinnerFrames,
  wordmark,
  type Choice,
  type ListState,
} from '../tty.ts';

const CHOICES: Choice<string>[] = [
  { value: 'a', label: 'alpha', hint: 'the first' },
  { value: 'b', label: 'bravo', hint: 'the second' },
  { value: 'c', label: 'charlie' },
];

const state = (cursor: number, selected: number[] = [], query = ''): ListState => ({
  cursor,
  selected: new Set(selected),
  query,
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
// The brand red is #e60000, the value web/app/globals.css already calls --red.
// Only truecolor can say that exactly; everything else gets the closest thing it
// has, and a sixteen-colour terminal gets whatever its own theme calls red —
// which is right, because a theme the operator chose outranks ours.
test('the brand red degrades to what the terminal can actually show', () => {
  assert.equal(colorDepth({ COLORTERM: 'truecolor' }), 'truecolor');
  assert.equal(colorDepth({ COLORTERM: '24bit' }), 'truecolor');
  assert.equal(colorDepth({ TERM: 'xterm-256color' }), 'ansi256');
  assert.equal(colorDepth({ TERM: 'xterm' }), 'basic');
  assert.equal(colorDepth({}), 'basic');

  assert.match(palette(true, 'truecolor').red('x'), /38;2;230;0;0/);
  assert.match(palette(true, 'ansi256').red('x'), /38;5;160/);
  assert.match(palette(true, 'basic').red('x'), /\x1b\[31m/);
  assert.equal(palette(false, 'truecolor').red('x'), 'x');
});

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
  // A paste is one chunk of many characters. Typing is one character, and only
  // that becomes a char key — otherwise a pasted escape sequence would land in
  // a search term one control byte at a time.
  assert.equal(readKey('web-react'), null);
  assert.deepEqual(readKey('x'), { kind: 'char', ch: 'x' });
  assert.equal(readKey('\x7f'), 'erase');
  assert.equal(readKey('\x01'), 'all');
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
  const on = reduceList(CHOICES, state(1), 'space', { multi: true, search: false });
  assert.equal(on.kind, 'state');
  assert.deepEqual([...(on.kind === 'state' ? on.state.selected : [])], [1]);

  const off = reduceList(CHOICES, state(1, [1]), 'space', { multi: true, search: false });
  assert.deepEqual([...(off.kind === 'state' ? off.state.selected : [])], []);

  const single = reduceList(CHOICES, state(1), 'space', { multi: false, search: false });
  assert.deepEqual(single, { kind: 'state', state: state(1) });
});

// A multi-select returning nothing is a real answer — "render for no vendor" —
// and a prompt that refused to submit an empty set would make it unreachable.
test('a multi-select submits an empty selection', () => {
  assert.deepEqual(reduceList(CHOICES, state(0), 'enter', { multi: true, search: false }), { kind: 'submit' });
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

// The hint used to share a line with the label, so a narrow terminal had to drop
// it entirely. It now has a line of its own below the list, which is the point:
// the text explaining the choice survives a width the row never could.
test('a hint never competes with its own row for width', () => {
  const narrow = plainFrame({ width: 24 });
  const [, , , firstRow] = narrow.split('\n');
  assert.ok(firstRow?.includes('alpha'));
  assert.ok(!firstRow?.includes('the first'));
  assert.ok(narrow.split('\n').at(-1)?.includes('the first'));
});

test('the footer follows the cursor, not the list', () => {
  const out = plainFrame({ state: state(1) });
  assert.ok(out.split('\n').at(-1)?.includes('the second'));
});

test('a multi-select counts what is chosen on its title line', () => {
  const out = plainFrame({ multi: true, state: state(0, [0, 2]) });
  assert.ok(out.split('\n')[0]?.includes('2/3 selected'));
});

test('a disabled row shows its reason in place of its hint', () => {
  const out = plainFrame({
    choices: [{ value: 'a', label: 'alpha', hint: 'the first', disabled: 'no credential' }],
  });
  assert.ok(out.includes('no credential'));
  assert.ok(!out.includes('the first'));
});

// The wordmark is drawn from U+2588. The console that needs the ASCII glyph set is
// exactly the console that would render it as seven letters of replacement
// characters, and a terminal narrower than the word would wrap it into rubble.
test('the wordmark gives way to the plain heading it cannot beat', () => {
  const uni = glyphs({ LANG: 'en_GB.UTF-8' }, 'linux');
  const ascii = glyphs({ LANG: 'C' }, 'linux');
  const c = palette(false);

  assert.equal(wordmark(c, ascii, 200).length, 0);
  assert.equal(wordmark(c, uni, 20).length, 0);
  assert.equal(wordmark(c, uni, 80).length, 5);
  for (const row of wordmark(c, uni, 80)) assert.ok(row.length <= 80);

  assert.ok(!intro('Redline', c, ascii, 200).includes('█'));
  assert.ok(intro('Redline', c, uni, 80).includes('█'));
  assert.ok(intro('Redline', c, ascii, 200).includes('Redline'));
});

// The redraw rewinds by the number of lines it drew. A frame taller than the
// terminal makes the terminal scroll first, so the rewind lands on rows that
// have already moved and erases whatever took their place. This is the invariant
// the scrolling window exists to hold, so it is swept rather than sampled.
test('no frame is ever taller than the terminal it is drawn in', () => {
  const uni = glyphs({ LANG: 'en_GB.UTF-8' }, 'linux');
  const ascii = glyphs({ LANG: 'C' }, 'linux');
  const c = palette(false);
  let checked = 0;

  for (const count of [1, 2, 16, 60]) {
    const choices: Choice<string>[] = Array.from({ length: count }, (_, i) => ({
      value: String(i),
      label: `profile-${i}`,
      hint: `a hint long enough to need truncating, for row ${i}`,
    }));
    // Four is the floor: below it there is no room for a question, one option
    // and the footer, and no terminal is that short.
    for (let rows = 4; rows <= 40; rows++) {
      for (const search of [true, false]) {
        for (const cursor of [0, Math.floor(count / 2), count - 1]) {
          for (const query of ['', 'profile-1', 'no-such-thing']) {
            for (const [width, g] of [[30, uni], [76, uni], [76, ascii]] as const) {
              const out = frame({
                title: 'Which standards apply here?',
                choices,
                state: { cursor, selected: new Set([0]), query },
                multi: true,
                palette: c,
                glyphs: g,
                width,
                height: rows,
                search,
              }).split('\n');
              checked += 1;
              assert.ok(out.length <= rows - 1, `${out.length} lines in ${rows} rows`);
              for (const line of out) assert.ok(line.length <= width, `line wider than ${width}`);
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 5000);
});

test('a window past the fold says how much it is hiding', () => {
  const choices: Choice<string>[] = Array.from({ length: 16 }, (_, i) => ({
    value: String(i),
    label: `profile-${i}`,
  }));
  const out = plainFrame({ choices, state: state(0), multi: true, height: 14 });
  assert.match(out, /9 more/);
  assert.ok(out.includes('profile-0'));
  assert.ok(!out.includes('profile-15'));
});

// Selection is indexed against the whole list, so filtering must not disturb it:
// a row ticked before a search is still ticked after one, and still in the answer.
test('a filter hides rows without unselecting them', () => {
  const choices: Choice<string>[] = [
    { value: 'a', label: 'web-react' },
    { value: 'b', label: 'infra' },
    { value: 'c', label: 'web-vue' },
  ];
  const mode = { multi: true, search: true };
  let s: ListState = { cursor: 0, selected: new Set([1]), query: '' };

  for (const ch of 'web') {
    const next = reduceList(choices, s, { kind: 'char', ch }, mode);
    assert.equal(next.kind, 'state');
    if (next.kind === 'state') s = next.state;
  }
  assert.equal(s.query, 'web');
  assert.deepEqual(matching(choices, s.query), [0, 2]);
  // infra is hidden, still selected, and still comes back in the answer.
  assert.ok(s.selected.has(1));

  // Ctrl-A takes what the filter shows and leaves the rest alone.
  const all = reduceList(choices, s, 'all', mode);
  if (all.kind === 'state') {
    assert.deepEqual([...all.state.selected].sort(), [0, 1, 2]);
  }
});

test('without a search field the letters stay shortcuts', () => {
  const mode = { multi: true, search: false };
  const down = reduceList(CHOICES, state(0), { kind: 'char', ch: 'j' }, mode);
  assert.equal(down.kind === 'state' && down.state.cursor, 1);
  const all = reduceList(CHOICES, state(0), { kind: 'char', ch: 'a' }, mode);
  assert.equal(all.kind === 'state' && all.state.selected.size, 3);
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

// A disabled row is unreachable by the cursor, so one that started selected
// could never be turned off. The prompter filters those out of the initial
// selection; this asserts the reducer's half — that nothing can select one.
test('a disabled row cannot be toggled into the selection', () => {
  const withDisabled: Choice<string>[] = [
    { value: 'a', label: 'alpha' },
    { value: 'b', label: 'bravo', disabled: 'not enabled for this organisation' },
  ];
  // The cursor can only ever be on an enabled row — move() guarantees it — so
  // toggling from any reachable position never reaches index 1.
  let cursor = firstEnabled(withDisabled);
  for (let i = 0; i < 5; i += 1) cursor = move(withDisabled, cursor, 1);
  assert.equal(cursor, 0);
});

// The spinner exists so the gap between the last answer and the first line of
// the report does not read as a hang. What matters about it is that it says
// what the run is doing; the turning is decoration.
test('the spinner advances through its frames and never runs off the end', () => {
  const c = palette(false);
  const g = glyphs({ LANG: 'en_GB.UTF-8' }, 'linux');
  const frames = spinnerFrames(g);
  const seen = new Set(
    Array.from({ length: frames.length * 2 }, (_, tick) => spinner('working', tick, c, g, 40))
  );
  assert.equal(seen.size, frames.length, 'two full turns must reuse the same frames');
  for (const line of seen) assert.ok(line.includes('working'));
});

test('a negative tick is still a real frame', () => {
  const c = palette(false);
  const g = glyphs({ LANG: 'en_GB.UTF-8' }, 'linux');
  assert.ok(spinnerFrames(g).some((f) => spinner('x', -1, c, g, 40).includes(f)));
});

test('a non-UTF-8 console gets a spinner it can draw', () => {
  const ascii = glyphs({ LANG: 'C' }, 'linux');
  for (const frame of spinnerFrames(ascii)) {
    assert.ok(/^[|/\-\\]$/.test(frame), frame);
  }
});

test('a finished task keeps its label and gains a tick', () => {
  const g = glyphs({ LANG: 'en_GB.UTF-8' }, 'linux');
  const line = spinnerDone('rendering the standards', palette(false), g, 60);
  assert.ok(line.includes(g.ok));
  assert.ok(line.includes('rendering the standards'));
});

// `0/2 selected` beside `enter confirm` reads as a form that will not submit
// until something is picked. It always would — reduceList treats an empty
// multi-select as a legitimate answer — so the word was the whole problem.
test('a multi-select with nothing chosen offers to skip, not to confirm', () => {
  const out = plainFrame({ multi: true, state: state(0) });
  assert.match(out, /enter skip/);
  assert.ok(!out.includes('enter confirm'));
});

test('ticking one thing turns the skip back into a confirm', () => {
  const out = plainFrame({ multi: true, state: state(0, [0]) });
  assert.match(out, /enter confirm/);
  assert.ok(!out.includes('enter skip'));
});

// A single-select submits whatever the cursor is on, so it can never return
// nothing and must never offer to.
test('a single-select never offers to skip', () => {
  const out = plainFrame({ multi: false, state: state(0) });
  assert.match(out, /enter confirm/);
  assert.ok(!out.includes('enter skip'));
});

// The key itself is untouched: escape still ends the run, which is the only way
// out of a wizard and must not quietly become "skip this question".
test('escape still cancels rather than skipping', () => {
  assert.equal(readKey('\x1b'), 'cancel');
  assert.deepEqual(reduceList(CHOICES, state(0), 'cancel', { multi: true, search: false }), {
    kind: 'cancel',
  });
});
