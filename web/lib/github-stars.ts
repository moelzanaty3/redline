import data from "./github-stars.json";

import type { Publisher } from "./skills-catalog";

/**
 * Star counts for every publisher repository, snapshotted by
 * `node scripts/fetch-stars.mjs`.
 *
 * The build does not call GitHub. A number that moves every hour would go stale
 * between deploys no matter what we did, so instead of hiding that we render the
 * date it was taken alongside it. Repos missing from the snapshot render no
 * count at all — an absent number beats an invented one.
 */
const STARS: Record<string, number | undefined> = data.stars;

export const STARS_FETCHED_AT = data.fetchedAt;

export function starsFor(publisher: Publisher): number | undefined {
  return STARS[`${publisher.owner}/${publisher.repo}`];
}

/** 31374 → "31.4k". GitHub itself keeps a decimal at five digits; dropping it
    would turn 31,374 and 31,999 into the same number. */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/** "2026-09-11" → "11 Sep 2026", without dragging in a date library. */
export function formatSnapshotDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(m) - 1];
  if (!month) return iso;
  return `${Number(d)} ${month} ${y}`;
}
