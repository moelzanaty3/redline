import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, type Manifest } from '../render/manifest.ts';
import { RedlineError } from '../core/errors.ts';

// The rule catalogue, read from the standards themselves.
//
// `scripts/lib/rules.mjs` parses the same markdown for CI — validate, seed
// scoring, the digest. This is deliberately a second reader rather than an
// import: the scripts are plain .mjs run by node directly, and reaching into
// them from typed code would mean shipping an untyped module inside the CLI's
// own build. The duplication is a parser of two regexes, and
// cli/rules/__tests__/catalogue.test.ts asserts the two agree on every rule id
// in the repository, so a drift between them fails the build rather than
// quietly giving `redline explain` a different catalogue than the gate uses.

export type Severity = 'BLOCKER' | 'HIGH' | 'SUGGESTION';

export interface Rule {
  readonly id: string;
  readonly stack: string;
  readonly severity: Severity;
  /** The rule's own words, with the id prefix stripped. */
  readonly text: string;
  readonly source: string;
  readonly line: number;
}

const RULE_LINE = /^-\s+`([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)`\s+—\s+(.*)$/;
const RULE_HEADING =
  /^#{2,3}\s+(BLOCKER|HIGH|SUGGESTION|Security|Type safety|Error handling|General correctness|Scope discipline)\b/i;
const ANY_HEADING = /^#{1,6}\s/;

// How a section heading decides the severity of the rules under it. This mirrors
// scripts/lib/rules.mjs exactly, which is the authority: it is what validate,
// seed scoring and the telemetry aggregation already use, so a rule's severity
// here has to be the severity the gate acts on. A stack file heads its sections
// with the severity word; the core standard groups by topic instead and states
// the severity in the heading's own text ("## Security (BLOCKER)"), which is why
// the fallback reads the line rather than the word.
const SEVERITIES = new Set<string>(['BLOCKER', 'HIGH', 'SUGGESTION']);

function severityOf(heading: string, line: string): Severity {
  const word = heading.toUpperCase();
  if (SEVERITIES.has(word)) return word as Severity;
  return /BLOCKER/i.test(line) ? 'BLOCKER' : 'HIGH';
}

/** Every rule the standards define, keyed by id, in source order. */
export function loadRules(root: string, manifest: Manifest = loadManifest(root)): Map<string, Rule> {
  const sources: [string, string][] = [
    ['core', manifest.core.source],
    ...Object.entries(manifest.stacks).map(
      ([id, stack]): [string, string] => [id, stack.source]
    ),
  ];

  const rules = new Map<string, Rule>();
  for (const [stack, relPath] of sources) {
    let severity: Severity | null = null;
    let inFence = false;

    readFileSync(join(root, relPath), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (/^```/.test(line.trim())) inFence = !inFence;
        if (inFence) return;

        if (ANY_HEADING.test(line)) {
          const heading = RULE_HEADING.exec(line);
          severity = heading ? severityOf(heading[1]!, line) : null;
          return;
        }

        const match = RULE_LINE.exec(line);
        if (!match || severity === null) return;
        const [, id, text] = match;
        rules.set(id!, {
          id: id!,
          stack,
          severity,
          text: text!.trim(),
          source: relPath,
          line: index + 1,
        });
      });
  }
  return rules;
}

export interface Explanation {
  readonly rule: Rule;
  /** Profiles whose stacks include this rule — who actually receives it. */
  readonly profiles: string[];
  /** Globs the rule is scoped to. Empty for core, which applies everywhere. */
  readonly globs: readonly string[];
  /** True when a checker decides this rule with no model call. */
  readonly deterministic: boolean;
}

/**
 * One rule, with the context a finding does not carry.
 *
 * A finding gives an id and a line. What it cannot say is whether a human or a
 * checker decided it, which files the rule is scoped to, and which repositories
 * in the estate receive it at all — which is exactly what someone asks when
 * they disagree with a finding.
 */
export function explain(root: string, id: string): Explanation {
  const manifest = loadManifest(root);
  const rules = loadRules(root, manifest);
  const rule = rules.get(id);

  if (!rule) {
    const near = suggest(id, [...rules.keys()]);
    throw new RedlineError(
      'usage',
      `no rule "${id}" in the standards`,
      near.length > 0 ? `did you mean: ${near.join(', ')}` : 'list them with: redline explain --list'
    );
  }

  const profiles = Object.entries(manifest.profiles)
    .filter(([, stacks]) => rule.stack === 'core' || stacks.includes(rule.stack))
    .map(([name]) => name);

  return {
    rule,
    profiles,
    globs: manifest.stacks[rule.stack]?.globs ?? [],
    deterministic: manifest.deterministic.includes(id),
  };
}

/**
 * Ids close enough to be what was meant.
 *
 * A mistyped id is the common case — they are copied out of a review comment by
 * hand — and "no such rule" with no candidates makes a typo look like a rule
 * that was removed.
 */
export function suggest(id: string, known: readonly string[], limit = 3): string[] {
  const target = id.toLowerCase();
  const [stack, slug] = target.includes('/') ? target.split('/') : [null, target];

  return known
    .map((candidate) => {
      const lower = candidate.toLowerCase();
      const [candStack, candSlug] = lower.split('/');
      let score = 0;
      if (lower === target) score += 100;
      if (stack !== null && candStack === stack) score += 20;
      if (candSlug === slug) score += 40;
      if (slug !== undefined && candSlug !== undefined) {
        if (candSlug.includes(slug) || slug.includes(candSlug)) score += 15;
        score += shared(candSlug, slug);
      }
      return { candidate, score };
    })
    // Above what a bare stack match scores: sharing a prefix with the typo makes
    // every rule in that stack a candidate, and a list of unrelated rules is
    // worse than no list — it reads as though the tool found something.
    .filter(({ score }) => score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/** How many hyphen-separated words two slugs have in common. */
function shared(a: string, b: string): number {
  const words = new Set(b.split('-'));
  return a.split('-').filter((word) => word.length > 2 && words.has(word)).length * 10;
}
