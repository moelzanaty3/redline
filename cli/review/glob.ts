// The subset of glob syntax the standards actually use, matched without a
// dependency.
//
// `scripts/validate.mjs` already refuses a glob this cannot express: negation,
// brace expansion and commas are rejected at build time because Copilot's
// `applyTo` cannot express them either. So the grammar here is exactly `**`, `*`
// and `?`, and anything else in a manifest is a build failure rather than a
// silent mismatch at review time.
export function minimatch(path: string, glob: string): boolean {
  const pattern = glob
    .split('')
    .reduce<{ out: string; i: number }>(
      (acc, _c, i, chars) => {
        if (i < acc.i) return acc;
        const rest = chars.slice(i).join('');
        if (rest.startsWith('**/')) return { out: `${acc.out}(?:.*/)?`, i: i + 3 };
        if (rest.startsWith('**')) return { out: `${acc.out}.*`, i: i + 2 };
        const c = chars[i]!;
        if (c === '*') return { out: `${acc.out}[^/]*`, i: i + 1 };
        if (c === '?') return { out: `${acc.out}[^/]`, i: i + 1 };
        return { out: acc.out + c.replace(/[.+^${}()|[\]\\]/g, '\\$&'), i: i + 1 };
      },
      { out: '', i: 0 }
    ).out;

  return new RegExp(`^${pattern}$`).test(path);
}
