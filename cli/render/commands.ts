import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RedlineError } from '../core/errors.ts';
import { wrapBlock } from './markers.ts';
import { stripBlock } from './standards.ts';

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

// `header` is deliberately outside the marker block: the tools that read these
// files parse frontmatter at byte zero, so it cannot sit below a marker line.
// Everything the block carries is `body`.
type HostRenderer = (cmd: CommandSource) => { path: string; header: string; body: string };

export const COMMAND_HOSTS: Record<string, HostRenderer> = {
  copilot: (cmd) => ({
    path: `.github/prompts/${cmd.name}.prompt.md`,
    header: `---\nmode: agent\ndescription: ${cmd.description}\n---\n`,
    body: cmd.body,
  }),
  claude: (cmd) => ({
    path: `.claude/commands/${cmd.name}.md`,
    header: `---\ndescription: ${cmd.description}\n---\n`,
    body: cmd.body,
  }),
  opencode: (cmd) => ({
    path: `.opencode/command/${cmd.name}.md`,
    header: `---\ndescription: ${cmd.description}\n---\n`,
    body: cmd.body,
  }),
  cursor: (cmd) => ({ path: `.cursor/commands/${cmd.name}.md`, header: '', body: cmd.body }),
};

export interface RenderCommandsOptions {
  root: string;
  out: string;
  hosts: string[];
  // Report which files would change and write none of them, matching
  // render()'s own check mode — what `redline init --dry-run` plans with.
  check?: boolean;
}

export interface RenderCommandsResult {
  written: string[];
  removed: string[];
}

// Everything outside Redline's block in a file Redline itself created: the
// frontmatter header above, and nothing else. Recognising it is what lets a
// changed `description:` in `commands/<name>.md` reach a file Redline already
// wrote, while a header — or any prose — a human put there is never rewritten.
const HEADER_ONLY = /^---\n[\s\S]*?\n---$/;

// `<name>` is only the filename in `commands/`, and nothing reserves that name
// in a consumer repository — `commands/review-pr.md` here would land on a
// team's own `.claude/commands/review-pr.md`. So whatever is at the path stays
// and Redline's half goes inside a marker block beside it. A `.claude/commands`
// file IS one prompt body, so `/<name>` then runs both texts concatenated; that
// is the accepted cost of not overwriting a human's prompt, and the markers are
// what keep Redline's half removable and re-renderable.
export function renderCommands(opts: RenderCommandsOptions): RenderCommandsResult {
  const commands = loadCommands(opts.root);
  const written: string[] = [];
  const removed: string[] = [];

  for (const host of opts.hosts) {
    if (!COMMAND_HOSTS[host]) {
      throw new RedlineError(
        'usage',
        `unknown command host "${host}". Known: ${Object.keys(COMMAND_HOSTS).join(', ')}`
      );
    }
  }

  // Every host, not just the selected ones: a host that is no longer selected
  // is how Redline's block gets taken back out again, which is the other half
  // of being allowed to merge it into a file it does not own.
  for (const [host, renderer] of Object.entries(COMMAND_HOSTS)) {
    const selected = opts.hosts.includes(host);
    for (const command of commands) {
      const { path, header, body } = renderer(command);
      const target = join(opts.out, path);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      // Throws rather than guessing on a half-edited marker pair or a block
      // hidden under an unclosed fence — see markers.ts. Nothing is written.
      const outside = current === null ? null : stripBlock(current, path);
      const ownedWhole =
        outside === null || (outside !== current && HEADER_ONLY.test(outside.trim()));

      if (!selected) {
        if (current === null || outside === current) continue; // never Redline's — brownfield rule
        if (!opts.check) {
          if (ownedWhole) rmSync(target);
          else writeFileSync(target, outside);
        }
        removed.push(path);
        continue;
      }

      const next = wrapBlock(current === null || ownedWhole ? header : current, body, path);
      if (current === next) continue;
      if (!opts.check) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, next);
      }
      written.push(path);
    }
  }
  return { written, removed };
}
