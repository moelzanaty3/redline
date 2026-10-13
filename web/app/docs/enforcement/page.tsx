import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineCode } from "@/components/learn/interactive";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Enforcement ladder" };

const EVIDENCE_OUTPUT = `recorded.

rung         observe
seed recall  80%
acted on     72%
sample       34 pull request(s)
false pos.   0
recorded     <today> (0 day(s) ago) — dashboard, last 30 days; seed score of PR #4

not yet eligible for block-blocker:
  - seed BLOCKER recall is 80% and 100% is required — a reviewer that misses known defects must not be given a veto

what block-blocker asks for:
  sample size      >= 20 reviewed pull requests
  seed recall      >= 100%
  acted-on rate    >= 60%
  false positives  <= 0
  measured within  90 days`;

const REFUSAL_OUTPUT = `  ▲ enforcement stays at observe — cannot move to block-blocker:
  ▲ seed BLOCKER recall is 80% and 100% is required — a reviewer that misses
    known defects must not be given a veto`;

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Enforcement ladder"
      intro="A repository starts by measuring its findings, and moves up to blocking merges only when recorded evidence shows those findings are right."
      href="/docs/enforcement"
    >
      <h2>Why a ladder</h2>
      <p>
        Every reviewer, model or checker, is sometimes wrong. A finding on correct code is a{" "}
        <b>false positive</b>. When findings only report, a false positive costs a minute to read
        and dismiss. When findings block, it stops a correct change from merging. After a few of
        those, the team stops trusting the gate and works around it.
      </p>
      <p>
        Blocking everywhere on day one turns every false positive into a blocked merge. Never
        blocking means no repository is actually held to the standard. The ladder sits between the
        two: each repository moves to blocking when its own evidence says its findings are worth
        blocking on.
      </p>

      <h2>The rungs</h2>
      <p>
        A <b>rung</b> is a repository&apos;s enforcement level. It decides which findings turn the{" "}
        <Link href="/docs/gate">gate</Link> red.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>A failing process check</th>
              <th>Deterministic policy fails on</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>observe</code> (the default)
              </td>
              <td>shows red on its own line; the gate still passes, with a warning</td>
              <td>a BLOCKER</td>
            </tr>
            <tr>
              <td>
                <code>block-blocker</code>
              </td>
              <td>fails the gate</td>
              <td>a BLOCKER</td>
            </tr>
            <tr>
              <td>
                <code>block-high</code>
              </td>
              <td>fails the gate</td>
              <td>a BLOCKER or a HIGH</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <code>observe</code> is not &ldquo;off&rdquo;. Findings are still produced, commented and
        recorded; they just do not stop a merge. The rung is recorded in <code>.redline.json</code>{" "}
        and in the gate&apos;s caller workflow, and the{" "}
        <Link href="/docs/gate#local-agent">local-agent hook</Link> reads it the same way.
      </p>

      <h2>The rung is not the blocking switch</h2>
      <p>
        Two settings, easy to confuse. The rung decides whether the gate turns red.{" "}
        <RedlineCode args="init --blocking" /> decides whether a red gate stops the merge, by making{" "}
        <code>redline-gate / gate</code> a required check. Together:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Gate not required (default)</th>
              <th>
                Gate required (<code>--blocking</code>)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>observe</code>
              </td>
              <td>nothing stops a merge; red is a signal only</td>
              <td>only the security floor stops a merge</td>
            </tr>
            <tr>
              <td>
                <code>block-blocker</code> / <code>block-high</code>
              </td>
              <td>the gate goes red on a finding, and the merge button still works</td>
              <td>the security floor, or a failing process check with no exemption, stops a merge</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <Link href="/docs/learn/required-gate">Learn step 07</Link> turns on blocking.
      </p>

      <h2>The evidence</h2>
      <p>
        Moving up a rung needs recorded evidence that the reviewer is right. There are four
        figures:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Figure</th>
              <th>What it answers</th>
              <th>
                <code>block-blocker</code>
              </th>
              <th>
                <code>block-high</code>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Sample size</b>
              </td>
              <td>
                How many reviewed pull requests the figures come from. A perfect rate over three is a
                coincidence.
              </td>
              <td>at least 20</td>
              <td>at least 50</td>
            </tr>
            <tr>
              <td>
                <b>Acted-on rate</b>
              </td>
              <td>
                Do people agree with the findings? The share whose review thread was resolved. See{" "}
                <Link href="/docs/telemetry#acted-on">Telemetry</Link>.
              </td>
              <td>at least 60%</td>
              <td>at least 80%</td>
            </tr>
            <tr>
              <td>
                <b>Seed BLOCKER recall</b>
              </td>
              <td>
                Does the reviewer catch real defects? The share of BLOCKERs planted in the{" "}
                <Link href="/docs/seeds">seeded corpus</Link> that it found.
              </td>
              <td>100%</td>
              <td>100%</td>
            </tr>
            <tr>
              <td>
                <b>False positives</b>
              </td>
              <td>
                Does it stay quiet on correct code? Findings on the corpus&apos;s clean files.
              </td>
              <td>0</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <code>block-high</code> asks for more agreement because blocking on a HIGH means blocking on
        judgement calls. Recall and false positives are absolute at both rungs: a reviewer that
        misses known defects, or flags correct code, must not be given a veto.
      </p>

      <h3>Recording evidence</h3>
      <p>
        The figures come from the metrics plane, which sees review outcomes across the
        organisation over time; see <Link href="/docs/telemetry">Telemetry &amp; value</Link>. The
        CLI records them in <code>.redline.json</code>, with where they came from, so the record is
        reviewed in a pull request like any other change:
      </p>
      <RedlineTerminal
        commands={`{redline} evidence record --source "dashboard, last 30 days; seed score of PR #4" --sample-size 34 --acted-on-rate 0.72 --seed-recall 0.8 --false-positives 0`}
        output={EVIDENCE_OUTPUT}
      />
      <p>
        Rates are fractions from 0 to 1. <code>--source</code> is required: a figure with no source
        is an assertion, not evidence. <RedlineCode args="evidence" /> prints the same report at
        any time without recording anything.
      </p>

      <h2>Promotion</h2>
      <p>
        A repository promotes itself, with no approval from anyone, once its recorded evidence meets
        the bar:
      </p>
      <RedlineTerminal commands="{redline} init --rung block-blocker" output={REFUSAL_OUTPUT} />
      <ul>
        <li>
          <b>A refusal names what is missing</b>, as above, and the rest of <code>init</code> still
          runs.
        </li>
        <li>
          <b>One rung at a time.</b> <code>observe</code> cannot jump to <code>block-high</code>: the
          rung it would skip is where the evidence for the next one is gathered.
        </li>
        <li>
          <b>Evidence expires after 90 days.</b> Rules, reviewer and codebase have all moved since;
          record a fresh measurement.
        </li>
      </ul>
      <p>
        <Link href="/docs/learn/earn-a-rung">Learn step 09</Link> records real evidence, is refused,
        and tries a blocking rung on a practice branch.
      </p>

      <h2>Demotion</h2>
      <p>
        Moving down never needs evidence or approval. A team whose gate is misfiring at 3am must be
        able to step back straight away. A ladder that made that
        hard would get switched off entirely.
      </p>
      <RedlineTerminal commands="{redline} init --rung observe" />

      <h2>What the ladder does not govern</h2>
      <p>
        The security floor. Dependency review and the secret scan fail the gate at every rung,{" "}
        <code>observe</code> included, and no exemption waives them. The ladder decides how strictly
        a repository&apos;s own standards are enforced, never whether the organisation&apos;s
        security minimum applies. See <Link href="/docs/gate">The merge gate</Link>.
      </p>

      <h2>Reading it across the organisation</h2>
      <p>
        The dashboard&apos;s <b>Enforcing</b> tile shows the share of onboarded repositories on a
        blocking rung. That is the question the ladder exists to answer, and no single repository
        can show it.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/cli/evidence">
            <code>redline evidence</code>
          </Link>
          : every flag.
        </li>
        <li>
          <Link href="/docs/exemptions">Exemptions</Link>: waiving one failing check at a blocking
          rung.
        </li>
        <li>
          <Link href="/docs/telemetry">Telemetry &amp; value</Link>: where the figures come from.
        </li>
      </ul>
    </DocsPage>
  );
}
