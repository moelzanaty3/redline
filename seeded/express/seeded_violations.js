// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();

// SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded database credential
const DB_URL = 'postgres://svc_billing:Wnt3r-Is-C0ming@db.internal:5432/billing';

// SEED 2 [BLOCKER] (express/cors-wildcard-with-credentials) every origin on the internet gets authenticated access
app.use(cors({ origin: '*', credentials: true }));

// SEED 3 [BLOCKER] (express/unbounded-body-limit) no ceiling on the request body
app.use(express.json({ limit: Infinity }));

// SEED 4 [BLOCKER] (express/async-handler-unhandled-rejection) a rejection nothing catches — the request hangs on Express 4
app.get('/orders/:id', async (req, res) => {
  const order = await lookupOrder(req.params.id);
  res.json(order);
});

// SEED 5 [BLOCKER] (express/route-missing-auth) a destructive route with no guard, where its siblings have one
app.delete('/orders/:id', async (req, res, next) => {
  try {
    // SEED 6 [BLOCKER] (core/query-string-concatenation) SQL built by concatenation with a path parameter
    await db.query("DELETE FROM orders WHERE id = '" + req.params.id + "'");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.post('/reports', requireAuth, (req, res, next) => {
  // SEED 7 [BLOCKER] (express/unvalidated-request-input) body fields consumed with no schema check
  const { name, range } = req.body;
  // SEED 8 [BLOCKER] (javascript/shell-injection) an interpolated string handed to a shell
  exec(`/usr/bin/report --name ${name} --range ${range}`, (err, out) => {
    if (err) return next(err);
    res.send(out);
  });
});

app.get('/files', requireAuth, (req, res) => {
  // SEED 9 [BLOCKER] (express/user-path-to-filesystem) traversal — the path is never resolved against a root
  res.sendFile('/srv/reports/' + req.query.name);
});

app.get('/health', (req, res) => {
  // SEED 10 [HIGH] (express/sync-work-in-handler) a synchronous read blocking the event loop for every connection
  const status = fs.readFileSync('/srv/status.json', 'utf8');
  res.type('json').send(status);
});

// SEED 11 [HIGH] (express/route-order-shadowing) the literal route below is unreachable
app.get('/users/:id', requireAuth, (req, res) => res.json({ id: req.params.id }));
app.get('/users/new', requireAuth, (req, res) => res.json({ blank: true }));

// SEED 12 [HIGH] (express/missing-rate-limit) a credential endpoint with no limiter in front
app.post('/login', async (req, res, next) => {
  try {
    const user = await authenticate(req.body.email, req.body.password);
    // SEED 13 [BLOCKER] (core/customer-data-in-logs) the caller's email address in a log line
    console.log('login for', req.body.email);
    res.json({ token: user.token });
  } catch (err) {
    next(err);
  }
});

// SEED 14 [BLOCKER] (express/error-detail-in-response) the stack trace is handed to the client
app.use((err, req, res, _next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

// SEED 15 [HIGH] (express/outbound-call-no-timeout) no timeout — one slow dependency exhausts the pool
async function lookupOrder(id) {
  const res = await fetch(`https://api.internal/orders/${id}`);
  return res.json();
}

// SEED 16 [HIGH] (express/config-scattered-process-env) config read ad hoc rather than through one validated module
const PORT = process.env.PORT || 3000;
app.listen(PORT);

function requireAuth(req, res, next) {
  next();
}

async function authenticate(email, password) {
  return { token: 'x' };
}

const db = { query: async () => {} };
