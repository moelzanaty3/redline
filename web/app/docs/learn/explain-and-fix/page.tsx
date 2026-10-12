import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: explain and fix" };

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

const SILENCED_TS = `// SAFETY: trust me
return JSON.parse(raw) as unknown as User`;

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

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
      <p>Take the rule id from the brackets of any finding:</p>
      <Terminal
        commands={rl("explain core/unsafe-assertion")}
        output={`BLOCKER core/unsafe-assertion

  No unsafe assertions (\`as unknown as X\`, force casts) used to silence an error. Where one is
  genuinely required, the justification is a \`SAFETY:\` comment on the same line or the line above,
  stating why the assertion holds (\`// SAFETY: payload parsed by the schema above\`). Any other
  comment does not count.

  decided by   a checker, with no model call
  defined in   standards/core.md:87
  applies to   every file — the core standard is not scoped by stack
  reaches      tooling, web-react, web-next, … every profile`}
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
          <code>{rl("explain --list")}</code> prints every rule id.
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
                  <code>TODO</code> and the <code>unknown</code> alias go with it:
                </p>
                <File name="src/user.ts" text={USER_FIXED_TS} />
                <p>
                  A payload with a missing field now throws a clear error, at the boundary where it
                  arrived, instead of becoming a <code>User</code> with an <code>undefined</code>{" "}
                  name somewhere far away. The demo adds a test for both outcomes in{" "}
                  <code>src/user.test.ts</code>.
                </p>
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
                <File name="src/user.ts" text={SILENCED_TS} />
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
      <Terminal
        commands={`pnpm test
git add src/user.ts
${rl("review")}`}
        output={`profile tooling — rules in scope: core, typescript
no findings`}
      />
      <p>
        Commit and push. On GitHub, every check on the pull request goes green, including{" "}
        <b>Deterministic policy</b>. The checklist&apos;s input-validation item can be ticked now,
        honestly, because the code validates.
      </p>

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
