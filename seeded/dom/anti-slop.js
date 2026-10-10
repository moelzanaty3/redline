// DO NOT MERGE — Redline validation seed (anti-slop rules).
export class Widget {
  init() { window.addEventListener('resize', this.onResize.bind(this)); }
  // SEED 1 [HIGH] (dom/remove-listener-fresh-function) removes a function that was never added
  destroy() { window.removeEventListener('resize', this.onResize.bind(this)); }
}

// SEED 2 [HIGH] (dom/on-property-clobbers-handler) replaces the host page's error handler
window.onerror = (msg) => navigator.sendBeacon('/err', msg);

export async function search(q) {
  // SEED 3 [HIGH] (dom/fetch-get-with-body) GET with a body throws before sending
  return fetch('/api/search', { body: JSON.stringify({ q }) });
}

// SEED 4 [HIGH] (dom/unchecked-query-result) throws on every page without the form
document.getElementById('newsletter').addEventListener('submit', () => {});

// SEED 5 [HIGH] (dom/document-cookie-string) unencoded value can inject attributes
document.cookie = `lang=${new URLSearchParams(location.search).get('lang')}; path=/`;
