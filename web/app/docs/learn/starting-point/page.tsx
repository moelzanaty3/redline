import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { LearnPage, Terminal } from "@/components/learn/parts";
import { DEMO_URL } from "@/lib/learn";

export const metadata: Metadata = { title: "Learn: the starting point" };

const TESTS = `ℹ pass 2
ℹ fail 0`;

export default function Page() {
  return (
    <LearnPage
      slug="starting-point"
      intro="Every later step changes one small repository, so start by getting it on your machine and seeing what it holds before Redline arrives."
      learn={[
        "What the demo service is, and what its CI checks before Redline",
        "Which of the three ways of following along suits you",
        "How to see the repository exactly as it was at any step",
      ]}
    >
      <h2>Choose how to follow along</h2>
      <p>
        Pick one. You can switch later: every step says where it needs GitHub.
      </p>
      <Tabs
        label="How to follow along"
        tabs={[
          {
            label: "Read along",
            content: (
              <>
                <p>
                  Clone the finished demo. Each step is a tag, so <code>git checkout step-NN</code>{" "}
                  shows the repository exactly as that step left it. You need{" "}
                  <a href="https://git-scm.com/downloads" rel="noopener noreferrer" target="_blank">git</a>,{" "}
                  <a href="https://nodejs.org" rel="noopener noreferrer" target="_blank">Node</a> 18.11 or later
                  and{" "}
                  <a href="https://pnpm.io/installation" rel="noopener noreferrer" target="_blank">pnpm</a>.
                </p>
                <Terminal
                  commands={`git clone ${DEMO_URL}.git
cd redline-demo
git checkout step-00
pnpm install
pnpm test`}
                  output={TESTS}
                />
                <p>
                  Each step page links the demo&apos;s pull request for that step, so you can read the
                  checks and logs the gate really produced.
                </p>
              </>
            ),
          },
          {
            label: "Build it on GitHub",
            content: (
              <>
                <p>
                  Make your own copy, starting at step 00, and run every command yourself. On top of
                  git, Node and pnpm you need the{" "}
                  <a href="https://cli.github.com" rel="noopener noreferrer" target="_blank">GitHub CLI</a>,
                  signed in with <code>gh auth login</code>.
                </p>
                <Terminal
                  commands={`git clone ${DEMO_URL}.git
cd redline-demo
git remote rename origin demo
git checkout -B main step-00
gh repo create redline-demo --public --source . --remote origin --push
pnpm install
pnpm test`}
                  output={TESTS}
                />
                <p>
                  The demo stays connected as a remote called <code>demo</code>, so later steps can
                  borrow its larger files instead of making you type 249 countries.
                </p>
                <div className="callout info">
                  <span className="ic">ℹ</span>
                  <p>
                    Make it <b>public</b>. Dependency review and secret scanning, which step 06 relies
                    on, are free on public repositories and need GitHub Advanced Security on private
                    ones. Merge each step&apos;s pull request before you start the next, and branch
                    from an up-to-date <code>main</code>.
                  </p>
                </div>
              </>
            ),
          },
          {
            label: "Only on my machine",
            content: (
              <>
                <p>
                  No GitHub account needed. Take step 00 and disconnect it from the demo, so nothing
                  you do can be pushed anywhere:
                </p>
                <Terminal
                  commands={`git clone ${DEMO_URL}.git
cd redline-demo
git checkout -B main step-00
git remote remove origin
pnpm install
pnpm test`}
                  output={TESTS}
                />
                <p>
                  With no remote, Redline installs what works on your machine: the rules for your
                  assistant and the local review. Steps 01 to 04 work fully this way. From step 05 on,
                  the lessons are about the pipeline, so switch to reading along.
                </p>
              </>
            ),
          },
        ]}
      />
      <p>
        <code>pnpm: command not found</code>? Install it with <code>npm install -g pnpm</code>, or
        see{" "}
        <a href="https://pnpm.io/installation" rel="noopener noreferrer" target="_blank">pnpm.io</a>.
        You never install Redline itself: every command runs it through <code>npx</code>, so you
        always get the current version.
      </p>

      <h2>What is in the repository</h2>
      <p>A small user directory, the kind of service a team writes in its first week:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th>What it is</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>src/users.ts</td>
              <td>A <code>UserDirectory</code> that adds and finds users</td>
            </tr>
            <tr>
              <td>src/users.test.ts</td>
              <td>Two tests, using Node&apos;s built-in test runner</td>
            </tr>
            <tr>
              <td>tsconfig.json</td>
              <td>Strict TypeScript, including <code>noUncheckedIndexedAccess</code></td>
            </tr>
            <tr>
              <td>.github/workflows/ci.yml</td>
              <td>Installs with pnpm, compiles and runs the tests on every push and pull request</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What nothing checks yet</h2>
      <p>
        CI compiles the code and runs the tests, and that is all. Nothing checks <i>how</i> the code is written: a{" "}
        <code>@ts-ignore</code>, a hardcoded token or a dependency with a known vulnerability would
        all pass, as long as the tests do. And nothing tells a coding assistant what this team
        expects, so it guesses. Step 01 fixes both with one command.
      </p>

      <Quiz
        question={
          <>
            In step 00, a pull request adds <code>// @ts-ignore</code> above a line that does not
            compile. What happens?
          </>
        }
        options={[
          {
            text: "CI fails, because the type checker catches it",
            why: "CI does run the compiler (pnpm test starts with tsc), but @ts-ignore exists to make the compiler look away. It succeeds, so CI is green.",
          },
          {
            text: "Nothing: it compiles and the tests pass, so CI is green",
            correct: true,
            why: "That is the gap. Before Redline, nothing in this repository looks at how the code is written, only at whether it compiles and the tests pass.",
          },
          {
            text: "GitHub warns about it on the pull request",
            why: "GitHub has no opinion about @ts-ignore on its own. Something has to be told the rule first, which is what onboarding does.",
          },
        ]}
      />
    </LearnPage>
  );
}
