// The searchable body of the documentation, built at build time.
//
// Why this exists. The ⌘K index used to be the navigation with a keyword field
// bolted on: page titles, page descriptions, and hand-written keywords. That
// finds a page you could already see in the sidebar and misses everything the
// page actually says — `javascript/var-in-new-code`, `pendingAdmin`,
// `swiftlint`, `Expected — waiting for status` all returned nothing.
//
// The rule ids were the damning ones. The whole contract is that every finding
// carries a permanent id, so the id is the single most likely thing a reader
// arrives with: they read `Redline/HIGH [javascript/var-in-new-code]` on a pull
// request and paste it into the docs. Answering that with "No results" is the
// product contradicting itself in the one place a reader tests it.
//
// Two indexes are built here, both server-side, both handed to the client
// component as props — `lib/rules.ts` reads standards/ off disk and the page
// scanner reads app/, so neither can be imported into a "use client" module.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FLAT_DOCS } from "./docs-nav";
import { getRules, type Severity } from "./rules";
import { PLANS, SCRIPTS, SEEDS, STANDARDS, TEMPLATES, WORKFLOWS } from "./registry";

/** A rule as its own search result, rather than a page that happens to list it. */
export type RuleHit = {
  id: string;
  severity: Severity;
  text: string;
  href: string;
  stackTitle: string;
};

/**
 * The anchor a rule row carries on its stack page. Shared with the standards
 * page so a search result and the row it points at cannot drift apart — a rule
 * id contains a slash, which is not usable in a fragment as-is.
 */
export function ruleAnchor(ruleId: string): string {
  return `rule-${ruleId.replace(/[^a-z0-9]+/gi, "-")}`;
}

// Which stack page documents a rule. Core rules are listed on every stack page
// but are owned by `core`, and the id's own prefix is the authority on that.
const stackTitle = new Map(STANDARDS.map((s) => [s.slug, s.title]));

export function ruleHits(): RuleHit[] {
  return getRules().map((r) => ({
    id: r.id,
    severity: r.severity,
    text: r.text,
    href: `/docs/standards/${r.stack}#${ruleAnchor(r.id)}`,
    stackTitle: stackTitle.get(r.stack) ?? r.stack,
  }));
}

// ---------------------------------------------------------------------------
// Page body text
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&apos;": "'",
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&mdash;": "—",
  "&nbsp;": " ",
};

/**
 * Readable text out of a page's JSX source.
 *
 * Not a parser, and it does not need to be: the output is a haystack for
 * `includes()`, never something a reader sees. Over-collecting costs a
 * false positive in search; under-collecting costs the miss this whole
 * module exists to fix, so this errs towards collecting.
 */
function textOf(source: string): string {
  return (
    source
      // Comments first — they explain the code to us, not the product to a reader,
      // and they are full of words that would match nothing useful.
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .replace(/^\s*import .*$/gm, " ")
      // Attributes whose values are never prose. `href` is kept deliberately:
      // searching for a path a page links to is a reasonable thing to do.
      .replace(/\b(className|class|key|style|id|width|height|viewBox|d|fill|stroke)=(["'{])[^"'}]*\2/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z]+;/g, (m) => ENTITIES[m] ?? " ")
      .replace(/[{}]/g, " ")
  );
}

/**
 * A page's text as a deduplicated token soup.
 *
 * Storing the prose verbatim would ship the whole documentation to the browser
 * twice. Unique tokens collapse a 20KB page to roughly a tenth of that and cost
 * nothing that matters here: the matcher already tests each query term on its
 * own, so a multi-word query like "waiting for status" still resolves — it asks
 * whether all three words appear on the page, which is what it meant.
 */
function tokenise(text: string): string {
  const seen = new Set<string>();
  // Slashes, dots and hyphens are kept inside a token, so `javascript/var-in-new-code`,
  // `.redline.json` and `--gate-source` survive as themselves rather than as fragments.
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9._/@-]*/g) ?? []) {
    const token = raw.replace(/[._/-]+$/, "");
    if (token.length > 1) seen.add(token);
  }
  return [...seen].join(" ");
}

// A reference page's real content is the artifact it renders, not the JSX that
// renders it: /docs/standards/core is standards/core.md in a viewer. Scanning
// only the component missed all of it — `swiftlint` is written in the rule that
// exists to catch it, and searching for it found nothing.
//
// Indexing the artifacts also means the search covers what actually ships: a
// scanner pin, a workflow job id, a CODEOWNERS path, a seed marker.
const REPO_ROOT = join(process.cwd(), "..");

const RENDERED_FILES: [base: string, entries: { slug: string; file: string }[]][] = [
  ["/docs/standards", STANDARDS],
  ["/docs/workflows", WORKFLOWS],
  ["/docs/templates", TEMPLATES],
  ["/docs/scripts", SCRIPTS],
  ["/docs/seeds", SEEDS],
  ["/docs/roadmap", PLANS],
];

function read(file: string): string {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}

/** Page href → token soup, for every doc page whose content is on disk. */
export function pageText(): Record<string, string> {
  const out: Record<string, string> = {};

  for (const doc of FLAT_DOCS) {
    // Catalogue children are generated from data already in the index as a
    // title and description; there is no source file to scan for them.
    const file = join(process.cwd(), "app", doc.href, "page.tsx");
    if (!existsSync(file)) continue;
    const tokens = tokenise(textOf(read(file)));
    if (tokens) out[doc.href] = tokens;
  }

  for (const [base, entries] of RENDERED_FILES) {
    for (const entry of entries) {
      const body = read(join(REPO_ROOT, entry.file));
      if (!body) continue;
      const href = `${base}/${entry.slug}`;
      // The artifact's own words, plus whatever the page component said around
      // them — both are on the page, so both are searchable.
      out[href] = tokenise(`${out[href] ?? ""} ${body}`);
    }
  }

  return out;
}
