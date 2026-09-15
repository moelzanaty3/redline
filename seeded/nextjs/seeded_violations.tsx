// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded credential
const PAYMENTS_API_KEY = 'pmt-live-Xq7Rn2Kd9Wm4Tz6Hb3Vy';

// SEED 2 [BLOCKER] (nextjs/secret-in-public-env) a signing secret inlined into the client bundle at build time
const SIGNING_SECRET = process.env.NEXT_PUBLIC_SESSION_SIGNING_SECRET;

export async function deleteInvoice(id: string) {
  'use server';
  // SEED 3 [BLOCKER] (nextjs/server-action-missing-auth) a public POST endpoint that checks neither session nor ownership
  await db.invoice.delete({ where: { id } });
}

export async function exportLedger(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('unauthorised');
  // SEED 4 [BLOCKER] (core/query-string-concatenation) SQL built by concatenation with form input
  const rows = await db.$queryRawUnsafe(
    "SELECT * FROM ledger WHERE account = '" + String(formData.get('account')) + "'"
  );
  try {
    return await summarise(rows);
  } catch (err) {
    // SEED 5 [HIGH] (nextjs/action-returns-internal-error) the driver's message goes back to the browser
    return { error: (err as Error).message };
  }
}

export async function continueTo(searchParams: { next?: string }) {
  'use server';
  // SEED 6 [BLOCKER] (nextjs/unsanitised-redirect) open redirect from an unchecked query parameter
  redirect(searchParams.next ?? '/');
}

export default async function BillingPage() {
  const session = await auth();
  // SEED 7 [BLOCKER] (nextjs/user-data-in-cached-render) per-user data rendered into a statically cached segment
  const balance = await fetch('https://api.internal/balance', {
    next: { revalidate: 3600 },
  }).then((r) => r.json());

  // SEED 8 [HIGH] (nextjs/sequential-server-fetches) independent awaits serialised
  const invoices = await db.invoice.findMany();
  const methods = await db.paymentMethod.findMany();

  // SEED 9 [BLOCKER] (core/customer-data-in-logs) the account holder's email in a log line
  console.log('rendering billing for', session?.user.email);

  return (
    <main>
      {/* SEED 10 [BLOCKER] (core/html-injection-sink) unsanitised HTML from a server response */}
      <div dangerouslySetInnerHTML={{ __html: balance.noteHtml }} />
      {/* SEED 11 [HIGH] (nextjs/raw-img-element) raw img where next/image applies */}
      <img src={session?.user.avatarUrl} alt="" />
      <InvoiceList invoices={invoices} methods={methods} />
    </main>
  );
}

async function summarise(rows: unknown): Promise<unknown> {
  return rows;
}

function InvoiceList(props: { invoices: unknown[]; methods: unknown[] }) {
  // SEED 12 [BLOCKER] (react/key-is-index) index key on a list that reorders
  return (
    <ul>
      {props.invoices.map((invoice, i) => (
        <li key={i}>{String(invoice)}</li>
      ))}
    </ul>
  );
}

export async function RootLayoutShell({ children }: { children: React.ReactNode }) {
  // SEED 13 [HIGH] (nextjs/dynamic-api-in-layout) reading cookies in the root layout opts every route out of static rendering
  const theme = (await cookies()).get('theme')?.value;
  return <div data-theme={theme}>{children}</div>;
}

// SEED 14 [HIGH] (core/untracked-todo) placeholder with no ticket
// TODO: check entitlement before exposing the export action
