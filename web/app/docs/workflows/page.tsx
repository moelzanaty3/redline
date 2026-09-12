import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { WORKFLOWS } from "@/lib/registry";

export const metadata: Metadata = { title: "Workflows" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Workflows"
      intro="The GitHub Actions workflows behind the merge gate and the telemetry pipeline: what each does, what triggers it, where it lives, and whether it works today."
      href="/docs/workflows"
    >
      <p>
        Only one of these is something your repo calls directly:{" "}
        <code>redline-gate.yml</code>, referenced by name from the caller
        workflow (<code>templates/redline.yml</code>) that{" "}
        <code>redline init</code> installs. The rest are org infrastructure
        for telemetry — they live in a central repo (usually{" "}
        <code>redline-metrics</code>), need their own secrets, and run on a
        schedule whether or not any given product repo exists.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          GitHub Actions, so GitHub-only — the CLI onboards and verifies on
          Azure DevOps, the scheduled plane does not yet reach it. See{" "}
          <Link href="/docs/telemetry">Telemetry &amp; validation</Link>.
        </p>
      </div>
      <p>
        <code>redline-sync.yml</code> and <code>verify-onboarding.yml</code> are
        live where a platform team has installed them and created the tokens they
        name — <code>sync</code> is a real cross-repository write on a GitHub
        estate, pull-request-only and scoped. See{" "}
        <Link href="/docs/who-runs-what">Who runs what</Link> for which credential
        each one holds.
      </p>
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
    </DocsPage>
  );
}
