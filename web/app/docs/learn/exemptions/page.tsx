import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: exemptions" };

const EXEMPTION = `## Redline exemption

- reason: parseUser replaces loadUser with no alias, so a consumer that upgrades cannot roll back without renaming its import again. Nothing outside this repository imports it yet.
- until: YYYY-MM-DD
- scope: checklist
`;

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

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
      <h2>A change that is right, and breaks a check</h2>
      <p>
        Rename <code>loadUser</code> to <code>parseUser</code>, to match <code>parseAddress</code>,
        with no alias left behind. The tests pass. But anyone importing <code>loadUser</code> breaks,
        so the checklist item <i>Rollback is safe (no destructive migration, no breaking contract
        change)</i> is honestly false, and you leave it unticked:
      </p>
      <Terminal
        commands="# from the PR checklist job"
        output={`Error: 1 unchecked launch-readiness item(s). Tick each one, or delete the line and say why in the PR description.`}
      />
      <p>
        You could tick the box anyway. Then the checklist says something untrue, and nobody finds
        out until a rollback fails. The exemption is the honest route.
      </p>
      <Term word="Process check">
        <p>
          The gate&apos;s jobs about how a change is made: the rule checker (<code>policy</code>),
          the pull request <code>checklist</code> and the <code>adr</code> check. They are the ones
          the rung governs and an exemption can cover. The security floor is not a process check.
        </p>
      </Term>

      <h2>Write the exemption</h2>
      <p>
        Add the <code>redline-exempt</code> label, and fill in the section the pull request template
        already has:
      </p>
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
      <Terminal
        commands={`gh pr view --json body --jq .body > body.md
${rl("exempt --body-file body.md --scope checklist")}`}
        output="exempt until YYYY-MM-DD (checklist): parseUser replaces loadUser with no alias, …"
      />
      <p>And see what it refuses:</p>
      <Tabs
        label="What the exemption check refuses"
        tabs={[
          {
            label: "Wrong scope",
            content: (
              <Terminal
                commands={rl("exempt --body-file body.md --scope adr")}
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
