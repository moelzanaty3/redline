import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { STANDARDS } from "@/lib/registry";

export const metadata: Metadata = { title: "Standards" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Standards"
      intro="The full rule set — 249 rules across core and 12 stacks, each with a permanent id. Open any file to read it in full and copy it."
      href="/docs/standards"
    >
      <p>
        These are the files a human edits. Everything else — Copilot
        instructions, AGENTS.md, CLAUDE.md, Cursor rules — is generated from
        them by the CLI&apos;s renderer, and written to a repo by{" "}
        <code>redline init</code>.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {STANDARDS.map((s) => (
          <Link className="doc-card" href={`/docs/standards/${s.slug}`} key={s.slug}>
            <h3>{s.title} <span>→</span></h3>
            <p>{s.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
