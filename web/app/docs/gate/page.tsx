import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "The readiness gate" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The readiness gate"
      intro="A reusable GitHub Actions workflow, required on every PR of every onboarded repo as the name-verified check redline-gate / gate."
      href="/docs/gate"
    >
      <h2>What it checks</h2>
      <ul>
        <li><b>Launch-readiness checklist</b> — the <code>## Launch readiness</code> section of the PR template must be fully ticked; the gate fails loudly if the heading was deleted.</li>
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

      <h2>Why the name is verified three times</h2>
      <p>
        Reusable workflows report as{" "}
        <code>&lt;caller job&gt; / &lt;called job&gt;</code>. Require the wrong
        name and every PR sits on “Expected — waiting for status” forever — the
        classic silent failure. <code>redline-gate / gate</code> is asserted in
        the ruleset JSON, in <code>scripts/validate.mjs</code> (CI fails if a
        job is renamed), and by <code>setup-repo.sh --verify</code>, which
        reads the names GitHub actually reported on a real PR.
      </p>

      <h2>Ruleset invariants</h2>
      <ul>
        <li>One human approval, always — automated review is advisory input, never the approver. CI fails if approvals are ever lowered to zero.</li>
        <li>Last-push approval required, review threads must be resolved.</li>
        <li>Applied org-wide via the <code>redline</code> custom repository property — no per-repo drift.</li>
      </ul>
    </DocsPage>
  );
}
