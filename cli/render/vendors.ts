import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from './manifest.ts';

export const PREFIX = 'redline-';

export interface RenderContext {
  manifest: Manifest;
  root: string;
  profile: string;
  stacks: string[];
}

export interface RenderedFile {
  body: string;
  merge?: boolean;
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

const copilot: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set('.github/copilot-instructions.md', {
    merge: true,
    body: `${header(ctx, ctx.stacks)}\n\n${read(ctx.root, ctx.manifest.core.source)}`,
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
  return { files: new Map([['AGENTS.md', { merge: true, body }]]), prune: [] };
};

const claude: VendorRenderer = () => ({
  files: new Map([
    [
      'CLAUDE.md',
      {
        merge: true,
        body: [
          'Engineering standards and review rules for this repository are defined by Redline',
          'and rendered into `AGENTS.md`. They are binding for all work in this repo.',
          '',
          '@AGENTS.md',
        ].join('\n'),
      },
    ],
  ]),
  prune: [],
});

const cursor: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set(`.cursor/rules/${PREFIX}core.mdc`, {
    body:
      `---\ndescription: Redline core standards\nalwaysApply: true\n---\n\n` +
      `${header(ctx, ctx.stacks)}\n\n${read(ctx.root, ctx.manifest.core.source)}`,
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
