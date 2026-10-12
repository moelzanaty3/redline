import type { Metadata } from "next";
import { PackageManagerTabs, Quiz, Tabs } from "@/components/learn/interactive";
import { LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: onboard" };

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);
  const tag = state.status === "published" ? "@latest" : "";

  return (
    <LearnPage
      slug="onboard"
      intro="One command reads the repository, works out its stack, and installs the rules, the review commands and a merge gate. Then it opens a pull request so the team reviews the change like any other."
      learn={[
        "What redline init installs, and where each piece acts",
        "What a merge gate and a rung are",
        "Why every repository starts at observe, where findings are reported but nothing is blocked",
      ]}
    >
      <h2>Run it</h2>
      <p>
        From the root of your repository, on an up-to-date <code>main</code>, with the package
        manager you picked in step 00:
      </p>
      <PackageManagerTabs
        panels={[
          { name: "pnpm", content: <Terminal commands={`pnpm dlx redlinegate${tag} init`} /> },
          { name: "npm", content: <Terminal commands={rl("init")} /> },
          { name: "yarn", content: <Terminal commands={`yarn dlx redlinegate${tag} init`} /> },
          { name: "bun", content: <Terminal commands={`bunx redlinegate${tag} init`} /> },
        ]}
      />
      <p>
        Each runs Redline once without installing it; <code>init</code> then adds it to your
        project. If it asks to download <code>redlinegate</code> first, answer <code>y</code>. Then{" "}
        <code>init</code> asks a few questions about the repository. Space ticks a box, Enter moves
        on. Keep the default everywhere except the three in bold:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>It asks</th>
              <th>Answer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Which standards apply here?</b>
              </td>
              <td>
                <b>
                  Tick <code>javascript-typescript</code>
                </b>{" "}
                (JavaScript, TypeScript). Nothing is ticked for you: which rules a repository is held
                to is your decision.
              </td>
            </tr>
            <tr>
              <td>Where does this repository live?</td>
              <td>GitHub</td>
            </tr>
            <tr>
              <td>What runs your pull request checks?</td>
              <td>GitHub Actions</td>
            </tr>
            <tr>
              <td>Which assistants should read the standards?</td>
              <td>The ones already ticked</td>
            </tr>
            <tr>
              <td>Extra context to render beside the rules</td>
              <td>Spec-driven development, already ticked</td>
            </tr>
            <tr>
              <td>What should Redline set up alongside its own checks?</td>
              <td>Nothing. GitHub&apos;s own secret scanning and dependency alerts are switched on anyway.</td>
            </tr>
            <tr>
              <td>What should Redline install?</td>
              <td>
                <code>gate</code>, <code>merge-policy</code> and <code>labels</code>, already ticked
              </td>
            </tr>
            <tr>
              <td>
                <b>Where should the merge gate live?</b>
              </td>
              <td>
                <b>in this repository</b>. See below for why.
              </td>
            </tr>
            <tr>
              <td>How hard should the check bite?</td>
              <td>
                <code>observe</code>
              </td>
            </tr>
            <tr>
              <td>Add Redline to this project&apos;s devDependencies?</td>
              <td>
                yes, pin it, already selected. Your package manager adds <code>redlinegate</code> at
                this exact version, so you, your team and your assistant all run the same Redline.
              </td>
            </tr>
            <tr>
              <td>
                <b>Ready?</b>
              </td>
              <td>
                <b>Write, commit and open a pull request</b>. The default only previews.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Term word="Where the merge gate lives">
        <p>
          The merge gate is a GitHub Actions workflow, and <code>init</code> can put it in one of two
          places:
        </p>
        <ul>
          <li>
            <b>in the organisation</b>, the default. The gate lives once, in the organisation&apos;s{" "}
            <code>.github</code> repository, and every repository calls it from there. A pull request
            cannot edit the gate that judges it, and fixing the gate fixes it everywhere. It needs the
            organisation to publish a gate first, which is what a real team should do.
          </li>
          <li>
            <b>in this repository</b>. The gate is copied into the repository itself, so it works
            with no organisation set up: right for a personal account, and for this path. It is
            weaker: the gate runs from the pull request&apos;s own commit, so a pull request can edit
            the gate judging it, even to switch off the secret and dependency checks.{" "}
            <code>init</code> says so on every run.
          </li>
        </ul>
        <p>
          Choosing the organisation when it publishes no gate is not a dead end: <code>init</code>{" "}
          notices, and asks again whether to skip the gate for now or copy it in.
        </p>
      </Term>
      <p>Once you answer the last question, it does the work:</p>
      <Terminal
        commands="# after Ready?"
        output={`  profile javascript-typescript
  Files  … written
   + package.json
   + AGENTS.md
   + CLAUDE.md
   + .github/copilot-instructions.md
   + .github/workflows/redline.yml
   + .github/workflows/redline-gate.yml
   + .github/pull_request_template.md
   + .redline.json
   …
  Repository settings  6 in place · 1 unavailable
   ✓ applied     labels             label "no-adr"
   ✓ applied     secret-scanning    secret scanning
   ✓ applied     push-protection    secret scanning push protection
   ✓ applied     dependency-alerts  dependabot alerts (vulnerability alerts)
   ✓ applied     merge-policy       branch ruleset
   · unsupported repo-property      repository property "redline=onboarded"
  Pull request
   https://github.com/<you>/my-redline-demo/pull/1`}
      />
      <p>
        <code>repo-property</code> needs a GitHub organisation, so it is unavailable on a personal
        account. Nothing depends on it. Running it from a script, with no questions? Add{" "}
        <code>--gate-source local --pin-cli</code> to the same command for the same result.
      </p>
      <p>
        Redline is in your <code>package.json</code> now, so from here on every command runs your
        project&apos;s own copy: <code>pnpm redline &lt;command&gt;</code>, or{" "}
        <code>npx redlinegate</code>, <code>yarn redline</code> or <code>bun run redline</code>.
      </p>

      <h2>What it installed</h2>
      <p>Three kinds of thing, each catching mistakes at a different moment:</p>
      <Tabs
        label="What init installed"
        tabs={[
          {
            label: "Rules for assistants",
            content: (
              <>
                <p>
                  <code>AGENTS.md</code>, <code>CLAUDE.md</code>,{" "}
                  <code>.github/copilot-instructions.md</code> and <code>.cursor/rules/</code>: the
                  same rules, in the form each assistant reads on every request. Open{" "}
                  <code>AGENTS.md</code> and read a few; every rule has an id in backticks, like{" "}
                  <code>core/hardcoded-secrets</code>.
                </p>
                <p>
                  <code>.claude/commands/</code>, <code>.github/prompts/</code> and{" "}
                  <code>.cursor/commands/</code> add a <code>/redline-review</code> command to each
                  assistant. Step 02 uses it.
                </p>
              </>
            ),
          },
          {
            label: "A merge gate",
            content: (
              <>
                <p>
                  <code>.github/workflows/redline.yml</code> runs on every pull request and calls the
                  gate in <code>.github/workflows/redline-gate.yml</code>. The pull request template,{" "}
                  <code>.github/pull_request_template.md</code>, holds the checklist the gate reads.
                </p>
                <p>
                  Because you answered <i>in this repository</i>, the gate itself is in{" "}
                  <code>redline-gate.yml</code>, so your repository is self-contained. A real team
                  calls one gate from its organisation&apos;s <code>.github</code> repository
                  instead, which a pull request here cannot edit. <code>init</code> prints that
                  warning itself.
                </p>
              </>
            ),
          },
          {
            label: "GitHub settings",
            content: (
              <ul>
                <li>
                  <b>A branch ruleset on <code>main</code></b>: changes arrive through a pull request,
                  review threads are resolved, and <code>main</code> cannot be deleted or
                  force-pushed. It requires no approving review: Redline fails the pipeline, and
                  whether a person must also approve is your choice (<code>--approvals &lt;n&gt;</code>
                  ). That is why one person can follow this path alone.
                </li>
                <li>
                  <b>The security floor</b>: secret scanning, push protection and Dependabot alerts.
                </li>
                <li>
                  <b>The <code>no-adr</code> label</b>, which step 05 explains.
                </li>
              </ul>
            ),
          },
          {
            label: ".redline.json",
            content: (
              <p>
                A record of what was installed, at which version, and the choices made: the profile,
                the rung, the gate source. A later <code>init</code> reads it, so re-running keeps
                your choices instead of resetting them. It is reviewed in pull requests like any
                other file.
              </p>
            ),
          },
        ]}
      />

      <Term word="Merge gate">
        <p>
          One required-looking check on the pull request, <code>redline-gate / gate</code>, that
          combines several jobs into one verdict: the rule checker, the pull request checklist, the
          decision-record check, dependency review and a secret scan. You will meet each job in the
          next steps.
        </p>
      </Term>

      <h2>The pull request</h2>
      <p>
        <code>init</code> committed everything on a branch and opened the pull request itself. Its
        description lists every file and setting, and carries a ticked{" "}
        <code>## Launch readiness</code> checklist and the <code>no-adr</code> label, because the
        diff is generated rather than a decision. With Redline 0.2.7 or later its checklist and ADR
        jobs pass. Read the diff, merge it, then bring the merged files back to your machine:
      </p>
      <Terminal
        commands={`git checkout main
git pull`}
      />
      <p>
        Every later step starts from this <code>main</code>, so the rules and review commands are
        in place before you write any code.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The demo&apos;s own pull request #1 was opened by an earlier version, before onboarding
          filled those in, so two of its process jobs are red and the gate still passed. That is
          the rung at work, explained next.
        </p>
      </div>

      <h2>Every repository starts at observe</h2>
      <Term word="Rung">
        <p>
          How strict the gate is. The enforcement ladder has three rungs:{" "}
          <code>observe</code>, <code>block-blocker</code> and <code>block-high</code>. At{" "}
          <code>observe</code> a broken rule is reported, and the gate stays green. Moving up needs
          evidence that the rules are right, which step 09 covers.
        </p>
        <p>
          The one exception is the security floor (step 06): a vulnerable dependency or a leaked
          secret fails the gate at every rung, <code>observe</code> included.
        </p>
      </Term>
      <p>
        Starting at <code>observe</code> means the team sees what Redline <i>would</i> block before
        anything is blocked. Nobody&apos;s afternoon is ruined by a rule the team has never
        discussed. Ask the repository where it stands:
      </p>
      <Terminal
        commands={rl("status")}
        output={`profile      javascript-typescript (javascript, typescript)
host         github
checks       GitHub Actions
rung         observe — findings are reported, only the security floor fails the check
…`}
      />

      <Quiz
        question="Onboarding put the rules in AGENTS.md and also installed a merge gate. Why both?"
        options={[
          {
            text: "AGENTS.md is for documentation; only the gate is enforced",
            why: "AGENTS.md is read by the assistant on every request, so it shapes the code as it is written. That is prevention, not documentation.",
          },
          {
            text: "They catch mistakes at different moments: while writing, and before merge",
            correct: true,
            why: "The assistant follows the rules while it writes, and the gate checks what reaches the pull request anyway, whoever or whatever wrote it.",
          },
          {
            text: "The gate only runs when the assistant is not used",
            why: "The gate runs on every pull request, whoever wrote the change.",
          },
        ]}
      />
    </LearnPage>
  );
}
