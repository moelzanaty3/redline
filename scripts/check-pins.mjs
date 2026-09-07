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
  // The Azure gate. It was outside this list while it pinned nothing, and the
  // moment it pinned a container digest that omission would have made the pin
  // unverifiable — the exact rot this script exists to catch.
  'platforms/azure/gate-template.yml',
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

// The Azure gate runs its secret scan from a container rather than an action,
// so the pin is an image digest with the version in a trailing comment — the
// same shape as `uses: repo@sha # tag`, verified the same way. A digest that no
// longer matches the tag it claims means someone edited one and not the other,
// and the scan of every Azure pull request is then running an unreviewed image.
const IMAGE_PIN = /([\w.-]+\/[\w.-]+)@(sha256:[0-9a-f]{64})\s*#\s*(\S+)/g;
const imagePins = [];
for (const file of files) {
  const body = readFileSync(join(ROOT, file), 'utf8');
  for (const [, image, digest, tag] of body.matchAll(IMAGE_PIN)) {
    imagePins.push({ file, image, digest, tag });
  }
}

for (const pin of imagePins) {
  try {
    const res = await fetch(`https://hub.docker.com/v2/repositories/${pin.image}/tags/${pin.tag}`);
    if (!res.ok) throw new Error(`docker hub: ${res.status}`);
    const resolved = (await res.json()).digest;
    if (resolved !== pin.digest) {
      console.error(
        `FAIL ${pin.file}: ${pin.image}@${pin.digest} is commented as ${pin.tag}, but ${pin.tag} resolves to ${resolved}`
      );
      errors += 1;
      continue;
    }
    console.log(`ok   ${pin.image}:${pin.tag} → ${pin.digest.slice(7, 19)}`);
  } catch (err) {
    console.error(`FAIL ${pin.file}: could not verify ${pin.image}:${pin.tag} — ${err.message}`);
    errors += 1;
  }
}

// The gate also pins the CLI it shells out to, as `REDLINE_CLI_VERSION` rather
// than as a `uses:` SHA, so the loop above cannot see it. It is the pin that
// rots hardest: it is a plain literal in two places, nothing in the release
// wires it to a publish, and until someone edits it by hand a fix shipped in
// the CLI reaches no onboarded repository at all — the gate keeps running the
// version named here. A published version behind the latest is reported the
// same way a stale action tag is.
const CLI_PIN = /REDLINE_CLI_VERSION:\s*'([^']+)'/g;
const cliPins = [];
for (const file of files) {
  const body = readFileSync(join(ROOT, file), 'utf8');
  for (const [, version] of body.matchAll(CLI_PIN)) cliPins.push({ file, version });
}

if (cliPins.length) {
  const pinned = [...new Set(cliPins.map((p) => p.version))];
  if (pinned.length > 1) {
    console.error(
      `FAIL REDLINE_CLI_VERSION disagrees with itself: ${pinned.join(', ')} — every job in one gate must run the same CLI`
    );
    errors += 1;
  }
  try {
    const res = await fetch('https://registry.npmjs.org/redlinegate');
    if (!res.ok) throw new Error(`registry: ${res.status}`);
    const latest = (await res.json())['dist-tags']?.latest;
    for (const version of pinned) {
      if (latest && latest !== version) {
        console.warn(`     update available: redlinegate@${version} → ${latest}`);
        updates += 1;
      } else {
        console.log(`ok   redlinegate@${version} is the published latest`);
      }
    }
  } catch (err) {
    console.error(`FAIL could not check redlinegate against the registry — ${err.message}`);
    errors += 1;
  }
}

console.log(
  `\n${pins.length + cliPins.length + imagePins.length} pin(s), ${errors} error(s), ${updates} update(s) available`
);
process.exit(errors || (STRICT && updates) ? 1 : 0);
