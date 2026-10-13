import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { LearnPage, PrivateRepo, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: make the gate required" };

export default function Page() {
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
      <h2>Why now, and not on day one</h2>
      <p>
        A required gate on day one would have blocked your first pull request for reasons nobody
        on the team had seen yet: a checklist, an ADR job, a dependency review that needed a
        licence. A team blocked by a check it does not understand learns to get around it, and an
        admin bypass becomes routine.
      </p>
      <p>
        You have now seen every job go red and turned each one green: the checklist in step 01, the
        policy in steps 02 and 03, the ADR in step 05, the security floor in step 06. Blocking is no
        longer a surprise. It is the same checks, with the merge button tied to them.
      </p>
      <Term word="Required status check">
        <p>
          A GitHub branch rule that names a check which must pass before a pull request can merge.
          While it is red or still running, the merge button is disabled. Here the check is{" "}
          <code>redline-gate / gate</code>, and nobody is on the bypass list, admins included.
        </p>
      </Term>

      <h2>Let Redline do it this time</h2>
      <p>
        In step 01 you committed, opened the pull request and set things up by hand, so you know
        what each part is. This time <code>init</code> does all of it in one run. Before you run it,
        here is what it will do:
      </p>
      <ul>
        <li>
          Record <code>&quot;blockingGate&quot;: true</code> in <code>.redline.json</code>, commit
          it on a branch called <code>redline/onboard</code>, push it and open the pull request.
          You stay on <code>main</code>.
        </li>
        <li>
          Apply a branch ruleset called <code>Redline</code> to <code>main</code>: no deletion, no
          force-push, changes through a pull request, review threads resolved, a Copilot review
          requested on every pull request where your plan includes Copilot, and{" "}
          <code>redline-gate / gate</code> required.
        </li>
        <li>
          Switch on the GitHub settings step 01 left for later: secret scanning, push protection
          and Dependabot alerts.
        </li>
      </ul>
      <RedlineTerminal
        commands="{redline} init --blocking"
        output={`  Repository settings  … in place
   ✓ already     labels             label "no-adr" already exists
   ✓ applied     secret-scanning    secret scanning
   ✓ applied     merge-policy       branch ruleset
   …
  Pull request
   https://github.com/<you>/my-redline-demo/pull/<n>`}
      />
      <p>
        <code>merge-policy</code> is the change that matters. Because{" "}
        <code>.redline.json</code> records <code>blockingGate</code>, a later plain{" "}
        <code>init</code> keeps the gate blocking instead of quietly undoing it.
      </p>
      <p>
        The ruleset is live as soon as <code>init</code> applies it, so the pull request it just
        opened is the first one held to it. Watch it, and merge it when it is green:
      </p>
      <Terminal
        commands={`gh pr checks redline/onboard --watch
gh pr merge redline/onboard --squash
git pull`}
      />

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
              <td>
                <code>--blocking</code>
              </td>
              <td>whether a red gate stops the merge</td>
              <td>on</td>
            </tr>
            <tr>
              <td>
                <code>--rung</code>
              </td>
              <td>which failures turn the gate red</td>
              <td>
                <code>observe</code>: only the security floor
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        So right now only dependency review and the secret scan can stop a merge. Step 02&apos;s
        broken rules would still leave the gate green. Step 09 is about raising the rung.
      </p>

      <h2>Watch it block</h2>
      <p>
        Open a throwaway pull request that brings back step 06&apos;s vulnerable lodash. It exists
        only to be blocked, and you close it at the end without merging.
      </p>
      <Tabs
        label="Block and clear"
        tabs={[
          {
            label: "1. Break it",
            content: (
              <>
                <Terminal
                  commands={`git checkout -b try/blocked
pnpm add lodash@4.17.20 --save-exact
git commit -am "chore(deps): pin lodash 4.17.20 to see the gate block"
git push -u origin try/blocked
gh pr create --title "Do not merge: see the required gate block" --body-file .github/pull_request_template.md
gh pr checks --watch
gh pr view --json mergeStateStatus`}
                  output={`{"mergeStateStatus":"BLOCKED"}`}
                />
                <p>
                  Open it in the browser with <code>gh pr view --web</code>: the merge button is
                  disabled, with <code>redline-gate / gate</code> named underneath.
                </p>
                <PrivateRepo title="The merge button stays enabled">
                  <p>
                    If you handed dependency checks to Dependabot in step 01, dependency review does
                    not run, the gate stays green, and this pull request can merge. That is step
                    01&apos;s trade-off again, in the merge button this time. Secret scanning and
                    push protection are also reported as <code>unavailable</code> by{" "}
                    <code>init</code> rather than failing the run.
                  </p>
                </PrivateRepo>
              </>
            ),
          },
          {
            label: "2. Clear it",
            content: (
              <>
                <Terminal
                  commands={`git revert --no-edit HEAD
git push
gh pr checks --watch
gh pr view --json mergeStateStatus`}
                  output={`{"mergeStateStatus":"CLEAN"}`}
                />
                <p>
                  Fixed, it could merge. It changes nothing, so close it instead, and go back to{" "}
                  <code>main</code>:
                </p>
                <Terminal
                  commands={`gh pr close
git checkout main`}
                />
              </>
            ),
          },
          {
            label: "3. Check the ruleset",
            content: (
              <>
                <p>
                  On GitHub: <b>Settings → Rules → Rulesets → Redline</b>. Or ask GitHub which
                  checks <code>main</code> requires. <code>gh</code> fills in{" "}
                  <code>{"{owner}"}</code> and <code>{"{repo}"}</code> from the repository you are in:
                </p>
                <Terminal
                  commands={`gh api 'repos/{owner}/{repo}/rules/branches/main' --jq '.[] | select(.type=="required_status_checks") | .parameters.required_status_checks'`}
                  output={`[{"context":"redline-gate / gate"}]`}
                />
              </>
            ),
          },
        ]}
      />

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
