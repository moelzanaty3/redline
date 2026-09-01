// DO NOT MERGE — Redline validation seed for the cross-cutting microservice rules.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.

type ChargeMessage = { messageId: string; accountId: string; amountMinor: number };

const db = {} as { charge(a: string, m: number): Promise<void>; wasApplied(id: string): Promise<boolean> };
const bus = {} as { publish(topic: string, payload: unknown): Promise<void> };

export class ChargeConsumer {
  // SEED 1 [BLOCKER] (microservices/non-idempotent-consumer) at-least-once consumer with no idempotency — a redelivery
  // double-charges the customer
  async onMessage(msg: ChargeMessage) {
    await db.charge(msg.accountId, msg.amountMinor);

    // SEED 2 [HIGH] (microservices/dual-write-no-outbox) DB write and publish in one logical step with no outbox —
    // a crash here leaves the ledger and the topic permanently inconsistent
    await bus.publish('charges.applied', { accountId: msg.accountId });
  }
}

export async function callPricing(accountId: string) {
  // SEED 3 [BLOCKER] (microservices/missing-timeout) outbound call with no timeout — the default is infinite
  const res = await fetch(`https://pricing.internal/quote/${accountId}`);

  // SEED 4 [BLOCKER] (microservices/swallowed-errors) non-2xx treated as success
  if (!res.ok) {
    console.error('pricing failed');
  }
  return res.json();
}

// SEED 5 [BLOCKER] (microservices/unversioned-breaking-change) breaking change to a published contract with no version bump:
// `msisdn` was returned by v1 consumers and is now removed and retyped
export type QuoteResponseV1 = {
  accountId: string;
  amount: number; // was `amountMinor: string`
};

export async function retry(fn: () => Promise<void>) {
  // SEED 6 [HIGH] (microservices/retry-without-backoff) retries with no backoff or jitter — turns a blip into a thundering herd
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch {
      continue;
    }
  }
}

// SEED 7 [BLOCKER] (microservices/pii-in-telemetry) PII in a metric label — unbounded cardinality and a data-exposure leak
export function recordCharge(metrics: { inc(name: string, labels: object): void }, msisdn: string) {
  metrics.inc('charges_total', { msisdn });
}

// SEED 8 [HIGH] (microservices/readiness-liveness-conflated) readiness that always reports healthy — traffic keeps arriving while
// the dependency is down
export function ready() {
  return { status: 'ok' };
}

// SEED 9 [HIGH] (microservices/unbounded-work) unbounded batch accepted from external input
export async function bulk(ids: string[]) {
  return Promise.all(ids.map((id) => callPricing(id)));
}
