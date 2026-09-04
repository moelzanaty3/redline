import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { TEMPLATES } from "@/lib/registry";

export const metadata: Metadata = { title: "Templates & rulesets" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Templates & rulesets"
      intro="What each per-repo file is, where it lands, who installs it, and — for the two ruleset JSON files — whether anything actually applies it."
      href="/docs/templates"
    >
      <p>
        Not everything here is live automation. Three of these files are read
        and written directly by <code>redline init</code>; two are copied by
        a human once; two are reference shapes that nothing in this codebase
        applies. Each page below says which.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {TEMPLATES.map((t) => (
          <Link className="doc-card" href={`/docs/templates/${t.slug}`} key={t.slug}>
            <h3>{t.title} <span>→</span></h3>
            <p>{t.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
