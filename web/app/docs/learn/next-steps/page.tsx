import type { Metadata } from "next";
import Link from "next/link";
import { LearnPage, RedlineTerminal, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: recap and next steps" };

export default function Page() {
  return (
    <LearnPage
      slug="next-steps"
      intro="You took one repository through everything Redline does. Here is what to keep from it, how the rules stay current without you doing anything, and where to go next."
      learn={[
        "The ideas the whole path rests on, and the step that showed each",
        "How to take a new version of Redline into your repository",
        "How to check a repository still matches what was installed",
      ]}
    >
      <h2>What you built</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Where you saw it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>One set of rules, three places.</b> The same rules reach your assistant while it
                writes, your terminal before you push, and the pull request before merge.
              </td>
              <td>01, 02</td>
            </tr>
            <tr>
              <td>
                <b>Findings you can look up.</b> Every finding names a rule id;{" "}
                <code>explain</code> says what it means, and the fix removes the problem, not the
                warning.
              </td>
              <td>02, 03</td>
            </tr>
            <tr>
              <td>
                <b>Your team&apos;s rules travel the same way.</b> One file you own,{" "}
                <code>.redline/local.md</code>, reaches every assistant.
              </td>
              <td>04</td>
            </tr>
            <tr>
              <td>
                <b>Big decisions are written down.</b> A large change links an ADR, or says on the
                record that it decides nothing.
              </td>
              <td>05</td>
            </tr>
            <tr>
              <td>
                <b>The security floor blocks from day one.</b> A vulnerable dependency or a leaked
                secret fails the gate at every rung, and nothing waives it.
              </td>
              <td>06</td>
            </tr>
            <tr>
              <td>
                <b>Blocking is separate from strictness.</b> A required gate stops the merge; the
                rung decides what turns it red.
              </td>
              <td>07</td>
            </tr>
            <tr>
              <td>
                <b>Exceptions are written down.</b> Merging past a process check is allowed, with
                why, for which check and until when on the record.
              </td>
              <td>08</td>
            </tr>
            <tr>
              <td>
                <b>Blocking on findings is earned.</b> At <code>observe</code> a BLOCKER still
                merges; a repository blocks on its findings only once the evidence says the rules
                are right.
              </td>
              <td>09</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>When the rules change</h2>
      <p>
        The rules, and the gate workflow that checks them, ship inside the{" "}
        <code>redlinegate</code> package. Step 01 pinned an exact version in your{" "}
        <code>package.json</code>, and <code>init</code> wrote that version&apos;s gate into{" "}
        <code>.github/workflows/</code>. A newer Redline brings new rules and gate fixes, but your
        repository keeps the old ones until you take them.
      </p>
      <p>Taking them is a pull request. Raise the pin, see what it changes, and render again:</p>
      <RedlineTerminal
        commands={`git checkout -b chore/redline-update
pnpm add -D --save-exact redlinegate@latest
{redline} status
{redline} init --no-commit
git add -A
git commit -m "chore: update Redline"
git push -u origin chore/redline-update
gh pr create --title "chore: update Redline" --body-file .github/pull_request_template.md
gh pr checks --watch
gh pr merge --squash
git checkout main
git pull`}
      />
      <p>
        <code>status</code> compares the rules rendered in your repository with the ones in the
        version you just installed, and says <code>behind</code> when they differ.{" "}
        <code>init</code> keeps every choice recorded in <code>.redline.json</code> and rewrites{" "}
        <code>AGENTS.md</code>, <code>CLAUDE.md</code>, the gate workflow and the rest. Raising the
        pin alone is not enough: the gate in <code>.github/workflows/</code> is a copy, and only{" "}
        <code>init</code> replaces it.
      </p>
      <p>
        In an organisation with many repositories, the team that owns Redline does this for
        everyone: <code>redline sync</code> opens the same pull request on every registered
        repository that is behind, and you review and merge it.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          Don&apos;t run <code>redline sync</code> from your own repository: it fails there with{" "}
          <code>no registry.json</code>. It is the estate-wide command, run from a checkout of the
          Redline source repository, and opens pull requests on <i>every</i> registered repository.
        </p>
      </div>

      <h2>Check nothing has drifted</h2>
      <p>
        To confirm the repository still matches what <code>.redline.json</code> says is installed
        (the gate workflow, the rendered files, the GitHub settings):
      </p>
      <RedlineTerminal commands="{redline} verify" />
      <p>
        It asks GitHub, so it needs <code>gh auth login</code> or <code>GH_TOKEN</code>.
      </p>

      <h2>Where to go next</h2>
      <ul>
        <li>
          <Link href="/docs/onboarding">Onboard a repository</Link>: your own, with the options this
          path skipped, including your organisation&apos;s gate, and a short check that the gate is
          real.
        </li>
        <li>
          <Link href="/docs/adopting">Adopting Redline</Link>: day one to month two with a real team.
        </li>
        <li>
          <Link href="/docs/enforcement">Enforcement ladder</Link> and{" "}
          <Link href="/docs/exemptions">Exemptions</Link>: the full rules behind steps 08 and 09.
        </li>
        <li>
          <Link href="/docs/troubleshooting">Troubleshooting</Link>: every failure that actually
          happens, and the command that resolves it.
        </li>
      </ul>
      <h2>Clean up</h2>
      <p>
        Finished with your copy? Deleting a repository needs a permission <code>gh</code> does not
        ask for by default, so grant it first. Then delete the repository and the folder:
      </p>
      <Terminal
        commands={`gh auth refresh -h github.com -s delete_repo
gh repo delete my-redline-demo
cd ..
rm -rf my-redline-demo`}
      />
    </LearnPage>
  );
}
