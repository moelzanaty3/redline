import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { SCRIPTS } from "@/lib/registry";

export const metadata: Metadata = { title: "Scripts" };

export default function Page() {
  return (
    <DocsPage
      crumb="Maintaining Redline"
      title="Scripts"
      intro="Maintainer tooling for this repository's own CI, telemetry and validation. If you are onboarding or checking a product repo, you want redline init and redline verify instead."
      href="/docs/scripts"
    >
      <p>
        Every script here runs in one of three places: this repo&apos;s own
        CI on every pull request, a scheduled workflow in the{" "}
        <code>redline-metrics</code> repo, or a maintainer&apos;s own
        terminal. None of them talk to a product repo directly — that&apos;s
        what the CLI is for.
      </p>
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
