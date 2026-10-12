import type { Metadata } from "next";
import { Quiz } from "@/components/learn/interactive";
import { LearnPage, Terminal } from "@/components/learn/parts";
import { DEMO_URL } from "@/lib/learn";

export const metadata: Metadata = { title: "Learn: the starting point" };

const TESTS = `ℹ pass 2
ℹ fail 0`;

export default function Page() {
  return (
    <LearnPage
      slug="starting-point"
      intro="Every later step changes one small repository. Get its starting files into a repository of your own, and see what it holds before Redline arrives."
      learn={[
        "What the demo service is, and what its CI checks before Redline",
        "How to get the starter files into your own repository",
        "When you need GitHub, and when your machine is enough",
      ]}
    >
      <h2>Get the starter files</h2>
      <p>
        Step 00 is a small TypeScript service with two tests and a CI workflow, and nothing from
        Redline yet. Look at it on GitHub, or download it:
      </p>
      <p className="learn-get">
        <a
          className="learn-path-go"
          href={`${DEMO_URL}/tree/step-00`}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open step 00 on GitHub
        </a>
        <a
          className="learn-get-alt"
          href={`${DEMO_URL}/archive/refs/tags/step-00.zip`}
          rel="noopener noreferrer"
        >
          Download .zip
        </a>
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <code>step-00</code> is a <b>tag</b>, not a branch. Searching the branch list on GitHub
          finds nothing; open the <b>Tags</b> tab in the same menu, or use the link above.
        </p>
      </div>

      <h2>Put them in your own repository</h2>
      <p>
        In an empty folder, run the commands below. You need{" "}
        <a href="https://git-scm.com/downloads" rel="noopener noreferrer" target="_blank">git</a>,{" "}
        <a href="https://nodejs.org" rel="noopener noreferrer" target="_blank">Node</a> 18.11 or later
        and{" "}
        <a href="https://pnpm.io/installation" rel="noopener noreferrer" target="_blank">pnpm</a>.
        Skip <code>git init</code> if you have already run it.
      </p>
      <Terminal
        commands={`git init
git remote add demo ${DEMO_URL}.git
git fetch demo --tags
git checkout -B main step-00
pnpm install
pnpm test`}
        output={TESTS}
      />
      <p>
        That is the whole setup: your <code>main</code> now holds the step 00 files. The demo stays
        connected as a remote called <code>demo</code>, with every step&apos;s tag, so later steps can
        copy its larger files instead of making you type 249 countries.
      </p>
      <p>
        <code>pnpm: command not found</code>? Install it with <code>npm install -g pnpm</code>. You
        never install Redline itself: every command runs it through <code>npx</code>, so you always
        get the current version.
      </p>

      <h2>Push it to GitHub when you need to</h2>
      <p>
        Steps 01 to 04 work entirely on your machine. From step 05 on, the lessons are about the
        checks that run on a pull request, so your repository needs to be on GitHub. Do it now or
        when you get there, with the{" "}
        <a href="https://cli.github.com" rel="noopener noreferrer" target="_blank">GitHub CLI</a>{" "}
        signed in (<code>gh auth login</code>):
      </p>
      <Terminal commands="gh repo create redline-demo --public --source . --remote origin --push" />
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Make it <b>public</b>. Dependency review and secret scanning, which step 06 relies on, are
          free on public repositories and need GitHub Advanced Security on private ones. Merge each
          step&apos;s pull request before you start the next, and branch from an up-to-date{" "}
          <code>main</code>.
        </p>
      </div>
      <p>
        Rather just read? Each step links the demo&apos;s pull request and tag, so you can see the
        files, checks and logs the gate really produced without running anything.
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
