import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { WORKFLOWS, findBySlug } from "@/lib/registry";

export function generateStaticParams() {
  return WORKFLOWS.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(WORKFLOWS, slug);
  return { title: entry ? `${entry.title} — Workflows` : "Workflows" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = findBySlug(WORKFLOWS, slug);
  if (!entry) notFound();
  return (
    <DocsPage
      crumb={`Reference / Workflows / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href="/docs/workflows"
    >
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
