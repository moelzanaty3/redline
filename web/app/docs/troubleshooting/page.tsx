import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

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
      <CodeWindow title="terminal" copyText="npx redlinegate verify">
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redlinegate verify</span>
      </CodeWindow>
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
      <p>
        You are right to check. A gate that never runs and a gate that finds
        nothing look identical from the outside — both are green ticks. Two
        things produce a false green:
      </p>
      <ul>
        <li>
          <b>A job that is not in the aggregate&apos;s <code>needs:</code>.</b> It
          runs, it can go red, and the <code>gate</code> job never reads it — so
          it blocks nothing while looking like it does.
        </li>
        <li>
          <b>A rung that is not what you think.</b> At{" "}
          <code>observe</code> and <code>warn</code> the process checks report
          and never block. That is the default for a fresh repository and it is
          deliberate — see the{" "}
          <Link href="/docs/enforcement">enforcement ladder</Link>.
        </li>
      </ul>
      <p>
        Do not reason about it. <Link href="/docs/verification">Verification</Link>{" "}
        is nine scenarios on a throwaway branch that make the gate pass, block,
        and refuse to be waived in front of you. It takes about twenty minutes,
        mostly waiting.
      </p>

      <h2 id="pending-admin">
        <code>partially onboarded</code>, or a capability that says{" "}
        <code>denied</code>
      </h2>
      <p>
        This is the normal path, not a failure. An engineer without repository
        admin rights still gets everything file-level; the settings that need an
        administrator come back <code>denied</code>, are recorded in{" "}
        <code>.redline.json</code> under <code>pendingAdmin</code>, and{" "}
        <code>verify</code> keeps saying <b>partially onboarded</b> until
        somebody with the rights clears them.
      </p>
      <p>
        The point is that it is <i>recorded</i> rather than silently skipped. To
        clear it, have an administrator re-run with a token that has the rights:
      </p>
      <CodeWindow title="terminal" copyText="npx redlinegate init --repair">
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redlinegate init --repair</span>
      </CodeWindow>
      <p>
        <code>--repair</code> re-applies every capability and recomputes{" "}
        <code>pendingAdmin</code> from the fresh outcomes. It is not{" "}
        <code>rm .redline.json</code>: your recorded menu, rung and onboarding
        date survive it.
      </p>
      <div className="callout">
        <p>
          <b>If your gate is vendored</b> (<code>--gate-source local</code>),{" "}
          <code>--repair</code> also rewrites{" "}
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
      <CodeWindow
        title="terminal"
        copyText="npx redlinegate init --docs-url https://your-docs.example.com"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">
          npx redlinegate init --docs-url https://your-docs.example.com
        </span>
      </CodeWindow>
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
        The standard moved. <code>standards/</code> is versioned, and a change
        there reaches every onboarded repository as a pull request — see{" "}
        <Link href="/docs/distribution">Distribution &amp; drift</Link>.
        Re-render locally with:
      </p>
      <CodeWindow title="terminal" copyText="npx redlinegate init --no-commit">
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redlinegate init --no-commit</span>
      </CodeWindow>
      <p>
        <code>--no-commit</code> writes the files into the working tree and
        stops: no host request, no branch, no pull request. It needs no
        credential and works offline, so it is the safe way to see what a
        re-render would do. Your own content above every{" "}
        <code>REDLINE:BEGIN</code> marker is never touched.
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
