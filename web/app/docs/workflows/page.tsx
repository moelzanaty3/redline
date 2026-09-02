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
          These are GitHub Actions workflows and are GitHub-only. The CLI
          drives onboarding and verification identically on Azure DevOps, but
          the org-wide telemetry pipeline below hasn&apos;t been
          adapter-ised for it yet — see{" "}
          <Link href="/docs/telemetry">Telemetry &amp; validation</Link>.
        </p>
      </div>
      <p>
        Two are wired up but disabled in Phase 1 —{" "}
        <code>redline-sync.yml</code> and{" "}
        <code>verify-onboarding.yml</code> both carry <code>if: false</code>{" "}
        and cannot run even on their own trigger. Automated standards
        distribution returns in Phase 3.
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
