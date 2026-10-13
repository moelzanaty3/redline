import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { WORKFLOW_EDIT } from "@/lib/lifecycle";
import { WORKFLOWS } from "@/lib/registry";

export const metadata: Metadata = { title: "Workflows" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Workflows"
      intro="The GitHub Actions workflows behind the merge gate, distribution and telemetry: where each one runs, what starts it, and what it leaves behind."
      href="/docs/workflows"
    >
      <p>
        Onboarding a repository installs one thing that runs there: a thin caller
        that invokes <code>redline-gate.yml</code> on every pull request.
        Everything that has to see the whole estate — distributing standards,
        checking for drift, collecting telemetry, testing the reviewer — runs
        centrally instead, so no product repository has to hold a Redline secret.
      </p>
      <ul>
        <li>
          <b>In the onboarded repository:</b> <code>redline-gate.yml</code>, through
          the caller <code>redline init</code> writes.
        </li>
        <li>
          <b>In this source repository:</b> <code>redline-sync.yml</code>,{" "}
          <code>verify-onboarding.yml</code> and <code>inbox.yml</code>.
        </li>
        <li>
          <b>In a separate <code>redline-metrics</code> repository</b>, copied
          there by hand: <code>redline-collect.yml</code>,{" "}
          <code>dashboard.yml</code>, <code>weekly-digest.yml</code> and{" "}
          <code>seed-canary.yml</code>. It owns the collected data and nothing
          else.
        </li>
      </ul>
      <p>
        Which credential each one holds is on{" "}
        <Link href="/docs/who-runs-what">Who runs what</Link>.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          These are GitHub Actions workflows. The CLI onboards and verifies Azure
          DevOps repositories too, but nothing here reaches them yet — see{" "}
          <Link href="/docs/telemetry">Telemetry &amp; validation</Link>.
        </p>
      </div>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {WORKFLOWS.map((w) => (
          <Link className="doc-card" href={`/docs/workflows/${w.slug}`} key={w.slug}>
            <h3>
              {w.title} <span>→</span>
            </h3>
            <p>{w.description}</p>
          </Link>
        ))}
      </div>

      <h2>Changing a workflow</h2>
      <LifecycleSteps steps={WORKFLOW_EDIT} />
    </DocsPage>
  );
}
