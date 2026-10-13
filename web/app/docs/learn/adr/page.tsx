import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";
import { DEMO_RAW, DEMO_URL } from "@/lib/learn";

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

const ADR_LINK = "[docs/adr/0001-country-list-in-code.md](../blob/main/docs/adr/0001-country-list-in-code.md)";

const PR_BODY = `## Architecture decision

ADR: ${ADR_LINK}
`;

// Lines the ADR file adds to the pull request, for the job log after it lands.
const ADR_LINES = ADR.split("\n").length - 1;

export default function Page() {
  return (
    <LearnPage
      slug="adr"
      intro="A large change usually carries a decision that someone will later want to understand. Past 300 changed lines, Redline asks for that decision to be written down and linked from the pull request."
      learn={[
        "What an ADR is, and why big changes need one",
        "How the gate decides a change is big, and what counts as a link",
        "When to skip it, on the record, with the no-adr label",
      ]}
    >
      <h2>Why write a decision down</h2>
      <p>
        Six months from now, someone opens <code>src/countries.ts</code>, finds 249 countries
        typed into the code, and asks: why not a package from npm? The answer was in the head of
        whoever wrote it, and maybe in a pull request comment nobody will find. They either spend an
        afternoon working it out again, or they &quot;fix&quot; it and bring back the problem the
        table was there to avoid.
      </p>
      <Term word="ADR (Architecture Decision Record)">
        <p>
          A short markdown file that records one decision: the context, the options considered, the
          choice, and its consequences. It lives in the repository, in <code>docs/adr/</code>, next
          to the code it explains, and answers &quot;why is it done this way?&quot; without anyone
          having to remember.
        </p>
      </Term>
      <p>
        The gate cannot tell whether a pull request made a decision. It can count lines, and a big
        change usually carries one, so it asks on size. When a big change decides nothing, you say
        so with a label instead.
      </p>

      <h2>What the check reads</h2>
      <p>
        The job is <code>Redline / redline-gate / ADR required for significant changes</code>. It
        fails when the change is over the threshold, has no ADR link, and has no{" "}
        <code>no-adr</code> label:
      </p>
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
              <td>
                A real file name under <code>docs/adr/</code> in the description, such as{" "}
                <code>docs/adr/0001-country-list-in-code.md</code>, as a path or a URL. The
                template&apos;s placeholder, <code>docs/adr/NNNN-*.md</code>, does not count.
              </td>
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

      <h2>Make a big change</h2>
      <p>
        Add an address parser that refuses a country that is not real, checked against a
        249-entry ISO 3166 table. Download the files from the demo rather than typing them:
      </p>
      <Terminal
        commands={`git checkout -b feat/addresses
curl -fsSL --remote-name-all --output-dir src "${DEMO_RAW}/step-05/src/{countries,countries.test,address,address.test}.ts"
pnpm test
git add src
git commit -m "feat: parse addresses, with the country checked against ISO 3166"
git push -u origin feat/addresses
gh pr create --title "feat: parse addresses, with the country checked against ISO 3166" --body-file .github/pull_request_template.md
gh pr checks --watch`}
        output={`✓  CI / test
✓  Redline / redline-gate / Deterministic policy
X  Redline / redline-gate / PR checklist                      until you tick the boxes
X  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate                              passes, with a warning`}
      />
      <p>
        On GitHub, tick the <code>## Launch readiness</code> boxes that hold, as in step 02. The
        ADR job stays red. Open it: with its tests, the change is 352 lines, and the description
        still has only the template&apos;s placeholder:
      </p>
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
                  On the same branch, create <code>docs/adr/0001-country-list-in-code.md</code>.
                  Paste this into your terminal:
                </p>
                <Terminal
                  commands={`mkdir -p docs/adr
cat > docs/adr/0001-country-list-in-code.md <<'EOF'
${ADR}EOF`}
                />
                <p>
                  It is a shortened version of the demo&apos;s. Read{" "}
                  <a
                    href={`${DEMO_URL}/blob/main/docs/adr/0001-country-list-in-code.md`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    the full one
                  </a>{" "}
                  for what each section looks like with real reasoning in it. Number the next one{" "}
                  <code>0002</code>: the number keeps them in the order they were decided.
                </p>
              </>
            ),
          },
          {
            label: "2. Commit and link it",
            content: (
              <>
                <p>Push the file to the pull request:</p>
                <Terminal
                  commands={`git add docs/adr
git commit -m "docs(adr): 0001 the country list lives in code"
git push`}
                />
                <p>
                  Then point the description at it. This swaps the template&apos;s placeholder for
                  the link and keeps everything else, including the boxes you ticked:
                </p>
                <Terminal
                  commands={`gh pr view --json body -q .body | sed 's|\`docs/adr/NNNN-\\*\\.md\`|${ADR_LINK}|' | gh pr edit --body-file -`}
                />
                <p>Or edit the description on GitHub, so the ADR line reads:</p>
                <File name="pull request description" text={PR_BODY} />
                <p>
                  Editing the description re-runs the gate, so no new commit is needed for the
                  link.
                </p>
              </>
            ),
          },
          {
            label: "3. Green",
            content: (
              <>
                <Terminal
                  commands="gh pr checks --watch"
                  output={`✓  CI / test
✓  Redline / redline-gate / Deterministic policy
✓  Redline / redline-gate / PR checklist
✓  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate`}
                />
                <p>The ADR job&apos;s log now counts the link:</p>
                <Terminal
                  commands="# from the ADR job's log"
                  output={`changed=${352 + ADR_LINES} threshold=300 adr-links=1 no-adr-label=0`}
                />
              </>
            ),
          },
        ]}
      />

      <h2>Merge it</h2>
      <p>
        Every check is green. Merge, and bring <code>main</code> back for the next step:
      </p>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull`}
      />

      <h2>When there is no decision</h2>
      <p>
        Not every big change decides something. For one pull request, label it and say why, as you
        did for the onboarding pull request in step 01:
      </p>
      <Terminal
        commands={`gh pr edit --add-label no-adr
gh pr comment --body "Regenerated lockfile. No design decision."`}
      />
      <p>
        A repository that does not keep decision records at all turns the check off, and{" "}
        <code>--adr</code> turns it back on:
      </p>
      <RedlineTerminal commands="{redline} init --no-adr --no-commit" />
      <p>
        That is a team decision, so it goes through a pull request like the rest of the
        configuration. Before you take it, remember the afternoon someone spends rediscovering
        why the country list is in code.
      </p>

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
