import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: your first finding" };

// Each line breaks exactly one rule the offline checker decides, so the
// findings appear at any terminal with no model and no network.
const USER_TS = `type User = { id: string; name: string }

// TODO: handle retries
export function loadUser(raw: string) {
  // @ts-ignore
  return JSON.parse(raw) as unknown as User
}

export type Payload = unknown
`;

const FINDINGS = `profile javascript-typescript — rules in scope: core, typescript
src/user.ts:3
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it.
src/user.ts:5
  Redline/BLOCKER [core/type-checker-suppression]: a type-checker suppression needs an inline explanation AND a ticket reference on the same line.
src/user.ts:6
  Redline/BLOCKER [core/unsafe-assertion]: a double assertion overrides the type checker with no stated reason.
src/user.ts:9
  Redline/HIGH [typescript/unknown-type-alias]: this alias names \`unknown\`, so it reads as a contract it is not.
4 finding(s)`;

const WRITE_PROMPT =
  "Write a function in src/account.ts that parses an Account { id: string; email: string } from a JSON string.";

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <LearnPage
      slug="first-finding"
      intro="Write the kind of code an assistant produces when it is told to make a type error go away. It compiles, the tests pass, and Redline names four problems in it."
      learn={[
        "How to review a change on your machine before you push",
        "How to read a finding: severity, rule id, problem",
        "How to run the same review inside Claude Code, Copilot or Cursor",
        "What the gate does with a broken rule at observe",
      ]}
    >
      <h2>Write some plausible code</h2>
      <p>Start a branch, and save this as <code>src/user.ts</code>:</p>
      <Terminal commands="git checkout -b feat/load-user" />
      <File name="src/user.ts" text={USER_TS} />
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
                <Terminal commands={`git add src/user.ts\n${rl("review")}`} output={FINDINGS} />
                <p>
                  The messages are shortened here; your terminal prints each in full, with the fix.
                  No model was called: these four rules are decided by a checker, so the result is
                  the same every time. Skip <code>git add</code> and the review stops with{" "}
                  <code>there is nothing to review — the diff is empty</code>.
                </p>
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
                  such as <code>2 BLOCKER · 2 HIGH · 0 SUGGESTION</code>.
                </p>
                <p>
                  A model can also apply the rules a checker cannot decide, such as customer data in
                  a log line, so it may find more than four. Its wording changes from run to run; the
                  rule ids do not.
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
                <Terminal commands={`${rl("review --print-prompt")} | pbcopy`} />
              </>
            ),
          },
        ]}
      />

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
gh pr create --fill`}
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>test</td>
              <td>✅ it compiles and the tests pass</td>
            </tr>
            <tr>
              <td>Deterministic policy</td>
              <td>❌ the same four findings</td>
            </tr>
            <tr>
              <td>PR checklist, ADR, dependency review, secret scan</td>
              <td>✅</td>
            </tr>
            <tr>
              <td>gate</td>
              <td>✅ passes, with a warning</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>The gate&apos;s log says why it passed with a red job:</p>
      <Terminal
        commands="# from the gate job's log"
        output={`warning: Process checks failed: policy. This repository is at rung 'observe', which reports and
         does not block. The findings are recorded either way.`}
      />
      <p>
        That is <code>observe</code> doing its job: the finding is visible on the pull request and
        recorded, and nothing is blocked yet. Fill in the pull request&apos;s{" "}
        <code>## Launch readiness</code> checklist honestly: this code skips input validation, so
        that item is false. The template says to delete a false line and explain why, rather than
        tick it.
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
