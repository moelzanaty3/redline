import type { Metadata } from "next";
import { Quiz, RedlineCode, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: explain and fix" };

const USER_FIXED_TS = `function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'email' in value &&
    typeof value.email === 'string'
  )
}

export function loadUser(raw: string): User {
  const parsed: unknown = JSON.parse(raw)
  if (!isUser(parsed)) throw new Error('payload is not a User')
  return parsed
}

export function requireUser(directory: UserDirectory, id: string): User {
  const user = directory.find(id)
  if (!user) throw new Error('the requested user does not exist')
  return user
}
`;

const USER_TEST_IMPORT = `import { UserDirectory, loadUser, requireUser } from './users.js'`;

const USER_TEST_TS = `test('a valid payload becomes a User', () => {
  const user = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
  assert.deepEqual(loadUser(JSON.stringify(user)), user)
})

test('a payload missing a field is refused', () => {
  assert.throws(() => loadUser('{"id":"u1","name":"Ada"}'), /not a User/)
})

test('a missing user is refused without naming anyone', () => {
  assert.throws(() => requireUser(new UserDirectory(), 'u1'), /^Error: the requested user does not exist$/)
})
`;

const SILENCED_TS = `// SAFETY: trust me
return JSON.parse(raw) as unknown as User`;

export default function Page() {
  return (
    <LearnPage
      slug="explain-and-fix"
      intro="A finding is only useful if you can find out why the rule exists and who decided it. Ask Redline, then fix the code so the problem is gone, not just the warning."
      learn={[
        "How to look up any rule from its id",
        "The difference between fixing a finding and silencing it",
        "How to confirm the fix with the same review",
      ]}
    >
      <h2>Ask why</h2>
      <p>
        Step 02 left findings on your pull request. Before you change any code, find out what
        a rule asks for and why. Take the rule id from the brackets of a finding:
      </p>
      <RedlineTerminal
        commands="{redline} explain core/unsafe-assertion"
        output={`BLOCKER core/unsafe-assertion

  No unsafe assertions (\`as unknown as X\`, force casts) used to silence an error. Where one is
  genuinely required, the justification is a \`SAFETY:\` comment on the same line or the line above,
  stating why the assertion holds (\`// SAFETY: payload parsed by the schema above\`). Any other
  comment does not count.

  decided by   a checker, with no model call
  defined in   standards/core.md:87
  applies to   every file — the core standard is not scoped by stack
  reaches      javascript-typescript, web-react, web-nextjs, … every profile`}
      />
      <ul>
        <li>
          <b>decided by</b> tells you whether a checker or a model applies it, so you know whether
          the result can vary.
        </li>
        <li>
          <b>defined in</b> is where the rule is written down. If you think a rule is wrong, that
          file is where you propose changing it, in a pull request, like code.
        </li>
        <li>
          <RedlineCode args="explain --list" /> prints every rule id.
        </li>
      </ul>
      <Term word="Standard">
        <p>
          The written set of rules, kept in one versioned repository and owned by people, not by a
          tool. Redline renders it into each repository&apos;s assistant files and checks against
          it. Your team can add its own rules on top, which is the next step.
        </p>
      </Term>

      <h2>Fix it, don&apos;t silence it</h2>
      <p>There are two ways to make a finding disappear. Compare them:</p>
      <Tabs
        label="Two ways to make the finding go away"
        tabs={[
          {
            label: "Fix the code",
            content: (
              <>
                <p>
                  Check the parsed JSON with a type predicate. Once the code has proved the value is a{" "}
                  <code>User</code>, there is nothing left to assert or suppress, and the{" "}
                  <code>TODO</code> and the <code>unknown</code> alias go with it. The error in{" "}
                  <code>requireUser</code> stops naming anyone: the caller knows who asked, and
                  decides what is safe to log. In <code>src/users.ts</code>, replace everything you
                  added in step 02 with:
                </p>
                <File name="src/users.ts — replaces the step 02 code" text={USER_FIXED_TS} />
                <p>
                  A payload with a missing field now throws a clear error, at the boundary where it
                  arrived, instead of becoming a <code>User</code> with an <code>undefined</code>{" "}
                  name somewhere far away. Pin all three outcomes with a test. In{" "}
                  <code>src/users.test.ts</code>, change the import line to:
                </p>
                <File name="src/users.test.ts — the import line" text={USER_TEST_IMPORT} />
                <p>and add these at the end:</p>
                <File name="src/users.test.ts — add at the end" text={USER_TEST_TS} />
              </>
            ),
          },
          {
            label: "Silence it",
            content: (
              <>
                <p>
                  The rule allows an assertion with a <code>SAFETY:</code> comment that says why it
                  holds:
                </p>
                <File name="src/users.ts" text={SILENCED_TS} />
                <p>
                  The checker would accept this. But the comment would be false: nothing has checked
                  the payload. <code>SAFETY:</code> is for the rare assertion that is genuinely
                  correct, and a reviewer reading it should be able to verify the reason. A finding
                  that keeps getting silenced with weak reasons is a sign the rule, or the code, needs
                  a conversation.
                </p>
              </>
            ),
          },
        ]}
      />

      <h2>Check it</h2>
      <p>The tests first: the two from step 00 and the three you just added.</p>
      <Terminal commands="pnpm test" output={`ℹ pass 5
ℹ fail 0`} />
      <p>Then the same review that found the problems:</p>
      <RedlineTerminal
        commands={`git add src/users.ts src/users.test.ts
{redline} review`}
        output={`profile javascript-typescript — rules in scope: core, typescript
no findings`}
      />
      <p>
        The checker&apos;s four findings are gone. The fifth, line 30, needs a model, so run{" "}
        <code>/redline-review</code> in your assistant again and expect no{" "}
        <code>[core/customer-data-in-logs]</code> finding: the error no longer names anyone.
      </p>

      <h2>Merge it</h2>
      <p>The fix goes onto the same branch, so it lands in the pull request from step 02:</p>
      <Terminal
        commands={`git commit -m "fix: validate the user payload, and keep personal data out of errors"
git push
gh pr checks --watch`}
        output={`✓  test
✓  redline-gate / Deterministic policy
X  redline-gate / PR checklist                                the box you left unticked
✓  redline-gate / ADR required for significant changes
✓  redline-gate / Dependency review
✓  redline-gate / Secret scan (diff)
✓  redline-gate / gate`}
      />
      <p>
        <code>redline-gate / Deterministic policy</code> is green now. On GitHub, tick the
        input-validation item you left unticked in step 02, honestly this time, because the code
        validates. Ticking it re-runs the checklist, and every check is green. Then merge, and
        bring <code>main</code> back to your machine for the next step:
      </p>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull`}
      />

      <Quiz
        question={
          <>
            A teammate adds <code>// SAFETY: it works</code> above an <code>as unknown as User</code>.
            What should a reviewer do?
          </>
        }
        options={[
          {
            text: "Accept it: the checker passes, so the rule is satisfied",
            why: "The checker only sees that a SAFETY comment exists. Whether the reason is true is the reviewer's job, and 'it works' gives them nothing to check.",
          },
          {
            text: "Ask for the value to be validated, or for a reason that can be verified",
            correct: true,
            why: "A SAFETY comment must state why the assertion holds, such as 'parsed by the schema above'. If nothing makes it hold, the fix is to validate.",
          },
          {
            text: "Replace it with @ts-expect-error",
            why: "That is a type-checker suppression, which core/type-checker-suppression flags too. It moves the problem rather than fixing it.",
          },
        ]}
      />
    </LearnPage>
  );
}
