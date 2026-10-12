import type { Metadata } from "next";
import { Quiz } from "@/components/learn/interactive";
import { File, LearnPage, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: a team rule" };

const LOCAL_MD = `## Errors are returned, not logged

This service is a library: the code that calls it decides what to log and where.

- \`local/no-console\` — No \`console.*\` calls in \`src/\`. Throw an \`Error\` with a message that says what was wrong, and let the caller log it.
`;

const GREET_TS = `export function greet(name: string): string {
  console.log('greeting', name)
  return 'hi ' + name
}
`;

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <LearnPage
      slug="team-rule"
      intro="The organisation's standard covers what every repository shares. Your team will have rules of its own. They go in one file, and Redline puts them everywhere the shared rules already go."
      learn={[
        "Where a team's own rules live, and how to write one",
        "How to re-render the assistant files after a change",
        "Which reviews apply a written rule, and which cannot",
      ]}
    >
      <h2>Write the rule</h2>
      <p>
        Create <code>.redline/local.md</code>. Explain the reason in a sentence, then state the
        rule with an id in backticks, <code>local/&lt;slug&gt;</code>:
      </p>
      <File name=".redline/local.md" text={LOCAL_MD} />
      <p>
        The id matters. Findings quote it, which is how you later find out whether this rule
        catches real problems or only makes noise. The reason matters too: a model applies this
        rule, and a model with the reason makes better calls at the edges.
      </p>

      <h2>Render it</h2>
      <Terminal
        commands={`git checkout -b feat/team-rule
${rl("init --no-commit")}`}
        output={`  Files  6 written
   + .github/copilot-instructions.md
   + AGENTS.md
   + CLAUDE.md
   + .cursor/rules/redline-core.mdc
   …
  not committed — the files are in your working tree`}
      />
      <p>
        <code>--no-commit</code> writes the files and stops, so you read the diff before anything
        is pushed. Every assistant file gains a <code># Repository-local rules</code> section with
        your rule, and <code>.redline.json</code> records <code>&quot;localRules&quot;: true</code>.
        A re-run keeps what was chosen at onboarding: the rung, the gate source, the approvals.
        Commit, push and open a pull request as before.
      </p>

      <h2>Who checks it</h2>
      <p>
        A team rule is written in prose, so a model applies it. The checker only runs rules a
        program can decide:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Where</th>
              <th>Sees local/no-console?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Your assistant, while writing</td>
              <td>✅ it reads AGENTS.md, CLAUDE.md, the Copilot instructions or the Cursor rules</td>
            </tr>
            <tr>
              <td>/redline-review in your assistant</td>
              <td>✅ the rule is in the review prompt</td>
            </tr>
            <tr>
              <td>redline review in your terminal</td>
              <td>❌ it runs only the checker&apos;s rules</td>
            </tr>
            <tr>
              <td>The gate&apos;s Deterministic policy job</td>
              <td>❌ the same checker</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Try it</h2>
      <p>Break the rule on purpose:</p>
      <File name="src/greet.ts" text={GREET_TS} />
      <Terminal commands="git add src/greet.ts" />
      <p>
        Run <code>/redline-review</code> in your assistant and expect a finding tagged{" "}
        <code>[local/no-console]</code> on line 2. Run <code>{rl("review")}</code> in the terminal
        and it says nothing about it, exactly as the table says. To see the rule in the prompt the
        assistant receives:
      </p>
      <Terminal commands={`${rl("review --print-prompt")} | grep no-console`} />
      <p>Throw the file away afterwards:</p>
      <Terminal commands="git rm -f src/greet.ts" />

      <Quiz
        question="Your team adds a rule to .redline/local.md. A pull request breaks it. What fails?"
        options={[
          {
            text: "The Deterministic policy job in the gate",
            why: "That job runs the checker, which only knows the rules a program can decide. A prose rule needs a model.",
          },
          {
            text: "Nothing fails in the pipeline; the assistant and /redline-review apply it",
            correct: true,
            why: "A team rule shapes code as it is written and is checked by the assistant review before pushing. It is guidance with an id you can measure, not a pipeline check.",
          },
          {
            text: "The secret scan",
            why: "The secret scan looks for credentials, and only credentials.",
          },
        ]}
      />
    </LearnPage>
  );
}
