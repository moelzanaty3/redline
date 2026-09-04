#!/usr/bin/env node
// Builds registry.json: the derived register of onboarded repositories.
//
// Runs in the Redline source repo on a schedule. The register is DERIVED — it is
// discovered from .redline.json across the org, never hand-edited, and never written
// by `redline init`. An entry exists exactly as long as the repository's own file
// does, so a repository that removes Redline leaves the register on its next run.
//
// Requires `npm run build` first: it imports the compiled CLI from dist/.
//
// Env: GH_TOKEN (read access to org repos), ORG, SOURCE (owner/name of this repo),
//      [OUT=registry.json]

import { writeFileSync } from 'node:fs';
import { createGitHubClient } from '../dist/platforms/github/client.js';
import { discoverGitHub } from '../dist/registry/discover.js';
import { serializeRegistry } from '../dist/registry/serialize.js';

const { GH_TOKEN, ORG, SOURCE, OUT = 'registry.json' } = process.env;
if (!GH_TOKEN || !ORG || !SOURCE) throw new Error('GH_TOKEN, ORG and SOURCE are required');

const client = createGitHubClient({ token: GH_TOKEN });
const { entries, problems } = await discoverGitHub(client, ORG);

for (const problem of problems) console.warn(`  ${problem}`);

// An empty register is indistinguishable from a token that lost access, and
// publishing it would erase the dashboard's coverage figure and every sync
// target at once. Refuse rather than overwrite.
if (entries.length === 0) {
  console.error(
    `No onboarded repositories discovered in ${ORG}. Refusing to write an empty register.`
  );
  process.exit(1);
}

writeFileSync(
  OUT,
  serializeRegistry({ generatedAt: new Date().toISOString(), source: SOURCE, entries })
);

console.log(`${OUT}: ${entries.length} onboarded repositories, ${problems.length} problem(s)`);
