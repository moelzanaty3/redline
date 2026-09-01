import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { SCRIPTS, findBySlug } from "@/lib/registry";

export function generateStaticParams() {
  return SCRIPTS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(SCRIPTS, slug);
  return { title: entry ? `${entry.title} — Scripts` : "Scripts" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findBySlug(SCRIPTS, slug);
  if (!entry) notFound();
  return (
    <DocsPage
      crumb={`Reference / Scripts / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href="/docs/scripts"
    >
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
