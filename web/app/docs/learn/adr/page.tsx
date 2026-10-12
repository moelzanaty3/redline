import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, Term, Terminal } from "@/components/learn/parts";
import { DEMO_URL } from "@/lib/learn";

export const metadata: Metadata = { title: "Learn: a big change needs an ADR" };

const ADR = `# 0001 · The country list lives in code

## Context

parseAddress has to refuse an address whose country does not exist.
That needs the ISO 3166-1 list, and the list has to come from somewhere.

## Options

1. A dependency: maintained by someone else, but every upgrade is a
   supply-chain change to review.
2. A lookup service: always current, but parsing would need the network.
3. A table in code, generated once from the CLDR data that ships with Node.

## Decision

Option 3. src/countries.ts holds 249 entries, and a test pins the count.

## Consequences

- No new dependency and no network call.
- When ISO 3166 changes, someone regenerates the table on purpose.
`;

const PR_BODY = `## Architecture decision

ADR: [docs/adr/0001-country-list-in-code.md](../blob/main/docs/adr/0001-country-list-in-code.md)
`;

export default function Page() {
  return (
    <LearnPage
      slug="adr"
      intro="A large change usually carries a decision that someone will later want to understand. Past 300 changed lines, Redline asks for that decision to be written down and linked from the pull request."
      learn={[
        "What an ADR is, and why big changes need one",
        "How the gate decides a change is big",
        "When to skip it, on the record, with the no-adr label",
      ]}
    >
      <Term word="ADR (Architecture Decision Record)">
        <p>
          A short markdown file that records one decision: the context, the options considered, the
          choice, and its consequences. Six months later it answers &quot;why on earth is it done
          this way?&quot; without anyone having to remember.
        </p>
      </Term>

      <h2>Make a big change</h2>
      <p>
        Add an address parser that refuses a country that is not real, checked against a
        249-entry ISO 3166 table. Borrow the files from the demo rather than typing them:
      </p>
      <Terminal
        commands={`git checkout -b feat/addresses
git checkout step-05 -- src/countries.ts src/countries.test.ts src/address.ts src/address.test.ts
pnpm test
git commit -m "feat: parse addresses, with the country checked against ISO 3166"
git push -u origin feat/addresses
gh pr create --fill`}
      />
      <p>With its tests, that is 352 changed lines. The ADR job fails:</p>
      <Terminal
        commands="# from the ADR job's log"
        output={`changed=352 threshold=300 adr-links=0 no-adr-label=0
Error: 352 changed lines with no ADR link. Add docs/adr/NNNN-*.md and link it in the PR body,
       or apply the 'no-adr' label with a justification comment.`}
      />
      <p>
        The gate still passes, because the repository is at <code>observe</code>. But the job is
        red on the pull request, and that is the prompt to write the decision down.
      </p>

      <h2>Write the decision down</h2>
      <Tabs
        label="Writing the ADR"
        tabs={[
          {
            label: "1. The ADR file",
            content: (
              <>
                <p>
                  Create <code>docs/adr/0001-country-list-in-code.md</code>. A shortened version of
                  the demo&apos;s:
                </p>
                <File name="docs/adr/0001-country-list-in-code.md" text={ADR} />
                <p>
                  Read{" "}
                  <a
                    href={`${DEMO_URL}/blob/main/docs/adr/0001-country-list-in-code.md`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    the full one
                  </a>{" "}
                  for what each section looks like with real reasoning in it.
                </p>
              </>
            ),
          },
          {
            label: "2. Link it",
            content: (
              <>
                <p>Commit the file, then add a link to it in the pull request description:</p>
                <File name="pull request description" text={PR_BODY} />
                <p>
                  Any <code>docs/adr/</code> path in the description counts. Editing the
                  description re-runs the gate; no new commit is needed.
                </p>
              </>
            ),
          },
          {
            label: "3. Green",
            content: (
              <>
                <Terminal
                  commands="# from the ADR job's log"
                  output="changed=375 threshold=300 adr-links=1 no-adr-label=0"
                />
                <p>Every check is green. Merge it.</p>
              </>
            ),
          },
        ]}
      />

      <h2>What the check reads</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Input</th>
              <th>Where it comes from</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Changed lines</td>
              <td>Additions plus deletions on the pull request</td>
            </tr>
            <tr>
              <td>Threshold</td>
              <td>
                <code>adr-diff-threshold: 300</code> in <code>.github/workflows/redline.yml</code>
              </td>
            </tr>
            <tr>
              <td>ADR link</td>
              <td>Any <code>docs/adr/</code> path in the description</td>
            </tr>
            <tr>
              <td>Opt-out</td>
              <td>
                The <code>no-adr</code> label, for a change that is large but decides nothing: a
                generated lockfile, a rename, the onboarding pull request. Say why in a comment.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Quiz
        question="A pull request regenerates pnpm-lock.yaml: 2,000 changed lines and no decision. What is the right move?"
        options={[
          {
            text: "Write an ADR about updating the lockfile",
            why: "An ADR records a decision. A regenerated lockfile decides nothing, and an empty ADR teaches people to write empty ADRs.",
          },
          {
            text: "Apply the no-adr label and say why in a comment",
            correct: true,
            why: "That is what the label is for: a large change that makes no decision, with the reason on the record.",
          },
          {
            text: "Split it into seven pull requests under 300 lines",
            why: "That defeats the check without recording anything, and a half-applied lockfile is broken.",
          },
        ]}
      />
    </LearnPage>
  );
}
