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
      intro="What each failure actually means, and the command that resolves it. Ordered by how often it happens rather than by how the system is built — you are here with a symptom, not a component."
      href="/docs/troubleshooting"
    >
      <p>
        Everything below is a real message from <code>redline</code>, the gate,
        or the host. If you have a string, search it — <kbd>⌘K</kbd> indexes the
        prose of every page and every rule id.
      </p>

      <h2>Start here: one command answers most of it</h2>
      <p>
        <code>redline verify</code> reads back what the host actually reports,
        not what a config file claims, and names every check that is wrong. Run
        it before reading further; the row it prints is the section you want.
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
                <code>not onboarded</code>
              </td>
              <td>
                no <code>.redline.json</code> here. Nothing has been installed.
              </td>
              <td>
                <code>2</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Three different people act on those three answers, which is why they are
        three answers and not two.
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
        <code>redline verify</code> catches this: it compares the required
        context against what the host reported on a real pull request. If you
        edited the gate yourself, see{" "}
        <Link href="/docs/gate#adding-a-check">Adding a check of your own</Link>{" "}
        — renaming a job id is the first of the two traps there.
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
      <p>Two reasons, and they are different problems:</p>
      <ul>
        <li>
          <b>The label on its own does nothing.</b> It needs a{" "}
          <code>## Redline exemption</code> block in the pull request body with a{" "}
          <code>reason</code> of at least 20 characters, an <code>until</code>{" "}
          date no more than 90 days out, and a <code>scope</code>. A label with no
          block is a label. See <Link href="/docs/exemptions">Exemptions</Link>.
        </li>
        <li>
          <b>You exempted a security check.</b> Dependency review and the secret
          scan are the security floor. They are not on the ladder and{" "}
          <b>no label waives them at any rung</b> — that is the one thing an
          exemption cannot do, on purpose.
        </li>
      </ul>
      <p>
        An exemption downgrades the <i>process</i> checks — checklist, ADR,
        policy — for a reviewer who accepts the trade-off on the record. It does
        not delete the finding; it records who accepted it, why, and until when.
      </p>

      <h2 id="checklist-fails">
        The checklist check fails and the boxes look ticked
      </h2>
      <p>
        The gate reads the checklist section of the pull request template by its
        heading. It fails loudly when the heading has been deleted — which is
        different from an unticked box, and is the failure people spend longest
        on because the body <i>looks</i> fine. Restore the heading from the
        template Redline installed, or from{" "}
        <Link href="/docs/templates">Templates &amp; rulesets</Link>.
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
