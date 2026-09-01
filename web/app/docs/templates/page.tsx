import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { TEMPLATES } from "@/lib/registry";

export const metadata: Metadata = { title: "Templates & rulesets" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Templates & rulesets"
      intro="The per-repo templates and branch rulesets — small files, shown in full. Copy what you need."
      href="/docs/templates"
    >
      {TEMPLATES.map((t) => (
        <section key={t.slug} id={t.slug}>
          <h2>{t.title}</h2>
          <p>{t.description}</p>
          <FileViewer file={t.file} maxHeight={420} />
        </section>
      ))}
    </DocsPage>
  );
}
