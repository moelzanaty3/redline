#!/usr/bin/env node
// Measures what the skills render target actually saves, per profile.
//
// The roadmap makes this piece conditional on the measurement: it is a cost
// optimisation, it is rated the highest-exposure item in the plan, and it dies if
// the reduction is marginal. So the number is produced by a script anyone can
// re-run rather than asserted once in a changelog.
//
// What is compared:
//   composed  — AGENTS.md, which a Claude session loads in full every turn for the
//               life of the session, whatever file is being edited
//   per-stack — the core skill plus the ONE stack whose files are in play, which
//               is what a skills-rendered repository loads instead
//
// Env: [ROOT=.], [OUT] (write JSON here as well as printing)

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../dist/render/standards.js';

const { ROOT = process.cwd(), OUT } = process.env;

// A scratch root whose manifest has skills enabled, so the measurement does not
// depend on whether the org has switched it on yet.
const root = mkdtempSync(join(tmpdir(), 'redline-measure-'));
cpSync(join(ROOT, 'standards'), join(root, 'standards'), { recursive: true });
const manifestPath = join(root, 'standards/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.vendors.skills.enabled = true;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const rows = [];
for (const profile of Object.keys(manifest.profiles)) {
  const skillsOut = mkdtempSync(join(tmpdir(), 'redline-skills-'));
  render({ root, profile, out: skillsOut, vendors: ['skills'] });
  const dir = join(skillsOut, '.claude/skills');
  const size = (name) => readFileSync(join(dir, name, 'SKILL.md'), 'utf8').length;
  const names = readdirSync(dir);
  const core = size('redline-core');
  const stacks = names.filter((n) => n !== 'redline-core');
  // The mean stack, not the smallest: quoting the best case would be marketing.
  const perStack =
    core + (stacks.length ? Math.round(stacks.reduce((a, n) => a + size(n), 0) / stacks.length) : 0);

  const composedOut = mkdtempSync(join(tmpdir(), 'redline-composed-'));
  render({ root, profile, out: composedOut, vendors: ['claude', 'agents'] });
  const composed = readFileSync(join(composedOut, 'AGENTS.md'), 'utf8').length;

  rows.push({
    profile,
    stacks: stacks.length,
    composedBytes: composed,
    perStackBytes: perStack,
    reduction: 1 - perStack / composed,
  });

  rmSync(skillsOut, { recursive: true, force: true });
  rmSync(composedOut, { recursive: true, force: true });
}
rmSync(root, { recursive: true, force: true });

rows.sort((a, b) => b.reduction - a.reduction);

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log('profile           stacks   composed   per-stack   reduction');
for (const row of rows) {
  console.log(
    `${row.profile.padEnd(17)}${String(row.stacks).padStart(6)}   ${String(row.composedBytes).padStart(8)}   ${String(row.perStackBytes).padStart(9)}   ${pct(row.reduction).padStart(9)}`
  );
}

// The finding, stated rather than left for a reader to notice: a single-stack
// profile pays the skill frontmatter and gains nothing, because there is no
// second stack to avoid loading. Selecting skills there makes the repository
// worse, and no amount of rollout enthusiasm changes that.
const helped = rows.filter((r) => r.reduction > 0);
const hurt = rows.filter((r) => r.reduction <= 0);
console.log('');
console.log(`Helps ${helped.length} profile(s): ${pct(Math.min(...helped.map((r) => r.reduction)))} to ${pct(Math.max(...helped.map((r) => r.reduction)))}.`);
if (hurt.length > 0) {
  console.log(
    `Costs ${hurt.length} profile(s) — all single-stack (${hurt.map((r) => r.profile).join(', ')}): ` +
      'there is no second stack to avoid loading, so the frontmatter is pure overhead. Do not select skills there.'
  );
}

if (OUT) {
  writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
  console.log(`\nWritten to ${OUT}.`);
}
