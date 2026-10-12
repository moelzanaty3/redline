import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: make the gate required" };

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <LearnPage
      slug="required-gate"
      intro="Until now the gate's verdict was advice: a red gate showed on the pull request, and GitHub still let you merge. One flag makes it a required check, so a red gate disables the merge button for everyone."
      learn={[
        "What a required status check is",
        "The difference between blocking and the rung",
        "How to watch a required gate block a merge, and clear it",
      ]}
    >
      <Term word="Required status check">
        <p>
          A GitHub branch rule that names a check which must pass before a pull request can merge.
          While it is red or still running, the merge button is disabled. Here the check is{" "}
          <code>redline-gate / gate</code>, and nobody is on the bypass list, admins included.
        </p>
      </Term>

      <h2>Turn it on</h2>
      <Terminal
        commands={`git checkout main && git pull
${rl("init --blocking")}`}
        output={`  Repository settings  6 in place · 1 unavailable
   ✓ already     labels             label "no-adr" already exists
   ✓ applied     secret-scanning    secret scanning
   ✓ applied     merge-policy       branch ruleset
   …
  Pull request
   https://github.com/<you>/my-redline-demo/pull/<n>`}
      />
      <p>
        <code>merge-policy</code> is the change: the <code>Redline</code> ruleset on{" "}
        <code>main</code> now requires <code>redline-gate / gate</code>. <code>.redline.json</code>{" "}
        records <code>&quot;blockingGate&quot;: true</code>, so a later plain <code>init</code>{" "}
        keeps the gate blocking instead of quietly undoing it. If the branch{" "}
        <code>redline/onboard</code> from step 01 still exists, <code>init</code> uses the next free
        name, <code>redline/onboard-2</code>, and leaves the old branch alone.
      </p>

      <h2>Blocking is not the rung</h2>
      <p>Two separate settings, easy to mix up:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Decides</th>
              <th>Now</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>--blocking</td>
              <td>whether a red gate stops the merge</td>
              <td>on</td>
            </tr>
            <tr>
              <td>--rung</td>
              <td>which failures turn the gate red</td>
              <td>observe: only the security floor</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        So right now only dependency review and the secret scan can stop a merge. Step 02&apos;s
        broken rules would still leave the gate green. Step 09 is about raising the rung.
      </p>

      <h2>Watch it block</h2>
      <p>On the pull request <code>init</code> just opened, which is green:</p>
      <Tabs
        label="Block and clear"
        tabs={[
          {
            label: "1. Break it",
            content: (
              <>
                <p>Pin step 06&apos;s vulnerable lodash again, and push:</p>
                <Terminal
                  commands={`pnpm add lodash@4.17.20 --save-exact
git commit -am "chore(deps): pin lodash 4.17.20 to see the gate block"
git push
gh pr view --json mergeStateStatus`}
                  output={`{"mergeStateStatus":"BLOCKED"}`}
                />
                <p>
                  Open the pull request in the browser: the merge button is disabled, with the
                  failing check named underneath.
                </p>
              </>
            ),
          },
          {
            label: "2. Clear it",
            content: (
              <Terminal
                commands={`git revert --no-edit HEAD
git push
gh pr view --json mergeStateStatus`}
                output={`{"mergeStateStatus":"CLEAN"}`}
              />
            ),
          },
          {
            label: "3. Check the ruleset",
            content: (
              <>
                <p>
                  On GitHub: <b>Settings → Rules → Rulesets → Redline</b>. Or from the terminal,
                  with your own owner name:
                </p>
                <Terminal
                  commands={`gh api repos/<you>/my-redline-demo/rulesets --jq '.[].id' \\
  | xargs -I{} gh api repos/<you>/my-redline-demo/rulesets/{} \\
      --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks'`}
                  output={`[{"context":"redline-gate / gate"}]`}
                />
              </>
            ),
          },
        ]}
      />
      <p>Merge the pull request once it is clean.</p>

      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>A vendored gate can be edited by the pull request it judges.</b> With{" "}
          <code>--gate-source local</code>, a pull request runs the gate file on its own branch, so a
          change to <code>.github/workflows/redline-gate.yml</code> could weaken the check. A real
          team closes that gap with the organisation&apos;s gate (<code>--gate-source org</code>),
          or by requiring an owner&apos;s review on <code>.github/workflows/</code> with{" "}
          <code>--with review-ownership --review-owners &lt;team&gt;</code>. <code>init</code> warns about this on every run.
        </p>
      </div>

      <Quiz
        question="The gate is now required, at observe. A pull request breaks two BLOCKER rules and nothing else. Can it merge?"
        options={[
          {
            text: "No: the gate is required, and BLOCKERs must not merge",
            why: "Required means a red gate stops the merge. At observe, broken rules leave the gate green, so there is nothing red to stop it.",
          },
          {
            text: "Yes: at observe only the security floor turns the gate red",
            correct: true,
            why: "Blocking decides whether red stops the merge; the rung decides what turns it red. Raising the rung is step 09.",
          },
          {
            text: "Only an admin can merge it",
            why: "Nobody is on the bypass list, admins included. And here, nothing needs bypassing: the gate is green.",
          },
        ]}
      />
    </LearnPage>
  );
}
