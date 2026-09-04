import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "The merge gate" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The merge gate"
      intro="Installed by redline init on every onboarded repo, on either host, running advisory in Phase 1: it reports on merge readiness, it does not block, until a repo deliberately promotes it."
      href="/docs/gate"
    >
      <h2>What it checks</h2>
      <ul>
        <li><b>Merge-readiness checklist</b> — the PR template&apos;s checklist section must be fully ticked; the gate fails loudly if the heading was deleted.</li>
        <li><b>ADR for big diffs</b> — large changes must link a decision record.</li>
        <li><b>Dependency review</b> — new vulnerable or malicious dependencies block.</li>
        <li><b>Diff secret scan</b> — a SHA-pinned scanner over the PR diff, verified results only.</li>
      </ul>

      <h2>Process vs security</h2>
      <p>
        The <code>redline-exempt</code> label downgrades the <b>process</b>{" "}
        checks — checklist and ADR — to warnings, for a reviewer who accepts
        the trade-off. It does nothing to dependency review or the secret scan.{" "}
        <b>Security checks can never be label-exempted.</b>
      </p>

      <h2>Two hosts, two gate contracts</h2>
      <p>
        Reusable GitHub workflows report a check-run name derived from two job
        ids, and requiring the wrong string means every PR sits on “Expected —
        waiting for status” forever — the classic silent failure. Azure has no
        such derivation: Redline defines its own contract, so nothing is
        derived from a job name and that failure mode doesn&apos;t exist on
        that host.
      </p>
      <p>
        Azure Repos ignores a pipeline&apos;s YAML <code>pr:</code> trigger, so
        the gate pipeline alone runs nothing. <code>redline init</code> also
        registers a build definition for it and a <code>Redline: gate build</code>{" "}
        Build Validation branch policy that queues that pipeline on every pull
        request — without Build Administrator rights that registration is
        recorded as pending and the required status is written advisory,
        since no pipeline could publish what it would require.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Host</th><th>Gate contract</th><th>Required by the policy as</th></tr>
          </thead>
          <tbody>
            <tr><td>GitHub</td><td>Check-run name from the caller/called job ids</td><td><code>redline-gate / gate</code></td></tr>
            <tr><td>Azure DevOps</td><td>PR status, genre <code>redline</code>, name <code>gate</code></td><td><code>redline/gate</code></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <code>redline verify</code> reads back the check names or statuses the
        host <b>actually reported</b> on a real pull request — not what a
        config file claims — before it will call the check name confirmed.
      </p>

      <h2>Policy invariants</h2>
      <ul>
        <li>One human approval, always — automated review is advisory input, never the approver.</li>
        <li>Review threads must be resolved before merge.</li>
        <li>Applied per repo by <code>redline init</code>, as a GitHub ruleset named <code>Redline</code> or an Azure DevOps branch policy — no manual per-repo setup, no drift from a hand-edited setting.</li>
        <li>Advisory by default in Phase 1 on both hosts. Promotion to blocking is a deliberate second step, after a soak period, not an onboarding default.</li>
      </ul>
    </DocsPage>
  );
}
