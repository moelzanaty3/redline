import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

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
      intro="Merging with a failing process check is sometimes the right call. Doing it without a record is not — so an exemption names who accepted what, why, and until when."
      href="/docs/exemptions"
    >
      <h2>Why a label was not enough</h2>
      <p>
        <code>redline-exempt</code> used to be a bare label. It downgraded the
        process checks to warnings and recorded nothing, which left the estate
        unable to answer the two questions that actually matter about an
        exemption: <b>is anyone still standing behind it</b>, and{" "}
        <b>was it ever meant to be permanent</b>. An exemption nobody has to
        justify and nobody revisits is not an exemption — it is an opt-out with a
        friendlier name.
      </p>

      <h2>What the gate reads</h2>
      <p>
        The label still marks the pull request. The <i>reason</i> lives in a block
        in its body, which <code>redline exempt</code> parses and the gate acts
        on. The pull request template carries the section already, empty, for you
        to fill in or delete.
      </p>
      <CodeWindow title="in the pull request body" copyText={BLOCK}>
        <span className="tk-white">{BLOCK}</span>
      </CodeWindow>
      <ul>
        <li>
          <b>reason</b> — at least 20 characters. &ldquo;Needed for release&rdquo;
          tells a reader in three months nothing they can act on.
        </li>
        <li>
          <b>until</b> — a date, at most <b>90 days</b> out. Longer than that is a
          standards change, not an exemption; raise it in the Redline source repo.
        </li>
        <li>
          <b>scope</b> — which checks it covers. Omit it to cover both process
          checks, which is what the bare label meant implicitly.
        </li>
      </ul>

      <h2>What it can never do</h2>
      <div className="callout">
        <span className="ic">!</span>
        <p>
          An exemption touches the <b>process</b> checks only — the checklist and
          the ADR requirement. It has never been able to waive dependency review
          or the diff secret scan, and it still cannot. That boundary is
          load-bearing: it is what makes the security floor a floor rather than a
          default.
        </p>
      </div>

      <h2>How it arrives</h2>
      <p>
        This is a behaviour change for every onboarded repository, so it ships
        behind a grace. The gate&apos;s <code>exemption-enforcement</code> input
        defaults to <code>warn</code>: a label with no valid block is accepted and
        told what is missing. A repository moves to <code>require</code> one
        standards version later — so nobody&apos;s open pull request is failed by
        a rule that did not exist when they opened it.
      </p>

      <h2>Redline exempts itself the same way</h2>
      <p>
        A <Link href="/docs/distribution">sync pull request</Link> carries a real
        exemption block rather than being a special case in the gate — one rule
        for everyone is worth more than a convenience for the tool that wrote the
        rule. Its exemption expires after 30 days, which means{" "}
        <b>a sync pull request nobody merges starts failing its own gate</b>. That
        is exactly what should happen to a standards change a repository is
        quietly refusing.
      </p>

      <h2>What gets measured</h2>
      <p>
        The collector records the parsed exemption per pull request, so standing
        exemptions trend on the dashboard. A team routing around the gate shows up
        as the same scope recurring across pull requests — which is the guardrail
        the programme asks for, and one a per-pull-request view can never show. An
        expired exemption drops out of that count: it is history, not a standing
        problem.
      </p>
    </DocsPage>
  );
}
