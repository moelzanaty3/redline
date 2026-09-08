import { emitKeypressEvents } from 'node:readline';
import {
  answered,
  colorEnabled,
  firstEnabled,
  frame,
  glyphs,
  intro as introLine,
  note as noteLine,
  outro as outroLine,
  palette,
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
  note(message: string): void;
  outro(message: string): void;
}

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

export function createPrompter(opts: PrompterOptions = {}): Prompter {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const env = opts.env ?? process.env;

  const c: Palette = palette(colorEnabled(env, output.isTTY === true));
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
  const erase = (lines: number): void => {
    if (lines === 0) return;
    write('\x1b[0G');
    for (let i = 0; i < lines; i += 1) {
      write('\x1b[2K');
      if (i < lines - 1) write('\x1b[1A');
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

    let state: ListState = { cursor: cursorAt, selected: preselected };
    const width = output.columns ?? DEFAULT_WIDTH;
    const render = (): string =>
      frame({ title, choices, state, multi, palette: c, glyphs: g, width });

    enterRaw();
    let drawn = render();
    write(`${drawn}\n`);

    try {
      return await new Promise<T[]>((resolve, reject) => {
        const onData = (chunk: Buffer | string): void => {
          const key = readKey(chunk.toString());
          if (key === null) return;

          const result = reduceList(choices, state, key, multi);
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
      write(`${introLine(title, c, g)}\n`);
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
      const selected = new Set(
        choices.flatMap((ch, i) => (initial.includes(ch.value) ? [i] : []))
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

    note(message) {
      write(`${noteLine(message, c, g)}\n`);
    },

    outro(message) {
      write(`${outroLine(message, c, g)}\n`);
    },
  };
}
