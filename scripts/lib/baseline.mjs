// Computes the Phase 0 baseline the roadmap's acceptance criteria name.
//
// The rule this module exists to enforce: an unavailable figure is `null` with a
// stated reason, never `0`. A baseline is the number every later phase is judged
// against, and a zero that actually means "nobody measured this" is worse than a
// gap — it reads as a finding, and it makes every later comparison look like
// progress that did not happen.

/** A measured figure, or an honest absence. */
export const measured = (value) => ({ value, available: true });
export const unavailable = (reason) => ({ value: null, available: false, reason });

const rate = (numerator, denominator) =>
  denominator > 0 ? measured(numerator / denominator) : unavailable('nothing to divide — no findings in the window');

/**
 * The baseline, from data already collected plus whatever the caller could read.
 *
 * @param {object} input
 * @param {object} input.aggregate      output of metrics.aggregate over the window
 * @param {number} input.windowDays     how many days the window covers
 * @param {object|null} input.registry  the derived register, or null if unreadable
 * @param {object[]|null} input.ownPullRequests  Redline's own PRs on the estate, or null
 * @param {object|null} input.sarifProducers     {repo: [tool]} or null if not surveyed
 * @param {object|null} input.spend              {total, currency, grain} or null
 */
export function buildBaseline(input) {
  const {
    aggregate: agg,
    windowDays,
    registry = null,
    ownPullRequests = null,
    sarifProducers = null,
    spend = null,
  } = input;

  const findings = agg.findings ?? 0;
  const resolved = agg.resolved ?? 0;
  const blocker = agg.blocker ?? 0;

  // The primary metric. Acted-on is resolved over fired — the same definition the
  // dashboard and the digest use, deliberately: three numbers called "acted-on
  // rate" that disagree is how a programme loses an argument it was winning.
  const actedOnRate = rate(resolved, findings);

  const coverage = registry
    ? measured(registry.entries?.length ?? 0)
    : unavailable('registry.json could not be read — run the Redline Registry workflow');

  const instrumented = agg.repos ?? 0;
  const onboarded = coverage.available ? coverage.value : null;

  const ownMergeRate =
    ownPullRequests === null
      ? unavailable('Redline\'s own pull requests were not surveyed — needs org read access')
      : ownPullRequests.length === 0
        ? unavailable('Redline has opened no pull requests on the estate yet')
        : measured(ownPullRequests.filter((pr) => pr.merged).length / ownPullRequests.length);

  const sarif =
    sarifProducers === null
      ? unavailable('no SARIF survey was run — open question 1 in the roadmap is unanswered')
      : measured(
          Object.entries(sarifProducers).reduce((acc, [, tools]) => {
            for (const tool of tools) acc[tool] = (acc[tool] ?? 0) + 1;
            return acc;
          }, {})
        );

  const tokenSpend =
    spend === null
      ? unavailable('AI vendor usage reporting was not read — open question 2 is unanswered')
      : measured(spend);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,

    // --- the primary metric and its guardrails, per roadmap §3 ---------------
    primary: { actedOnRate },
    guardrails: {
      coverage: {
        onboarded: coverage,
        instrumented: measured(instrumented),
        // Instrumented-against-onboarded, so partial coverage cannot read as
        // health. Absent rather than 1.0 when the register is unreadable.
        ratio:
          onboarded === null
            ? unavailable('onboarded count unavailable, so the ratio has no denominator')
            : onboarded === 0
              ? unavailable('no repositories are onboarded — the ratio has no meaning yet')
              : measured(instrumented / onboarded),
      },
      ownPullRequestMergeRate: ownMergeRate,
      falsePositivesOnCleanCorpus: unavailable(
        'read from data/seed-scores.jsonl by the canary — not derivable from merged-PR telemetry'
      ),
      standingExemptions: measured(agg.exempted ?? 0),
    },

    // --- the rest of Phase 0's acceptance list -------------------------------
    findings: {
      total: measured(findings),
      blocker: measured(blocker),
      perWeek: measured(windowDays > 0 ? (findings / windowDays) * 7 : 0),
      untagged: measured(agg.untagged ?? 0),
    },
    sarifProducers: sarif,
    tokenSpend,

    // The number D exists to produce. It needs both halves, and says which one
    // is missing rather than dividing by an assumption.
    costPerBlockerCaught:
      !tokenSpend.available
        ? unavailable(`spend unavailable: ${tokenSpend.reason}`)
        : blocker === 0
          ? unavailable('no BLOCKER findings in the window — nothing to divide by')
          : measured(tokenSpend.value.total / blocker),
  };
}

/** A readable summary. Every absent figure prints its reason, not a dash. */
export function formatBaseline(baseline) {
  const lines = [`Redline baseline — ${baseline.generatedAt} (${baseline.windowDays}-day window)`, ''];
  const show = (label, figure, format = (v) => String(v)) => {
    lines.push(
      figure.available
        ? `  ${label.padEnd(34)} ${format(figure.value)}`
        : `  ${label.padEnd(34)} not available — ${figure.reason}`
    );
  };
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  lines.push('PRIMARY');
  show('BLOCKER acted-on rate', baseline.primary.actedOnRate, pct);
  lines.push('', 'GUARDRAILS');
  show('repositories onboarded', baseline.guardrails.coverage.onboarded);
  show('repositories instrumented', baseline.guardrails.coverage.instrumented);
  show('coverage', baseline.guardrails.coverage.ratio, pct);
  show('merge rate on Redline\'s own PRs', baseline.guardrails.ownPullRequestMergeRate, pct);
  show('false positives (clean corpus)', baseline.guardrails.falsePositivesOnCleanCorpus);
  show('standing exemptions', baseline.guardrails.standingExemptions);
  lines.push('', 'VOLUME');
  show('findings in window', baseline.findings.total);
  show('BLOCKER findings', baseline.findings.blocker);
  show('findings per week', baseline.findings.perWeek, (v) => v.toFixed(1));
  show('untagged findings', baseline.findings.untagged);
  lines.push('', 'COST');
  show('SARIF producers in use', baseline.sarifProducers, (v) =>
    Object.entries(v).map(([tool, n]) => `${tool} (${n})`).join(', ') || 'none found'
  );
  show('AI spend', baseline.tokenSpend, (v) => `${v.total} ${v.currency} (${v.grain})`);
  show('cost per BLOCKER caught', baseline.costPerBlockerCaught, (v) => v.toFixed(2));

  return lines.join('\n');
}
