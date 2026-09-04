import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from '../render/manifest.ts';
import { SCHEMA_DESCRIPTION } from './schema.ts';
import type { Scope } from './scope.ts';

// The bounded prompt: the applicable rules, the diff, and the output schema.
//
// Bounded is the product. Anyone can ask an assistant to review a diff; what
// this adds is that the model sees the rules that apply to these files and not
// the other nine stacks, and that its output is parsed rather than pasted.

export interface PromptOptions {
  root: string;
  manifest: Manifest;
  scope: Scope;
  diff: string;
}

const read = (root: string, relPath: string): string =>
  readFileSync(join(root, relPath), 'utf8').trimEnd();

export function buildPrompt(opts: PromptOptions): string {
  const { manifest, scope } = opts;
  const sections = [
    read(opts.root, manifest.core.source),
    ...scope.stacks.map((id) => read(opts.root, manifest.stacks[id]!.source)),
  ];

  return [
    'You are reviewing a change against this organisation\'s engineering standard.',
    '',
    `Profile: ${scope.profile}. Applicable stacks: ${scope.stacks.join(', ') || 'core only'}.`,
    'These are the ONLY rules in scope. Do not apply a rule that is not written below,',
    'and do not cite a rule id that does not appear below — a finding you cannot point at',
    'a rule for is not a finding.',
    '',
    '--- RULES ---',
    '',
    ...sections,
    '',
    '--- THE CHANGE ---',
    '',
    '```diff',
    opts.diff,
    '```',
    '',
    '--- WHAT TO RETURN ---',
    '',
    'Return JSON and nothing else, against this schema:',
    '',
    SCHEMA_DESCRIPTION,
    '',
    'Rules for what you return:',
    '- Only lines this change ADDED. An existing pattern the change merely touches is',
    '  explicitly out of scope — see "What NOT to flag" in the rules above.',
    '- One finding per problem. If the same rule is broken in several places, report the',
    '  first and say "and N similar" in the problem.',
    '- If you cannot describe the input that breaks it, it is not a finding. Return fewer.',
    '- If nothing qualifies, return {"findings": []}. An empty review is a valid review and',
    '  is a better answer than a manufactured one.',
  ].join('\n');
}
