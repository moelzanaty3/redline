// AI spend, at whatever grain the vendor's own reporting actually offers.
//
// The roadmap's open question 2 asks whether spend is attributable per repository
// or only org-wide. The honest answer depends on the vendor and cannot be settled
// in code, so this module carries the grain WITH the number and every consumer
// reads it. The failure it prevents: an org-level figure divided by repository
// count, presented as per-repository cost. That number looks precise, is entirely
// invented, and is the one a stakeholder will act on.
//
// Redline cannot read a vendor's billing API for you. It takes the figure you
// have, records where it came from, and refuses to make it more precise than it is.

export const GRAINS = ['repo', 'org', 'unknown'];

/**
 * @param {{total: number, currency?: string, grain?: string, source?: string, period?: string}} input
 */
export function readSpend(input) {
  if (!input || typeof input.total !== 'number' || !Number.isFinite(input.total)) {
    return { available: false, reason: 'no AI spend figure was supplied — read it from the assistant vendor\'s usage reporting' };
  }
  if (input.total < 0) {
    return { available: false, reason: `spend cannot be negative (${input.total})` };
  }
  const grain = GRAINS.includes(input.grain) ? input.grain : 'unknown';
  return {
    available: true,
    total: input.total,
    currency: input.currency ?? 'USD',
    grain,
    source: input.source ?? 'supplied by the operator',
    period: input.period ?? null,
  };
}

/**
 * Cost per BLOCKER caught — the figure nobody else in the toolchain can compute.
 *
 * A cost-management tool knows spend and has no findings, so it cannot compute
 * value. A DORA tool has neither. Redline knows which findings were acted on, and
 * joining the two is the whole argument.
 *
 * It refuses in three cases rather than producing a misleading number:
 *   - no spend figure at all
 *   - no BLOCKERs in the window, which would divide by zero
 *   - a per-repo question asked of an org-level figure
 */
export function costPerBlocker(spend, blockersCaught, { scope = 'org' } = {}) {
  if (!spend?.available) {
    return { value: null, reason: spend?.reason ?? 'no spend figure' };
  }
  if (!Number.isFinite(blockersCaught) || blockersCaught <= 0) {
    return { value: null, reason: 'no BLOCKER findings were acted on in this window — nothing to divide by' };
  }
  if (scope === 'repo' && spend.grain !== 'repo') {
    return {
      value: null,
      reason:
        `spend is reported at ${spend.grain} grain, so it cannot be attributed per repository. ` +
        'Publish the org-level figure against org-level value instead of inventing a per-repo number.',
    };
  }
  return {
    value: spend.total / blockersCaught,
    currency: spend.currency,
    grain: spend.grain,
    blockersCaught,
  };
}
