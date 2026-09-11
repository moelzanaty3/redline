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
  /** One of five shades, 0 brightest. Used by the wordmark and nothing else. */
  shade: (level: number) => Paint;
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

export type ColorDepth = 'basic' | 'ansi256' | 'truecolor';

/**
 * How precisely this terminal can be asked for a colour.
 *
 * Only truecolor renders the brand red exactly. The 256-colour cube's nearest
 * neighbour is #d70000, fifteen points of red away and indistinguishable in
 * practice; the sixteen-colour fallback is whatever the terminal theme calls
 * "red", which on a Solarized profile is not this red at all — and that is
 * correct, because a theme the operator chose outranks ours.
 */
export function colorDepth(env: NodeJS.ProcessEnv): ColorDepth {
  const colorterm = env.COLORTERM ?? '';
  if (/truecolor|24bit/i.test(colorterm)) return 'truecolor';
  const term = env.TERM ?? '';
  if (/-256(color)?$/.test(term)) return 'ansi256';
  return 'basic';
}

// #e60000 — the same value web/app/globals.css calls --red. One brand red, and
// the CLI had been wearing the terminal's generic one.
const BRAND = { r: 230, g: 0, b: 0 } as const;
const BRAND_256 = 160;

const redOpen = (depth: ColorDepth): string => {
  switch (depth) {
    case 'truecolor':
      return `38;2;${BRAND.r};${BRAND.g};${BRAND.b}`;
    case 'ansi256':
      return `38;5;${BRAND_256}`;
    default:
      return '31';
  }
};

// The wordmark is drawn in white, falling away to grey down the letterforms.
// Truecolor gets the real ramp; 256 colours get the greyscale cube, which has
// twenty-four greys and so loses nothing worth having; sixteen colours get the
// only three shades they have — bright white, white, and whatever the terminal
// calls "bright black".
const RAMP_RGB = [245, 214, 180, 148, 120];
const RAMP_256 = [255, 252, 249, 246, 243];

function shadeOf(depth: ColorDepth): (level: number) => Paint {
  return (level: number) => {
    const index = Math.max(0, Math.min(RAMP_RGB.length - 1, level));
    if (depth === 'truecolor') {
      const v = RAMP_RGB[index]!;
      return wrap(`38;2;${v};${v};${v}`, '39');
    }
    if (depth === 'ansi256') return wrap(`38;5;${RAMP_256[index]!}`, '39');
    if (index === 0) return wrap('97', '39');
    return index < 3 ? wrap('37', '39') : wrap('90', '39');
  };
}

export function palette(on: boolean, depth: ColorDepth = 'basic'): Palette {
  if (!on) {
    return {
      red: plain,
      shade: () => plain,
      green: plain,
      yellow: plain,
      cyan: plain,
      dim: plain,
      bold: plain,
      inverse: plain,
    };
  }
  return {
    red: wrap(redOpen(depth), '39'),
    shade: shadeOf(depth),
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
  // Report markers. A finished run is read by scanning the left column, so the
  // four states it can be in each get one cell of their own: done, refused,
  // not available here, and a file this run put on disk.
  ok: string;
  fail: string;
  skip: string;
  write: string;
  remove: string;
  arrow: string;
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
  ok: '✓',
  fail: '✗',
  skip: '·',
  write: '+',
  remove: '-',
  arrow: '→',
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
  ok: 'v',
  fail: 'x',
  skip: '.',
  write: '+',
  remove: '-',
  arrow: '->',
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
  | 'all'
  | 'enter'
  | 'cancel'
  | 'home'
  | 'end'
  | 'erase'
  // A printable character. Whether it filters the list or works a shortcut is
  // the reducer's decision, not this function's: the same 'a' means "select
  // everything" on a six-row menu and a letter of a search term on a long one,
  // and only the caller knows which prompt it is driving.
  | { readonly kind: 'char'; readonly ch: string };

export function readKey(chunk: string): Key | null {
  switch (chunk) {
    case '\x1b[A':
    case '\x1b0A':
      return 'up';
    case '\x1b[B':
    case '\x1b0B':
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
    // Ctrl-A, not 'a': on a list that filters, every letter belongs to the
    // search term, so the bulk action needs a chord that can never be typed.
    case '\x01':
      return 'all';
    case '\x7f':
    case '\b':
      return 'erase';
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
      // One printable character, and nothing else. A paste arrives as a single
      // chunk of many, and an escape sequence this switch does not name starts
      // with ESC — treating either as typing would scatter control bytes
      // through a search term.
      return chunk.length === 1 && chunk >= ' ' && chunk <= '~'
        ? { kind: 'char', ch: chunk }
        : null;
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
  // The search term. Selection is indexed against the WHOLE choice list, never
  // against what the filter leaves showing, so a row ticked before a search
  // stays ticked through it and comes back in the answer. Filtering decides
  // what is on screen and nothing else.
  readonly query: string;
}

const enabledIndexes = (choices: readonly Choice<unknown>[]): number[] =>
  choices.flatMap((choice, index) => (choice.disabled === undefined ? [index] : []));

/** Rows the current search term leaves on screen, in list order. */
export function matching(choices: readonly Choice<unknown>[], query: string): number[] {
  const term = query.trim().toLowerCase();
  if (term === '') return choices.map((_, index) => index);
  return choices.flatMap((choice, index) =>
    `${choice.label} ${choice.hint ?? ''}`.toLowerCase().includes(term) ? [index] : []
  );
}

const reachable = (choices: readonly Choice<unknown>[], query: string): number[] => {
  const shown = new Set(matching(choices, query));
  return enabledIndexes(choices).filter((index) => shown.has(index));
};

// Movement skips disabled rows and wraps. Wrapping is deliberate: with four
// options on screen, "down" from the last one meaning nothing is a worse
// surprise than returning to the top.
export function move(
  choices: readonly Choice<unknown>[],
  cursor: number,
  delta: number,
  query = ''
): number {
  const usable = reachable(choices, query);
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

export interface ListMode {
  readonly multi: boolean;
  // Whether letters type into a search term or work shortcuts. Off, `j`/`k`
  // move and `a` selects everything, which is what a six-row menu wants; on,
  // every printable character filters and the bulk action moves to Ctrl-A.
  readonly search: boolean;
}

export function reduceList(
  choices: readonly Choice<unknown>[],
  state: ListState,
  key: Key,
  mode: ListMode
): Reduction {
  const { multi, search } = mode;
  const usable = reachable(choices, state.query);

  // A search that hides the cursor's row has to put the cursor somewhere real,
  // or the next space toggles a row nobody can see.
  const settle = (next: ListState): Reduction => {
    const shown = reachable(choices, next.query);
    if (shown.includes(next.cursor) || shown.length === 0) return { kind: 'state', state: next };
    return { kind: 'state', state: { ...next, cursor: shown[0]! } };
  };

  if (typeof key === 'object') {
    if (!search) {
      // Without a search field the letters are free, so the shortcuts a long
      // list cannot afford are worth having here.
      if (key.ch === 'j') return { kind: 'state', state: { ...state, cursor: move(choices, state.cursor, 1) } };
      if (key.ch === 'k') return { kind: 'state', state: { ...state, cursor: move(choices, state.cursor, -1) } };
      if (key.ch === 'a') return toggleAll(state, usable, multi);
      return { kind: 'state', state };
    }
    return settle({ ...state, query: state.query + key.ch });
  }

  switch (key) {
    case 'up':
      return { kind: 'state', state: { ...state, cursor: move(choices, state.cursor, -1, state.query) } };
    case 'down':
      return { kind: 'state', state: { ...state, cursor: move(choices, state.cursor, 1, state.query) } };
    case 'home':
      return { kind: 'state', state: { ...state, cursor: usable[0] ?? state.cursor } };
    case 'end':
      return { kind: 'state', state: { ...state, cursor: usable.at(-1) ?? state.cursor } };
    case 'erase':
      return search && state.query !== ''
        ? settle({ ...state, query: state.query.slice(0, -1) })
        : { kind: 'state', state };
    case 'space': {
      if (!multi) return { kind: 'state', state };
      // Nothing showing means nothing to toggle: the cursor is stale, left on
      // whatever row the filter hid.
      if (!usable.includes(state.cursor)) return { kind: 'state', state };
      const selected = new Set(state.selected);
      if (selected.has(state.cursor)) selected.delete(state.cursor);
      else selected.add(state.cursor);
      return { kind: 'state', state: { ...state, selected } };
    }
    case 'all':
      return toggleAll(state, usable, multi);
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

/**
 * Select every row currently showing, or clear them if they are already all on.
 *
 * Scoped to what the filter leaves visible, which is the combination worth
 * having: type `web`, take all five web profiles, and leave the rest alone.
 * Rows hidden by the filter keep whatever state they had.
 */
function toggleAll(state: ListState, usable: number[], multi: boolean): Reduction {
  if (!multi || usable.length === 0) return { kind: 'state', state };
  const every = usable.every((i) => state.selected.has(i));
  const selected = new Set(state.selected);
  for (const i of usable) {
    if (every) selected.delete(i);
    else selected.add(i);
  }
  return { kind: 'state', state: { ...state, selected } };
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
  // Terminal height. The frame must never be taller than the screen: the redraw
  // rewinds by the number of lines it drew, and a frame that made the terminal
  // scroll would rewind into rows that have already moved up, erasing whatever
  // took their place. Rows past the fold become a scrolling window instead.
  readonly height?: number;
  // Whether the search field is drawn. Matches the reducer's `search` mode —
  // showing the field on a list that ignores typing would be a lie.
  readonly search?: boolean;
}

const MIN_HINT = 12;
// Title, keys and footer are never dropped; the two blank separators are, on a
// terminal too short to spend rows on breathing space. The `+ 1` is the line the
// cursor sits on after the frame's own trailing newline: without it a frame
// exactly as tall as the terminal scrolls it by a row, and the rewind then
// erases whatever moved up into its place.
const FIXED_LINES = 3;
const CURSOR_LINE = 1;
const COMPACT_BELOW = 12;
// Under this the key hints go too. They are the last thing to drop and the first
// thing anyone new needs, so this is genuinely the floor: a terminal this short
// has room for the question, one option and the footer, and nothing else.
const TERSE_BELOW = 8;
const MIN_WINDOW = 3;

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

  // The count belongs on the title line and nowhere else. A multi-select whose
  // answer is "three of twelve" gives the operator no way to check that without
  // counting marks down the list, and the list is the part that scrolls.
  const chosen = multi ? `${state.selected.size}/${choices.length} selected` : '';
  const titleRoom = width - 3 - (chosen === '' ? 0 : chosen.length + 2);
  const heading = `${c.red(g.active)}  ${truncate(c.bold(opts.title), titleRoom)}`;
  const lines: string[] = [chosen === '' ? heading : `${heading}  ${c.dim(chosen)}`];

  // Keys go directly under the question, not at the far end of the list. At the
  // end they are below the fold on a long menu, which is exactly when an
  // operator who has never seen this prompt needs to be told that space toggles.
  const unicode = g.bar === UNICODE.bar;
  const arrows = unicode ? '↑↓' : 'up/down';
  const sep = unicode ? ' · ' : ' | ';
  const all = multi ? (opts.search === true ? 'ctrl-a all' : 'a all') : '';
  // A multi-select with nothing ticked already submits an empty answer, and
  // "none" is a real answer to most of these questions — install no extra
  // tooling, render for no vendor. But `enter confirm` over `0/2 selected`
  // reads as a form refusing to be submitted until something is picked, so
  // operators sat on a question they had already answered correctly. The key
  // does not change; only the word for what it does when nothing is chosen.
  const submit = multi && state.selected.size === 0 ? 'enter skip' : 'enter confirm';
  const keys = [
    `${arrows} move`,
    ...(multi ? ['space select', all] : []),
    ...(opts.search === true ? ['type to filter'] : []),
    submit,
  ].join(sep);
  const height = opts.height ?? 24;
  const compact = height < COMPACT_BELOW;
  const terse = height < TERSE_BELOW;
  if (!terse) lines.push(c.dim(`${g.bar}  ${truncate(keys, width - g.bar.length - 2)}`));

  const field = opts.search === true && !terse;
  if (field) {
    // The cursor block is drawn, not left to the terminal: the real cursor is
    // hidden for the whole prompt, because a prompt that moved it would have to
    // put it back before every redraw.
    const typed = state.query === '' ? c.dim('type to filter') : state.query;
    lines.push(`${bar}  ${c.dim('search')} ${truncate(typed, width - 12)}${c.inverse(' ')}`);
  }
  if (!compact) lines.push(bar);

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

  const shown = matching(choices, state.query);
  if (shown.length === 0) {
    lines.push(`${bar}  ${c.dim(truncate(`no option matches "${state.query}"`, width - 4))}`);
  }

  // The window keeps the frame inside the terminal. `more above`/`more below`
  // occupy a row each, so they are counted before the rows are, and the cursor
  // is kept one row inside the edge where there is anything to see past it.
  const chrome =
    FIXED_LINES -
    (terse ? 1 : 0) +
    CURSOR_LINE +
    (field ? 1 : 0) +
    (compact ? 0 : 2);
  const room = Math.max(1, height - chrome);
  const at = Math.max(0, shown.indexOf(state.cursor));
  let start = 0;
  if (shown.length > room) {
    start = Math.min(Math.max(0, at - Math.floor(room / 2)), shown.length - room);
  }
  const end = Math.min(shown.length, start + room);

  // The counters cost a row each, so they are only worth drawing when a row is
  // left to draw under them. Below that the window is silent and simply shows
  // what fits — a terminal this short has no space to explain itself in, and
  // overflowing it would corrupt the redraw rather than merely inform nobody.
  const markers = room >= MIN_WINDOW;
  const above = markers && start > 0 ? start + 1 : 0;
  const below = markers && end < shown.length ? shown.length - end + 1 : 0;
  const window = shown.slice(above > 0 ? start + 1 : start, below > 0 ? end - 1 : end);

  if (above > 0) {
    lines.push(`${bar}  ${c.dim(`${unicode ? '↑' : '^'} ${above} more`)}`);
  }

  for (const index of window) {
    const choice = choices[index]!;
    const active = index === state.cursor;
    const on = multi ? state.selected.has(index) : active;
    const glyph = multi ? (on ? g.checkOn : g.checkOff) : on ? g.radioOn : g.radioOff;
    const mark = on ? c.red(glyph) : c.dim(glyph);
    // Pad the mark itself so a mixed-width glyph set still aligns the labels.
    const markPad = ' '.repeat(markWidth - glyph.length);

    const raw = truncate(choice.label, labelWidth);
    const disabled = choice.disabled !== undefined;
    const label = disabled ? c.dim(raw) : active ? c.bold(c.red(raw)) : raw;
    const pad = ' '.repeat(labelWidth - raw.length);

    // Only a disabled row explains itself in place: the reason it cannot be
    // picked has to be readable without moving the cursor onto it, which is the
    // one thing the cursor cannot do. Every other row's hint goes to the panel
    // below, where it gets the whole width instead of whatever is left after
    // the longest label in the list.
    const room = width - prefixWidth - labelWidth - HINT_GAP;
    const tail =
      choice.disabled !== undefined && room >= MIN_HINT
        ? `  ${c.dim(truncate(choice.disabled, room))}`
        : '';

    // Pad only when something follows: with the hints moved to the footer most
    // rows end at their label, and padding them all would leave a column of
    // trailing spaces that shows up the moment a terminal highlights a line.
    lines.push(`${bar}  ${mark}${markPad} ${label}${tail === '' ? '' : pad + tail}`);
  }

  if (below > 0) {
    lines.push(`${bar}  ${c.dim(`${unicode ? '↓' : 'v'} ${below} more`)}`);
  }

  // The footer is the focused row's own text, full width. A hint squeezed into
  // the tail of its row is the first thing to get truncated, and it is the part
  // that explains a term the operator has never seen — which is the whole
  // reason there is a menu here rather than a flag.
  const focused = choices[state.cursor];
  const detail = focused?.disabled ?? focused?.hint ?? '';
  if (!compact) lines.push(bar);
  lines.push(c.dim(`${g.end}  ${truncate(detail, width - g.end.length - 2)}`));
  return lines.join('\n');
}

export interface FieldOptions {
  readonly title: string;
  readonly value: string;
  readonly placeholder: string;
  readonly hint: string;
  readonly palette: Palette;
  readonly glyphs: Glyphs;
  readonly width: number;
}

/**
 * One line of typed input, rendered. Pure, like frame().
 *
 * Three lines and no list, because the only thing this asks for is a value the
 * repository cannot supply itself — a team name, in practice. The placeholder is
 * what happens on an empty answer, stated rather than implied: an operator who
 * presses enter here has chosen the default, and should be able to see what they
 * chose before they choose it.
 */
export function field(opts: FieldOptions): string {
  const { palette: c, glyphs: g, width } = opts;
  const shown =
    opts.value === '' ? c.dim(truncate(opts.placeholder, width - 6)) : truncate(opts.value, width - 6);
  return [
    `${c.red(g.active)}  ${truncate(c.bold(opts.title), width - 3)}`,
    c.dim(`${g.bar}  ${truncate(opts.hint, width - g.bar.length - 2)}`),
    `${c.dim(g.bar)}  ${shown}${c.inverse(' ')}`,
    c.dim(`${g.end}  enter to confirm`),
  ].join('\n');
}

/** The collapsed record of an answered prompt, kept above the next one. */
export function answered(
  title: string,
  answer: string,
  c: Palette,
  g: Glyphs
): string {
  return `${c.dim(g.done)}  ${title} ${c.dim('·')} ${c.cyan(answer)}`;
}

// A five-row block face, carrying only the letters REDLINE needs. A full font
// would be dead weight: this draws one word, once, and any other string falls
// back to the plain heading below.
const FACE: Record<string, readonly string[]> = {
  R: ['████', '█  █', '████', '█ █ ', '█  █'],
  E: ['████', '█   ', '███ ', '█   ', '████'],
  D: ['███ ', '█  █', '█  █', '█  █', '███ '],
  L: ['█   ', '█   ', '█   ', '█   ', '████'],
  I: ['███', ' █ ', ' █ ', ' █ ', '███'],
  N: ['█  █', '██ █', '█ ██', '█  █', '█  █'],
};

const WORDMARK = 'REDLINE';
const FACE_ROWS = 5;

/**
 * The wordmark, or nothing.
 *
 * Nothing is the right answer more often than it looks: the block face is drawn
 * from U+2588, so the same non-UTF-8 console the ASCII glyph set exists for would
 * render seven letters of replacement characters, and a terminal narrower than the
 * word would wrap it into rubble. Both fall back to the plain heading, which is
 * why this returns a list of lines the caller can simply not have.
 */
export function wordmark(c: Palette, g: Glyphs, width: number): string[] {
  if (g.bar !== UNICODE.bar) return [];
  const letters = [...WORDMARK].map((ch) => FACE[ch]).filter((f) => f !== undefined);
  if (letters.length !== WORDMARK.length) return [];

  const drawn = Array.from({ length: FACE_ROWS }, (_, row) =>
    letters.map((face) => face[row]).join(' ')
  );
  if ((drawn[0]?.length ?? 0) > width) return [];

  // White at the top falling to grey at the base. Red is the accent this tool
  // spends on the things that matter — the cursor, a selected row, a finding —
  // and a wordmark five rows tall in it drowns all three.
  return drawn.map((row, i) => c.shade(i)(row));
}

export function intro(title: string, c: Palette, g: Glyphs, width = 80): string {
  const art = wordmark(c, g, width);
  // The chip's padding is drawn by the inverse background, so without colour it
  // is just two stray spaces around the word. Ask the palette whether it paints
  // rather than threading the answer down from the caller.
  const painted = c.dim('') !== '';
  const head = painted
    ? `${c.red(g.top)}  ${c.inverse(c.bold(` ${title} `))}`
    : `${c.red(g.top)}  ${c.bold(title)}`;
  return art.length > 0
    ? `${art.join('\n')}\n\n${head}\n${c.dim(g.bar)}`
    : `${head}\n${c.dim(g.bar)}`;
}

export function outro(message: string, c: Palette, g: Glyphs): string {
  return `${c.dim(g.bar)}\n${c.red(g.end)}  ${message}`;
}

// The spinner's frames. Braille dots because they are one cell wide in every
// font that has them at all, so the line does not jitter as it turns; the ASCII
// fallback is the same four positions a non-UTF-8 console can draw.
const SPIN_UNICODE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPIN_ASCII = ['|', '/', '-', '\\'];

export function spinnerFrames(g: Glyphs): readonly string[] {
  return g.bar === UNICODE.bar ? SPIN_UNICODE : SPIN_ASCII;
}

/**
 * One line of a running task. Pure, like everything else here.
 *
 * `tick` selects the frame, so the caller owns the clock: a spinner that read
 * the time itself could not be tested, and the thing worth testing about a
 * spinner is that it says what the run is doing, not that it turns.
 */
export function spinner(label: string, tick: number, c: Palette, g: Glyphs, width = 80): string {
  const frames = spinnerFrames(g);
  const frame = frames[((tick % frames.length) + frames.length) % frames.length]!;
  return `${c.dim(g.bar)}  ${c.red(frame)} ${truncate(label, Math.max(1, width - 6))}`;
}

/** The same line, finished: a green tick and the last thing the task was doing. */
export function spinnerDone(label: string, c: Palette, g: Glyphs, width = 80): string {
  return `${c.dim(g.bar)}  ${c.green(g.ok)} ${truncate(label, Math.max(1, width - 6))}`;
}

export function note(message: string, c: Palette, g: Glyphs): string {
  return `${c.dim(g.bar)}  ${c.yellow(g.warn)} ${message}`;
}
