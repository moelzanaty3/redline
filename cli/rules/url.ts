// The canonical address of a rule.
//
// Why a URL at all. The output contract already puts a permanent id on every
// finding — `Redline/HIGH [javascript/var-in-new-code]` — and that id is the
// most useful thing on the line and the least actionable. A developer reading
// it on a pull request has the exact name of the rule and no way to reach what
// it says short of leaving the review, finding the documentation and searching
// for it. A permanent id that resolves to a permanent URL costs one line and
// closes that gap everywhere a finding is printed at once.
//
// Why it is configured rather than hardcoded. An organisation running Redline
// internally wants its own copy of the standard on the other end of that link —
// its rules, its local additions, behind its own login. Baking a public host in
// would make the link useless to exactly the organisations this is built for,
// and there is no honest default: the base URL is empty until someone sets one,
// and an empty base prints no link rather than a broken one.

/**
 * Where a rule is documented, or null when this repository has not been told.
 *
 * Returns null rather than a placeholder for the same reason `verify` reports
 * `??` and never `ok`: a link that goes nowhere is worse than no link, because
 * the reader spends the click before they find out.
 */
export function ruleUrl(ruleId: string, base: string): string | null {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (trimmed === '') return null;
  // Only http(s). A finding is rendered into a pull request comment on someone
  // else's host, so the one thing this must never do is emit a scheme that
  // turns a comment into a link nobody vetted.
  if (!/^https?:\/\//i.test(trimmed)) return null;
  // Rule ids are `<stack>/<slug>`, both already URL-safe by the catalogue's own
  // validation, so the id maps onto the path as itself. `/r/` and not `/rules/`
  // because this string is pasted into review comments by the thousand.
  return `${trimmed}/r/${ruleId}`;
}

/**
 * The reference line that follows a finding, or '' when there is no base URL.
 *
 * One renderer, so the deterministic tier and the model review cannot drift
 * into two different shapes for the same fact.
 */
export function ruleReference(ruleId: string, base: string): string {
  const url = ruleUrl(ruleId, base);
  return url === null ? '' : `\n  → ${url}`;
}
