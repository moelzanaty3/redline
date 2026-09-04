import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from './manifest.ts';
import { BEGIN, BEGIN_PREFIX, END, findBlock } from './markers.ts';

export const PREFIX = 'redline-';

// The repository's own rules. A human owns this file outright: Redline reads
// it, never writes it, never prunes it, and never fails a run over what is in
// it. It is rendered INSIDE the Redline block precisely because a human's edit
// to the block itself does not survive the next render and this has to.
export const LOCAL_RULES_FILE = '.redline/local.md';

export interface RenderContext {
  manifest: Manifest;
  root: string;
  profile: string;
  stacks: string[];
  // The repository's own rules, ready to embed, or null when it has none.
  // Read from the tree being rendered INTO (`out`), not from `root`: `root` is
  // the standards package, and the org's copy of a repository's local rules
  // does not exist.
  local: string | null;
}

export interface RenderedFile {
  body: string;
  merge?: boolean;
  // This artifact is where the repository-local rules section is rendered.
  // Structural, not conditional on the file existing: `redline verify` needs to
  // know which artifacts the section can explain staleness in, including on the
  // run where the local file has just been deleted and the section is gone.
  localRules?: boolean;
}

export interface PruneRule {
  dir: string;
  matches: (filename: string) => boolean;
}

export interface VendorOutput {
  files: Map<string, RenderedFile>;
  prune: PruneRule[];
}

export type VendorRenderer = (ctx: RenderContext) => VendorOutput;

const read = (root: string, relPath: string): string =>
  readFileSync(join(root, relPath), 'utf8').trimEnd();

const stackBody = (ctx: RenderContext, id: string): string =>
  read(ctx.root, ctx.manifest.stacks[id]!.source);

const header = (ctx: RenderContext, stacks: string[]): string =>
  `<!-- Redline v${ctx.manifest.version} · profile: ${ctx.profile} · stacks: ${stacks.join(', ')} -->`;

// Precedence has to be stated in the artifact itself, in words the tool acts
// on: two rule sets sitting side by side with nothing to resolve a conflict
// between them is the gap this section exists to close.
const PRECEDENCE = [
  `The rules below come from this repository's own \`${LOCAL_RULES_FILE}\`, not from the org`,
  'standard. Where one of them conflicts with anything above, the repository\'s own rules win',
  'here. Everything above that they do not contradict still applies.',
].join('\n');

export const LOCAL_HEADING = '# Repository-local rules';

export function localSection(local: string): string {
  return `---\n\n${LOCAL_HEADING}\n\n${PRECEDENCE}\n\n${local}`;
}

const withLocal = (ctx: RenderContext, body: string): string =>
  ctx.local === null ? body : `${body}\n\n${localSection(ctx.local)}`;

// A REDLINE marker line and an unclosed code fence are the two shapes in a
// human's markdown that reach markers.ts as structure rather than as prose: the
// first makes a second marker pair, which wrapBlock refuses, and the second
// swallows the END marker written below it. Neither may cost the run, because
// this file is not Redline's to validate. So the marker text is escaped to the
// characters it renders as, and whether what is left can still be read back is
// asked of markers.ts itself rather than of a second parser here — anything it
// cannot read is quoted, which no fence and no marker survives.
//
// Built from markers.ts's own literals rather than restating the marker shape:
// BEGIN_PREFIX exists because the marker wording changes, and a second copy of
// it here would stop escaping the day it does — which is the one direction
// that costs a run.
const escapeRegExp = (literal: string): string => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MARKER_LINE = new RegExp(
  `^([ \\t]*)(${[BEGIN_PREFIX, END].map(escapeRegExp).join('|')})`,
  'gm'
);

const readable = (candidate: string): boolean => {
  try {
    return findBlock(`${BEGIN}\n${candidate}\n${END}\n`, LOCAL_RULES_FILE) !== null;
  } catch {
    return false;
  }
};

const quote = (text: string): string =>
  text
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');

export function readLocalRules(out: string): string | null {
  const path = join(out, LOCAL_RULES_FILE);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  if (raw === '') return null;
  const escaped = raw.replace(
    MARKER_LINE,
    (_match: string, indent: string, marker: string): string => `${indent}&lt;${marker.slice(1)}`
  );
  return readable(escaped) ? escaped : quote(escaped);
}

const copilot: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set('.github/copilot-instructions.md', {
    merge: true,
    localRules: true,
    body: withLocal(ctx, `${header(ctx, ctx.stacks)}\n\n${read(ctx.root, ctx.manifest.core.source)}`),
  });
  for (const id of ctx.stacks) {
    const stack = ctx.manifest.stacks[id]!;
    files.set(`.github/instructions/${PREFIX}${id}.instructions.md`, {
      body:
        `---\napplyTo: ${JSON.stringify(stack.globs.join(','))}\n---\n\n` +
        `${header(ctx, [id])}\n\n${stackBody(ctx, id)}`,
    });
  }
  return {
    files,
    prune: [
      {
        dir: '.github/instructions',
        matches: (f) => f.startsWith(PREFIX) && f.endsWith('.instructions.md'),
      },
    ],
  };
};

const demote = (md: string): string => md.replace(/^(#{1,5}) /gm, '#$1 ');

const agents: VendorRenderer = (ctx) => {
  const sections = ctx.stacks.map((id) => {
    const scope = ctx.manifest.stacks[id]!.globs.map((g) => `\`${g}\``).join(', ');
    return `${demote(stackBody(ctx, id))}\n\n_Applies to: ${scope}_`;
  });
  const body = [
    header(ctx, ctx.stacks),
    '',
    read(ctx.root, ctx.manifest.core.source),
    '',
    '---',
    '',
    '# Stack rules',
    '',
    sections.join('\n\n---\n\n'),
  ].join('\n');
  return {
    files: new Map([['AGENTS.md', { merge: true, localRules: true, body: withLocal(ctx, body) }]]),
    prune: [],
  };
};

const claude: VendorRenderer = (ctx) => ({
  files: new Map([
    [
      'CLAUDE.md',
      {
        merge: true,
        localRules: true,
        body: withLocal(
          ctx,
          [
            'Engineering standards and review rules for this repository are defined by Redline',
            'and rendered into `AGENTS.md`. They are binding for all work in this repo.',
            '',
            '@AGENTS.md',
          ].join('\n')
        ),
      },
    ],
  ]),
  prune: [],
});

const cursor: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set(`.cursor/rules/${PREFIX}core.mdc`, {
    localRules: true,
    body:
      `---\ndescription: Redline core standards\nalwaysApply: true\n---\n\n` +
      withLocal(ctx, `${header(ctx, ctx.stacks)}\n\n${read(ctx.root, ctx.manifest.core.source)}`),
  });
  for (const id of ctx.stacks) {
    const stack = ctx.manifest.stacks[id]!;
    files.set(`.cursor/rules/${PREFIX}${id}.mdc`, {
      body:
        `---\ndescription: Redline ${stack.title} rules\nglobs: ${stack.globs.join(',')}\n` +
        `alwaysApply: false\n---\n\n${stackBody(ctx, id)}`,
    });
  }
  return {
    files,
    prune: [{ dir: '.cursor/rules', matches: (f) => f.startsWith(PREFIX) && f.endsWith('.mdc') }],
  };
};

export const VENDORS: Record<string, VendorRenderer> = { copilot, agents, claude, cursor };
