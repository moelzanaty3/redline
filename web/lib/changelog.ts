import { readRepoFile } from "./content";

// The changelog, parsed at build time from the file itself.
//
// Sourced rather than retyped, so the page cannot drift from the record. A
// release-notes page maintained by hand is one that is accurate on the day it
// ships and misleading a month later — and this one carries the sentences that
// say what changed and why, which are the reason anyone reads it.
export type ChangelogSection = {
  heading: string;
  // The unreleased section, which is what a reader upgrading actually needs.
  unreleased: boolean;
  entries: string[];
};

let cached: ChangelogSection[] | null = null;

const HEADING = /^##\s+(.+?)\s*$/;
// A `### Sub heading` groups a release's entries; treated as an entry so the
// grouping survives without inventing a second level of structure here.
const SUBHEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^-\s+(.*)$/;

export function loadChangelog(): ChangelogSection[] {
  if (cached) return cached;

  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current && buffer.length > 0) {
      current.entries.push(buffer.join(" ").replace(/\s+/g, " ").trim());
      buffer = [];
    }
  };

  for (const line of readRepoFile("CHANGELOG.md").split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      current = {
        heading: heading[1] ?? "",
        unreleased: /unreleased/i.test(heading[1] ?? ""),
        entries: [],
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    const sub = SUBHEADING.exec(line);
    if (sub) {
      flush();
      current.entries.push(`## ${sub[1]}`);
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      buffer.push(bullet[1] ?? "");
      continue;
    }
    // A continuation line of the bullet above. Blank lines end one.
    if (line.trim() === "") flush();
    else if (buffer.length > 0) buffer.push(line.trim());
  }
  flush();

  cached = sections;
  return cached;
}

/** Markdown emphasis and code spans, as plain segments a component can render. */
export type Segment = { text: string; bold?: boolean; code?: boolean };

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) out.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) out.push({ text: match[2], code: true });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
