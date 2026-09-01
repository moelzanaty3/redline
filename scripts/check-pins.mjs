#!/usr/bin/env node
// Verifies that every SHA-pinned third-party action still resolves to the tag its
// trailing comment claims, and reports when a newer release exists.
//
//   node scripts/check-pins.mjs            # verify pins, warn on updates available
//   node scripts/check-pins.mjs --strict   # also fail when an update is available
//
// A pin without verification rots: the comment says v3.97.1, the SHA says something
// else, and nobody notices. This is the only check in the bundle that needs network,
// so it runs as its own CI job and is allowed to be skipped offline.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const PINNED = /^\s*-?\s*uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})\s*#\s*(\S+)/gm;

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`rate limited on ${path} — set GH_TOKEN`);
  }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const files = [
  ...readdirSync(join(ROOT, 'workflows')).map((f) => `workflows/${f}`),
  ...(existsSync(join(ROOT, '.github/workflows'))
    ? readdirSync(join(ROOT, '.github/workflows')).map((f) => `.github/workflows/${f}`)
    : []),
  'templates/redline.yml',
].filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

const pins = [];
for (const file of files) {
  const body = readFileSync(join(ROOT, file), 'utf8');
  for (const [, repo, sha, tag] of body.matchAll(PINNED)) pins.push({ file, repo, sha, tag });
}

if (!pins.length) {
  console.log('no SHA-pinned third-party actions found');
  process.exit(0);
}

let errors = 0;
let updates = 0;

for (const pin of pins) {
  try {
    const ref = await api(`/repos/${pin.repo}/git/ref/tags/${pin.tag}`);
    // An annotated tag points at a tag object; dereference it to the commit.
    const resolved =
      ref.object.type === 'tag'
        ? (await api(`/repos/${pin.repo}/git/tags/${ref.object.sha}`)).object.sha
        : ref.object.sha;

    if (resolved !== pin.sha) {
      console.error(
        `FAIL ${pin.file}: ${pin.repo}@${pin.sha} is commented as ${pin.tag}, but ${pin.tag} resolves to ${resolved}`
      );
      errors += 1;
      continue;
    }
    console.log(`ok   ${pin.repo}@${pin.tag} → ${pin.sha.slice(0, 12)}`);

    const latest = await api(`/repos/${pin.repo}/releases/latest`).catch(() => null);
    if (latest?.tag_name && latest.tag_name !== pin.tag) {
      console.warn(`     update available: ${pin.tag} → ${latest.tag_name} (${latest.published_at?.slice(0, 10)})`);
      updates += 1;
    }
  } catch (err) {
    console.error(`FAIL ${pin.file}: could not verify ${pin.repo}@${pin.tag} — ${err.message}`);
    errors += 1;
  }
}

console.log(`\n${pins.length} pin(s), ${errors} error(s), ${updates} update(s) available`);
process.exit(errors || (STRICT && updates) ? 1 : 0);
