import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineCode } from "@/components/learn/interactive";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Troubleshooting" };

export default function Page() {
  return (
    <DocsPage
      crumb="Getting Started"
      title="Troubleshooting"
      intro="What each failure means, and the command that resolves it. Ordered by how often it happens, because you are here with a symptom, not a component."
      href="/docs/troubleshooting"
    >
      <p>
        Every heading below is a real message from <code>redline</code>, the
        gate, or GitHub. Each entry says what causes it, the command that fixes
        it, and how to confirm the fix. If you have a string, search it:{" "}
        <kbd>⌘K</kbd> indexes every page and every rule id.
      </p>

      <h2>Start here: one command answers most of it</h2>
      <p>
        <code>redline verify</code> reads back what the host actually reports,
        not what a config file claims, and names every check that is wrong. Run
        it before reading further. Each line starts with one of these:
      </p>
      <RedlineTerminal commands="{redline} verify" />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>It prints</th>
              <th>Means</th>
              <th>Exit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>ok</code>
              </td>
              <td>checked, and correct.</td>
              <td>
                <code>0</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>FAIL</code>
              </td>
              <td>checked, and wrong. This is drift, and it is work.</td>
              <td>
                <code>1</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>??</code>
              </td>
              <td>
                <b>could not be checked</b> — no credential, no permission, or
                the host did not answer. Never read this as a pass.
              </td>
              <td>
                <code>1</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>FAIL  onboarded  no …/.redline.json</code>, alone
              </td>
              <td>
                Nothing has been installed here. The line ends with the{" "}
                <code>init</code> command to run.
              </td>
              <td>
                <code>2</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <code>FAIL</code> is work for you or an admin. <code>??</code> means
        run it again with a token that can see the setting.
      </p>

      <h2 id="waiting-for-status">
        The pull request says “Expected — waiting for status”, forever
      </h2>
      <p>
        <b>The most common failure, and the most misleading:</b> the branch rule
        requires a check name that nothing will ever report, so the pull request
        waits for a status that does not exist. It is not a slow gate. It will
        never resolve.
      </p>
      <p>
        On GitHub the required context is built from two job ids — the caller
        job and the called job — so it is exactly{" "}
        <code>redline-gate / gate</code>, with the spaces. Rename either job and
        every pull request in the repository hangs.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>The required name must be</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>GitHub</td>
              <td>
                <code>redline-gate / gate</code>
              </td>
            </tr>
            <tr>
              <td>Azure DevOps</td>
              <td>
                <code>redline/gate</code> (genre <code>redline</code>, name{" "}
                <code>gate</code>)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <b>Find it.</b> <code>redline verify</code> compares the required name
        with what GitHub reported on a real pull request, on its{" "}
        <code>check-name-reported</code> line. Or ask GitHub which check the
        default branch requires:
      </p>
      <RedlineTerminal
        commands={`gh api 'repos/{owner}/{repo}/rules/branches/main' --jq '.[] | select(.type=="required_status_checks") | .parameters.required_status_checks'`}
        output={`[{"context":"redline-gate / gate"}]`}
      />
      <p>
        <b>Fix it.</b> If you renamed the caller job (<code>redline-gate</code>{" "}
        in <code>.github/workflows/redline.yml</code>) or the gate&apos;s{" "}
        <code>gate</code> job, put the name back, or re-run{" "}
        <RedlineCode args="init --repair" /> to rewrite both files. If you are
        adding your own job, see{" "}
        <Link href="/docs/gate#adding-a-check">Adding a check of your own</Link>.
      </p>
      <p>
        <b>Confirm.</b> Push to the pull request. A check named{" "}
        <code>redline-gate / gate</code> appears in <code>gh pr checks</code>,
        and <code>check-name-reported</code> in <code>verify</code> reads{" "}
        <code>ok</code>.
      </p>

      <h2 id="green-but-nothing-checked">
        The gate is green, and I do not believe it
      </h2>
      <p>You are right to check. Two things produce a false green:</p>
      <ul>
        <li>
          <b>A job that is not in the aggregate&apos;s <code>needs:</code>.</b> It
          runs, it can go red, and the <code>gate</code> job never reads it — so
          it blocks nothing while looking like it does.
        </li>
        <li>
          <b>A rung that is not what you think.</b> At{" "}
          <code>observe</code> the process checks report and never block. That
          is the default for a fresh repository and it is deliberate — see the{" "}
          <Link href="/docs/enforcement">enforcement ladder</Link>.
        </li>
      </ul>
      <p>
        Do not reason about it —{" "}
        <Link href="/docs/onboarding#prove-it">prove it</Link>: watch the gate
        pass, block, and refuse to be waived.
      </p>

      <h2 id="pending-admin">
        <code>partially onboarded</code>, or a capability that says{" "}
        <code>denied</code>
      </h2>
      <p>
        This is the normal path, not a failure: a run without admin rights
        still lands everything file-level and records what it was refused. An
        administrator clears it with <RedlineCode args="init --repair" /> —{" "}
        <Link href="/docs/onboarding#after-merge">After the pull request merges</Link>{" "}
        has the details. It is not <code>rm .redline.json</code>: your recorded
        menu, rung and onboarding date survive it.
      </p>
      <p>
        <b>Confirm.</b> In the <code>--repair</code> report, every setting reads{" "}
        <code>applied</code> or <code>already</code>, and{" "}
        <RedlineCode args="verify" /> prints <code>ok</code> on{" "}
        <code>pending-admin</code>.
      </p>
      <div className="callout">
        <p>
          <b>If your gate is vendored</b> (<code>--gate-source local</code>),
          every <code>init</code> run, <code>--repair</code> included, rewrites{" "}
          <code>.github/workflows/redline-gate.yml</code> from the shipped copy.
          Anything you added to that file by hand is gone. Put your own checks in
          their own workflow — <Link href="/docs/gate#adding-a-check">option 1</Link>.
        </p>
      </div>

      <h2 id="exemption-ignored">
        I applied <code>redline-exempt</code> and the gate still blocked
      </h2>
      <p>The gate&apos;s log says which of three causes it is:</p>
      <ul>
        <li>
          <code>A soft-fail label was applied without a valid `## Redline exemption` block (reason and expiry required).</code>{" "}
          The label on its own does nothing. The pull request description needs
          a <code>## Redline exemption</code> block with a <code>reason</code>{" "}
          of at least 20 characters and an <code>until</code> date no more than
          90 days out. See <Link href="/docs/exemptions">Exemptions</Link>.
        </li>
        <li>
          The same error, with a block present: the block does not cover the
          failing check. Its <code>scope</code> must name every process check
          that is failing, or be left out to cover them all.
        </li>
        <li>
          <code>Redline gate failed on security checks (not label-exemptible, and not on the enforcement ladder): …</code>{" "}
          Dependency review or the secret scan failed. They are the security
          floor, and no label or exemption waives them at any rung. Fix the
          dependency or remove the secret.
        </li>
      </ul>
      <p>
        <b>Find which.</b> Run the check the gate runs, on your machine,
        once per failing check (<code>checklist</code>, <code>adr</code>,{" "}
        <code>policy</code>). It prints what is wrong with the block:
      </p>
      <RedlineTerminal
        commands={`gh pr view --json body --jq .body > body.md
{redline} exempt --body-file body.md --scope checklist`}
      />
      <p>
        <b>Confirm.</b> The command prints{" "}
        <code>exempt until &lt;date&gt; (&lt;scope&gt;): &lt;reason&gt;</code>{" "}
        and exits <code>0</code>. Edit the description, and the gate runs
        again.
      </p>
      <p>
        An exemption downgrades the <i>process</i> checks — checklist, ADR,
        policy — for a reviewer who accepts the trade-off on the record. It does
        not delete the finding; it records who accepted it, why, and until when.
      </p>

      <h2 id="checklist-fails">
        The checklist check fails and the boxes look ticked
      </h2>
      <p>The <code>PR checklist</code> job fails with one of two errors:</p>
      <ul>
        <li>
          <code>No &apos;## Launch readiness&apos; section in the PR description. Restore .github/pull_request_template.md and complete the checklist.</code>{" "}
          The job finds the checklist by its heading, and the heading is gone or
          reworded. The boxes can all be ticked and it still fails. Paste the{" "}
          <code>## Launch readiness</code> section back from{" "}
          <code>.github/pull_request_template.md</code>.
        </li>
        <li>
          <code>N unchecked launch-readiness item(s). Tick each one, or delete the line and say why in the PR description.</code>{" "}
          A box under the heading is still <code>[ ]</code>. Tick it, or delete
          the line and explain why in the description.
        </li>
      </ul>
      <p>
        <b>Confirm.</b> Editing the description re-runs the job, and its log
        ends with <code>Launch readiness complete.</code>
      </p>

      <h2 id="rule-not-firing">A rule is installed and never fires</h2>
      <p>
        Check the rule&apos;s own page first —{" "}
        <code>/r/&lt;rule-id&gt;</code>, or{" "}
        <code>redline explain &lt;rule-id&gt;</code> — for what it applies to:
      </p>
      <ul>
        <li>
          <b>The globs.</b> A rule scoped to <code>**/*.ts</code> will not fire
          in a <code>.vue</code> file, whatever the profile says.
        </li>
        <li>
          <b>Added lines only.</b> The deterministic tier judges what the change{" "}
          <i>added</i>. A pre-existing violation the diff merely moves past is
          not a finding — that is the noise rule, not a bug.
        </li>
        <li>
          <b>A ticket reference silences some rules by design.</b>{" "}
          <code>core/untracked-todo</code> and{" "}
          <code>core/type-checker-suppression</code> both pass when the line
          carries one.
        </li>
      </ul>
      <p>
        If the rule genuinely cannot fire in your language — the checker knows no
        pattern your stack writes — that is a defect in Redline, not in your
        repository, and it is worth reporting. It has happened:{" "}
        <Link href="/docs/changes">the changelog</Link> has the case where a
        BLOCKER shipped to four languages it could not fire in.
      </p>

      <h2 id="findings-have-no-link">
        A finding names a rule and gives me nothing to click
      </h2>
      <p>
        Set where your organisation publishes the standard, and every finding
        carries the address of the rule it cites:
      </p>
      <RedlineTerminal commands="{redline} init --docs-url https://your-docs.example.com" />
      <p>
        It is recorded in <code>.redline.json</code> as{" "}
        <code>docsBaseUrl</code> and is empty by default. There is no default on
        purpose: a link to somebody else&apos;s copy of the standard is worse
        than no link, and an organisation running Redline internally wants
        findings pointing at its own.
      </p>

      <h2 id="drift">
        Verify says the artifacts are stale and I did not touch them
      </h2>
      <p>
        The rendered files are compared with what the CLI running{" "}
        <code>verify</code> would render. Which of these lines{" "}
        <code>artifacts-current</code> prints tells you what moved:
      </p>
      <ul>
        <li>
          <b>
            <code>standards updated upstream (vA → vB) — re-run redline init to adopt</code>
          </b>{" "}
          — the CLI running the check is newer than the one that rendered this
          repository, so it carries a newer standard. Re-running{" "}
          <code>init</code> with the copy pinned in <code>package.json</code>{" "}
          changes nothing: it renders the version this repository already has.
          Bump the pin, then re-run <code>init</code> and merge the pull request
          — the walk-through is in{" "}
          <Link href="/docs/learn/next-steps">Learn 10</Link>.
        </li>
        <li>
          <b>
            <code>this CLI renders standards vA, older than the vB this repository recorded</code>
          </b>{" "}
          — your copy of the CLI is behind the repository. Install the version
          in <code>package.json</code> rather than re-running <code>init</code>,
          which would render the repository backwards.
        </li>
        <li>
          <b>
            <code>this repository&apos;s own .redline/local.md has changed since the last render</code>
          </b>{" "}
          — re-run <RedlineCode args="init" /> to fold it in.
        </li>
        <li>
          <b>
            <code>stale: …</code>
          </b>{" "}
          — the same version renders differently, so somebody edited inside a{" "}
          <code>REDLINE</code> block. <RedlineCode args="init" /> restores it;
          your own content outside the markers is never touched.
        </li>
      </ul>
      <p>
        On a repository in the register, the platform team does the first case
        for you: <code>redline sync</code>, run from a checkout of the Redline
        source repository, opens the update pull request — see{" "}
        <Link href="/docs/distribution">Distribution &amp; drift</Link>. It only
        reaches repositories listed in <code>registry.json</code>; any other
        repository updates itself.
      </p>

      <h2 id="get-out">I want it off this repository</h2>
      <p>
        Close the onboarding pull request if it has not merged — nothing was
        changed. If it has,{" "}
        <Link href="/docs/removing">Removing Redline</Link> lists every file and
        host setting <code>redline init</code> created and how to take each one
        back out. Read the part about the security floor before you start:
        secret scanning and push protection are host settings that were probably
        worth having anyway.
      </p>

      <h2 id="failed-unexpectedly">
        <code>redline failed unexpectedly</code>
      </h2>
      <p>
        That line means a defect in Redline, not a mistake in how it was run —
        a usage mistake exits 2 and names the flag, and a mistyped flag or
        command says which one you probably meant. Re-run the same command with{" "}
        <code>REDLINE_DEBUG=1</code> set and the stack trace is printed to
        stderr. Include it when you open an issue. The exit code stays{" "}
        <code>4</code>.
      </p>

      <h2>Still stuck</h2>
      <p>
        <code>redline status</code> prints what this repository recorded, and{" "}
        <code>redline verify --json</code> gives the same checks in a form you
        can paste. Both are safe to share — neither includes a credential. Open
        an issue with the output rather than a description of it.
      </p>
    </DocsPage>
  );
}
