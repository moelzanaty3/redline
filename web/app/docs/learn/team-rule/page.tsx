import type { Metadata } from "next";
import { Quiz, RedlineCode } from "@/components/learn/interactive";
import { File, LearnPage, RedlineTerminal, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: a team rule" };

const LOCAL_MD = `## Errors are returned, not logged

This service is a library: the code that calls it decides what to log and where.

- \`local/no-console\` — No \`console.*\` calls in \`src/\`. Throw an \`Error\` with a message that says what was wrong, and let the caller log it.
`;

const SECOND_RULE = `
## Exports are named

Callers import from this library by name. A default export can be imported under any name, so a search for it misses callers.

- \`local/no-default-export\` — No \`export default\` in \`src/\`. Export the function or type by name.
`;

const GREET_TS =`export function greet(name: string): string {
  console.log('greeting', name)
  return 'hi ' + name
}
`;

export default function Page() {
  return (
    <LearnPage
      slug="team-rule"
      intro="Step 01 gave every assistant the organisation's rules. Your team has rules of its own, true for your code and nobody else's. This step writes one down in a file you own, and Redline carries it to every assistant and every review prompt."
      learn={[
        "Why a team rule needs its own file, and what the .redline folder is",
        "What a rule is made of: an id, the rule, the fix and the reason",
        "How to re-render the assistant files, and which reviews apply the rule",
      ]}
    >
      <h2>Why a team needs its own rules</h2>
      <p>
        Every rule so far came from the organisation. <code>core/customer-data-in-logs</code>{" "}
        applies to every repository, which is why it is in the shared standard.
      </p>
      <p>
        Some rules are only true for one codebase. Say this repository is a library: other
        services import it, and they decide what gets logged and where. A{" "}
        <code>console.log</code> in here writes into somebody else&apos;s logs, maybe with their
        customer&apos;s data in it, and they cannot turn it off. &quot;Never log&quot; is right
        for this repository and wrong for a service, so the organisation&apos;s standard cannot
        say it. Your team has to.
      </p>
      <p>Where would you write it down? You have three choices:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Where you write the rule</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Inside the <code>REDLINE</code> markers in <code>AGENTS.md</code>
              </td>
              <td>❌ the next <code>init</code> rewrites that block, and the rule is gone</td>
            </tr>
            <tr>
              <td>
                Below the markers in <code>CLAUDE.md</code>
              </td>
              <td>⚠️ it survives, but only Claude reads it. Copilot and Cursor never see it</td>
            </tr>
            <tr>
              <td>
                <code>.redline/local.md</code>
              </td>
              <td>
                ✅ Redline copies it into every assistant file on every run, and into the{" "}
                <code>/redline-review</code> prompt
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What the .redline folder is</h2>
      <p>
        <code>.redline/</code> is a folder at the root of your repository. It does not exist yet:
        you create it in this step. The file that matters in it is <code>local.md</code>, and it
        is different from everything step 01 wrote:
      </p>
      <ul>
        <li>
          <strong>It is yours.</strong> Redline reads it on every run, and never writes, rewrites
          or deletes it. Even <code>redline remove</code> leaves it in place.
        </li>
        <li>
          <strong>It is plain markdown.</strong> No schema, no config keys. Write it the way you
          would explain the rule to a new teammate.
        </li>
        <li>
          <strong>It is reviewed like code.</strong> It is committed, so a change to a team rule
          goes through a pull request like any other change.
        </li>
      </ul>

      <h2>What a rule is</h2>
      <p>
        A rule is one line an assistant can act on and a reviewer can point at. The rule for this
        step, taken apart:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>In the example</th>
              <th>Why it is there</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Id</td>
              <td>
                <code>local/no-console</code>
              </td>
              <td>
                Every finding quotes it, which is how you later count whether the rule catches
                real problems or only makes noise. The <code>local/</code> prefix keeps it apart
                from the organisation&apos;s <code>core/</code> ids.
              </td>
            </tr>
            <tr>
              <td>Rule</td>
              <td>
                No <code>console.*</code> calls in <code>src/</code>.
              </td>
              <td>Specific enough that a finding can point at one line.</td>
            </tr>
            <tr>
              <td>Fix</td>
              <td>
                Throw an <code>Error</code> … and let the caller log it.
              </td>
              <td>An assistant that knows the fix writes it, instead of only stopping.</td>
            </tr>
            <tr>
              <td>Reason</td>
              <td>This service is a library: the code that calls it decides…</td>
              <td>
                A model applies this rule, and a model that knows why makes better calls at the
                edges, such as a script in <code>scripts/</code> that is not shipped.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Write it</h2>
      <p>On a new branch, create the folder and the file. Paste this into your terminal:</p>
      <Terminal
        commands={`git checkout -b feat/team-rule
mkdir -p .redline
cat > .redline/local.md <<'EOF'
${LOCAL_MD}EOF`}
      />
      <p>Or create the file in your editor with the same text:</p>
      <File name=".redline/local.md" text={LOCAL_MD} />

      <h2>Render it</h2>
      <p>
        The file alone changes nothing: assistants read <code>AGENTS.md</code>,{" "}
        <code>CLAUDE.md</code> and the rest, not <code>.redline/</code>. Run <code>init</code>{" "}
        again to copy the rule into them. With a flag, it asks no questions and keeps every answer
        you gave in step 01:
      </p>
      <RedlineTerminal
        commands={`{redline} init --no-commit`}
        output={`  Files  5 written
   + .github/copilot-instructions.md
   + AGENTS.md
   + CLAUDE.md
   + .cursor/rules/redline-core.mdc
   + .redline.json

  not committed — the files are in your working tree …`}
      />
      <p>
        It also prints the same <code>▲</code> warnings as in step 01; nothing new. Every
        assistant file gains a <code># Repository-local rules</code> section with your rule, and{" "}
        <code>.redline.json</code> records <code>&quot;localRules&quot;: true</code>. Look at the
        diff before you go on:
      </p>
      <Terminal commands="git diff --stat" />

      <h2>Add a second rule</h2>
      <p>
        Rules change, and someone will edit <code>local.md</code> and forget to re-run{" "}
        <code>init</code>. See what happens then. Add a second rule to the end of the file:
      </p>
      <Terminal
        commands={`cat >> .redline/local.md <<'EOF'
${SECOND_RULE}EOF`}
      />
      <p>
        The assistant files still carry only the first rule. <RedlineCode args="verify" /> notices:
      </p>
      <RedlineTerminal
        commands={`{redline} verify | grep artifacts-current`}
        output={`ok    artifacts-current      this repository's own .redline/local.md has changed since the last render — re-run redline init to fold it in: …`}
      />
      <p>
        It says <code>ok</code>, not <code>FAIL</code>: the file is yours, so changing it is work to
        do, not drift. Re-render, and check again:
      </p>
      <RedlineTerminal
        commands={`{redline} init --no-commit
{redline} verify | grep artifacts-current`}
        output={`ok    artifacts-current      rendered artifacts match standards v0.2.2`}
      />
      <p>
        Both rules are in every assistant file now, and both go into the same pull request.
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
      <p>Break the rule on purpose. Create <code>src/greet.ts</code>:</p>
      <File name="src/greet.ts" text={GREET_TS} />
      <p>It is a new file, so stage it, or no review can see it:</p>
      <Terminal commands="git add src/greet.ts" />
      <p>
        Run <code>/redline-review</code> in your assistant and expect a finding tagged{" "}
        <code>[local/no-console]</code> on line 2. Run <RedlineCode args="review" /> in the terminal
        and it says nothing about it, exactly as the table says. To see the rule in the prompt the
        assistant receives:
      </p>
      <RedlineTerminal commands={`{redline} review --print-prompt | grep no-console`} />
      <p>Throw the file away afterwards:</p>
      <Terminal commands="git rm -f src/greet.ts" />

      <h2>Merge it</h2>
      <p>
        What is left is the rule and the files <code>init</code> re-rendered. Commit them and open
        the pull request:
      </p>
      <Terminal
        commands={`git add -A
git commit -m "docs: add the team's own rules"
git push -u origin feat/team-rule
gh pr create --title "docs: add the team's own rules" --body-file .github/pull_request_template.md
gh pr checks --watch`}
      />
      <p>
        Tick the checklist boxes that are true, as in step 01. When every check is green, merge, and
        bring <code>main</code> back for the next step:
      </p>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull`}
      />

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
