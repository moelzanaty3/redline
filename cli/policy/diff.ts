// A unified diff, reduced to the only thing a deterministic check may look at:
// the lines this change ADDED, with their file and line number.
//
// Added lines only, and that is a rule not an optimisation. `core/unrelated-change`
// and the "what NOT to flag" section both say the same thing — existing patterns a
// pull request merely touches are not this pull request's problem. A checker that
// read whole files would flag every `var` in a legacy file the author renamed, and
// the author would be right to ignore it, and then to ignore the next one too.

export interface AddedLine {
  file: string;
  // 1-based line number in the file after the change, so a finding points at
  // something a reviewer can open.
  line: number;
  text: string;
}

const FILE_HEADER = /^\+\+\+ b\/(.+)$/;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseDiff(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let file: string | null = null;
  let line = 0;

  for (const raw of diff.split('\n')) {
    const header = FILE_HEADER.exec(raw);
    if (header) {
      // /dev/null as the destination is a deletion. Nothing was added, and the
      // path is not a real one.
      file = header[1] === '/dev/null' ? null : (header[1] ?? null);
      continue;
    }
    const hunk = HUNK.exec(raw);
    if (hunk) {
      line = Number.parseInt(hunk[1] ?? '1', 10);
      continue;
    }
    if (file === null) continue;

    if (raw.startsWith('+')) {
      added.push({ file, line, text: raw.slice(1) });
      line += 1;
    } else if (raw.startsWith('-')) {
      // A removed line does not advance the new-file counter.
      continue;
    } else if (raw.startsWith(' ') || raw === '') {
      line += 1;
    }
    // Everything else — `diff --git`, `index`, `\ No newline` — is metadata.
  }

  return added;
}
