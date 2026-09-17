import { BEGIN_PREFIX, END } from '../render/markers.ts';

// The line every wholly-generated Redline artifact carries in a format that has
// somewhere to put one — YAML, shell, and the rendered command prompts.
// Anchored at the start of the trimmed body so a sentence merely mentioning the
// phrase is not one.
const OWNERSHIP_LINE = /^(?:#|<!--|\/\/)?\s*Managed by Redline\b/;

// The artifacts with nowhere to put that line: the per-stack instruction files
// and the Cursor rules open with frontmatter a tool parses, so a comment above
// it would break them. They are recognised the way `redline remove` recognises
// the same files — by the `redline-` prefix on the name AND the directory the
// vendor's PruneRule in render/vendors.ts owns. The prefix alone is not
// evidence: it exempted a hand-written `scripts/redline-deploy.sh` from every
// deterministic check, so naming a file was enough to get past the gate.
const REDLINE_ARTIFACT =
  /^(?:\.github\/instructions\/redline-[^/]+\.instructions\.md|\.cursor\/rules\/redline-[^/]+\.mdc)$/;

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
      // A file Redline renders whole is generated from its first line, with no
      // marker to open the state — unlike the shared files below, where the
      // block is bounded and the repository owns everything outside it.
      generated = file !== null && REDLINE_ARTIFACT.test(file);
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

    // The other half of the same problem. The markers above bound Redline's
    // output inside a file the repository also owns; these files are Redline's
    // output WHOLE — the per-stack instruction files, the Cursor rules, the
    // rendered commands — and carry no marker to bound, so nothing here
    // recognised them. The rendered rule text necessarily spells out every
    // construct the checks hunt for, so `redline init`'s own pull request
    // opened with findings against files Redline had just written: a BLOCKER on
    // `core/type-checker-suppression` from the rule that forbids suppressions,
    // and a HIGH on `core/untracked-todo` from the rule that forbids untracked
    // TODOs.
    //
    // Recognised by the ownership line rather than by path, for the same reason
    // `remove` does: a list of paths goes stale the moment a vendor is added,
    // and the line is the thing that is actually true of every file Redline
    // wrote. Once set it holds for the rest of the file — there is no closing
    // marker, because the whole file is generated.
    if (body !== null && OWNERSHIP_LINE.test(body)) generated = true;

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
