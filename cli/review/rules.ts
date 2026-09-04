import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from '../render/manifest.ts';

// The rule ids in scope, parsed from the same markdown the prompt carries.
//
// Parsed from the source rather than taken from a list, so the set the model is
// validated against is exactly the set it was shown. Two lists would drift, and
// the drift would appear as a model "inventing" a rule that was in the prompt all
// along — which is the kind of bug that gets blamed on the model for a year.
const RULE_ID = /^-\s+`([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)`/gm;

export function loadRuleIds(root: string, manifest: Manifest, stacks: string[]): Set<string> {
  const ids = new Set<string>();
  const sources = [manifest.core.source, ...stacks.map((id) => manifest.stacks[id]!.source)];
  for (const source of sources) {
    const body = readFileSync(join(root, source), 'utf8');
    for (const match of body.matchAll(RULE_ID)) ids.add(match[1]!);
  }
  // Reserved by the standard for a real problem no rule covers. It is in the
  // core markdown as prose rather than as a rule bullet, so the parse above does
  // not find it, and rejecting it would silence exactly the finding the standard
  // asks for when the catalogue has a gap.
  ids.add('core/uncatalogued');
  return ids;
}
