import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: exemptions" };

const REASON =
  "parseUser replaces loadUser with no alias, so a consumer that upgrades cannot roll back without renaming its import again. Nothing outside this repository imports it yet.";

const EXEMPTION = `## Redline exemption

- reason: ${REASON}
- until: YYYY-MM-DD
- scope: checklist
`;

export default function Page() {
  return (
    <LearnPage
      slug="exemptions"
      intro="Sometimes a check is right and you merge anyway, on purpose. An exemption makes that a decision on the record: what is being accepted, why, until when, and for which check."
      learn={[
        "When an exemption is the honest answer",
        "How to write one, and check it on your machine before pushing",
        "What the gate refuses, and why a label alone is not enough",
      ]}
    >
      <h2>Why exemptions exist</h2>
      <p>
        Until now, every red check meant you did something wrong, and you fixed it. This step is
        about the other case: the check is right, and your change is <i>also</i> right.
      </p>
      <p>
        Here is the example you are about to build. You rename <code>loadUser</code> to{" "}
        <code>parseUser</code>. Good change. But any code that imports <code>loadUser</code> will
        break. The pull request checklist asks <i>&quot;Rollback is safe, no breaking change?&quot;</i>{" "}
        and the honest answer is <b>no</b>. You still want to merge it.
      </p>
      <p>You have three options:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>You…</th>
              <th>What happens</th>
              <th>The problem</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>tick the box anyway</td>
              <td>everything goes green</td>
              <td>the checklist now lies</td>
            </tr>
            <tr>
              <td>ask an admin to force the merge</td>
              <td>the change lands</td>
              <td>nobody wrote down why</td>
            </tr>
            <tr>
              <td>
                <b>write an exemption</b>
              </td>
              <td>the check stays red, the gate lets it through</td>
              <td>none: the reason is on the pull request</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        An exemption is a short note in the pull request description: <b>why</b> you are merging
        anyway, <b>until when</b> that is acceptable, and <b>which check</b> it is about. Add the{" "}
        <code>redline-exempt</code> label, and the gate reads the note instead of failing. Think of
        it as a signed note: &quot;I know this check is red. Here is why that is fine, until this
        date.&quot;
      </p>
      <Term word="Process check">
        <p>
          A check about <i>how</i> you work, not about whether the code is dangerous: the rule
          checker (<code>policy</code>), the pull request <code>checklist</code> and the{" "}
          <code>adr</code> check. An exemption can cover these. It can never cover the security
          floor from step 06: a vulnerable dependency or a leaked secret is never waived.
        </p>
      </Term>

      <h2>A change that is right, and breaks a check</h2>
      <p>
        Rename <code>loadUser</code> to <code>parseUser</code> in <code>src/users.ts</code> and its
        test, to match <code>parseAddress</code>, with no alias left behind:
      </p>
      <Terminal
        commands={`git checkout -b refactor/parse-user
perl -pi -e 's/\\bloadUser\\b/parseUser/g' src/users.ts src/users.test.ts
pnpm test
git commit -am "refactor: rename loadUser to parseUser"
git push -u origin refactor/parse-user
gh pr create --title "refactor: rename loadUser to parseUser" --body-file .github/pull_request_template.md`}
      />
      <p>
        The tests pass. On GitHub, tick the <code>## Launch readiness</code> boxes that hold. One
        does not: anyone importing <code>loadUser</code> breaks, so{" "}
        <i>Rollback is safe (no destructive migration, no breaking contract change)</i> is
        honestly false. Leave it unticked:
      </p>
      <Terminal
        commands="# from the PR checklist job"
        output={`Error: 1 unchecked launch-readiness item(s). Tick each one, or delete the line and say why in the PR description.`}
      />

      <h2>Write the exemption</h2>
      <p>
        The pull request template already has a <code>## Redline exemption</code> section with three
        empty fields. Fill them in, with an end date 30 days from today, and add the{" "}
        <code>redline-exempt</code> label that step 07 created:
      </p>
      <Terminal
        commands={`UNTIL=$(node -p "new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)")
gh pr view --json body -q .body | UNTIL=$UNTIL perl -pe 's/^- reason:\\s*$/- reason: ${REASON}\\n/; s/^- until:\\s*$/- until: $ENV{UNTIL}\\n/; s/^- scope:\\s*$/- scope: checklist\\n/' | gh pr edit --body-file -
gh pr edit --add-label redline-exempt`}
      />
      <p>Or edit the description on GitHub, so the section reads:</p>
      <File name="pull request description" text={EXEMPTION} />
      <Tabs
        label="The three fields"
        tabs={[
          {
            label: "reason",
            content: (
              <p>
                At least 20 characters. Say what is accepted and why, so a reader in three months can
                act on it. &quot;needed for release&quot; is refused: it tells a later reader nothing.
              </p>
            ),
          },
          {
            label: "until",
            content: (
              <p>
                A real date, <code>YYYY-MM-DD</code>, at most 90 days away. An exemption is temporary
                by design; anything longer is a change to the standard, not an exemption.
              </p>
            ),
          },
          {
            label: "scope",
            content: (
              <p>
                The checks it covers: <code>checklist</code>, <code>adr</code>, <code>policy</code>.
                Name only the one that is failing. Leave it out and it covers all of them, which is
                rarely what you mean.
              </p>
            ),
          },
        ]}
      />

      <h2>Check it before you push</h2>
      <p>The gate runs this exact command. Run it yourself first, against the check that is failing:</p>
      <RedlineTerminal
        commands={`gh pr view --json body --jq .body > body.md
{redline} exempt --body-file body.md --scope checklist`}
        output="exempt until YYYY-MM-DD (checklist): parseUser replaces loadUser with no alias, …"
      />
      <p>And see what it refuses:</p>
      <Tabs
        label="What the exemption check refuses"
        tabs={[
          {
            label: "Wrong scope",
            content: (
              <RedlineTerminal
                commands="{redline} exempt --body-file body.md --scope adr"
                output={`warn  the exemption covers checklist — it does not cover "adr". Widen its scope deliberately, or fix the check.`}
              />
            ),
          },
          {
            label: "Too far out",
            content: (
              <Terminal
                commands="# until: more than 90 days away"
                output="warn  `until: 2027-06-01` is 232 days away; the maximum is 90 — a longer exemption is a standards change, not an exemption"
              />
            ),
          },
          {
            label: "Empty reason",
            content: (
              <Terminal
                commands="# reason: needed for release"
                output={`warn  the reason is 18 characters; at least 20 are required — "needed for release" tells a later reader nothing`}
              />
            ),
          },
          {
            label: "Label alone",
            content: (
              <>
                <Terminal
                  commands="# the label, and no ## Redline exemption section"
                  output="Error: A soft-fail label was applied without a valid `## Redline exemption` block (reason and expiry required)."
                />
                <p>
                  A label says something was waived, not why, by whom or until when. From Redline
                  0.2.7 the gate refuses one on its own: at <code>observe</code> the error is recorded and the
                  gate still passes, and at a blocking rung it fails.
                </p>
              </>
            ),
          },
        ]}
      />
      <p>
        None of this ever applies to the security floor. Step 06 showed the label being ignored
        there, and an exemption block is ignored the same way.
      </p>

      <h2>Why it matters more later</h2>
      <p>
        At <code>observe</code> a failing process check does not block, so the exemption changes the
        record, not the merge: the gate logs who accepted what, and until when. Once a repository
        blocks on its findings, a failing process check stops the merge, and a valid exemption is the
        only way through it. That is the next step.
      </p>

      <h2>Merge it</h2>
      <Terminal
        commands="gh pr checks --watch"
        output={`✓  CI / test
✓  Redline / redline-gate / Deterministic policy
X  Redline / redline-gate / PR checklist                      still red, on the record
✓  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate                              passes; its log shows the exemption`}
      />
      <p>
        The checklist job stays red: the item is still false, and the page says so. The gate is
        green, so the required check from step 07 lets the merge through. Merge, and clean up the
        description copy you checked locally:
      </p>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull
rm body.md`}
      />

      <Quiz
        question="PR checklist and ADR are both failing. The exemption block says scope: checklist. At a blocking rung, what happens?"
        options={[
          {
            text: "The gate passes: the pull request is exempt",
            why: "The gate checks every failing process check against the scope, one at a time. adr is not covered.",
          },
          {
            text: "The gate fails, because adr is not covered",
            correct: true,
            why: "An exemption covers exactly what it names. Either fix the ADR check, or widen the scope deliberately, with a reason that covers it.",
          },
          {
            text: "The gate fails, because only one exemption is allowed per repository",
            why: "There is no such limit. The problem is the scope: adr is failing and not covered.",
          },
        ]}
      />
    </LearnPage>
  );
}
