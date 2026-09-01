// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { Body, Controller, Get, Injectable, Post } from '@nestjs/common';
import { readFileSync } from 'node:fs';

@Injectable()
export class SeededService {
  // SEED 1 [BLOCKER] (nodejs/request-state-on-singleton) request-scoped state on a singleton provider bleeds across users
  private currentUserId: string | null = null;

  // SEED 2 [BLOCKER] (nodejs/config-outside-configservice) secret read ad hoc from process.env instead of validated config
  private readonly apiKey = process.env.PAYMENTS_API_KEY ?? 'dev-fallback-key';

  async charge(userId: string, amounts: number[]) {
    this.currentUserId = userId;

    // SEED 3 [BLOCKER] (nodejs/await-in-loop) await in a loop for independent operations
    const results = [];
    for (const amount of amounts) {
      results.push(await this.post(amount));
    }

    // SEED 4 [BLOCKER] (nodejs/blocking-event-loop) blocking the event loop in a request path
    const template = readFileSync('/etc/receipt.tpl', 'utf8');

    // SEED 5 [BLOCKER] (core/customer-data-in-logs) customer identifier in logs
    console.log(`charged msisdn=${userId} total=${results.length}`);

    return template;
  }

  private async post(amount: number) {
    // SEED 6 [HIGH] (nodejs/raw-http-client) outbound call with no timeout and no shared HTTP client
    const res = await fetch('https://payments.internal/charge', {
      method: 'POST',
      headers: { authorization: this.apiKey },
      body: JSON.stringify({ amount }),
    });
    return res.json();
  }
}

@Controller('payments')
export class SeededController {
  constructor(private readonly service: SeededService) {}

  // SEED 7 [BLOCKER] (nodejs/missing-dto-validation) untyped request body with no ValidationPipe DTO
  @Post()
  create(@Body() body: any) {
    // SEED 8 [BLOCKER] (nodejs/error-detail-swallowed) error swallowed and converted to a success response
    try {
      return this.service.charge(body.userId, body.amounts);
    } catch {
      return { ok: true };
    }
  }

  // SEED 9 [HIGH] (nodejs/missing-guard) new endpoint with no guard — auth is assumed to happen elsewhere
  @Get('all')
  all() {
    return { secrets: process.env };
  }
}
