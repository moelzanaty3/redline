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
      intro="The reusable GitHub Actions workflows: gate, sync, telemetry collection, digest, inbox, dashboard, canary and onboarding verification."
      href="/docs/workflows"
    >
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {WORKFLOWS.map((w) => (
          <Link className="doc-card" href={`/docs/workflows/${w.slug}`} key={w.slug}>
            <h3>{w.title} <span>→</span></h3>
            <p>{w.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
