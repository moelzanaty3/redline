import { BEGIN_PREFIX, END } from '../render/markers.ts';

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

// `b/` OR `/dev/null`: the prefixed form is a real destination path, the second
// is a deletion. Matching only the prefixed form left `+++ /dev/null` falling
// through to the added-line branch below, where it became a phantom line of
// content attributed to the PREVIOUS file — so a deleted file could produce a
// finding on a file the change never touched.
const FILE_HEADER = /^\+\+\+ (?:b\/(.+)|(\/dev\/null))$/;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseDiff(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let file: string | null = null;
  let line = 0;
  let generated = false;

  for (const raw of diff.split('\n')) {
    const header = FILE_HEADER.exec(raw);
    if (header) {
      // A deletion has no destination path, so nothing after it is an addition
      // until the next file header.
      file = header[2] ? null : (header[1] ?? null);
      generated = false;
      continue;
    }
    const hunk = HUNK.exec(raw);
    if (hunk) {
      line = Number.parseInt(hunk[1] ?? '1', 10);
      continue;
    }
    if (file === null) continue;

    // Lines inside a REDLINE block are Redline's own output, not this author's
    // code, and they are not reviewable as code. The rendered standards quote
    // the exact constructs the checks hunt for — `@ts-ignore`, `TODO` — so a
    // checker that read them reported each rule as a violation of itself, and
    // every `redline init` pull request opened with BLOCKER findings against
    // the block Redline had just written. Same failure the parseInt pattern
    // above already had once: a checker flagging its own source.
    //
    // Context lines drive the state as well as added ones, so a hunk that opens
    // an existing block without adding its marker is still recognised as inside
    // it. A hunk that begins deeper inside a block than its context reaches
    // cannot be — the marker is simply not in the diff — which is why the
    // markers are matched at all rather than the whole file being skipped by
    // name: what is in the diff is decided correctly, and what is not stays as
    // it was.
    const body = raw.startsWith('+') || raw.startsWith(' ') ? raw.slice(1).trimStart() : null;
    if (body !== null && body.startsWith(BEGIN_PREFIX)) generated = true;

    if (raw.startsWith('+')) {
      if (!generated) added.push({ file, line, text: raw.slice(1) });
      line += 1;
    } else if (raw.startsWith('-')) {
      // A removed line does not advance the new-file counter.
      continue;
    } else if (raw.startsWith(' ') || raw === '') {
      line += 1;
    }

    // Closed after the line is counted: the END marker is itself generated.
    if (body !== null && body.startsWith(END)) generated = false;
    // Everything else — `diff --git`, `index`, `\ No newline` — is metadata.
  }

  return added;
}
