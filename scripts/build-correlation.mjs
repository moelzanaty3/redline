#!/usr/bin/env node
// Research: does ignoring a finding cost anything?
//
// Redline can say a rule was ignored. It cannot say ignoring it mattered. Where a
// finding was left unresolved and the same file's repository later attracted a
// revert or a hotfix, that is evidence the rule earns its place — from git and
// merged-pull-request history alone, with no incident feed, which is what keeps it
// inside the roadmap's non-goals.
//
// The roadmap calls this the most speculative item on the list and says to cut it
// without regret if the signal is too weak. So the output is a verdict on the
// experiment as much as on any rule: below the sample threshold it reports that it
// cannot say, rather than a number. A correlation quoted without its sample size
// is how a plausible story becomes a policy nobody can unwind.
//
// Env: [DATA_DIR=data], [DAYS=180], [WINDOW_DAYS=30], [MIN_SAMPLE=10], [OUT=correlation.json]

import { writeFileSync } from 'node:fs';
import { loadRecords } from './lib/metrics.mjs';
import { correlate, MIN_SAMPLE } from './lib/correlate.mjs';

const {
  DATA_DIR = 'data',
  DAYS = '180',
  WINDOW_DAYS = '30',
  MIN_SAMPLE: MIN = String(MIN_SAMPLE),
  OUT = 'correlation.json',
} = process.env;

const since = new Date(Date.now() - Number(DAYS) * 86400000).toISOString();
const { records, problems } = loadRecords(DATA_DIR, since);
for (const problem of problems) console.warn(`  ${problem}`);

const result = correlate(records, {
  windowDays: Number(WINDOW_DAYS),
  minSample: Number(MIN),
});

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);

console.log(`Ignored-finding correlation — ${DAYS}-day history, ${result.windowDays}-day remediation window\n`);

if (!result.verdict.reportable) {
  console.log(`  NOT REPORTABLE. ${result.verdict.reason}`);
  if (result.rules.length > 0) {
    console.log('\n  What was seen, and withheld:');
    for (const rule of result.rules.slice(0, 10)) {
      console.log(`    ${rule.ruleId.padEnd(40)} ${rule.ignored} ignored — ${rule.reason}`);
    }
  }
  console.log(
    '\n  This is the honest output of a weak experiment, not a failure of it. The roadmap\n' +
      '  sequences this piece last and says to cut it without regret if the signal stays thin.'
  );
} else {
  console.log('  rule                                     ignored   followed by a revert/hotfix');
  for (const rule of result.rules.filter((r) => r.reportable)) {
    console.log(
      `  ${rule.ruleId.padEnd(40)} ${String(rule.ignored).padStart(7)}   ${(rule.rate * 100).toFixed(0)}%`
    );
  }
  if (result.verdict.rulesWithheld > 0) {
    console.log(`\n  ${result.verdict.rulesWithheld} rule(s) withheld: too few ignored findings to mean anything.`);
  }
  console.log(`\n  ${result.verdict.caveat}`);
}

if (result.unattributable > 0) {
  console.log(
    `\n  ${result.unattributable} ignored finding(s) sat on a revert or hotfix itself and were not attributed: ` +
      'a remediation\'s own findings say nothing about the change it remedied.'
  );
}
console.log(`\nWritten to ${OUT}.`);
