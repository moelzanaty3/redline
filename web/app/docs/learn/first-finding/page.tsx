import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: your first finding" };

// Added to the end of step 00's src/users.ts, which is 18 lines long. Lines
// 20-26 each break one rule the offline checker decides, so those findings appear
// at any terminal with no model and no network. Line 30 breaks one that needs
// judgement — no checker, Redline's or ESLint's, can tell that an email address
// is customer data — so only the review in an assistant reports it.
const USER_TS = `// TODO: handle retries
export function loadUser(raw: string) {
  // @ts-ignore
  return JSON.parse(raw) as unknown as User
}

export type Payload = unknown

export function requireUser(directory: UserDirectory, id: string, requester: User): User {
  const user = directory.find(id)
  if (!user) throw new Error(\`\${requester.email} asked for user \${id}, which does not exist\`)
  return user
}
`;

const FINDINGS = `profile javascript-typescript — rules in scope: core, typescript
src/users.ts:20
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it.
src/users.ts:22
  Redline/BLOCKER [core/type-checker-suppression]: a type-checker suppression needs an inline explanation AND a ticket reference on the same line.
src/users.ts:23
  Redline/BLOCKER [core/unsafe-assertion]: a double assertion overrides the type checker with no stated reason.
src/users.ts:26
  Redline/HIGH [typescript/unknown-type-alias]: this alias names \`unknown\`, so it reads as a contract it is not.
4 finding(s)`;

const WRITE_PROMPT =
  "Write a function in src/account.ts that parses an Account { id: string; email: string } from a JSON string.";

export default function Page() {
  return (
    <LearnPage
      slug="first-finding"
      intro="Write the kind of code an assistant produces when it is told to make a type error go away. It compiles, the tests pass, and Redline names five problems in it: four a checker can prove, and one only a reviewer would notice."
      learn={[
        "How to review a change on your machine before you push",
        "How to read a finding: severity, rule id, problem",
        "How to run the same review inside Claude Code, Copilot or Cursor",
        "What the gate does with a broken rule at observe",
      ]}
    >
      <h2>Write some plausible code</h2>
      <p>
        The directory from step 00 holds users; now they have to arrive from somewhere, as JSON.
        Start a branch:
      </p>
      <Terminal commands="git checkout -b feat/load-user" />
      <p>
        Open <code>src/users.ts</code>, keep everything in it, and add this at the end, below the
        closing <code>{"}"}</code> of <code>UserDirectory</code>:
      </p>
      <File name="src/users.ts — add at the end" text={USER_TS} />
      <p>
        Look at it for a moment before reading on. Would you have caught all of it in a review on
        a busy afternoon? It compiles, because <code>@ts-ignore</code> tells the compiler to look
        away and <code>as unknown as User</code> tells it to trust whatever comes back.{" "}
        <code>pnpm test</code> still passes.
      </p>

      <h2>Review it</h2>
      <Tabs
        label="Where to review"
        tabs={[
          {
            label: "In your terminal",
            content: (
              <>
                <p>
                  Redline reviews a <i>diff</i>, and a file git does not track is not in one, so stage
                  it first:
                </p>
                <RedlineTerminal
                  commands={`git add src/users.ts\n{redline} review`}
                  output={FINDINGS}
                />
                <p>
                  The messages are shortened here; your terminal prints each in full, with the fix.
                  No model was called: these four rules are decided by a checker, so the result is
                  the same every time. Skip <code>git add</code> and the review stops with{" "}
                  <code>there is nothing to review — the diff is empty</code>.
                </p>
                <div className="callout warn">
                  <span className="ic">!</span>
                  <p>
                    <b>Four, not five, and that is the point.</b> Line 30 is missing, and it is the
                    worst line in the file. The terminal runs only the rules a checker can decide,
                    and no checker can tell that <code>requester.email</code> is a customer&apos;s
                    email address. Finding it takes a model: run <code>/redline-review</code> in
                    your assistant, in the next tab. With no assistant, <code>review --engine
                    api</code> calls a model from the terminal, given an API key.
                  </p>
                </div>
              </>
            ),
          },
          {
            label: "In your assistant",
            content: (
              <>
                <p>
                  Onboarding added a <code>/redline-review</code> command to every assistant. In
                  Claude Code, Copilot Chat (agent mode) or Cursor, in this repository, type:
                </p>
                <CodeWindow title="assistant chat" copyText="/redline-review">
                  <span className="tk-prompt">&gt;</span> <span className="tk-white">/redline-review</span>
                </CodeWindow>
                <p>
                  The assistant collects the rules that apply to the files you changed, the diff and
                  the checker&apos;s findings into one prompt, and reviews against it. The reply uses
                  the same <code>Redline/SEVERITY [rule-id]: problem</code> shape, ending with a count
                  such as <code>3 BLOCKER · 2 HIGH · 0 SUGGESTION</code>.
                </p>
                <p>
                  A model also applies the rules a checker cannot decide, so expect a fifth finding:
                </p>
                <CodeWindow title="the fifth finding">
                  <span className="tk-red">Redline/BLOCKER</span>{" "}
                  <span className="tk-amber">[core/customer-data-in-logs]</span>
                  <span className="tk-white">
                    : line 30 puts the requester&apos;s email address into an error message, which
                    ends up in logs and error trackers.
                  </span>
                </CodeWindow>
                <p>
                  Nothing in the code says <code>requester.email</code> is personal data. It is a
                  string, like any other. Knowing that it belongs to a customer, and that error
                  messages are read by people who should not see it, takes judgement. The model may
                  word it differently from run to run, or find more; the rule ids do not change.
                </p>
                <p>
                  Reviewing is half of it. The assistant reads the rules on every request, so they
                  shape new code before anything is reviewed. Try it:
                </p>
                <CodeWindow title="assistant chat" copyText={WRITE_PROMPT}>
                  <span className="tk-prompt">&gt;</span> <span className="tk-white">{WRITE_PROMPT}</span>
                </CodeWindow>
                <p>
                  An assistant that has read the rules usually validates the parsed value with a type
                  guard or a schema instead of writing <code>as unknown as Account</code>. It depends
                  on the model, so treat it as something to look for, not a guarantee. That is why the
                  review exists.
                </p>
              </>
            ),
          },
          {
            label: "In any other chat",
            content: (
              <>
                <p>
                  A browser chat works too. This copies the whole review prompt to the clipboard on
                  macOS; on Linux pipe to <code>xclip -selection clipboard</code>, on Windows to{" "}
                  <code>clip</code>. Then paste it into the chat.
                </p>
                <RedlineTerminal commands={`{redline} review --print-prompt | pbcopy`} />
              </>
            ),
          },
        ]}
      />

      <h2>Wouldn&apos;t ESLint catch this?</h2>
      <p>
        Four of the five, yes, with the right configuration, and you should run it. None of these
        rules is on in a default setup:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Redline</th>
              <th>ESLint</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>20</td>
              <td>
                <code>core/untracked-todo</code>
              </td>
              <td>
                <code>no-warning-comments</code> flags every TODO, with a ticket or without
              </td>
            </tr>
            <tr>
              <td>22</td>
              <td>
                <code>core/type-checker-suppression</code>
              </td>
              <td>
                <code>@typescript-eslint/ban-ts-comment</code>, configured to require a description
              </td>
            </tr>
            <tr>
              <td>23</td>
              <td>
                <code>core/unsafe-assertion</code>
              </td>
              <td>
                <code>@typescript-eslint/no-unsafe-type-assertion</code>, not in the recommended set
              </td>
            </tr>
            <tr>
              <td>26</td>
              <td>
                <code>typescript/unknown-type-alias</code>
              </td>
              <td>
                No rule; a custom <code>no-restricted-syntax</code> selector
              </td>
            </tr>
            <tr>
              <td>30</td>
              <td>
                <code>core/customer-data-in-logs</code>
              </td>
              <td>
                <b>Nothing.</b> A linter sees a string, not a customer&apos;s email address.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Line 30 is the kind of rule most of the standard is made of: missing auth checks, races,
        personal data where it should not be. They need a reviewer, so Redline gives every
        assistant the same reviewer&apos;s brief. And the rules reach the assistant before it
        writes, in <code>AGENTS.md</code> and its siblings, where a linter only reports after the
        code exists.
      </p>

      <h2>Reading a finding</h2>
      <p>Every finding has the same three parts, in the same order:</p>
      <CodeWindow title="one finding">
        <span className="tk-red">Redline/BLOCKER</span>{" "}
        <span className="tk-amber">[core/unsafe-assertion]</span>
        <span className="tk-white">: a double assertion overrides the type checker with no stated reason.</span>
      </CodeWindow>
      <ul>
        <li>
          <b>Severity.</b> <code>BLOCKER</code> must not merge. <code>HIGH</code> is a deliberate
          trade-off a reviewer acknowledges. <code>SUGGESTION</code> is optional.
        </li>
        <li>
          <b>Rule id</b>, in brackets. It is stable, it is what you look up in the next step, and it
          is how the organisation counts which rules earn their place.
        </li>
        <li>
          <b>The problem</b>, and how to fix it, in a sentence or two.
        </li>
      </ul>
      <Term word="Deterministic rule">
        <p>
          A rule a program can decide on its own, with no model: a <code>@ts-ignore</code> is either
          there or it isn&apos;t. Most of the standard needs judgement and is applied by a model.
          The deterministic share runs in your terminal and in the gate, and always gives the same
          answer. More in <Link href="/docs/deterministic">Deterministic rules</Link>.
        </p>
      </Term>

      <h2>Push it anyway</h2>
      <p>
        On GitHub, open a pull request with the findings still in it, to see what the pipeline does:
      </p>
      <Terminal
        commands={`git commit -m "feat: load a user from JSON"
git push -u origin feat/load-user
gh pr create --title "feat: load a user from JSON" --body-file .github/pull_request_template.md`}
      />
      <p>
        On GitHub, fill in the <code>## Launch readiness</code> checklist honestly. One item is
        false: <i>Input validated at boundaries touched by this change</i>, because this code skips
        validation. Leave that box unticked. Step 03 makes it true, and you tick it then.
      </p>
      <Terminal
        commands="gh pr checks"
        output={`✓  CI / test                                                  compiles, tests pass
X  Redline / redline-gate / Deterministic policy              the same four findings
X  Redline / redline-gate / PR checklist                      one box, honestly unticked
✓  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate                              passes, with a warning`}
      />
      <p>
        Open <code>Redline / redline-gate / gate</code>: its log says why it passed with two red
        jobs. <code>checklist</code> and <code>policy</code> are the ids of the PR checklist and
        Deterministic policy jobs:
      </p>
      <Terminal
        commands="# from the log of Redline / redline-gate / gate"
        output={`Warning: Process checks failed: checklist
policy. This repository is at rung 'observe', which reports and does not block. The findings
are recorded either way.`}
      />
      <p>
        That is <code>observe</code> doing its job: the findings are visible on the pull request and
        recorded, and nothing is blocked yet.
      </p>
      <p>
        Notice what the gate did not see: line 30. The Deterministic policy job runs the same
        checker as your terminal, and the gate calls no model, so the email address in the error
        goes unremarked. In a pull request, that rule is applied by the review in your assistant
        before you push, and by a human reviewer. Step 07 adds a GitHub ruleset that also asks
        Copilot to review every pull request, when your plan includes it.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          A local review always exits 0 and is never recorded. It is a mirror, not a gate: nothing
          on your machine can block you.
        </p>
      </div>

      <Quiz
        question="The Deterministic policy job failed, but the gate passed. Why?"
        options={[
          {
            text: "The gate ignores the policy job",
            why: "It reads it: the gate's log names the failed policy job. It just doesn't block on it yet.",
          },
          {
            text: "HIGH findings never block",
            why: "Two of the four findings are BLOCKERs. Severity matters on the stricter rungs; at observe nothing but the security floor blocks.",
          },
          {
            text: "The repository is at observe, which reports findings without blocking",
            correct: true,
            why: "Every repository starts at observe. The findings are shown and recorded, so the team sees what Redline would block before anything is blocked.",
          },
        ]}
      />
    </LearnPage>
  );
}
