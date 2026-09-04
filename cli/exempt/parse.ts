// A structured exemption: who accepted a failing process check, why, and until when.
//
// The bare `redline-exempt` label recorded none of that. It downgraded process
// checks to warnings and left the estate unable to answer the two questions that
// matter about an exemption — is anyone still standing behind it, and was it ever
// meant to be permanent. An exemption nobody has to justify and nobody revisits
// is not an exemption, it is an opt-out.

export type ExemptionProblem =
  | 'no-block'
  | 'no-reason'
  | 'reason-too-short'
  | 'no-until'
  | 'until-unparseable'
  | 'until-past'
  | 'until-too-far';

export interface Exemption {
  reason: string;
  // ISO date. An exemption without an end is a permanent one nobody chose.
  until: string;
  // The rules or checks it covers. `*` means every soft-failing check, which is
  // what the bare label used to mean implicitly.
  scope: string[];
}

export interface ExemptionResult {
  exemption: Exemption | null;
  problems: { problem: ExemptionProblem; detail: string }[];
}

export const EXEMPTION_HEADING = '## Redline exemption';

// Ninety days. Long enough for real remediation work to be scheduled, short
// enough that "temporary" has to be renewed by someone who still believes it.
export const MAX_DAYS = 90;
export const MIN_REASON_LENGTH = 20;

const field = (block: string, name: string): string | null => {
  const match = new RegExp(`^\\s*[-*]?\\s*${name}\\s*:\\s*(.+)$`, 'im').exec(block);
  return match?.[1]?.trim() ?? null;
};

/**
 * Parse the exemption block out of a pull request body.
 *
 * `now` is injected rather than read from the clock so the expiry rules are
 * testable and so a gate run and a later audit of the same pull request can
 * reach the same verdict about the same text.
 */
export function parseExemption(body: string, now: Date): ExemptionResult {
  const problems: ExemptionResult['problems'] = [];
  const fail = (problem: ExemptionProblem, detail: string): ExemptionResult => {
    problems.push({ problem, detail });
    return { exemption: null, problems };
  };

  const start = body.toLowerCase().indexOf(EXEMPTION_HEADING.toLowerCase());
  if (start === -1) {
    return fail(
      'no-block',
      `the pull request has no "${EXEMPTION_HEADING}" section — a label alone no longer exempts anything`
    );
  }

  // Everything until the next heading of the same or higher level. A reason that
  // runs into the next section would otherwise swallow the rest of the body.
  const rest = body.slice(start + EXEMPTION_HEADING.length);
  const next = /^#{1,2}\s/m.exec(rest);
  const block = next ? rest.slice(0, next.index) : rest;

  const reason = field(block, 'reason');
  if (!reason) {
    return fail('no-reason', 'the exemption block has no `reason:` — say what is being accepted and why');
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return fail(
      'reason-too-short',
      `the reason is ${reason.length} characters; at least ${MIN_REASON_LENGTH} are required — "needed for release" tells a later reader nothing`
    );
  }

  const until = field(block, 'until');
  if (!until) {
    return fail('no-until', 'the exemption block has no `until:` — an exemption with no end is a permanent one nobody chose');
  }
  const parsed = new Date(`${until}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    return fail('until-unparseable', `\`until: ${until}\` is not a YYYY-MM-DD date`);
  }
  if (parsed.getTime() < now.getTime()) {
    return fail('until-past', `this exemption expired on ${until} — renew it deliberately or fix the finding`);
  }
  const days = (parsed.getTime() - now.getTime()) / 86400000;
  if (days > MAX_DAYS) {
    return fail(
      'until-too-far',
      `\`until: ${until}\` is ${Math.round(days)} days away; the maximum is ${MAX_DAYS} — a longer exemption is a standards change, not an exemption`
    );
  }

  const scopeField = field(block, 'scope');
  const scope = scopeField
    ? scopeField
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
    : ['*'];

  return { exemption: { reason, until, scope }, problems };
}

/** Whether an exemption covers a named check or rule id. */
export function covers(exemption: Exemption, check: string): boolean {
  return exemption.scope.includes('*') || exemption.scope.includes(check);
}
