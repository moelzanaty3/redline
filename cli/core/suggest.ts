// The nearest known name to something mistyped, or undefined when nothing is
// close enough to be the thing meant. Deliberately strict: a suggestion that is
// wrong costs the reader more than no suggestion, so `refactor` offers nothing
// rather than `remove`.
export function closest(input: string, candidates: Iterable<string>): string | undefined {
  const allowed = Math.max(1, Math.floor(input.length / 4));
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= allowed ? best : undefined;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
