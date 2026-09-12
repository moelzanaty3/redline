// Shared rule catalogue and finding parser.
//
// Every consumer of review output — telemetry, seed scoring, the digest, the dashboard —
// must agree on what a rule id is and how a finding is parsed. Keeping that in one place
// is the difference between "our numbers disagree" and a working feedback loop.

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SEVERITIES = ['BLOCKER', 'HIGH', 'SUGGESTION'];
export const RANK = { SUGGESTION: 1, HIGH: 2, BLOCKER: 3 };

// Reserved ids that are not bullets in the standards.
export const RESERVED_RULE_IDS = new Set(['core/uncatalogued']);

export const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const RULE_LINE = /^-\s+`([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)`\s+—\s+(.*)$/;
const RULE_HEADING = /^#{2,3}\s+(BLOCKER|HIGH|SUGGESTION|Security|Type safety|Error handling|General correctness|Scope discipline)\b/i;
const ANY_HEADING = /^#{1,6}\s/;

// A finding's first line, e.g. "Redline/BLOCKER [react/key-is-index]: ...".
// The id group is optional so pre-2.1 repos still parse, reported as untagged.
const FINDING = /(?:^|\n)\s*(?:[*_`>-]*\s*)?Redline\/(BLOCKER|HIGH|SUGGESTION)\b\s*(?:\[\s*`?([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)`?\s*\])?/i;
const BARE_SEVERITY = /\b(BLOCKER|HIGH|SUGGESTION)\b/;

// Logins that count as automated review. Substring match, case-insensitive.
export const REVIEW_BOTS = ['copilot', 'claude', 'codex', 'cursor', 'devin', 'jules', 'redline'];
export const isReviewBot = (login = '') =>
  REVIEW_BOTS.some((bot) => login.toLowerCase().includes(bot));

/**
 * Reads every rule out of the standards sources.
 * @returns {Map<string, {id, stack, severity, text, source, line}>}
 */
// A rule bullet wrapped over several lines is one sentence, not one line.
//
// This read the first line only, which quietly truncated ten of the catalogue's
// rules mid-clause — `core/hardcoded-secrets` ended at "including in test
// files," and `redline explain` printed exactly that. It also imposed a rule
// nobody could see: the first line of a bullet had to be a complete sentence,
// or the catalogue would publish half of one. Both are gone now.
//
// A continuation is an indented line that is not itself a bullet and not blank.
// The list item's own indentation ends it, as does a fence, a heading or the
// next rule — all of which are unindented and therefore already excluded.
const CONTINUATION = /^\s{2,}(?![-*+]\s)(?!\d+\.\s)\S/;

function continuation(lines, index, first) {
  const parts = [first];
  for (let n = index + 1; n < lines.length; n += 1) {
    const next = lines[n];
    if (next === undefined || !CONTINUATION.test(next)) break;
    parts.push(next.trim());
  }
  return parts.join(' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

export function loadRules(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'standards/manifest.json'), 'utf8'));
  const sources = [
    ['core', manifest.core.source],
    ...Object.entries(manifest.stacks).map(([id, s]) => [id, s.source]),
  ];

  const rules = new Map();
  for (const [stack, relPath] of sources) {
    const lines = readFileSync(join(root, relPath), 'utf8').split('\n');
    let severity = null;
    let inFence = false;

    lines.forEach((line, i) => {
      if (/^```/.test(line.trim())) inFence = !inFence;
      if (inFence) return;

      if (ANY_HEADING.test(line)) {
        const heading = RULE_HEADING.exec(line);
        if (!heading) {
          severity = null;
          return;
        }
        const word = heading[1].toUpperCase();
        // Core groups rules by topic, not severity; each section states its own default.
        severity = SEVERITIES.includes(word) ? word : /BLOCKER/i.test(line) ? 'BLOCKER' : 'HIGH';
        return;
      }
      if (!severity) return;

      const rule = RULE_LINE.exec(line);
      if (!rule) return;
      rules.set(rule[1], {
        id: rule[1],
        stack,
        severity,
        text: continuation(lines, i, rule[2]),
        source: relPath,
        line: i + 1,
      });
    });
  }
  return rules;
}

/**
 * Parses a review comment body into a finding.
 * @returns {{severity, ruleId: string|null, tagged: boolean, hasRuleId: boolean}}
 */
export function parseFinding(body = '') {
  const match = FINDING.exec(body);
  if (match) {
    return {
      severity: match[1].toUpperCase(),
      ruleId: match[2] ? match[2].toLowerCase() : null,
      tagged: true,
      hasRuleId: Boolean(match[2]),
    };
  }
  const bare = BARE_SEVERITY.exec(body);
  return {
    severity: (bare?.[1] ?? 'SUGGESTION').toUpperCase(),
    ruleId: null,
    tagged: false,
    hasRuleId: false,
  };
}

export const emptyBySeverity = () =>
  Object.fromEntries(SEVERITIES.map((s) => [s.toLowerCase(), 0]));
