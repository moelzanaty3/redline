// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
//
// This is a UNIVERSAL load function: it runs on the server and again in the browser.

// SEED 1 [BLOCKER] (core/hardcoded-secrets) database password committed in source
const DB_URL = 'postgres://redline:Sup3rSecret@db.internal.acme:5432/billing';

export async function load({ params, url, fetch: eventFetch }) {
  // SEED 2 [BLOCKER] (svelte/secret-in-universal-load) internal-only credential used in code that also runs in the browser
  const db = await connect(DB_URL);

  // SEED 3 [BLOCKER] (core/query-string-concatenation) route param concatenated into a sql string
  const account = await db.query(`select * from accounts where id = '${params.id}'`);

  // SEED 4 [HIGH] (svelte/global-fetch-in-load) global fetch in load — no cookie forwarding, no SSR reuse
  const orders = await fetch(`/api/accounts/${params.id}/orders`);

  // SEED 5 [HIGH] (svelte/load-waterfall) independent requests awaited in sequence
  const invoices = await eventFetch(`/api/accounts/${params.id}/invoices`);
  const offers = await eventFetch(`/api/accounts/${params.id}/offers`);

  // SEED 6 [HIGH] (svelte/error-swallowed-in-load) failure rendered as "no data" instead of an error
  let usage = [];
  try {
    usage = await (await eventFetch(`/api/usage?page=${url.searchParams.get('page')}`)).json();
  } catch {
    usage = [];
  }

  // SEED 7 [BLOCKER] (core/customer-data-in-logs) msisdn written to the log
  console.log('loaded account', account.msisdn);

  return {
    account,
    orders: await orders.json(),
    invoices: await invoices.json(),
    offers: await offers.json(),
    usage,
  };
}
