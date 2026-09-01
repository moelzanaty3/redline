import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { STANDARDS, findBySlug } from "@/lib/registry";

export function generateStaticParams() {
  return STANDARDS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(STANDARDS, slug);
  return { title: entry ? `${entry.title} — Standards` : "Standards" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findBySlug(STANDARDS, slug);
  if (!entry) notFound();
  return (
    <DocsPage
      crumb={`Reference / Standards / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href="/docs/standards"
    >
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
