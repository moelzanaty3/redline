import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { SCRIPTS } from "@/lib/registry";

export const metadata: Metadata = { title: "Scripts" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Scripts"
      intro="Render, sync, onboarding, validation, scoring and telemetry — every script in the bundle, viewable in full and ready to copy."
      href="/docs/scripts"
    >
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {SCRIPTS.map((s) => (
          <Link className="doc-card" href={`/docs/scripts/${s.slug}`} key={s.slug}>
            <h3>{s.title} <span>→</span></h3>
            <p>{s.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
