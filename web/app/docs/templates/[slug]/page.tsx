import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { TEMPLATES, findBySlug } from "@/lib/registry";
import { TEMPLATES_INFO } from "@/lib/templates-info";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(TEMPLATES, slug);
  return { title: entry ? `${entry.title} — Templates` : "Templates" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findBySlug(TEMPLATES, slug);
  if (!entry) notFound();
  const info = TEMPLATES_INFO[slug];
  if (!info) notFound();

  return (
    <DocsPage
      crumb={`Reference / Templates / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href="/docs/templates"
    >
      <h2>What this is</h2>
      <p>{info.what}</p>

      <h2>When it applies to you</h2>
      <p>
        <b>Installed as:</b>{" "}
        {info.installedAs ? <code>{info.installedAs}</code> : "Nowhere — not installed by anything."}
      </p>
      <p>
        <b>Installed by:</b> {info.installedBy}
      </p>

      <h2>What it actually does</h2>
      <ul>
        {info.detail.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h2>What you do with it</h2>
      <p>{info.action}</p>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={420} />
    </DocsPage>
  );
}
