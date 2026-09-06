import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Cost and value" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Cost and value"
      intro="Redline could prove review works and could not say what it cost. Cost per BLOCKER caught is the number that closes that, and no other tool in the chain can compute it."
      href="/docs/cost"
    >
      <h2>Why nobody else can compute it</h2>
      <p>
        A cost-management tool knows spend and has no findings, so it cannot
        compute value. A DORA tool has neither. Redline knows which findings were{" "}
        <b>acted on</b>. Joining the two is the whole argument.
      </p>
      <CodeWindow
        title="terminal"
        copyText="npx redlinegate metrics roi --data data --days 90 --spend-total 850 --spend-grain org"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">
          npx redlinegate metrics roi --data data --days 90 \
        </span>
        {"\n"}
        <span className="tk-white">
          {"    --spend-total 850 --spend-grain org"}
        </span>
      </CodeWindow>
      <p>
        It writes <code>roi.html</code> — one page a finance stakeholder can read,
        sourced entirely from collected data.
      </p>

      <h2>Value is what was acted on</h2>
      <p>
        Not what was reported. A finding nobody acted on caught nothing, and
        counting it would let the return be inflated by <b>producing more
        noise</b> — precisely the behaviour the guardrails exist to prevent.
      </p>

      <h2>The refusals are the design</h2>
      <p>
        Every figure here will be quoted at someone who acts on it, so each one
        that cannot be sourced says so instead of being approximated.
      </p>
      <ul>
        <li>
          <b>An org-level spend figure will not answer a per-repository question.</b>{" "}
          Org spend divided by repository count and presented as per-repo cost
          looks precise, is invented, and is exactly the number a stakeholder
          would act on. Redline says to publish org-level cost against org-level
          value instead.
        </li>
        <li>
          <b>Deployment frequency is unknown, not zero</b>, where a repository
          does not use the deployments API. Assuming one deploy per merge reports
          a trunk-based team and a quarterly-release team as identical — the exact
          distinction the metric draws.
        </li>
        <li>
          <b>MTTR is refused by name</b>, so nobody wonders whether it was
          forgotten. It needs an incident feed Redline does not have and should
          not acquire.
        </li>
        <li>
          <b>Change failure rate travels with its caveat.</b> It is a floor, not
          the true rate: a revert or hotfix is evidence of a failed change rather
          than proof, and a team that fixes forward without saying
          &ldquo;hotfix&rdquo; scores better than one that labels honestly.
        </li>
      </ul>

      <h2>The spend figure is yours to supply</h2>
      <p>
        No script here reads a vendor&apos;s billing API, and nothing on the page
        is estimated. You pass the figure from the assistant vendor&apos;s own
        usage reporting, and Redline records its <b>grain</b> — per repository or
        org-wide — alongside it, so a later reader knows what it can and cannot
        answer.
      </p>

      <h2>Delivery metrics, from data already collected</h2>
      <p>
        Lead time and change failure rate come from the merged pull requests the
        nightly collector already walks — see{" "}
        <Link href="/docs/telemetry">Telemetry</Link>. Nothing new is instrumented
        in a product repository to produce them.
      </p>
    </DocsPage>
  );
}
