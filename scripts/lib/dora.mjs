// DORA metrics from data the collector already pulls, and nothing else.
//
// Two of the four are derivable from merged pull requests alone. The other two
// are not, and this file says so rather than approximating them:
//
//   lead time for changes ....... first commit to merge, per pull request. Derived.
//   change failure rate ......... share of merges that attracted a revert or a
//                                 hotfix within a window. Derived, with its own
//                                 caveat below.
//   deployment frequency ........ needs the deployments API. Absent where a
//                                 repository does not use it — NOT assumed to be
//                                 "once per merge", which would silently report
//                                 trunk-based teams and quarterly-release teams
//                                 as identical.
//   MTTR ........................ needs an incident feed. Explicitly out of scope
//                                 in the roadmap, and not approximated here: a
//                                 wrong MTTR is the number most likely to be
//                                 quoted at a stakeholder who will act on it.
//
// The change-failure caveat, stated because the number will be quoted: a revert
// or a hotfix is evidence of a failed change, not proof, and a team that fixes
// forward without the word "hotfix" scores better than one that labels honestly.
// It is a floor on the true rate, and every consumer is told so.

const DAY = 86400000;

/** Lead time in hours, per pull request, from first commit to merge. */
export function leadTimes(records) {
  const hours = [];
  for (const record of records ?? []) {
    const merged = Date.parse(record.merged_at ?? '');
    const first = Date.parse(record.first_commit_at ?? '');
    if (Number.isNaN(merged) || Number.isNaN(first)) continue;
    if (merged < first) continue; // a rebase can move the commit date past the merge
    hours.push((merged - first) / 3600000);
  }
  return hours.sort((a, b) => a - b);
}

/** The median, which is what DORA reports — a mean is dragged by one stale branch. */
export function median(values) {
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

const REVERT = /^revert[\s:"']|^revert\b/i;
const HOTFIX = /\b(hotfix|hot-fix)\b/i;

/**
 * Change failure rate: the share of merged pull requests followed by a revert or
 * a hotfix touching the same repository within `windowDays`.
 *
 * Returns null rather than 0 when there is nothing to divide. Zero here would
 * read as "this estate never breaks anything", which is a claim no data supports.
 */
export function changeFailureRate(records, { windowDays = 7 } = {}) {
  const merged = (records ?? []).filter((r) => r.merged_at);
  if (merged.length === 0) return { rate: null, failures: 0, total: 0, reason: 'no merged pull requests in the window' };

  const byRepo = new Map();
  for (const record of merged) {
    if (!byRepo.has(record.repo)) byRepo.set(record.repo, []);
    byRepo.get(record.repo).push(record);
  }

  let failures = 0;
  for (const [, list] of byRepo) {
    const sorted = [...list].sort((a, b) => Date.parse(a.merged_at) - Date.parse(b.merged_at));
    for (let i = 0; i < sorted.length; i += 1) {
      const at = Date.parse(sorted[i].merged_at);
      // A pull request "failed" when a later one in the same repository, inside
      // the window, is a revert or a hotfix. The remediation itself is not
      // counted as a failure of its own, or every incident would score twice.
      const remedied = sorted.slice(i + 1).some((later) => {
        const gap = Date.parse(later.merged_at) - at;
        if (gap < 0 || gap > windowDays * DAY) return false;
        const title = later.title ?? '';
        return REVERT.test(title) || HOTFIX.test(title);
      });
      if (remedied && !REVERT.test(sorted[i].title ?? '') && !HOTFIX.test(sorted[i].title ?? '')) {
        failures += 1;
      }
    }
  }

  return {
    rate: failures / merged.length,
    failures,
    total: merged.length,
    // Carried with the number, not buried in a doc. It will be quoted.
    caveat:
      'A floor, not the true rate: a revert or hotfix is evidence of a failed change rather than proof, ' +
      'and a team that fixes forward without saying "hotfix" scores better than one that labels honestly.',
  };
}

/**
 * Deployment frequency, from deployment timestamps the caller supplies.
 *
 * Absent — not zero, and not "once per merge" — where a repository does not use
 * the deployments API. Assuming a merge is a deploy reports a trunk-based team
 * and a quarterly-release team as identical, which is the exact distinction the
 * metric exists to draw.
 */
export function deploymentFrequency(deployments, windowDays) {
  if (deployments === null || deployments === undefined) {
    return { perDay: null, reason: 'this repository does not use the deployments API — frequency is unknown, not zero' };
  }
  if (windowDays <= 0) return { perDay: null, reason: 'no window to divide by' };
  return { perDay: deployments.length / windowDays, count: deployments.length };
}

/** The DORA block, with every unavailable figure carrying its reason. */
export function dora(records, { windowDays = 90, deployments = null } = {}) {
  const times = leadTimes(records);
  const cfr = changeFailureRate(records, { windowDays: 7 });
  const freq = deploymentFrequency(deployments, windowDays);

  return {
    leadTimeHours: times.length
      ? { median: median(times), p90: times[Math.floor(times.length * 0.9)] ?? null, samples: times.length }
      : { median: null, p90: null, samples: 0, reason: 'no pull request in the window carries a first-commit timestamp' },
    changeFailureRate: cfr,
    deploymentFrequency: freq,
    // Named so a reader can see it was considered and refused, rather than
    // wondering whether it was forgotten.
    meanTimeToRestore: {
      value: null,
      reason: 'needs an incident feed Redline does not have and should not acquire — out of scope in the roadmap',
    },
  };
}
