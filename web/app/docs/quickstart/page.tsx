import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { PackageBadge } from "@/components/package-badge";
import { browserRegistry, installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Quick start" };

const DEMO = "https://github.com/moelzanaty3/redline-demo";

// Commands are copied as one block; output is shown dimmed under them and is
// never part of what the Copy button puts on the clipboard.
function Terminal({ commands, output }: { commands: string; output?: string }) {
  return (
    <CodeWindow title="terminal" copyText={commands}>
      {commands.split("\n").map((line, i) => (
        <span key={i}>
          {line.startsWith("#") ? (
            <span className="tk-dim">{line}</span>
          ) : (
            <>
              <span className="tk-prompt">$</span> <span className="tk-white">{line}</span>
            </>
          )}
          {"\n"}
        </span>
      ))}
      {output ? <span className="tk-dim">{`\n${output}`}</span> : null}
    </CodeWindow>
  );
}

function File({ name, text }: { name: string; text: string }) {
  return (
    <CodeWindow title={name} copyText={text}>
      <span className="tk-white">{text}</span>
    </CodeWindow>
  );
}

function SeeIt({ tag, pr }: { tag: string; pr?: number }) {
  return (
    <p>
      <b>See it in the demo:</b> <code>git checkout {tag}</code>
      {pr ? (
        <>
          {" "}· pull request{" "}
          <a href={`${DEMO}/pull/${pr}`} rel="noopener noreferrer" target="_blank">
            #{pr}
          </a>
        </>
      ) : null}
    </p>
  );
}

const STEPS = [
  { n: "00", title: "The starting point", learn: "a small TypeScript service with tests and CI, before Redline" },
  { n: "01", title: "Onboard", learn: "one command adds the rules, the review commands and a merge gate" },
  { n: "02", title: "Your first finding", learn: "four broken rules, caught on your machine and in the pipeline" },
  { n: "03", title: "Explain and fix", learn: "why a rule exists, and fixing the code instead of silencing it" },
  { n: "04", title: "A team rule", learn: "your team's own rule, in every assistant and in the review" },
  { n: "05", title: "A big change needs an ADR", learn: "past 300 lines, write the decision down" },
  { n: "06", title: "The security floor", learn: "a vulnerable dependency fails the gate at every rung" },
  { n: "07", title: "Make the gate required", learn: "a red gate disables the merge button" },
  { n: "08", title: "Exemptions", learn: "merge past a failing check, on the record" },
  { n: "09", title: "Earn a stricter rung", learn: "blocking is earned with evidence, never switched on" },
];

const USER_TS = `type User = { id: string; name: string }

// TODO: handle retries
export function loadUser(raw: string) {
  // @ts-ignore
  return JSON.parse(raw) as unknown as User
}

export type Payload = unknown
`;

const USER_FIXED_TS = `export type User = { id: string; name: string }

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

export function loadUser(raw: string): User {
  const parsed: unknown = JSON.parse(raw)
  if (!isUser(parsed)) throw new Error('payload is not a User')
  return parsed
}
`;

const LOCAL_MD = `## Errors are returned, not logged

This service is a library: the code that calls it decides what to log and where.

- \`local/no-console\` — No \`console.*\` calls in \`src/\`. Throw an \`Error\` with a message that says what was wrong, and let the caller log it.
`;

const EXEMPTION = `## Redline exemption

- reason: parseUser replaces loadUser with no alias, so a consumer that upgrades cannot roll back without renaming its import again. Nothing outside this repository imports it yet.
- until: YYYY-MM-DD
- scope: checklist
`;

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <DocsPage
      crumb="Getting Started"
      title="Quick start"
      intro="Take a small TypeScript service from no Redline to a merge gate that has earned its rung. Ten short steps. Each one is a commit and a pull request in a real repository you can open, so you can read along or build it yourself."
      href="/docs/quickstart"
    >
      <PackageBadge initial={state} registry={browserRegistry()} />

      <div className="callout ok">
        <span className="ic">✓</span>
        <div>
          <p>
            <b>You will learn</b>
          </p>
          <ul>
            <li>How to onboard a repository with one command</li>
            <li>How to read a finding, ask why the rule exists, and fix it properly</li>
            <li>How to add your team&apos;s own rules</li>
            <li>What the merge gate checks, and which failures nothing can waive</li>
            <li>How to merge past a check on the record, with an exemption</li>
            <li>How a repository earns blocking enforcement</li>
          </ul>
        </div>
      </div>

      <h2>What you are building</h2>
      <p>
        <a href={DEMO} rel="noopener noreferrer" target="_blank">
          redline-demo
        </a>{" "}
        is a tiny user and address service. Every step below is one pull request
        there, merged into <code>main</code> and tagged <code>step-NN</code>, so{" "}
        <code>git log --first-parent main</code> reads like this page:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>What you will see</th>
            </tr>
          </thead>
          <tbody>
            {STEPS.map((s) => (
              <tr key={s.n}>
                <td>
                  <a href={`#step-${s.n}-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`}>
                    {s.n} · {s.title}
                  </a>
                </td>
                <td>{s.learn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Setup</h2>
      <p>
        You need <a href="https://nodejs.org" rel="noopener noreferrer" target="_blank">Node</a>{" "}
        18.11 or later,{" "}
        <a href="https://pnpm.io/installation" rel="noopener noreferrer" target="_blank">pnpm</a>,{" "}
        <a href="https://git-scm.com/downloads" rel="noopener noreferrer" target="_blank">git</a>{" "}
        and the{" "}
        <a href="https://cli.github.com" rel="noopener noreferrer" target="_blank">GitHub CLI</a>,
        signed in with <code>gh auth login</code>. <b>You do not install Redline</b>: every
        command runs it with <code>npx</code>.
      </p>

      <h3>Option 1: read along</h3>
      <p>Clone the finished repository and check out any step to see exactly what it held.</p>
      <Terminal
        commands={`git clone ${DEMO}.git
cd redline-demo
git checkout step-00
pnpm install
pnpm test`}
      />

      <h3>Option 2: build it yourself</h3>
      <p>
        Start your own copy from step 00, on your own GitHub account, and run every
        command below against it. The demo stays connected as a remote called{" "}
        <code>demo</code>, so a step can borrow its larger files.
      </p>
      <Terminal
        commands={`git clone ${DEMO}.git
cd redline-demo
git remote rename origin demo
git checkout -B main step-00
gh repo create redline-demo --public --source . --remote origin --push
pnpm install
pnpm test`}
        output={`ℹ pass 2
ℹ fail 0`}
      />
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          Make it <b>public</b>. Dependency review and secret scanning, which step 06 relies on,
          are free on public repositories and need GitHub Advanced Security on private ones.
          Merge each step&apos;s pull request before you start the next one, and branch from an
          up-to-date <code>main</code>.
        </p>
      </div>

      <h2>Step 00 · The starting point</h2>
      <p>
        A TypeScript service with strict compiler settings, two tests, and a CI workflow that
        runs them. Nothing here knows about Redline. Every later step changes this repository
        and nothing else.
      </p>
      <SeeIt tag="step-00" />

      <h2>Step 01 · Onboard</h2>
      <p>One command, from the repository root:</p>
      <Terminal
        commands={rl("init --gate-source local")}
        output={`  profile tooling
  Files  21 written
   + AGENTS.md
   + CLAUDE.md
   + .github/copilot-instructions.md
   + .github/workflows/redline.yml
   + .github/workflows/redline-gate.yml
   + .redline.json
   …
  Repository settings  6 in place · 1 unavailable
   ✓ applied     secret-scanning    secret scanning
   ✓ applied     dependency-alerts  dependabot alerts (vulnerability alerts)
   ✓ applied     merge-policy       branch ruleset
  Pull request
   https://github.com/<you>/redline-demo/pull/1`}
      />
      <p>It did three things:</p>
      <ul>
        <li>
          <b>Rules for your assistants.</b> <code>AGENTS.md</code>, <code>CLAUDE.md</code>,
          the Copilot instructions and the Cursor rules, read on every request.
        </li>
        <li>
          <b>A merge gate.</b> <code>.github/workflows/redline.yml</code> runs on every pull
          request. <code>--gate-source local</code> keeps the gate inside this repository; a
          real team would reference one from its organisation&apos;s <code>.github</code>{" "}
          repository instead, which a pull request cannot edit.
        </li>
        <li>
          <b>Repository settings.</b> Secret scanning, push protection, Dependabot alerts, and
          a branch ruleset on <code>main</code> that requires a pull request and no approving
          review. Redline fails the pipeline; whether a person must also approve is your choice
          (<code>--approvals &lt;n&gt;</code>).
        </li>
      </ul>
      <p>
        It committed all of it on a branch and opened the pull request itself. Merge it.
      </p>
      <SeeIt tag="step-01" pr={1} />

      <h2>Step 02 · Your first finding</h2>
      <p>
        Write the kind of code an assistant produces when told to make a type error go away.
        It compiles, and the tests still pass:
      </p>
      <Terminal commands={`git checkout -b feat/load-user`} />
      <File name="src/user.ts" text={USER_TS} />
      <p>Ask Redline before you push:</p>
      <Terminal
        commands={`git add src/user.ts
${rl("review")}`}
        output={`profile tooling — rules in scope: core, typescript
src/user.ts:3
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it.
src/user.ts:5
  Redline/BLOCKER [core/type-checker-suppression]: a type-checker suppression needs an inline explanation AND a ticket reference on the same line.
src/user.ts:6
  Redline/BLOCKER [core/unsafe-assertion]: a double assertion overrides the type checker with no stated reason.
src/user.ts:9
  Redline/HIGH [typescript/unknown-type-alias]: this alias names \`unknown\`, so it reads as a contract it is not.
4 finding(s)`}
      />
      <p>
        Every finding names a <b>severity</b> (<code>BLOCKER</code> must not merge,{" "}
        <code>HIGH</code> is a deliberate trade-off), a <b>rule id</b> in brackets, and the
        problem. No model was called: these four rules are decided by a checker.
      </p>
      <p>Push it and open a pull request anyway, to see the pipeline:</p>
      <Terminal
        commands={`git commit -m "feat: load a user from JSON"
git push -u origin feat/load-user
gh pr create --fill`}
      />
      <p>
        <b>Deterministic policy</b> fails with the same four findings, and the <b>gate</b>{" "}
        still passes. Every repository starts at the <code>observe</code> rung: Redline
        reports first, so a team sees what it would block before anything is blocked.
      </p>
      <SeeIt tag="step-02" pr={2} />

      <h2>Step 03 · Explain and fix</h2>
      <p>Take any rule id from a finding and ask what it means:</p>
      <Terminal
        commands={rl("explain core/unsafe-assertion")}
        output={`BLOCKER core/unsafe-assertion

  No unsafe assertions (\`as unknown as X\`, force casts) used to silence an error. …

  decided by   a checker, with no model call
  defined in   standards/core.md:87`}
      />
      <p>
        Then fix the code rather than the symptom: check the parsed JSON with a type predicate,
        and there is nothing left to assert or suppress.
      </p>
      <File name="src/user.ts" text={USER_FIXED_TS} />
      <Terminal
        commands={`git add src/user.ts
${rl("review")}`}
        output={`profile tooling — rules in scope: core, typescript
no findings`}
      />
      <p>Push it; every check on the pull request goes green.</p>
      <SeeIt tag="step-03" pr={3} />

      <h2>Step 04 · A team rule</h2>
      <p>
        The org standard covers what every repository shares. Your team&apos;s own rules go in
        one file:
      </p>
      <File name=".redline/local.md" text={LOCAL_MD} />
      <Terminal commands={rl("init --no-commit")} />
      <p>
        Redline renders the rule into every assistant file, under a{" "}
        <code># Repository-local rules</code> heading, and into the prompt{" "}
        <code>/redline-review</code> uses. A team rule is prose, so a model applies it: add a{" "}
        <code>console.log</code> to <code>src/</code> and run <code>/redline-review</code> in
        Claude Code, Copilot or Cursor to see <code>[local/no-console]</code>.
      </p>
      <SeeIt tag="step-04" pr={4} />

      <h2>Step 05 · A big change needs an ADR</h2>
      <p>
        Large changes usually carry a decision. Past 300 changed lines, the gate asks for an
        Architecture Decision Record linked from the pull request. Borrow the demo&apos;s
        address parser and its 249-country table:
      </p>
      <Terminal
        commands={`git checkout -b feat/addresses
git checkout step-05 -- src/countries.ts src/countries.test.ts src/address.ts src/address.test.ts
pnpm test
git commit -m "feat: parse addresses, with the country checked against ISO 3166"
git push -u origin feat/addresses
gh pr create --fill`}
        output={`changed=352 threshold=300 adr-links=0 no-adr-label=0
Error: 352 changed lines with no ADR link.`}
      />
      <p>
        Write the decision down (context, options, choice, consequences) in{" "}
        <code>docs/adr/0001-country-list-in-code.md</code>, commit it, and add a link to it
        under <code>## Architecture decision</code> in the pull request description. Editing the
        description re-runs the gate. A large change that makes no decision, such as a
        generated lockfile, takes the <code>no-adr</code> label instead.
      </p>
      <SeeIt tag="step-05" pr={5} />

      <h2>Step 06 · The security floor</h2>
      <p>
        So far every failure was soft: reported, not blocking. Dependency review and the secret
        scan are different. They fail the gate at every rung, and no label waives them.
      </p>
      <Terminal
        commands={`git checkout -b feat/directory
pnpm add lodash@4.17.20 --save-exact
pnpm add -D @types/lodash
git checkout step-06 -- src/directory.ts src/directory.test.ts
git add -A && git commit -m "feat: group countries by initial"
git push -u origin feat/directory
gh pr create --fill`}
        output={`package.json » lodash@4.17.20 – Command Injection in lodash (high severity)
Error: Redline gate failed on security checks (not label-exemptible,
       and not on the enforcement ladder): dependency-review`}
      />
      <p>
        Try <code>gh pr edit --add-label redline-exempt</code>: the gate notices the label and
        fails anyway. The fix is the upgrade:
      </p>
      <Terminal
        commands={`pnpm add lodash@4.18.1 --save-exact
git commit -am "fix(deps): lodash 4.18.1"
git push`}
      />
      <SeeIt tag="step-06" pr={6} />

      <h2>Step 07 · Make the gate required</h2>
      <p>
        A red gate has been advice so far: GitHub still let you merge. Make it a required check:
      </p>
      <Terminal
        commands={`git checkout main && git pull
${rl("init --blocking")}`}
        output={`   ✓ applied     merge-policy       branch ruleset
  Pull request
   https://github.com/<you>/redline-demo/pull/<n>`}
      />
      <p>
        The ruleset on <code>main</code> now requires <code>redline-gate / gate</code>, for
        everyone, admins included. Push the vulnerable lodash pin to that pull request and{" "}
        <code>gh pr view --json mergeStateStatus</code> says <code>BLOCKED</code>; revert it and
        it says <code>CLEAN</code>. At <code>observe</code> only the security floor turns the
        gate red, so this changes nothing for a broken rule yet.
      </p>
      <SeeIt tag="step-07" pr={12} />

      <h2>Step 08 · Exemptions</h2>
      <p>
        Sometimes a check is right and you merge anyway, on purpose. Rename{" "}
        <code>loadUser</code> to <code>parseUser</code> with no alias: that breaks anyone
        importing it, so the checklist item <i>Rollback is safe</i> stays honestly unticked and{" "}
        <b>PR checklist</b> fails.
      </p>
      <p>
        A <code>redline-exempt</code> label alone records nothing, and the gate says so. Add
        this to the pull request description as well:
      </p>
      <File name="pull request description" text={EXEMPTION} />
      <p>Check it on your machine first, against the check that is failing:</p>
      <Terminal
        commands={`gh pr view --json body --jq .body > body.md
${rl("exempt --body-file body.md --scope checklist")}`}
        output={`exempt until YYYY-MM-DD (checklist): parseUser replaces loadUser with no alias, …`}
      />
      <p>
        Set <code>until</code> to a real date. The reason needs 20 characters or more, the expiry must be within 90 days, and the
        scope names the checks it covers. An exemption never covers the security floor. At{" "}
        <code>observe</code> it changes the record, not the merge; once a repository blocks, it
        is the only way past a failing process check.
      </p>
      <SeeIt tag="step-08" pr={14} />

      <h2>Step 09 · Earn a stricter rung</h2>
      <p>
        Blocking on findings is not a setting you flip. The ladder runs{" "}
        <code>observe → block-blocker → block-high</code>, and each rung asks for a measurement:
      </p>
      <Terminal
        commands={`${rl("evidence")}
${rl("evidence record --sample-size 7 --acted-on-rate 1 \\")}
  --source "PRs #2-#6, #12, #14: the gate ran on each; all 4 findings on #2 were fixed in #3"
${rl("init --rung block-blocker --no-commit")}`}
        output={`  ▲ enforcement stays at observe — cannot move to block-blocker:
  ▲ 20 reviewed pull requests are needed and 7 have been recorded
  ▲ the seeded corpus has never been scored for this stack, so there is no
    evidence the reviewer catches known defects at all
  ▲ the clean corpus has never been scored, so nothing shows the reviewer stays
    quiet on correct code`}
      />
      <p>
        That refusal is the point. Before Redline may stop a merge on its findings, it must
        catch every known defect in a seeded corpus, flag nothing in a clean one, and show 20
        pull requests of people agreeing with what it found. The evidence is recorded in{" "}
        <code>.redline.json</code> with its source, and is reviewed like any other change.
        Stepping down never needs evidence: <code>--rung observe</code> always works.
      </p>
      <SeeIt tag="step-09" pr={15} />

      <h2>Wrapping up</h2>
      <p>You took one repository through everything Redline does:</p>
      <ul>
        <li>The same rules reach your assistant, your terminal and the pull request.</li>
        <li>
          Findings name a rule you can look up, and a fix that removes the problem rather than
          the warning.
        </li>
        <li>The security floor blocks from day one, and nothing waives it.</li>
        <li>Everything else reports first, and blocks only once the evidence says it is right.</li>
        <li>Merging past a check is allowed, and written down: who, why, until when.</li>
      </ul>

      <h2>Next steps</h2>
      <ul>
        <li>
          <Link href="/docs/onboarding">Onboard a repository</Link>: your own, with the options
          this walkthrough skipped.
        </li>
        <li>
          <Link href="/docs/tutorial">Tutorial</Link>: the same first finding on a throwaway
          repository on your machine, with no GitHub needed.
        </li>
        <li>
          <Link href="/docs/enforcement">Enforcement ladder</Link> and{" "}
          <Link href="/docs/exemptions">Exemptions</Link>: the rules behind steps 08 and 09.
        </li>
        <li>
          <Link href="/docs/troubleshooting">Troubleshooting</Link>: every failure that actually
          happens, and the command that resolves it.
        </li>
      </ul>
    </DocsPage>
  );
}
