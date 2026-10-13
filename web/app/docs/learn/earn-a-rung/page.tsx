import type { Metadata } from "next";
import Link from "next/link";
import { Quiz, RedlineCode } from "@/components/learn/interactive";
import { File, LearnPage, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: earn a stricter rung" };

const BAD_LEGACY = `// @ts-ignore
export const legacyId: number = JSON.parse("1")`;

const GOOD_LEGACY = `export const legacyId = Number.parseInt("1", 10)`;

export default function Page() {
  return (
    <LearnPage
      slug="earn-a-rung"
      intro="Your gate is required, and a pull request with a BLOCKER finding still merges. In this step you merge one yourself, clean it up, find out why the gate let it through, and see what it takes to make the gate stop the next one."
      learn={[
        "Why a BLOCKER finding can still merge today",
        "What a rung is, and why going up needs proof",
        "What a blocking rung feels like, on a practice branch",
      ]}
    >
      <h2>1. Make the mistake</h2>
      <p>
        Someone on your team needs a quick value and silences the type checker to get it. One line,
        an <code>@ts-ignore</code> with no reason:
      </p>
      <Terminal
        commands={`git checkout -b feat/legacy-id
cat > src/legacy.ts <<'EOF'
${BAD_LEGACY}
EOF
git add src/legacy.ts
git commit -m "feat: add legacy id"
git push -u origin feat/legacy-id
gh pr create --title "feat: add legacy id" --body-file .github/pull_request_template.md
gh pr checks --watch`}
        output={`✓  test
X  redline-gate / Deterministic policy
✓  redline-gate / PR checklist
✓  redline-gate / ADR required for significant changes
✓  redline-gate / Dependency review
✓  redline-gate / Secret scan (diff)
✓  redline-gate / gate`}
      />
      <p>
        Tick the <code>## Launch readiness</code> boxes as usual. The Deterministic policy job caught
        it:
      </p>
      <Terminal
        commands="# from the Deterministic policy job"
        output={`src/legacy.ts:1
  Redline/BLOCKER [core/type-checker-suppression]: a type-checker suppression needs an inline explanation AND a ticket reference on the same line. Without one, nobody knows what it hides or when it can go.`}
      />
      <p>
        The standard says a BLOCKER <i>must not merge</i>. Now try to merge it, the way a busy
        teammate would:
      </p>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull
cat src/legacy.ts`}
        output={BAD_LEGACY}
      />
      <p>
        It merged. Nobody bypassed anything, nobody was an admin, and the gate you made required in
        step 07 was green the whole time. A BLOCKER is on <code>main</code>.
      </p>

      <h2>2. Clean it up</h2>
      <p>
        The fix is a parse that needs no suppression. Make it, and check it on your machine before
        pushing:
      </p>
      <File name="src/legacy.ts" text={GOOD_LEGACY} />
      <RedlineTerminal
        commands={`git checkout -b fix/legacy-id
cat > src/legacy.ts <<'EOF'
${GOOD_LEGACY}
EOF
git diff > fix.diff
{redline} policy --diff-file fix.diff
rm fix.diff`}
        output="no deterministic findings — 53 rule(s) evaluated with no model call"
      />
      <Terminal
        commands={`git commit -am "fix: parse legacy id without silencing the type checker"
git push -u origin fix/legacy-id
gh pr create --title "fix: parse legacy id without silencing the type checker" --body-file .github/pull_request_template.md
gh pr checks --watch
gh pr merge --squash
git checkout main
git pull`}
      />
      <p>
        <code>main</code> is clean again, but only because you noticed. Nothing stops the same
        mistake tomorrow. Two pull requests and a cleanup, for one line the gate had already found.
      </p>

      <h2>3. Why the gate let it through: the rung</h2>
      <p>
        A <b>rung</b> is how strict the gate is about review findings. Think of a ladder: every
        repository starts on the bottom step, and each step up makes the gate stricter.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>When a rule is broken, the gate…</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>observe</code>
              </td>
              <td>reports it and stays green. You are here: that is why your BLOCKER merged.</td>
            </tr>
            <tr>
              <td>
                <code>block-blocker</code>
              </td>
              <td>turns red on a BLOCKER finding.</td>
            </tr>
            <tr>
              <td>
                <code>block-high</code>
              </td>
              <td>turns red on a BLOCKER or a HIGH finding.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Do not mix this up with step 07. <code>--blocking</code> decided whether a red gate stops
        the merge. The rung decides what turns the gate red. You have the first; this step is about
        the second.
      </p>

      <h2>4. Try to turn it up</h2>
      <p>The obvious fix is one command. Try it:</p>
      <RedlineTerminal
        commands="{redline} init --rung block-blocker --no-commit"
        output={`  ▲ enforcement stays at observe — cannot move to block-blocker:
  ▲ 20 reviewed pull requests are needed and 0 have been recorded — a perfect
    rate over a handful is a coincidence, not evidence
  ▲ the seeded corpus has never been scored for this stack, so there is no
    evidence the reviewer catches known defects at all
  ▲ the clean corpus has never been scored, so nothing shows the reviewer stays
    quiet on correct code
  ▲ too few findings have fired to compute an acted-on rate`}
      />
      <p>
        Redline refuses, and no flag or admin gets past it. The rung stays at{" "}
        <code>observe</code>. To see why, think about what happens
        when the reviewer is wrong.
      </p>
      <p>
        Reviewers make mistakes. Sometimes a rule fires on code that is perfectly fine: a{" "}
        <b>false positive</b>.
      </p>
      <ul>
        <li>
          At <code>observe</code>, a false positive costs someone a minute to read and ignore.
        </li>
        <li>
          At a blocking rung, it stops a correct change from merging. Do that a few times, and the
          team stops trusting the gate and starts looking for ways around it.
        </li>
      </ul>
      <p>
        So Redline only lets you go up when you can show the findings are worth blocking on. It
        asks for proof of three things:
      </p>
      <ol>
        <li>
          <b>Enough history:</b> the gate has reviewed enough pull requests to judge it fairly.
        </li>
        <li>
          <b>People act on the findings:</b> most of them were actually fixed, not ignored.
        </li>
        <li>
          <b>The reviewer is accurate:</b> tested on sample code with planted bugs, it catches all
          of them, and it says nothing about code that is fine.
        </li>
      </ol>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>To reach</th>
              <th>Pull requests reviewed</th>
              <th>Findings fixed</th>
              <th>Reviewer accuracy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>block-blocker</code>
              </td>
              <td>20</td>
              <td>60%</td>
              <td>catches every planted BLOCKER, zero false positives</td>
            </tr>
            <tr>
              <td>
                <code>block-high</code>
              </td>
              <td>50</td>
              <td>80%</td>
              <td>the same</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The proof must be less than 90 days old, and you climb one rung at a time. Going back down
        is always allowed.
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

      <h2>5. Record what you really have</h2>
      <p>
        You do have some evidence. Count your merged pull requests:
      </p>
      <Terminal
        commands="gh pr list --state merged --json number --jq length"
        output="9"
      />
      <p>
        Nine, from steps 01 to 09; the throwaway pull requests you closed do not count. Every
        finding the gate raised on them was fixed: step 02&apos;s in step 03, and today&apos;s in
        your cleanup. Record that on a branch, with where the figures came from:
      </p>
      <RedlineTerminal
        commands={`git checkout -b chore/evidence
{redline} evidence record --sample-size 9 --acted-on-rate 1 --source "the 9 merged pull requests of the Learn path; every finding was fixed"`}
        output={`recorded.

rung         observe
seed recall  not measured
acted on     100%
sample       9 pull request(s)
false pos.   not measured
recorded     <today> (0 day(s) ago) — the 9 merged pull requests of the Learn path; …

not yet eligible for block-blocker:
  - 20 reviewed pull requests are needed and 9 have been recorded — a perfect rate over a handful is a coincidence, not evidence
  - the seeded corpus has never been scored for this stack, so there is no evidence the reviewer catches known defects at all
  - the clean corpus has never been scored, so nothing shows the reviewer stays quiet on correct code

what block-blocker asks for:
  sample size      >= 20 reviewed pull requests
  seed recall      >= 100%
  acted-on rate    >= 60%
  false positives  <= 0
  measured within  90 days`}
      />
      <p>
        The report is the to-do list for the next rung. Run <RedlineCode args="evidence" /> any
        time to see it again. <code>--source</code> is
        required: a figure with no source is just a claim. A real team takes these figures from
        its metrics over a few weeks of normal work, not from a count by hand. The record lives in{" "}
        <code>.redline.json</code>, so it is reviewed like any other change. Merge it:
      </p>
      <Terminal
        commands={`git add .redline.json
git commit -m "chore: record review evidence from the Learn path"
git push -u origin chore/evidence
gh pr create --title "chore: record review evidence from the Learn path" --body-file .github/pull_request_template.md
gh pr checks --watch
gh pr merge --squash
git checkout main
git pull`}
      />

      <h2>6. Feel a blocking rung, on a practice branch</h2>
      <p>
        You cannot earn <code>block-blocker</code> in a tutorial, but you can see what it does. On a
        branch you will never merge, record practice figures that meet the bar, raise the rung, and
        make step 1&apos;s mistake again:
      </p>
      <RedlineTerminal
        commands={`git checkout -b try/rung
{redline} evidence record --sample-size 20 --acted-on-rate 0.8 --seed-recall 1 --false-positives 0 --source "PRACTICE ONLY: made-up figures to see a blocking rung; never merged"
{redline} init --rung block-blocker --no-commit
cat > src/legacy.ts <<'EOF'
${BAD_LEGACY}
EOF
git add -A
git commit -m "chore: practice a blocking rung"
git push -u origin try/rung
gh pr create --title "Do not merge: practice a blocking rung" --body-file .github/pull_request_template.md
gh pr checks --watch
gh pr view --json mergeStateStatus`}
        output={`recorded.
…
  ▲ enforcement: observe -> block-blocker
…
✓  test
X  redline-gate / Deterministic policy
✓  redline-gate / PR checklist
✓  redline-gate / ADR required for significant changes
✓  redline-gate / Dependency review
✓  redline-gate / Secret scan (diff)
X  redline-gate / gate
{"mergeStateStatus":"BLOCKED"}`}
      />
      <p>Tick the launch-readiness boxes again. The gate&apos;s log:</p>
      <Terminal commands="# from the gate job" output="Error: Redline gate failed: policy" />
      <p>
        Same line as step 1, same finding. This time the gate is red and the merge button is
        disabled. That is the whole point of the ladder: the mistake you had to clean up by hand is
        stopped before it lands.
      </p>
      <p>
        This works on the branch because the pull request changes the rung in{" "}
        <code>.github/workflows/redline.yml</code>, and a pull request runs its own copy of that
        file. It is the same gap step 07 warned about, used on purpose here. Close the pull request
        without merging, so the made-up figures never reach <code>main</code>:
      </p>
      <Terminal
        commands={`gh pr close
git checkout main`}
      />
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>Never record figures you did not measure on a real repository.</b> The{" "}
          <code>--source</code> and the pull request that adds it are the audit trail. Made-up
          evidence makes the gate block on findings nobody has shown to be right, which is exactly
          the harm the ladder exists to prevent.
        </p>
      </div>

      <h2>Going down is always allowed</h2>
      <p>
        A demotion needs no evidence. If a rung is blocking good work, step down first and
        investigate after. A gate people resent gets worked around, and then it protects nothing.
        You are at <code>observe</code> already, so there is nothing to run now; on a higher rung it
        is one command, through a pull request like any other change:
      </p>
      <RedlineTerminal commands="{redline} init --rung observe" />

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
