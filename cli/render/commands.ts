import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RedlineError } from '../core/errors.ts';

export interface CommandSource {
  name: string;
  description: string;
  body: string;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function loadCommands(root: string): CommandSource[] {
  const dir = join(root, 'commands');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const raw = readFileSync(join(dir, file), 'utf8');
      const match = FRONTMATTER.exec(raw);
      const description = /description:\s*(.+)/.exec(match?.[1] ?? '')?.[1]?.trim() ?? '';
      return {
        name: file.replace(/\.md$/, ''),
        description,
        body: raw.slice(match?.[0].length ?? 0).trimStart(),
      };
    });
}

type HostRenderer = (cmd: CommandSource) => { path: string; body: string };

export const COMMAND_HOSTS: Record<string, HostRenderer> = {
  copilot: (cmd) => ({
    path: `.github/prompts/${cmd.name}.prompt.md`,
    body: `---\nmode: agent\ndescription: ${cmd.description}\n---\n\n${cmd.body}`,
  }),
  claude: (cmd) => ({
    path: `.claude/commands/${cmd.name}.md`,
    body: `---\ndescription: ${cmd.description}\n---\n\n${cmd.body}`,
  }),
  opencode: (cmd) => ({
    path: `.opencode/command/${cmd.name}.md`,
    body: `---\ndescription: ${cmd.description}\n---\n\n${cmd.body}`,
  }),
  cursor: (cmd) => ({ path: `.cursor/commands/${cmd.name}.md`, body: cmd.body }),
};

export interface RenderCommandsOptions {
  root: string;
  out: string;
  hosts: string[];
  // Report which files would change and write none of them, matching
  // render()'s own check mode — what `redline init --dry-run` plans with.
  check?: boolean;
}

export function renderCommands(opts: RenderCommandsOptions): string[] {
  const commands = loadCommands(opts.root);
  const written: string[] = [];

  for (const host of opts.hosts) {
    const renderer = COMMAND_HOSTS[host];
    if (!renderer) {
      throw new RedlineError(
        'usage',
        `unknown command host "${host}". Known: ${Object.keys(COMMAND_HOSTS).join(', ')}`
      );
    }
    for (const command of commands) {
      const { path, body } = renderer(command);
      const target = join(opts.out, path);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      const next = `${body.trimEnd()}\n`;
      if (current === next) continue;
      if (!opts.check) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, next);
      }
      written.push(path);
    }
  }
  return written;
}
