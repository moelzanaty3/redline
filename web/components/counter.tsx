/**
 * Renders a number. That is the whole job.
 *
 * This used to ease from 0 to `value` over a second on intersection, which meant
 * the stats band spent that second displaying numbers that were not true — and
 * rendered `0` into the server HTML, so a crawler and a JavaScript-disabled
 * reader saw zero rules, zero stack rule sets, zero coverage. For a product
 * whose claim is measurement you can trust, animating your own figures through
 * a second of falsehood is the one effect that costs more than it earns.
 *
 * Kept as a component (rather than inlining `{value}` at every call site) so the
 * `<Counter value={n} />` API stays stable for the pages already importing it,
 * and so there is one place to reintroduce a genuinely honest treatment later.
 */
export function Counter({ value }: { value: number }) {
  return <span>{value}</span>;
}
