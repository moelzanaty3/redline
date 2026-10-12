import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, Terminal } from "@/components/learn/parts";
import { DEMO_URL } from "@/lib/learn";

export const metadata: Metadata = { title: "Learn: the starting point" };

const TESTS = `ℹ pass 2
ℹ fail 0`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
`;

const USERS = `export type User = { id: string; name: string; email: string }

export class UserDirectory {
  private readonly users = new Map<string, User>()

  add(user: User): void {
    if (this.users.has(user.id)) throw new Error(\`user \${user.id} already exists\`)
    this.users.set(user.id, user)
  }

  find(id: string): User | undefined {
    return this.users.get(id)
  }

  count(): number {
    return this.users.size
  }
}
`;

const USERS_TEST = `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UserDirectory } from './users.js'

test('a user that was added can be found', () => {
  const directory = new UserDirectory()
  directory.add({ id: 'u1', name: 'Ada', email: 'ada@example.com' })
  assert.equal(directory.find('u1')?.name, 'Ada')
})

test('the same id cannot be added twice', () => {
  const directory = new UserDirectory()
  directory.add({ id: 'u1', name: 'Ada', email: 'ada@example.com' })
  assert.throws(() => directory.add({ id: 'u1', name: 'Grace', email: 'grace@example.com' }))
})
`;

const CI = `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
`;

export default function Page() {
  return (
    <LearnPage
      slug="starting-point"
      intro="Every later step changes one small repository. Get its starting files into a repository of your own, and see what it holds before Redline arrives."
      learn={[
        "What the demo service is, and what its CI checks before Redline",
        "How to get the starter files: downloaded, or built by hand file by file",
        "When you need GitHub, and when your machine is enough",
      ]}
    >
      <h2>Get the starter files</h2>
      <p>
        Step 00 is a small TypeScript service with two tests and a CI workflow, and nothing from
        Redline yet. Download it in one go, or build it yourself file by file and see what each
        piece is for. You need{" "}
        <a href="https://git-scm.com/downloads" rel="noopener noreferrer" target="_blank">git</a>,{" "}
        <a href="https://nodejs.org" rel="noopener noreferrer" target="_blank">Node</a> 18.11 or later
        and{" "}
        <a href="https://pnpm.io/installation" rel="noopener noreferrer" target="_blank">pnpm</a>{" "}
        either way.
      </p>
      <Tabs
        label="How to get the starter files"
        tabs={[
          {
            label: "Download it",
            content: (
              <>
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
                    <code>step-00</code> is a <b>tag</b>, not a branch. Searching the branch list on
                    GitHub finds nothing; open the <b>Tags</b> tab in the same menu, or use the link
                    above.
                  </p>
                </div>
                <p>
                  To put it in a repository of your own, run this in an empty folder. Skip{" "}
                  <code>git init</code> if you have already run it.
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
                  Your <code>main</code> now holds the step 00 files. The demo stays connected as a
                  remote called <code>demo</code>, with every step&apos;s tag, so later steps can copy
                  its larger files instead of making you type 249 countries.
                </p>
              </>
            ),
          },
          {
            label: "Build it by hand",
            content: (
              <>
                <h3>1. A project that uses TypeScript</h3>
                <p>
                  In an empty folder, start a git repository and a package, then add the TypeScript
                  compiler and Node&apos;s type definitions. The versions match the demo, so your
                  output matches the lessons.
                </p>
                <Terminal
                  commands={`git init
pnpm init
pnpm add -D typescript@5 @types/node@22`}
                />
                <p>
                  <code>pnpm init</code> writes <code>package.json</code>, already marked{" "}
                  <code>&quot;type&quot;: &quot;module&quot;</code> so the code uses{" "}
                  <code>import</code> and <code>export</code>.
                </p>

                <h3>2. Scripts to build and test</h3>
                <Terminal
                  commands={`pnpm pkg set scripts.build=tsc "scripts.test=tsc && node --test dist/*.test.js"`}
                />
                <p>
                  <code>pnpm test</code> now compiles <code>src/</code> into <code>dist/</code>, then
                  runs every compiled test file with the test runner built into Node. No test
                  framework to install.
                </p>

                <h3>3. Tell the compiler how strict to be</h3>
                <File name="tsconfig.json" text={TSCONFIG} />
                <p>
                  <code>strict</code> turns on every standard check. <code>noUncheckedIndexedAccess</code>{" "}
                  goes further: reading <code>list[0]</code> gives a value that may be{" "}
                  <code>undefined</code>, and the compiler makes you check. Redline&apos;s rules
                  assume both are on.
                </p>

                <h3>4. Keep build output out of git</h3>
                <File name=".gitignore" text={"node_modules/\ndist/\n"} />

                <h3>5. The service</h3>
                <File name="src/users.ts" text={USERS} />
                <p>
                  A user directory that adds users and finds them by id, and refuses the same id
                  twice. Small on purpose: later steps add code to it, and Redline reviews that code.
                </p>

                <h3>6. Its tests</h3>
                <File name="src/users.test.ts" text={USERS_TEST} />
                <p>
                  The import says <code>./users.js</code>, not <code>.ts</code>: the test runs after
                  compiling, when the file next to it is JavaScript.
                </p>
                <Terminal commands="pnpm test" output={TESTS} />

                <h3>7. CI that runs the tests on GitHub</h3>
                <File name=".github/workflows/ci.yml" text={CI} />
                <p>
                  On every push to <code>main</code> and every pull request, GitHub installs the
                  exact versions in <code>pnpm-lock.yaml</code> and runs <code>pnpm test</code>. It
                  only runs once the repository is on GitHub, which is step 05.
                </p>

                <h3>8. Commit, and connect the demo</h3>
                <Terminal
                  commands={`git add -A
git commit -m "chore: a TypeScript service with tests and CI"
git remote add demo ${DEMO_URL}.git
git fetch demo --tags`}
                />
                <p>
                  The demo is connected so later steps can copy its larger files, like a 249-country
                  table, instead of making you type them. It is never pushed to.
                </p>
              </>
            ),
          },
        ]}
      />
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
