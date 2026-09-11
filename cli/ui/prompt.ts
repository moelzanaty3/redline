import { emitKeypressEvents } from 'node:readline';
import {
  answered,
  colorDepth,
  colorEnabled,
  firstEnabled,
  field,
  frame,
  glyphs,
  intro as introLine,
  note as noteLine,
  outro as outroLine,
  palette,
  spinner as spinnerLine,
  spinnerDone,
  readKey,
  reduceList,
  type Choice,
  type Glyphs,
  type ListState,
  type Palette,
} from './tty.ts';

// Re-exported so a caller building a menu imports the prompt kit's own type
// rather than reaching past it into the rendering module.
export type { Choice } from './tty.ts';

// The terminal side of the prompt kit: raw mode, the in-place redraw, and
// restoring the terminal whatever happens. Everything that decides what a
// prompt looks like or what a key means lives in tty.ts and is pure.
//
// The invariant this file exists to hold: the terminal is left exactly as it
// was found. Raw mode with a hidden cursor is not a state to leave behind on a
// crash — the operator's shell would keep echoing nothing until they blind-typed
// `reset`. Every exit path goes through `restore()`, including the process-level
// handlers, because a throw from deep inside `init()` unwinds past our `finally`
// only if we let it.

/**
 * The operator stopped the run at a prompt.
 *
 * Not a RedlineError: cancelling is not a failure, and it must not print an
 * `error` line or return a failure exit code that a wrapping script would read
 * as "onboarding broke". 130 is the shell convention for SIGINT.
 */
export class Cancelled extends Error {
  readonly exitCode = 130;
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

export interface PrompterOptions {
  readonly input?: NodeJS.ReadStream;
  readonly output?: NodeJS.WriteStream;
  readonly env?: NodeJS.ProcessEnv;
}

export interface Prompter {
  intro(title: string): void;
  select<T>(title: string, choices: readonly Choice<T>[], initial?: T): Promise<T>;
  multiselect<T>(
    title: string,
    choices: readonly Choice<T>[],
    initial?: readonly T[]
  ): Promise<T[]>;
  confirm(title: string, initial?: boolean): Promise<boolean>;
  /** One line of typed input. Returns '' when the operator takes the default. */
  text(title: string, opts?: { placeholder?: string; hint?: string }): Promise<string>;
  note(message: string): void;
  outro(message: string): void;
  /**
   * A turning line for work that takes time.
   *
   * `redline init` renders a dozen files, makes six host calls and pushes a
   * branch. Between the last question and the first line of the report that was
   * ten to thirty seconds of nothing at all, which reads as a hang — and the
   * operator's next move after a hang is Ctrl-C, in the middle of a run that is
   * writing to their repository.
   */
  task(label: string): Task;
}

export interface Task {
  /** What the run is doing now. Replaces the line in place. */
  update(label: string): void;
  /** Stop, leaving one finished line behind. */
  done(label?: string): void;
  /** Stop, leaving nothing behind — for a failure whose own error follows. */
  stop(): void;
}

// Slow enough that the line is readable, fast enough to look alive. Also the
// interval a non-TTY never pays: there, `task` writes one line and never
// schedules anything.
const SPIN_MS = 90;

/**
 * True when a stepped, redrawing prompt can be shown.
 *
 * Both streams must be a TTY: output alone is not enough (there would be
 * nothing to read keys from) and input alone is not enough (there would be
 * nowhere to draw). CI is excluded even when it allocates a TTY, because a
 * prompt in a pipeline is a hang with no operator to answer it — the failure
 * this whole change exists to remove.
 */
export function isInteractive(
  env: NodeJS.ProcessEnv = process.env,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout
): boolean {
  if (env.CI !== undefined && env.CI !== 'false' && env.CI !== '0') return false;
  if (env.REDLINE_NO_PROMPT !== undefined) return false;
  if (env.TERM === 'dumb') return false;
  return input.isTTY === true && output.isTTY === true;
}

const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 24;
// Below this a list is faster to read than to filter, and the letters are worth
// more as shortcuts: `j`/`k` to move, `a` to take everything.
const SEARCH_FROM = 9;

export function createPrompter(opts: PrompterOptions = {}): Prompter {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const env = opts.env ?? process.env;

  const c: Palette = palette(colorEnabled(env, output.isTTY === true), colorDepth(env));
  const g: Glyphs = glyphs(env);

  const write = (text: string): void => {
    output.write(text);
  };

  // Cursor visibility is toggled around a prompt rather than for the whole run:
  // a hidden cursor left behind by a crash is invisible breakage in the
  // operator's next command, not ours.
  const hideCursor = (): void => write('\x1b[?25l');
  const showCursor = (): void => write('\x1b[?25h');

  let active = false;
  let restoreHandlers: (() => void) | null = null;

  const enterRaw = (): void => {
    emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.resume();
    hideCursor();
    active = true;

    // A signal or an uncaught throw must not leave the terminal in raw mode.
    // These are removed again in exitRaw so a long-lived process (the tests)
    // does not accumulate one pair per prompt.
    const onExit = (): void => {
      if (active) exitRaw();
    };
    process.once('exit', onExit);
    process.once('SIGINT', onExit);
    process.once('SIGTERM', onExit);
    restoreHandlers = () => {
      process.off('exit', onExit);
      process.off('SIGINT', onExit);
      process.off('SIGTERM', onExit);
    };
  };

  const exitRaw = (): void => {
    active = false;
    showCursor();
    if (input.isTTY) input.setRawMode(false);
    input.pause();
    restoreHandlers?.();
    restoreHandlers = null;
  };

  // Rewind exactly the number of lines last drawn, clearing each. Counting our
  // own output rather than asking the terminal is what makes this correct
  // without a cursor-position query — and is why frame() must never emit a
  // line wider than `columns`.
  //
  // Every draw ends with a newline, so the cursor sits on the blank line below
  // the frame, not on its last row: the rewind has to clear that line too or it
  // stops one short and leaves the frame's first line — the title — on screen,
  // once per keypress.
  const erase = (lines: number): void => {
    if (lines === 0) return;
    write('\x1b[0G');
    for (let i = 0; i <= lines; i += 1) {
      write('\x1b[2K');
      if (i < lines) write('\x1b[1A');
    }
  };

  async function list<T>(
    title: string,
    choices: readonly Choice<T>[],
    multi: boolean,
    preselected: ReadonlySet<number>,
    cursorAt: number
  ): Promise<T[]> {
    if (choices.length === 0) return [];

    let state: ListState = { cursor: cursorAt, selected: preselected, query: '' };
    const width = output.columns ?? DEFAULT_WIDTH;
    const height = output.rows ?? DEFAULT_HEIGHT;
    // A search field costs a row and is worth one only where rows are not the
    // scarce thing. On a terminal shorter than this the list itself needs every
    // line it can get, and filtering a list you cannot see does not help.
    const search = choices.length >= SEARCH_FROM && height >= 10;
    const render = (): string =>
      frame({ title, choices, state, multi, palette: c, glyphs: g, width, height, search });

    enterRaw();
    let drawn = render();
    write(`${drawn}\n`);

    try {
      return await new Promise<T[]>((resolve, reject) => {
        const onData = (chunk: Buffer | string): void => {
          const key = readKey(chunk.toString());
          if (key === null) return;

          const result = reduceList(choices, state, key, { multi, search });
          if (result.kind === 'cancel') {
            cleanup();
            reject(new Cancelled());
            return;
          }
          if (result.kind === 'submit') {
            cleanup();
            const picked = multi
              ? [...state.selected].sort((a, b) => a - b).map((i) => choices[i]!.value)
              : [choices[state.cursor]!.value];
            resolve(picked);
            return;
          }
          state = result.state;
          // The redraw rewinds by the line count of what is on screen now,
          // not of what is about to replace it: a prompt whose option list
          // changed length between frames would otherwise leave orphaned rows.
          erase(drawn.split('\n').length);
          drawn = render();
          write(`${drawn}\n`);
        };

        const cleanup = (): void => {
          input.off('data', onData);
          erase(drawn.split('\n').length);
          exitRaw();
        };

        input.on('data', onData);
      });
    } catch (error) {
      // A throw from anywhere above still has to hand the terminal back.
      if (active) exitRaw();
      throw error;
    }
  }

  return {
    intro(title) {
      write(`${introLine(title, c, g, output.columns ?? DEFAULT_WIDTH)}\n`);
    },

    async select<T>(title: string, choices: readonly Choice<T>[], initial?: T): Promise<T> {
      const at = initial === undefined ? -1 : choices.findIndex((ch) => ch.value === initial);
      const cursor = at >= 0 && choices[at]!.disabled === undefined ? at : firstEnabled(choices);
      const [picked] = await list(title, choices, false, new Set(), cursor);
      const label = choices.find((ch) => ch.value === picked)?.label ?? String(picked);
      write(`${answered(title, label, c, g)}\n`);
      return picked as T;
    },

    async multiselect<T>(
      title: string,
      choices: readonly Choice<T>[],
      initial: readonly T[] = []
    ): Promise<T[]> {
      // A disabled row can never be toggled (movement skips it), so one that
      // started selected could never be turned off — it would render checked
      // and come back in the answer with no way for the operator to refuse it.
      // A vendor the organisation has switched off is exactly that case, and
      // it is recorded in .redline.json often enough to reach here.
      const selected = new Set(
        choices.flatMap((ch, i) =>
          ch.disabled === undefined && initial.includes(ch.value) ? [i] : []
        )
      );
      const picked = await list(title, choices, true, selected, firstEnabled(choices));
      const labels = picked.map(
        (value) => choices.find((ch) => ch.value === value)?.label ?? String(value)
      );
      write(`${answered(title, labels.length > 0 ? labels.join(', ') : 'none', c, g)}\n`);
      return picked;
    },

    async confirm(title, initial = true) {
      const choices: Choice<boolean>[] = [
        { value: true, label: 'Yes' },
        { value: false, label: 'No' },
      ];
      const [picked] = await list(
        title,
        choices,
        false,
        new Set(),
        initial ? 0 : 1
      );
      write(`${answered(title, picked === true ? 'Yes' : 'No', c, g)}\n`);
      return picked as boolean;
    },

    async text(title, opts = {}) {
      const width = output.columns ?? DEFAULT_WIDTH;
      const placeholder = opts.placeholder ?? '';
      const hint = opts.hint ?? '';
      let value = '';

      const render = (): string =>
        field({ title, value, placeholder, hint, palette: c, glyphs: g, width });

      enterRaw();
      let drawn = render();
      write(`${drawn}\n`);

      try {
        const answer = await new Promise<string>((resolve, reject) => {
          const onData = (chunk: Buffer | string): void => {
            const key = readKey(chunk.toString());
            if (key === null) return;

            if (key === 'cancel') {
              cleanup();
              reject(new Cancelled());
              return;
            }
            if (key === 'enter') {
              cleanup();
              resolve(value.trim());
              return;
            }
            if (key === 'erase') value = value.slice(0, -1);
            else if (typeof key === 'object') value += key.ch;
            // A space is a space here, not a toggle: this is the one prompt where
            // the list reducer's meaning for it would be wrong.
            else if (key === 'space') value += ' ';
            else return;

            erase(drawn.split('\n').length);
            drawn = render();
            write(`${drawn}\n`);
          };

          const cleanup = (): void => {
            input.off('data', onData);
            erase(drawn.split('\n').length);
            exitRaw();
          };

          input.on('data', onData);
        });
        write(`${answered(title, answer === '' ? placeholder : answer, c, g)}\n`);
        return answer;
      } catch (error) {
        if (active) exitRaw();
        throw error;
      }
    },

    task(label) {
      const width = output.columns ?? DEFAULT_WIDTH;
      let current = label;

      // No TTY, no animation: the frames would arrive as a column of near
      // identical lines in a log file. The label still gets said once, because
      // "what is it doing" is the question even a pipe wants answered.
      if (output.isTTY !== true) {
        write(`${spinnerDone(current, c, g, width)}\n`);
        return {
          update(next) {
            current = next;
            write(`${spinnerDone(next, c, g, width)}\n`);
          },
          done() {},
          stop() {},
        };
      }

      let tick = 0;
      const draw = (): void => {
        write(`\x1b[0G\x1b[2K${spinnerLine(current, tick, c, g, width)}`);
      };
      hideCursor();
      draw();
      // Unref'd: a timer this owns must never be the reason the process stays
      // alive after the work it was describing has finished.
      const timer = setInterval(() => {
        tick += 1;
        draw();
      }, SPIN_MS);
      timer.unref?.();

      let running = true;
      const halt = (): void => {
        if (!running) return;
        running = false;
        clearInterval(timer);
        write('\x1b[0G\x1b[2K');
        showCursor();
      };

      return {
        update(next) {
          if (!running) return;
          current = next;
          draw();
        },
        done(final) {
          if (!running) return;
          const last = final ?? current;
          halt();
          write(`${spinnerDone(last, c, g, width)}\n`);
        },
        stop: halt,
      };
    },

    note(message) {
      write(`${noteLine(message, c, g)}\n`);
    },

    outro(message) {
      write(`${outroLine(message, c, g)}\n`);
    },
  };
}
