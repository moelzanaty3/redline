import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../', import.meta.url));

// Scoping decision: the constraint is "no file outside cli/platforms/ may
// reference api.github.com, dev.azure.com, gh, or az". A literal substring
// match on bare "gh" or "az" is unusable — "az" alone matches inside
// ordinary words ("lazy", "amazing", "phrase") and would make this test
// fail on files that never touch a host. What actually matters for "gh"
// and "az" is *invoking the CLI binary*, which in this codebase only ever
// happens via `execFileSync('gh', ...)` / `execFileSync('az', ...)` — see
// cli/platforms/github/client.ts and cli/platforms/azure/client.ts. So
// "gh"/"az" are enforced as that call shape, while the two host URLs are
// enforced as plain substrings since they have no false-positive risk.
const FORBIDDEN = [
  /api\.github\.com/,
  /dev\.azure\.com/,
  /\bexecFileSync\(\s*['"]gh['"]/,
  /\bexecFileSync\(\s*['"]az['"]/,
];

function sourceFilesOutsidePlatforms(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      if (entry === 'platforms' && dir === CLI) continue;
      sourceFilesOutsidePlatforms(abs, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      acc.push(abs);
    }
  }
  return acc;
}

test('no file outside cli/platforms/ knows which host it is talking to', () => {
  const offenders: string[] = [];
  for (const file of sourceFilesOutsidePlatforms(CLI)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(source)) offenders.push(`${file.replace(CLI, 'cli/')} matches ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], `host details leaked outside the adapter:\n${offenders.join('\n')}`);
});
