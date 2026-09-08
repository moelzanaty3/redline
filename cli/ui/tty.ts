// A prompt kit, hand-rolled against node:readline.
//
// Redline ships with `"dependencies": {}` and runs via `npx` inside other
// organisations' CI. Every runtime dependency it takes is one those
// organisations inherit without choosing it, on a tool whose entire pitch is
// that oversight should be auditable. A prompt library is roughly two hundred
// lines of ANSI and a keypress reducer; that is a smaller thing to own than a
// supply-chain edge in every onboarded repository.
//
// The split below matters more than the drawing: rendering is a pure function
// from state to string and the key handling is a pure function from key to
// state. Neither touches a terminal, so both are tested directly and the
// untested surface shrinks to "write this string, read those bytes".

// NO_COLOR is the cross-tool convention (no-color.org) and is honoured whatever
// its value, including the empty string — the spec is presence, not truth.
// FORCE_COLOR wins over a non-TTY because that is how a caller says "I am
// capturing this for a human to read".
export function colorEnabled(env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  if (env.NO_COLOR !== undefined) return false;
  // FORCE_COLOR is an override in both directions: `0` is the documented way to
  // turn colour off, and falling through to `isTty` there would paint anyway.
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0';
  if (env.TERM === 'dumb') return false;
  return isTty;
}

type Paint = (text: string) => string;

export interface Palette {
  red: Paint;
  green: Paint;
  yellow: Paint;
  cyan: Paint;
  dim: Paint;
  bold: Paint;
  inverse: Paint;
}

const ESC = '\x1b[';
const wrap =
  (open: string, close: string): Paint =>
  (text) =>
    `${ESC}${open}m${text}${ESC}${close}m`;
const plain: Paint = (text) => text;

export function palette(on: boolean): Palette {
  if (!on) {
    return {
      red: plain,
      green: plain,
      yellow: plain,
      cyan: plain,
      dim: plain,
      bold: plain,
      inverse: plain,
    };
  }
  return {
    red: wrap('31', '39'),
    green: wrap('32', '39'),
    yellow: wrap('33', '39'),
    cyan: wrap('36', '39'),
    dim: wrap('2', '22'),
    bold: wrap('1', '22'),
    inverse: wrap('7', '27'),
  };
}

// Box-drawing for the gutter. The ASCII fallback is not cosmetic: a console
// that mangles UTF-8 would render an entire run as replacement characters, and
// the gutter is what makes a multi-step prompt readable at a glance.
export interface Glyphs {
  top: string;
  bar: string;
  end: string;
  active: string;
  done: string;
  warn: string;
  radioOn: string;
  radioOff: string;
  checkOn: string;
  checkOff: string;
}

const UNICODE: Glyphs = {
  top: '┌',
  bar: '│',
  end: '└',
  active: '◆',
  done: '◇',
  warn: '▲',
  radioOn: '●',
  radioOff: '○',
  checkOn: '◼',
  checkOff: '◻',
};

const ASCII: Glyphs = {
  top: '*',
  bar: '|',
  end: '*',
  active: '>',
  done: '*',
  warn: '!',
  radioOn: '(o)',
  radioOff: '( )',
  checkOn: '[x]',
  checkOff: '[ ]',
};

export function glyphs(env: NodeJS.ProcessEnv, platform: string = process.platform): Glyphs {
  // Windows Terminal and modern PowerShell set WT_SESSION; the legacy console
  // host does not, and is where the mangling happens.
  if (platform === 'win32' && env.WT_SESSION === undefined) return ASCII;
  const locale = env.LC_ALL ?? env.LC_CTYPE ?? env.LANG ?? '';
  if (locale !== '' && !/UTF-?8/i.test(locale)) return ASCII;
  return UNICODE;
}

// The keys the prompts react to, named rather than compared as byte sequences
// at each call site. Everything unrecognised becomes `null` and is ignored:
// a terminal emits far more than this (mouse reports, bracketed paste, focus
// events) and a prompt that treated an unknown sequence as input would move
// the selection when the window merely gained focus.
export type Key =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'space'
  | 'enter'
  | 'cancel'
  | 'home'
  | 'end';

export function readKey(chunk: string): Key | null {
  switch (chunk) {
    case '\x1b[A':
    case '\x1b0A':
    case 'k':
      return 'up';
    case '\x1b[B':
    case '\x1b0B':
    case 'j':
      return 'down';
    case '\x1b[C':
    case 'l':
      return 'right';
    case '\x1b[D':
    case 'h':
      return 'left';
    case '\x1b[H':
    case '\x1b[1~':
      return 'home';
    case '\x1b[F':
    case '\x1b[4~':
      return 'end';
    case ' ':
      return 'space';
    case '\r':
    case '\n':
      return 'enter';
    // Ctrl-C, Ctrl-D and a bare Escape all mean "stop". Raw mode means Ctrl-C
    // does NOT raise SIGINT — the byte arrives here instead, so a prompt that
    // did not handle it would trap the operator in the menu.
    case '\x03':
    case '\x04':
    case '\x1b':
      return 'cancel';
    default:
      return null;
  }
}

export interface Choice<T> {
  readonly value: T;
  readonly label: string;
  // One line, shown beside the label. This is where a term the operator has
  // never seen gets explained at the moment they have to choose it — the whole
  // reason the menu exists rather than a flag.
  readonly hint?: string;
  // Renders the row unselectable. Used for an option the repository cannot
  // take (a host with no credential, a gate whose workflow does not resolve),
  // because hiding it would leave the operator wondering where it went.
  readonly disabled?: string;
}

export interface ListState {
  readonly cursor: number;
  readonly selected: ReadonlySet<number>;
}

const enabledIndexes = (choices: readonly Choice<unknown>[]): number[] =>
  choices.flatMap((choice, index) => (choice.disabled === undefined ? [index] : []));

// Movement skips disabled rows and wraps. Wrapping is deliberate: with four
// options on screen, "down" from the last one meaning nothing is a worse
// surprise than returning to the top.
export function move(
  choices: readonly Choice<unknown>[],
  cursor: number,
  delta: number
): number {
  const usable = enabledIndexes(choices);
  if (usable.length === 0) return cursor;
  const at = usable.indexOf(cursor);
  if (at === -1) return usable[0]!;
  const next = (at + delta + usable.length) % usable.length;
  return usable[next]!;
}

export function firstEnabled(choices: readonly Choice<unknown>[]): number {
  return enabledIndexes(choices)[0] ?? 0;
}

export type Reduction =
  | { readonly kind: 'state'; readonly state: ListState }
  | { readonly kind: 'submit' }
  | { readonly kind: 'cancel' };

export function reduceList(
  choices: readonly Choice<unknown>[],
  state: ListState,
  key: Key,
  multi: boolean
): Reduction {
  const usable = enabledIndexes(choices);
  switch (key) {
    case 'up':
      return { kind: 'state', state: { ...state, cursor: move(choices, state.cursor, -1) } };
    case 'down':
      return { kind: 'state', state: { ...state, cursor: move(choices, state.cursor, 1) } };
    case 'home':
      return { kind: 'state', state: { ...state, cursor: usable[0] ?? state.cursor } };
    case 'end':
      return { kind: 'state', state: { ...state, cursor: usable.at(-1) ?? state.cursor } };
    case 'space': {
      if (!multi) return { kind: 'state', state };
      const selected = new Set(state.selected);
      if (selected.has(state.cursor)) selected.delete(state.cursor);
      else selected.add(state.cursor);
      return { kind: 'state', state: { ...state, selected } };
    }
    case 'enter':
      // A single-select submits whatever the cursor is on, so it can never
      // return nothing. A multi-select can, and that is a legitimate answer —
      // "render for no vendor" is a choice, not an empty form.
      return { kind: 'submit' };
    case 'cancel':
      return { kind: 'cancel' };
    default:
      return { kind: 'state', state };
  }
}

export interface FrameOptions {
  readonly title: string;
  readonly choices: readonly Choice<unknown>[];
  readonly state: ListState;
  readonly multi: boolean;
  readonly palette: Palette;
  readonly glyphs: Glyphs;
  // Terminal width, used only to keep a long hint from wrapping into a second
  // line — a wrapped line breaks the in-place redraw, because the redraw
  // rewinds by a line count it computed before the terminal wrapped anything.
  readonly width: number;
}

const MIN_HINT = 12;

function truncate(text: string, max: number): string {
  if (max <= 1) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * One prompt, rendered. Pure: same inputs, same string, no terminal touched.
 *
 * The returned string never ends in a newline. The caller counts its lines to
 * know how far to rewind on the next redraw, and a trailing newline would make
 * that count disagree with what the terminal actually advanced.
 */
export function frame(opts: FrameOptions): string {
  const { palette: c, glyphs: g, state, choices, multi, width } = opts;
  const bar = c.dim(g.bar);
  const lines: string[] = [`${c.red(g.active)}  ${truncate(c.bold(opts.title), width - 3)}`];

  // Every column below is measured in screen cells, on the RAW text: a painted
  // string carries escape sequences that have width on the wire and none on the
  // terminal, and padding computed from them misaligns every row.
  //
  // The gutter is `bar + two spaces + mark + one space`, and the mark is three
  // cells wide in the ASCII glyph set — measuring it rather than assuming one
  // is what keeps a legacy Windows console inside its own width.
  const markWidth = Math.max(g.radioOn.length, g.radioOff.length, g.checkOn.length, g.checkOff.length);
  const prefixWidth = g.bar.length + 2 + markWidth + 1;
  const HINT_GAP = 2;

  // A label longer than the terminal is rare and entirely possible — a profile
  // id is short, a vendor title is not. It gets truncated like anything else,
  // because a row that wraps breaks the redraw's line arithmetic for the rest
  // of the prompt, not just for itself.
  const labelRoom = Math.max(1, width - prefixWidth);
  const labelWidth = Math.min(labelRoom, Math.max(...choices.map((ch) => ch.label.length)));

  for (const [index, choice] of choices.entries()) {
    const active = index === state.cursor;
    const on = multi ? state.selected.has(index) : active;
    const glyph = multi ? (on ? g.checkOn : g.checkOff) : on ? g.radioOn : g.radioOff;
    const mark = on ? c.green(glyph) : c.dim(glyph);
    // Pad the mark itself so a mixed-width glyph set still aligns the labels.
    const markPad = ' '.repeat(markWidth - glyph.length);

    const raw = truncate(choice.label, labelWidth);
    const disabled = choice.disabled !== undefined;
    const label = disabled ? c.dim(raw) : active ? c.cyan(raw) : raw;
    const pad = ' '.repeat(labelWidth - raw.length);

    const note = choice.disabled ?? choice.hint;
    const room = width - prefixWidth - labelWidth - HINT_GAP;
    const tail =
      note !== undefined && room >= MIN_HINT ? `  ${c.dim(truncate(note, room))}` : '';

    lines.push(`${bar}  ${mark}${markPad} ${label}${pad}${tail}`);
  }

  const help = multi
    ? 'space to toggle, enter to confirm'
    : 'arrows to move, enter to confirm';
  lines.push(c.dim(`${g.end}  ${truncate(help, width - g.end.length - 2)}`));
  return lines.join('\n');
}

/** The collapsed record of an answered prompt, kept above the next one. */
export function answered(
  title: string,
  answer: string,
  c: Palette,
  g: Glyphs
): string {
  return `${c.green(g.done)}  ${title} ${c.dim('·')} ${c.cyan(answer)}`;
}

export function intro(title: string, c: Palette, g: Glyphs): string {
  return `${c.red(g.top)}  ${c.bold(title)}\n${c.dim(g.bar)}`;
}

export function outro(message: string, c: Palette, g: Glyphs): string {
  return `${c.dim(g.bar)}\n${c.red(g.end)}  ${message}`;
}

export function note(message: string, c: Palette, g: Glyphs): string {
  return `${c.dim(g.bar)}  ${c.yellow(g.warn)} ${message}`;
}
