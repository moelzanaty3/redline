// Reads the structured exemption block out of a pull request body, for telemetry.
//
// Deliberately a mirror of cli/exempt/parse.ts rather than an import: the
// collector is plain .mjs running in the metrics repo with no build step, and it
// must not depend on dist/. The two are kept honest by scripts/validate.mjs,
// which fails the build if the heading or the field names diverge — the failure
// mode this guards against is the gate accepting a block the audit cannot read,
// so an exemption is enforced and then never reported.

export const EXEMPTION_HEADING = '## Redline exemption';

const field = (block, name) => {
  const match = new RegExp(`^\\s*[-*]?\\s*${name}\\s*:\\s*(.+)$`, 'im').exec(block);
  return match?.[1]?.trim() ?? null;
};

/**
 * @returns {{reason: string, until: string, scope: string[]} | null}
 */
export function readExemption(body) {
  if (!body) return null;
  const start = body.toLowerCase().indexOf(EXEMPTION_HEADING.toLowerCase());
  if (start === -1) return null;

  const rest = body.slice(start + EXEMPTION_HEADING.length);
  const next = /^#{1,2}\s/m.exec(rest);
  const block = next ? rest.slice(0, next.index) : rest;

  const reason = field(block, 'reason');
  const until = field(block, 'until');
  if (!reason || !until) return null;

  const scopeField = field(block, 'scope');
  return {
    reason,
    until,
    scope: scopeField
      ? scopeField.split(',').map((s) => s.trim()).filter(Boolean)
      : ['*'],
  };
}

/**
 * Standing exemptions: those still in force, grouped by scope, most-used first.
 * A team routing around the gate shows up here as the same scope recurring
 * across pull requests — which is the signal the roadmap's guardrail wants, and
 * one a per-pull-request view can never show.
 */
export function standingExemptions(records, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const byScope = new Map();

  for (const record of records) {
    const exemption = record.exemption;
    if (!exemption) continue;
    // An expired exemption is history, not a standing one. Counting it would
    // make a resolved problem look permanent.
    if (exemption.until < today) continue;
    for (const scope of exemption.scope) {
      const entry = byScope.get(scope) ?? { scope, count: 0, repos: new Set(), soonest: exemption.until };
      entry.count += 1;
      entry.repos.add(record.repo);
      if (exemption.until < entry.soonest) entry.soonest = exemption.until;
      byScope.set(scope, entry);
    }
  }

  return [...byScope.values()]
    .map((e) => ({ scope: e.scope, count: e.count, repos: e.repos.size, soonest: e.soonest }))
    .sort((a, b) => b.count - a.count || a.scope.localeCompare(b.scope));
}
