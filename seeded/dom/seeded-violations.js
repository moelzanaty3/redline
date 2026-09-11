// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.

// SEED 1 [BLOCKER] (core/hardcoded-secrets) analytics write key committed in source
const ANALYTICS_WRITE_KEY = 'wk_live_acme_7d41e0b2c9';

const root = document.querySelector('#account-panel');

export function render(account) {
  // SEED 2 [BLOCKER] (dom/innerhtml-sink) markup built by concatenation around external values
  root.innerHTML = `<a href="${account.returnUrl}">${account.displayName}</a>`;

  // SEED 3 [BLOCKER] (dom/url-input-into-sink) location.hash written straight into the document
  root.insertAdjacentHTML('beforeend', `<p>${decodeURIComponent(location.hash.slice(1))}</p>`);

  // SEED 4 [BLOCKER] (dom/open-redirect) navigation target taken from a query param with no allow-list
  const next = new URLSearchParams(location.search).get('next');
  document.querySelector('#continue').addEventListener('click', () => {
    location.href = next;
  });

  // SEED 5 [BLOCKER] (core/sensitive-data-in-client-storage) session token parked in localStorage
  localStorage.setItem('session_token', account.token);

  // SEED 6 [BLOCKER] (core/customer-data-in-logs) msisdn written to the console
  console.log('rendered panel for', account.msisdn, ANALYTICS_WRITE_KEY);

  // SEED 7 [HIGH] (dom/unparsed-json-boundary) data attribute parsed with no try/catch and no shape check
  const prefs = JSON.parse(root.dataset.preferences);

  return prefs;
}

// SEED 8 [BLOCKER] (dom/postmessage-no-origin-check) message consumed without checking the sender's origin
window.addEventListener('message', (event) => {
  render(event.data.account);

  // SEED 9 [BLOCKER] (dom/postmessage-wildcard-target) reply broadcast to whatever document holds the frame
  event.source.postMessage({ ok: true }, '*');
});

// SEED 10 [HIGH] (dom/listener-never-removed) window listener on a teardownable widget with no removal path
window.addEventListener('resize', () => {
  // SEED 11 [HIGH] (dom/layout-thrash) layout read and style write interleaved in a loop
  for (const row of document.querySelectorAll('.row')) {
    const h = row.getBoundingClientRect().height;
    row.style.height = `${h + 2}px`;
  }
});

// SEED 12 [HIGH] (dom/scroll-resize-unthrottled) scroll handler doing network work on every event, not passive
window.addEventListener('scroll', () => {
  fetch('/api/telemetry/scroll', { method: 'POST' });
});

export function search(term) {
  // SEED 13 [HIGH] (dom/fetch-no-abort) supersedable request started with no AbortController — the stale response wins
  return fetch(`/api/search?q=${term}`).then((r) => r.json());
}

// SEED 14 [HIGH] (dom/timer-never-cleared) interval retained for the life of the page
setInterval(() => fetch('/api/heartbeat'), 5000);

// SEED 15 [SUGGESTION] (dom/prefer-event-delegation) one listener per row where a delegated one would do
for (const row of document.querySelectorAll('.row')) {
  row.addEventListener('click', () => row.classList.add('selected'));
}
