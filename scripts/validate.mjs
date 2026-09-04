#!/usr/bin/env node
// Bundle self-check. This repo enforces standards on hundreds of others; it has to hold
// itself to the same bar. Run by .github/workflows/ci.yml.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, RANK, loadRules, parseFinding, RESERVED_RULE_IDS, RULE_ID } from './lib/rules.mjs';
const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// --- manifest integrity -----------------------------------------------------
const manifest = JSON.parse(read('standards/manifest.json'));

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`manifest version "${manifest.version}" is not semver`);
if (!existsSync(join(ROOT, manifest.core.source))) fail(`core source missing: ${manifest.core.source}`);

for (const [id, stack] of Object.entries(manifest.stacks)) {
  if (!existsSync(join(ROOT, stack.source))) fail(`stack "${id}": source missing (${stack.source})`);
  if (!stack.globs?.length) fail(`stack "${id}": no globs`);
  for (const glob of stack.globs ?? []) {
    // Copilot's applyTo is a plain comma-separated glob list. Negation and brace
    // expansion are not portable across Copilot, Cursor and AGENTS.md consumers.
    if (glob.startsWith('!')) fail(`stack "${id}": negated glob "${glob}" is not supported by applyTo`);
    if (glob.includes('{')) fail(`stack "${id}": brace expansion "${glob}" is not portable — list globs separately`);
    if (glob.includes(',')) fail(`stack "${id}": glob "${glob}" contains a comma, which is the applyTo separator`);
  }
  for (const parent of stack.extends ?? []) {
    if (!manifest.stacks[parent]) fail(`stack "${id}": extends unknown stack "${parent}"`);
  }
}

for (const [name, stacks] of Object.entries(manifest.profiles)) {
  if (!stacks.length) fail(`profile "${name}" is empty`);
  for (const id of stacks) {
    if (!manifest.stacks[id]) fail(`profile "${name}": unknown stack "${id}"`);
  }
}

for (const [alias, target] of Object.entries(manifest.profileAliases)) {
  if (!manifest.profiles[target]) fail(`profile alias "${alias}" points at unknown profile "${target}"`);
  if (manifest.profiles[alias]) fail(`profile alias "${alias}" shadows a real profile`);
}

const unusedStacks = Object.keys(manifest.stacks).filter(
  (id) => !Object.values(manifest.profiles).some((p) => p.includes(id))
);
if (unusedStacks.length) warn(`stacks in no profile (will never be distributed): ${unusedStacks.join(', ')}`);

// --- the severity contract has to survive edits ------------------------------
const core = read(manifest.core.source);
for (const token of ['Redline/BLOCKER', 'Redline/HIGH', 'Redline/SUGGESTION']) {
  if (!core.includes(token)) fail(`core standard no longer documents "${token}" — telemetry parsing depends on it`);
}
if (!core.includes('What NOT to flag')) fail('core standard lost its "What NOT to flag" section');
if (!core.includes('[rule-id]')) fail('core standard no longer documents the rule-id part of the output contract');
for (const reserved of RESERVED_RULE_IDS) {
  if (!core.includes(reserved)) fail(`core standard must document the reserved id "${reserved}"`);
}

// The parser and the documented contract must not drift apart: parse the example the
// standard itself gives and confirm it yields what the pipeline expects.
const example = parseFinding('Redline/BLOCKER [core/query-string-concatenation]: example');
if (example.severity !== 'BLOCKER' || example.ruleId !== 'core/query-string-concatenation') {
  fail('the finding parser cannot parse the output contract documented in the core standard');
}

// --- rule catalogue -----------------------------------------------------------
const rules = loadRules();
if (rules.size < 200) fail(`only ${rules.size} rules carry an id — run: node scripts/assign-rule-ids.mjs`);

for (const [id, rule] of rules) {
  if (!RULE_ID.test(id)) fail(`rule id "${id}" is not <stack>/<slug> in kebab-case`);
  const [prefix] = id.split('/');
  if (prefix !== rule.stack) {
    fail(`rule "${id}" lives in ${rule.source} but is prefixed "${prefix}" instead of "${rule.stack}"`);
  }
  if (id.split('/')[1].length < 4) warn(`rule id "${id}" has a very short slug — it should read as a name`);
}

// Every normative bullet must carry an id, or telemetry silently loses it.
const idsAssigned = readdirSync(join(ROOT, 'standards/stacks'))
  .map((f) => `standards/stacks/${f}`)
  .concat(['standards/core.md']);
for (const relPath of idsAssigned) {
  const lines = read(relPath).split('\n');
  let inRules = false;
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) return;
    if (/^#{1,6}\s/.test(line)) {
      inRules = /^#{2,3}\s+(BLOCKER|HIGH|SUGGESTION|Security|Type safety|Error handling|General correctness|Scope discipline)\b/i.test(line);
      return;
    }
    if (!inRules || !/^-\s+/.test(line)) return;
    if (!/^-\s+`[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*`\s+—\s/.test(line)) {
      fail(`${relPath}:${i + 1} is a rule with no id — run: node scripts/assign-rule-ids.mjs`);
    }
  });
}

// --- rulesets ----------------------------------------------------------------
const REQUIRED_CHECK = 'redline-gate / gate';
for (const file of ['rulesets/redline-ruleset.json', 'rulesets/redline-org-ruleset.json']) {
  const ruleset = JSON.parse(read(file));
  const checks = ruleset.rules
    .filter((r) => r.type === 'required_status_checks')
    .flatMap((r) => r.parameters.required_status_checks.map((c) => c.context));
  if (!checks.includes(REQUIRED_CHECK)) {
    fail(`${file}: required status check is ${JSON.stringify(checks)}, expected "${REQUIRED_CHECK}"`);
  }
  const pr = ruleset.rules.find((r) => r.type === 'pull_request');
  if (!pr) fail(`${file}: no pull_request rule — human approval is not enforced`);
  else if ((pr.parameters.required_approving_review_count ?? 0) < 1) {
    fail(`${file}: required_approving_review_count must be at least 1 — automated review never approves`);
  }
  if (ruleset.bypass_actors?.length) warn(`${file}: has ${ruleset.bypass_actors.length} bypass actor(s)`);
}

// --- workflows ---------------------------------------------------------------
const callerTemplate = read('templates/redline.yml');
if (!/^\s{2}redline-gate:\s*$/m.test(callerTemplate)) {
  fail('templates/redline.yml: the caller job id must be `redline-gate` — the required check name derives from it');
}

const gate = read('workflows/redline-gate.yml');
if (!/^\s{2}gate:\s*$/m.test(gate)) {
  fail('workflows/redline-gate.yml: the aggregate job id must be `gate` — the required check name derives from it');
}
if (!gate.includes('pull-requests: write')) {
  fail('workflows/redline-gate.yml: dependency-review needs pull-requests: write to comment');
}

// --- the derived register -----------------------------------------------------
// The register is the estate's only source of truth for which repositories are
// onboarded. It was lost once already — scripts/setup-repo.sh was its only writer
// and sync-targets.txt went with it — and nothing failed, which is why the dashboard
// quietly stopped reporting coverage. These two assertions are what makes that
// silent again impossible.
if (!existsSync(join(ROOT, 'scripts/build-registry.mjs'))) {
  fail('scripts/build-registry.mjs is missing — the register cannot be derived, so redline sync has no targets and the dashboard loses its coverage figure');
}
if (!existsSync(join(ROOT, '.github/workflows/registry.yml'))) {
  fail('.github/workflows/registry.yml is missing — the register would silently stop refreshing and go stale without a single failing build');
}

// --- pull request template ----------------------------------------------------
// Two copies of one file, deliberately, kept identical by this check.
//
// templates/github/pull_request_template.md is the shipped source: package.json
// "files" packages templates/, and `redline init` installs it into an onboarded
// repository. It cannot live under .github/, because .github/ is excluded from the
// tarball on purpose — packaging it would push this repo's own CI workflows into
// every consumer.
//
// .github/pull_request_template.md is this repository's own copy. Redline is
// onboarded to Redline, and the `checklist` job in workflows/redline-gate.yml reads
// the pull request *body*, which GitHub pre-fills from that path. Without it every
// pull request opened here starts empty and fails this repo's own gate.
//
// Neither file carries an explanatory comment of its own: the shipped one is copied
// verbatim into every consumer's PR body, so a note about Redline's packaging would
// end up in other teams' pull requests. The explanation lives here, where the drift
// it guards against is caught.
const GATED_SECTION = '## Launch readiness';
const shippedTemplate = read('templates/github/pull_request_template.md');
const ownTemplate = existsSync(join(ROOT, '.github/pull_request_template.md'))
  ? read('.github/pull_request_template.md')
  : null;

if (ownTemplate === null) {
  fail('.github/pull_request_template.md is missing — every pull request here would start with an empty body and fail the checklist job in workflows/redline-gate.yml');
} else if (ownTemplate !== shippedTemplate) {
  fail('.github/pull_request_template.md has drifted from templates/github/pull_request_template.md — the shipped template is the source, copy it across');
}
if (!shippedTemplate.includes(GATED_SECTION)) {
  fail(`templates/github/pull_request_template.md: no "${GATED_SECTION}" section — workflows/redline-gate.yml fails the checklist job without it`);
}

const workflowFiles = [
  ...readdirSync(join(ROOT, 'workflows')).map((f) => `workflows/${f}`),
  ...(existsSync(join(ROOT, '.github/workflows'))
    ? readdirSync(join(ROOT, '.github/workflows')).map((f) => `.github/workflows/${f}`)
    : []),
  'templates/redline.yml',
].filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

for (const file of workflowFiles) {
  const body = read(file);
  for (const [, action] of body.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/gm)) {
    if (action.startsWith('<org>/') || action.startsWith('./')) continue;
    if (/@(main|master|latest)$/.test(action)) {
      // The org's own reusable workflow is a first-party ref and is allowed to float.
      if (action.includes('/.github/.github/workflows/')) continue;
      fail(`${file}: third-party action pinned to a mutable ref: ${action}`);
    }
    const [owner] = action.split('/');
    if (owner !== 'actions' && !/@[0-9a-f]{40}$/.test(action)) {
      warn(`${file}: ${action} is not pinned to a commit SHA`);
    }
  }
  // Expressions are not allowed in a step-level `uses:`; the workflow silently fails to parse.
  for (const [, action] of body.matchAll(/^\s+uses:\s*(\$\{\{[^\n]*)/gm)) {
    if (!/^\s*jobs:/m.test(action)) fail(`${file}: expression in a step \`uses:\` is not supported by Actions: ${action.trim()}`);
  }
}

// --- seeds --------------------------------------------------------------------
// Recall without precision is meaningless, so both corpora are load-bearing and both
// are enforced here rather than left to a reviewer to notice.
const SEED_MARKER = /SEED\s+(\d+)\s*\[(BLOCKER|HIGH|SUGGESTION)\]\s*(?:\(([^)]+)\))?/;
const MIN_BLOCKERS_PER_STACK = 4;
const seedDir = join(ROOT, 'seeded');
const seedDirs = readdirSync(seedDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const seedFiles = (dir) =>
  readdirSync(join(seedDir, dir)).filter((f) => !f.endsWith('.md'));

for (const id of Object.keys(manifest.stacks)) {
  if (!seedDirs.includes(id)) {
    fail(`seeded/${id}/ is missing — that stack's catch rate cannot be measured`);
    continue;
  }
  const files = seedFiles(id);
  if (!files.length) {
    fail(`seeded/${id}/ has no seed file`);
    continue;
  }
  let blockers = 0;
  let ids = new Set();
  for (const file of files) {
    for (const line of readFileSync(join(seedDir, id, file), 'utf8').split('\n')) {
      const m = SEED_MARKER.exec(line);
      if (!m) continue;
      const key = `${file}#${m[1]}`;
      if (ids.has(key)) fail(`seeded/${id}/${file}: duplicate SEED ${m[1]}`);
      ids.add(key);
      if (m[2] === 'BLOCKER') blockers += 1;

      // A seed without a rule id cannot verify attribution; one citing an unknown or
      // weaker rule silently makes the corpus disagree with the standard it tests.
      const cited = m[3];
      if (!cited) {
        fail(`seeded/${id}/${file}: SEED ${m[1]} does not cite a rule id`);
      } else if (!rules.has(cited) && !RESERVED_RULE_IDS.has(cited)) {
        fail(`seeded/${id}/${file}: SEED ${m[1]} cites unknown rule "${cited}"`);
      } else if (rules.has(cited) && RANK[m[2]] > RANK[rules.get(cited).severity]) {
        fail(
          `seeded/${id}/${file}: SEED ${m[1]} expects ${m[2]} but rule "${cited}" is ${rules.get(cited).severity} in the standard`
        );
      }
    }
  }
  if (blockers < MIN_BLOCKERS_PER_STACK) {
    fail(`seeded/${id}/ has ${blockers} BLOCKER seed(s), minimum is ${MIN_BLOCKERS_PER_STACK}`);
  }
}

if (!seedDirs.includes('clean')) {
  fail('seeded/clean is missing — recall is measured but precision is not');
} else {
  const clean = seedFiles('clean');
  if (!clean.length) fail('seeded/clean is empty — precision is unmeasured');
  for (const file of clean) {
    if (SEED_MARKER.test(readFileSync(join(seedDir, 'clean', file), 'utf8'))) {
      fail(`seeded/clean/${file} contains a SEED marker — the precision corpus must be defect-free`);
    }
  }
}

// --- report -------------------------------------------------------------------
warnings.forEach((w) => console.warn(`warn: ${w}`));
errors.forEach((e) => console.error(`FAIL: ${e}`));
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
