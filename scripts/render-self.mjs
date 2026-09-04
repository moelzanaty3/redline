#!/usr/bin/env node
// Renders this repository's own standards artifacts. The estate-wide renderer lives
// in cli/render/standards.ts; this is the two-line shim CI calls.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../cli/render/standards.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const result = render({ root, profile: 'tooling', out: root, check });

if (result.stale.length) {
  console.error(`Rendered output is stale. Run: node scripts/render-self.mjs\n  ${result.stale.join('\n  ')}`);
  process.exit(1);
}
result.written.forEach((f) => console.log(`  write  ${f}`));
result.removed.forEach((f) => console.log(`  prune  ${f}`));
if (!result.written.length && !result.removed.length) console.log('  up to date');
