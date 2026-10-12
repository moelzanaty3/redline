import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  PackageManagerTabs,
  Quiz,
  Tabs,
  type PackageManagerName,
} from "@/components/learn/interactive";
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

const CI_HEAD = `name: CI

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
`;

const SCRIPTS = `scripts.build=tsc "scripts.test=tsc && node --test dist/*.test.js"`;

type PackageManager = {
  name: PackageManagerName;
  setup: string;
  setupNote: ReactNode;
  scripts: string;
  test: string;
  ci: string;
};

// Every one runs the same compiled tests with Node's test runner; only how the
// project is created, installed and run in CI differs.
const PACKAGE_MANAGERS: PackageManager[] = [
  {
    name: "pnpm",
    setup: `git init
pnpm init
pnpm add -D typescript@5 @types/node@22`,
    setupNote: (
      <>
        <code>pnpm init</code> writes <code>package.json</code>, already marked{" "}
        <code>&quot;type&quot;: &quot;module&quot;</code> so the code uses <code>import</code> and{" "}
        <code>export</code>.
      </>
    ),
    scripts: `pnpm pkg set ${SCRIPTS}`,
    test: "pnpm test",
    ci: `      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
`,
  },
  {
    name: "npm",
    setup: `git init
npm init -y
npm install -D typescript@5 @types/node@22`,
    setupNote: (
      <>
        <code>npm init -y</code> writes <code>package.json</code> with every default accepted.
      </>
    ),
    scripts: `npm pkg set type=module ${SCRIPTS}`,
    test: "npm test",
    ci: `      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
`,
  },
  {
    name: "yarn",
    setup: `git init
yarn init -y
yarn add -D typescript@5 @types/node@22`,
    setupNote: (
      <>
        <code>yarn init -y</code> writes <code>package.json</code>, and a <code>.gitignore</code>{" "}
        you will add to in step 4.
      </>
    ),
    scripts: `npm pkg set type=module ${SCRIPTS}`,
    test: "yarn test",
    ci: `      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: yarn
      - run: yarn install --immutable
      - run: yarn test
`,
  },
  {
    name: "bun",
    setup: `git init
bun add -d typescript@5 @types/node@22`,
    setupNote: (
      <>
        <code>bun add</code> writes <code>package.json</code> when there is none. Skip{" "}
        <code>bun init</code>: it adds a starter project you don&apos;t need here.
      </>
    ),
    scripts: `npm pkg set name=redline-demo type=module ${SCRIPTS}`,
    test: "bun run test",
    ci: `      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: bun install --frozen-lockfile
      - run: bun run test
`,
  },
];

function variants(render: (pm: PackageManager) => ReactNode) {
  const panels = PACKAGE_MANAGERS.map((pm) => ({ name: pm.name, content: render(pm) }));
  return <PackageManagerTabs panels={panels} />;
}

function BuildByHand() {
  return (
    <>
      <h3>1. A project that uses TypeScript</h3>
      <p>
        In an empty folder, start a git repository and a package, then add the TypeScript compiler
        and Node&apos;s type definitions. The versions match the demo, so your output matches the
        lessons.
      </p>
      {variants((pm) => (
        <>
          <Terminal commands={pm.setup} />
          <p>{pm.setupNote}</p>
        </>
      ))}

      <h3>2. Scripts to build and test</h3>
      {variants((pm) => (
        <>
          <Terminal commands={pm.scripts} />
          {pm.name === "yarn" || pm.name === "bun" ? (
            <p>
              <code>npm pkg</code> only edits <code>package.json</code>; npm comes with Node, so it
              is already there.
            </p>
          ) : null}
        </>
      ))}
      <p>
        The test script compiles <code>src/</code> into <code>dist/</code>, then runs every compiled
        test file with the test runner built into Node. No test framework to install.
      </p>

      <h3>3. Tell the compiler how strict to be</h3>
      <File name="tsconfig.json" text={TSCONFIG} />
      <p>
        <code>strict</code> turns on every standard check. <code>noUncheckedIndexedAccess</code>{" "}
        goes further: reading <code>list[0]</code> gives a value that may be <code>undefined</code>,
        and the compiler makes you check. Redline&apos;s rules assume both are on.
      </p>

      <h3>4. Keep build output out of git</h3>
      <p>
        Create <code>.gitignore</code>, or add these lines if your package manager already made one:
      </p>
      <File name=".gitignore" text={"node_modules/\ndist/\n"} />

      <h3>5. The service</h3>
      <File name="src/users.ts" text={USERS} />
      <p>
        A user directory that adds users and finds them by id, and refuses the same id twice. Small
        on purpose: later steps add code to it, and Redline reviews that code.
      </p>

      <h3>6. Its tests</h3>
      <File name="src/users.test.ts" text={USERS_TEST} />
      <p>
        The import says <code>./users.js</code>, not <code>.ts</code>: the test runs after
        compiling, when the file next to it is JavaScript.
      </p>
      {variants((pm) => (
        <Terminal commands={pm.test} output={TESTS} />
      ))}

      <h3>7. CI that runs the tests on GitHub</h3>
      {variants((pm) => (
        <File name=".github/workflows/ci.yml" text={CI_HEAD + pm.ci} />
      ))}
      <p>
        On every push to <code>main</code> and every pull request, GitHub installs the exact
        versions in your lockfile and runs the tests. It only runs once the repository is on GitHub,
        which is the next thing you do.
      </p>

      <h3>8. Commit</h3>
      <Terminal
        commands={`git add -A
git commit -m "chore: a TypeScript service with tests and CI"`}
      />
      <p>
        The repository is yours alone: nothing connects it to the demo. When a later step needs one
        of the demo&apos;s larger files, like a 249-country table, it downloads that file directly.
      </p>
    </>
  );
}

export default function Page() {
  return (
    <LearnPage
      slug="starting-point"
      intro="Every later step changes one small repository. Get its starting files into a repository of your own, and see what it holds before Redline arrives."
      learn={[
        "What the demo service is, and what its CI checks before Redline",
        "How to get the starter files: downloaded, or built by hand file by file",
        "How to put them in a GitHub repository of your own",
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
                  Or, in an empty folder, unpack it straight into a repository of your own. Skip{" "}
                  <code>git init</code> if you have already run it.
                </p>
                <Terminal
                  commands={`git init
curl -L ${DEMO_URL}/archive/refs/tags/step-00.tar.gz | tar -xz --strip-components=1
git add -A
git commit -m "chore: start from the Redline demo, step 00"
pnpm install
pnpm test`}
                  output={TESTS}
                />
                <p>
                  That copies the files, not the demo&apos;s history: the repository is yours alone,
                  with nothing connecting it to the demo. The download comes set up for pnpm; to use
                  another package manager, build it by hand.
                </p>
              </>
            ),
          },
          {
            label: "Build it by hand",
            content: (
              <>
                <p>
                  Where a command depends on your package manager, pick yours; every switcher on the
                  page follows. Every later step uses pnpm, so with another one, swap
                  the command: <code>pnpm add</code> is <code>npm install</code>,{" "}
                  <code>yarn add</code> or <code>bun add</code>, and <code>pnpm test</code> is{" "}
                  <code>npm test</code>, <code>yarn test</code> or <code>bun run test</code>.
                </p>
                <BuildByHand />
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

      <h2>Put your repository on GitHub</h2>
      <p>
        The checks Redline adds run on pull requests, so your repository needs to be on GitHub.
        From its root, with the{" "}
        <a href="https://cli.github.com" rel="noopener noreferrer" target="_blank">
          GitHub CLI
        </a>{" "}
        signed in (<code>gh auth login</code>):
      </p>
      <Terminal commands="gh repo create my-redline-demo --public --source . --remote origin --push" />
      <p>
        That creates a new repository under your own account and pushes your <code>main</code> to
        it. Everything from here on happens there; the demo is only ever read from.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Make it <b>public</b>. Dependency review and secret scanning, which step 06 relies on, are
          free on public repositories and need GitHub Advanced Security on private ones. From here
          on, merge each step&apos;s pull request before you start the next, and branch from an
          up-to-date <code>main</code>.
        </p>
      </div>

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
