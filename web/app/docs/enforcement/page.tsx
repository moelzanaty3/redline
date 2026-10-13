import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineCode } from "@/components/learn/interactive";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Enforcement ladder" };

const RUNGS = [
  {
    rung: "observe",
    blocks: "No finding. The security floor still blocks.",
    needs: "Nothing: this is where a repository starts.",
    detail:
      "Findings are produced, commented and recorded, and a failing rule shows as a red check in the merge box. Observe is not 'off'; it is 'measured and not yet enforced'.",
  },
  {
    rung: "block-blocker",
    blocks: "A BLOCKER finding.",
    needs: "20 pull requests, 60% acted on, 100% seed BLOCKER recall, zero false positives on the clean corpus.",
    detail:
      "The first rung that can stop a merge, and the first that needs proof the reviewer both catches real defects and stays quiet on correct code.",
  },
  {
    rung: "block-high",
    blocks: "A BLOCKER or a HIGH.",
    needs: "50 pull requests, 80% acted on, 100% seed BLOCKER recall, zero false positives.",
    detail:
      "Blocking on HIGH means blocking on judgement calls, so the bar for people actually agreeing with the findings is higher. The policy check fails on HIGH as well as BLOCKER here.",
  },
];

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
      intro="A gate that blocks on a wrong finding stops a correct change, and after a few of those the team stops trusting it and works around it. So a repository starts by only measuring, and climbs to blocking on recorded evidence that its findings are right."
      href="/docs/enforcement"
    >
      <h2>Why a ladder</h2>
      <p>
        Every reviewer, model or checker, is sometimes wrong. A finding on correct code (a{" "}
        <b>false positive</b>) costs a minute to read and dismiss when it only reports. When it
        blocks, it costs a merge. Switching blocking on everywhere at once makes every false
        positive a blocked merge; leaving everything advisory means nobody can say any repository
        is held to the standard. The ladder is the middle: each repository moves to blocking when
        its own evidence says the findings are worth blocking on.
      </p>
      <p>
        A <b>rung</b> decides which review findings turn the{" "}
        <Link href="/docs/gate">gate</Link> red. It is set per repository, with{" "}
        <RedlineCode args="init --rung <name>" />, and recorded in <code>.redline.json</code> and
        the gate&apos;s caller workflow.
      </p>

      <h2>The rungs</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>Blocks on</th>
              <th>Evidence to reach it</th>
            </tr>
          </thead>
          <tbody>
            {RUNGS.map((r) => (
              <tr key={r.rung}>
                <td>
                  <code>{r.rung}</code>
                </td>
                <td>{r.blocks}</td>
                <td>{r.needs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        {RUNGS.map((r) => (
          <li key={r.rung}>
            <code>{r.rung}</code>: {r.detail}
          </li>
        ))}
      </ul>

      <h2>Promotion is evidence-gated self-service</h2>
      <p>
        A repository promotes itself, with no approval from anyone, when its recorded evidence
        meets the bar. It cannot promote on assertion. The evidence has four parts:
      </p>
      <ul>
        <li>
          <b>Sample size:</b> how many reviewed pull requests the rate is computed from. A perfect
          rate over a handful is a coincidence.
        </li>
        <li>
          <b>Acted-on rate:</b> the share of findings someone fixed. Blocking on findings people
          already ignore turns the gate into an obstacle. See{" "}
          <Link href="/docs/telemetry#acted-on">Telemetry</Link>.
        </li>
        <li>
          <b>Seed BLOCKER recall</b> and <b>false positives</b>: scored against the{" "}
          <Link href="/docs/seeds">seeded corpus</Link>, code with known defects planted in it
          beside correct code that must draw no finding.
        </li>
      </ul>
      <p>
        The figures come from the metrics plane, which sees the estate over a window. The CLI
        records them with where they came from, in <code>.redline.json</code>, so the record is
        reviewed like any other change:
      </p>
      <RedlineTerminal
        commands={`{redline} evidence record --source "dashboard, last 30 days; seed score of PR #4" --sample-size 34 --acted-on-rate 0.72 --seed-recall 0.8 --false-positives 0`}
        output={EVIDENCE_OUTPUT}
      />
      <p>
        <code>--source</code> is required: a figure with no provenance is an assertion.{" "}
        <RedlineCode args="evidence" /> prints the same report at any time. Three more rules:
      </p>
      <ul>
        <li>
          <b>Evidence older than 90 days does not count.</b> Rules, reviewer and codebase have all
          moved since; re-measure.
        </li>
        <li>
          <b>One rung at a time.</b> <code>observe</code> cannot jump to <code>block-high</code>:
          the rung it would skip is where the evidence for the next one is gathered.
        </li>
        <li>
          <b>A refusal names what is missing</b> rather than just saying no, and the rest of{" "}
          <code>init</code> still runs:
        </li>
      </ul>
      <RedlineTerminal commands="{redline} init --rung block-blocker" output={REFUSAL_OUTPUT} />
      <p>
        <Link href="/docs/learn/earn-a-rung">Learn step 09</Link> records real evidence, is
        refused, and feels a blocking rung on a practice branch.
      </p>

      <h2>Demotion never needs evidence</h2>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>The safe direction never needs permission.</b> A repository whose gate is misfiring at
          3am must be able to step back without waiting for anyone, and a ladder that made that
          hard would be switched off entirely rather than stepped down.
        </p>
      </div>
      <RedlineTerminal commands="{redline} init --rung observe" />

      <h2>The rung is not the blocking switch</h2>
      <p>
        Two separate settings, easy to mix up. The rung decides what turns the gate red.{" "}
        <RedlineCode args="init --blocking" /> decides whether a red gate stops the merge, by
        making <code>redline-gate / gate</code> a required check. A required gate at{" "}
        <code>observe</code> stops only the security floor; a <code>block-blocker</code> gate that
        is not required turns red on a BLOCKER and still lets the merge through.{" "}
        <Link href="/docs/learn/required-gate">Learn step 07</Link> turns on blocking.
      </p>

      <h2>What the ladder does not govern</h2>
      <p>
        The security floor. Dependency review and the secret scan fail the gate at every rung,{" "}
        <code>observe</code> included; see <Link href="/docs/gate">The merge gate</Link>. The
        ladder decides how strictly a repository&apos;s own standards are enforced, never whether
        the organisation&apos;s security minimum applies.
      </p>

      <h2>Reading it across the estate</h2>
      <p>
        The dashboard&apos;s <b>Enforcing</b> tile reports how much of the estate is on a blocking
        rung rather than watching: the question the ladder exists to answer, and one no
        per-repository view can show. See <Link href="/docs/telemetry">Telemetry &amp; value</Link>.
      </p>
    </DocsPage>
  );
}
