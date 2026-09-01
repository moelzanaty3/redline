// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
'use strict';

const { exec } = require('child_process');

// SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded credential
const SLACK_WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXXsecretXXXX';

// SEED 2 [BLOCKER] (javascript/prototype-pollution) prototype pollution: recursive merge over external input
function merge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      target[key] = merge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// SEED 3 [BLOCKER] (javascript/shared-module-state-mutation) shared module-scope mutable state across requests
const cache = {};

async function handler(req, res) {
  // SEED 4 [BLOCKER] (javascript/unvalidated-boundary-input) JSON.parse of an external payload with no try/catch or size limit
  const body = JSON.parse(req.rawBody);
  merge(cache, body);

  // SEED 5 [BLOCKER] (javascript/shell-injection) shell command built by interpolating external input
  exec(`convert ${body.filename} -resize 100x100 out.png`, () => {});

  // SEED 6 [HIGH] (javascript/async-callback-ignored-promise) async callback in forEach — rejections are swallowed
  body.items.forEach(async (item) => {
    await persist(item);
  });

  // SEED 7 [BLOCKER] (javascript/floating-promises) floating promise
  notify(body.userId);

  // SEED 8 [HIGH] (javascript/unsafe-numeric-coercion) parseInt without a radix
  const page = parseInt(req.query.page);

  res.end(JSON.stringify({ page, webhook: SLACK_WEBHOOK }));
}

async function persist(item) {
  return item;
}
async function notify(userId) {
  await fetch(SLACK_WEBHOOK, { method: 'POST', body: String(userId) });
}

module.exports = { handler, merge };
