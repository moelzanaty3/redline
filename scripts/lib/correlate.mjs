// Does ignoring a finding cost anything?
//
// Redline can already say a rule was ignored. It cannot say ignoring it mattered.
// Where a finding was left unresolved and the same file later attracted a revert
// or a hotfix, that is *evidence* the rule earns its place — computable from
// merged-pull-request history alone, with no incident feed, which is what keeps
// it inside the non-goals.
//
// THIS IS RESEARCH, and the roadmap says to cut it without regret if the signal
// is too weak. So the design decision that matters here is not the correlation —
// it is the refusal. This module reports a rate only when the sample supports one,
// and returns `reportable: false` with the reason otherwise. A correlation quoted
// without its sample size is how a plausible story becomes a policy nobody can
// unwind, and the honest output of a weak experiment is "we cannot say".

const DAY = 86400000;

// Below this many ignored findings for a rule, no rate is reported for it. Ten is
// not a statistical threshold — it is the point below which a single coincidence
// moves the number by ten percentage points, which is enough to mislead.
export const MIN_SAMPLE = 10;

const REVERT = /^revert[\s:"']|^revert\b/i;
const HOTFIX = /\b(hotfix|hot-fix)\b/i;

const isRemediation = (record) => REVERT.test(record.title ?? '') || HOTFIX.test(record.title ?? '');

/**
 * Files a pull request's ignored findings touched, per rule.
 *
 * A record carries per-rule counts, not per-file findings, so file attribution is
 * only available where the collector recorded it. Where it is not, the pull
 * request contributes to the totals and not to the correlation — counted as
 * unattributable rather than quietly dropped, because a correlation computed over
 * whichever records happened to have the field is not a correlation.
 */
export function correlate(records, { windowDays = 30, minSample = MIN_SAMPLE } = {}) {
  const byRepo = new Map();
  for (const record of records ?? []) {
    if (!record.merged_at) continue;
    if (!byRepo.has(record.repo)) byRepo.set(record.repo, []);
    byRepo.get(record.repo).push(record);
  }
  for (const list of byRepo.values()) {
    list.sort((a, b) => Date.parse(a.merged_at) - Date.parse(b.merged_at));
  }

  const perRule = new Map();
  let unattributable = 0;

  for (const [, list] of byRepo) {
    for (let i = 0; i < list.length; i += 1) {
      const record = list[i];
      const at = Date.parse(record.merged_at);
      const followedByRemediation = list
        .slice(i + 1)
        .some((later) => {
          const gap = Date.parse(later.merged_at) - at;
          return gap >= 0 && gap <= windowDays * DAY && isRemediation(later);
        });

      for (const [ruleId, stats] of Object.entries(record.rules ?? {})) {
        const ignored = stats.stale ?? 0;
        if (ignored === 0) continue;
        // A remediation's own findings are not evidence about the change it
        // remedied. Counting them would let one incident inflate every rule that
        // happened to fire on the fix.
        if (isRemediation(record)) {
          unattributable += ignored;
          continue;
        }
        const entry = perRule.get(ruleId) ?? { ruleId, ignored: 0, followedByRemediation: 0, severity: stats.severity };
        entry.ignored += ignored;
        if (followedByRemediation) entry.followedByRemediation += ignored;
        perRule.set(ruleId, entry);
      }
    }
  }

  const rules = [...perRule.values()]
    .map((entry) => ({
      ...entry,
      // Reported ONLY where the sample supports it. Below the threshold the rate
      // exists arithmetically and means nothing, and publishing it anyway is how
      // a coincidence becomes a rule nobody can argue with.
      rate: entry.ignored >= minSample ? entry.followedByRemediation / entry.ignored : null,
      reportable: entry.ignored >= minSample,
      reason:
        entry.ignored >= minSample
          ? null
          : `${entry.ignored} ignored finding(s); at least ${minSample} are needed before a rate means anything`,
    }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.ignored - a.ignored);

  const reportable = rules.filter((r) => r.reportable);
  const totalIgnored = rules.reduce((n, r) => n + r.ignored, 0);

  return {
    windowDays,
    minSample,
    rules,
    unattributable,
    // The verdict on the experiment itself, not on any one rule. The roadmap
    // asks for the correlation "with its confidence, or the work abandoned and
    // said so" — this is that sentence, computed rather than written.
    verdict:
      reportable.length === 0
        ? {
            reportable: false,
            reason:
              totalIgnored === 0
                ? 'no findings were ignored in this window, so there is nothing to correlate — which is a good result, not a failed experiment'
                : `no rule reached ${minSample} ignored findings. The signal is too weak to report, and reporting it anyway would turn a coincidence into a policy nobody can unwind.`,
          }
        : {
            reportable: true,
            rulesReported: reportable.length,
            rulesWithheld: rules.length - reportable.length,
            caveat:
              'Correlation, not causation, and a weak one: a revert near an ignored finding is ' +
              'evidence the rule earns its place, never proof the finding caused the revert. ' +
              'Use it to prioritise which rules to examine, never to justify a rule on its own.',
          },
  };
}
