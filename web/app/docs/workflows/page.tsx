import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { WORKFLOW_EDIT } from "@/lib/lifecycle";
import { WORKFLOWS } from "@/lib/registry";
import { WORKFLOWS_INFO, type WorkflowHome } from "@/lib/workflows-info";

export const metadata: Metadata = { title: "Workflows" };

const HOME_LABEL: Record<WorkflowHome, string> = {
  onboarded: "Each onboarded repository",
  source: "This source repository",
  metrics: "redline-metrics",
};

export default function Page() {
  const rows = WORKFLOWS.flatMap((workflow) => {
    const info = WORKFLOWS_INFO[workflow.slug];
    return info ? [{ ...workflow, info }] : [];
  });

  return (
    <DocsPage
      crumb="Reference"
      title="Workflows"
      intro="The GitHub Actions workflows behind the merge gate, distribution and measurement: where each one runs, when, and with which credential."
      href="/docs/workflows"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>For the platform team maintaining Redline.</b> If you work in a
          product repository, the only workflow that touches you is the merge
          gate — read <Link href="/docs/gate">The merge gate</Link> instead.
        </p>
      </div>

      <h2>Why most of them run centrally</h2>
      <p>
        Onboarding a repository installs one workflow there: a thin caller that
        runs the <b>merge gate</b> (<code>redline-gate.yml</code>) on every pull
        request. The gate is the required status check that decides whether a
        pull request can merge.
      </p>
      <p>
        Everything that needs to see many repositories runs centrally instead:
        distributing standards, checking for drift, collecting telemetry and
        testing the reviewer. That way no product repository holds a Redline
        secret. The central workflows live in two places:
      </p>
      <ul>
        <li>
          <b>This source repository</b>, which holds the standards and the
          register of onboarded repositories.
        </li>
        <li>
          <b>A separate <code>redline-metrics</code> repository</b>, which owns
          the collected data and nothing else. You copy those workflow files
          there by hand.
        </li>
      </ul>

      <h2>All workflows</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Workflow</th>
              <th>Runs in</th>
              <th>When</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug}>
                <td>
                  <Link href={`/docs/workflows/${r.slug}`}>
                    <code>{r.title}</code>
                  </Link>
                </td>
                <td>{HOME_LABEL[r.info.home]}</td>
                <td>{r.info.cadence}</td>
                <td>{r.info.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        This repository&apos;s own CI lives in <code>.github/workflows/</code>{" "}
        and is not distributed: <code>ci.yml</code> and <code>release.yml</code>{" "}
        run the <Link href="/docs/scripts">maintainer scripts</Link>, and{" "}
        <code>registry.yml</code> rebuilds <code>registry.json</code> nightly
        with <Link href="/docs/cli/registry">redline registry</Link>.
      </p>
      <p>
        Which credential each workflow holds, and how far it reaches, is on{" "}
        <Link href="/docs/who-runs-what">Who runs what</Link>.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          These are GitHub Actions workflows only. The CLI also onboards Azure
          DevOps repositories, but no scheduled workflow reaches them yet — see{" "}
          <Link href="/docs/telemetry">Telemetry &amp; validation</Link>.
        </p>
      </div>

      <h2>Changing a workflow</h2>
      <LifecycleSteps steps={WORKFLOW_EDIT} />
    </DocsPage>
  );
}
