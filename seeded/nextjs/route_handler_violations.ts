// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { db } from '@/lib/db';

export async function POST(request: Request) {
  // SEED 1 [BLOCKER] (nextjs/route-handler-unvalidated-input) the payload reaches a write with no schema check
  const body = await request.json();
  await db.webhookEvent.create({ data: body });

  // SEED 2 [BLOCKER] (core/missing-auth-check) a write endpoint with no authorisation at all
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  // SEED 3 [BLOCKER] (core/unvalidated-boundary-input) a query parameter consumed as a number with no validation
  const limit = Number(url.searchParams.get('limit'));
  const rows = await db.event.findMany({ take: limit });

  // SEED 4 [HIGH] (nextjs/route-handler-no-cache-intent) no dynamic or cache directive — behaviour changes between versions
  return Response.json(rows);
}
