import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Exemptions" };

const BLOCK = `## Redline exemption

- reason: the upstream fix lands in v4 and we are pinned to v3 until the migration
- until: 2026-11-30
- scope: checklist`;

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Exemptions"
      intro="Merging with a failing process check is sometimes the right call. Doing it without a record is not, so an exemption says what was accepted, why, and until when."
      href="/docs/exemptions"
    >
      <h2>Why a record, not just a label</h2>
      <p>
        A check that can never be waived gets worked around: someone disables it, or stops
        trusting it. A check that can be waived with a bare label gets waived without anyone
        knowing why, and the waiver outlives the reason. An exemption sits between the two. The{" "}
        <code>redline-exempt</code> label marks the pull request, and a block in its description
        says why and until when, so a reader months later can tell whether anyone still stands
        behind it.
      </p>
      <p>
        It only matters at a blocking <Link href="/docs/enforcement">rung</Link>. At{" "}
        <code>observe</code> a failing process check does not stop a merge anyway.{" "}
        <Link href="/docs/learn/exemptions">Learn step 08</Link> writes one on a real pull request.
      </p>

      <h2>What the gate reads</h2>
      <p>
        The pull request template carries the section already, empty, for you to fill in or
        delete:
      </p>
      <CodeWindow title="in the pull request body" copyText={BLOCK}>
        <span className="tk-white">{BLOCK}</span>
      </CodeWindow>
      <ul>
        <li>
          <b>reason</b>: at least 20 characters. &ldquo;Needed for release&rdquo; tells a reader in
          three months nothing they can act on.
        </li>
        <li>
          <b>until</b>: a <code>YYYY-MM-DD</code> date, at most <b>90 days</b> out. Longer than that
          is a standards change, not an exemption; raise it in the Redline source repository.
        </li>
        <li>
          <b>scope</b>: which process checks it covers, comma separated: <code>checklist</code>,{" "}
          <code>adr</code>, <code>policy</code>. <b>Omit it and the exemption covers all three.</b>{" "}
          The gate checks the scope against every failing check, one at a time, so an exemption
          for <code>checklist</code> does not also waive a failing <code>policy</code>.
        </li>
      </ul>
      <p>Check it before you push, with the description saved to a file:</p>
      <RedlineTerminal commands="{redline} exempt --body-file body.md --scope checklist" />
      <p>
        It exits 0 when the exemption applies, and otherwise says which field is wrong.
      </p>
      <p>
        A label with no valid block is refused. A repository can pass{" "}
        <code>exemption-enforcement: warn</code> to its gate to accept the label with a warning
        instead; <code>require</code> is the default.
      </p>

      <h2>What it can never do</h2>
      <div className="callout">
        <span className="ic">!</span>
        <p>
          An exemption touches the <b>process</b> checks only: the checklist, the ADR requirement
          and the deterministic policy. It cannot waive dependency review or the secret scan. That
          boundary is what makes the <Link href="/docs/gate">security floor</Link> a floor rather
          than a default.
        </p>
      </div>
      <p>
        Redline&apos;s own sync pull requests are exempted the same way, with no special case in
        the gate; see <Link href="/docs/distribution#sync-exemption">Distribution</Link>.
      </p>

      <h2>What gets measured</h2>
      <p>
        The collector records the parsed exemption per pull request, so standing exemptions trend
        on the <Link href="/docs/telemetry">dashboard</Link>. A team routing around the gate shows
        up as the same scope recurring across pull requests, which a per-pull-request view can
        never show. An expired exemption drops out of that count: it is history, not a standing
        problem.
      </p>
    </DocsPage>
  );
}
