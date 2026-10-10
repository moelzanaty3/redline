// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.

interface Account {
  id: string;
  balance: number;
}

interface Handler {
  (request: Request): Promise<Response>;
}

declare const home: Handler;
declare const about: Handler;
declare function fetchJson(url: string): Promise<string>;

// SEED 1 [BLOCKER] (typescript/widen-then-assert) known value widened to unknown, then asserted back to a different type
export function toAccount(user: { id: string; name: string }): Account {
  const raw: unknown = user;
  return raw as Account;
}

// SEED 2 [BLOCKER] (core/unsafe-assertion) double assertion with no SAFETY justification
export function coerceAccount(payload: Record<string, string>): Account {
  return payload as unknown as Account;
}

// SEED 3 [BLOCKER] (core/escape-hatch-types) any where a concrete type works
export function total(accounts: any[]): number {
  return accounts.reduce((sum, account) => sum + account.balance, 0);
}

// SEED 4 [BLOCKER] (core/type-checker-suppression) type checker silenced with no explanation and no ticket
// @ts-ignore
export const fallback: Account = { id: 1 };

// SEED 5 [HIGH] (typescript/unknown-return) function exposes unknown to every caller
export async function loadAccount(id: string): Promise<unknown> {
  return JSON.parse(await fetchJson(`/accounts/${id}`));
}

// SEED 6 [HIGH] (typescript/unknown-type-alias) alias hides the top type
export type AccountPayload = unknown;

// SEED 7 [HIGH] (typescript/open-dictionary-value) open dictionary of unknown values
export const accountCache: Record<string, unknown> = {};

// SEED 8 [HIGH] (typescript/object-parameter) parameter typed object
export function describe(value: object): string {
  return String(value);
}

// SEED 9 [HIGH] (typescript/reflect-dynamic-access) Reflect.get bypasses typed property access
export function readField(account: Account, field: string): number {
  return Reflect.get(account, field);
}

// SEED 10 [HIGH] (typescript/known-value-widening) annotation makes routes.contact type-check while being undefined
export const routes: Record<string, Handler> = { home, about };

// SEED 11 [HIGH] (typescript/unknown-parameter) unknown parameter on a function that is not the boundary parser
export function formatBalance(balance: unknown): string {
  return (balance as number).toFixed(2);
}

// SEED 12 [SUGGESTION] (typescript/ad-hoc-typeof-narrowing) typeof narrowing in domain logic on a value that should be typed
export function label(account: Account | string): string {
  if (typeof account === 'string') return account;
  return account.id;
}

// SEED 13 [HIGH] (typescript/module-mocking) module mock replaces the import graph instead of injecting the dependency
declare const vi: { mock(path: string): void };
vi.mock('./account-store');

// SEED 14 [HIGH] (typescript/reduce-accumulator-copy) accumulator copied on every iteration — quadratic
export const byId = (accounts: Account[]): Record<string, Account> =>
  accounts.reduce((acc, account) => ({ ...acc, [account.id]: account }), {});

// SEED 15 [SUGGESTION] (typescript/filter-map-double-pass) filter then map makes two passes and an intermediate array
export const positiveIds = (accounts: Account[]): string[] =>
  accounts.filter((account) => account.balance > 0).map((account) => account.id);

// SEED 16 [SUGGESTION] (typescript/conditional-empty-spread) conditional property hidden behind an empty-object spread
export const withNote = (account: Account, note?: string) => ({ ...account, ...(note ? { note } : {}) });
