import type { Metadata } from "next";
import Link from "next/link";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: earn a stricter rung" };

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <LearnPage
      slug="earn-a-rung"
      intro="Blocking a merge on a finding is a strong claim: that the rule is right, and the reviewer applies it correctly. Redline will not let a repository make that claim without evidence, and it refuses until the evidence is there."
      learn={[
        "The three rungs, and what each one blocks",
        "How to record evidence, and ask what the next rung needs",
        "Why Redline refuses a promotion, and why stepping down is always allowed",
      ]}
    >
      <h2>The ladder</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>A failing rule…</th>
              <th>To get here</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>observe</td>
              <td>is reported, and the gate stays green</td>
              <td>where every repository starts</td>
            </tr>
            <tr>
              <td>block-blocker</td>
              <td>stops the merge if it is a BLOCKER</td>
              <td>
                20 reviewed pull requests, 60% of findings acted on, every seeded BLOCKER caught,
                zero false positives on correct code
              </td>
            </tr>
            <tr>
              <td>block-high</td>
              <td>stops the merge if it is a BLOCKER or HIGH</td>
              <td>50 reviewed pull requests, 80% acted on, the same corpus scores</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Measurements older than 90 days don&apos;t count, and you climb one rung at a time. The
        security floor is off this ladder and blocks at every rung.
      </p>
      <Term word="Seeded corpus">
        <p>
          Code with known defects planted in it, beside correct code that looks similar. Scoring
          the reviewer against it answers two questions a handful of real pull requests cannot:
          does it catch every known BLOCKER, and does it stay quiet on code that is fine? See{" "}
          <Link href="/docs/seeds">Seeded corpus</Link>.
        </p>
      </Term>
      <Term word="Acted-on rate">
        <p>
          Of the findings the gate raised, the share someone fixed. A rule people keep ignoring is
          either wrong or badly explained, and blocking on it would only teach people to work
          around the gate.
        </p>
      </Term>

      <h2>Try to climb</h2>
      <Tabs
        label="Earning a rung"
        tabs={[
          {
            label: "1. Record evidence",
            content: (
              <>
                <p>
                  The demo&apos;s gate reviewed seven pull requests with code in them, raised four
                  findings, all on step 02&apos;s, and step 03 fixed every one. Record that, with
                  where it came from:
                </p>
                <Terminal
                  commands={`${rl("evidence record --sample-size 7 --acted-on-rate 1 \\")}
  --source "PRs #2-#6, #12, #14: the gate ran on each; all 4 findings on #2 were fixed in #3"`}
                />
                <p>
                  <code>--source</code> is required: a figure with no source is just a claim. The
                  record goes into <code>.redline.json</code> and is reviewed in the pull request like
                  any other change.
                </p>
              </>
            ),
          },
          {
            label: "2. Ask what is missing",
            content: (
              <Terminal
                commands={rl("evidence")}
                output={`rung         observe
seed recall  not measured
acted on     100%
sample       7 pull request(s)
false pos.   not measured

not yet eligible for block-blocker:
  - 20 reviewed pull requests are needed and 7 have been recorded — a perfect rate over a
    handful is a coincidence, not evidence
  - the seeded corpus has never been scored for this stack, so there is no evidence the
    reviewer catches known defects at all
  - the clean corpus has never been scored, so nothing shows the reviewer stays quiet on
    correct code`}
              />
            ),
          },
          {
            label: "3. Ask anyway",
            content: (
              <Terminal
                commands={rl("init --rung block-blocker --no-commit")}
                output={`  ▲ enforcement stays at observe — cannot move to block-blocker:
  ▲ 20 reviewed pull requests are needed and 7 have been recorded — a perfect
    rate over a handful is a coincidence, not evidence
  ▲ the seeded corpus has never been scored for this stack, so there is no
    evidence the reviewer catches known defects at all
  ▲ the clean corpus has never been scored, so nothing shows the reviewer stays
    quiet on correct code`}
              />
            ),
          },
        ]}
      />
      <p>
        That refusal is the right answer. Seven pull requests of a demo say nothing about whether
        these rules would wrongly block a real team&apos;s work. Once a repository does reach{" "}
        <code>block-blocker</code>, step 02&apos;s code could not merge, and step 08&apos;s exemption
        becomes the only way past a failing process check.
      </p>

      <h2>Going down is always allowed</h2>
      <Terminal commands={rl("init --rung observe")} />
      <p>
        A demotion needs no evidence. If a rung is blocking good work, step down first and
        investigate after. A gate people resent gets worked around, and then it protects nothing.
      </p>

      <Quiz
        question="A team's 30 pull requests show a 90% acted-on rate, but the seeded corpus has never been scored. Can it move to block-blocker?"
        options={[
          {
            text: "Yes: 30 pull requests and 90% are both above the bar",
            why: "Those two are met. But nothing yet shows the reviewer catches every known defect, or stays quiet on correct code.",
          },
          {
            text: "No: the corpus must be scored first",
            correct: true,
            why: "Every requirement must hold. Real pull requests show people agree with the findings; the corpus shows the reviewer misses nothing known and invents nothing.",
          },
          {
            text: "Yes, if an admin approves it",
            why: "No approval replaces the evidence. The refusal is in the command itself.",
          },
        ]}
      />
    </LearnPage>
  );
}
