import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { WORKFLOWS, findBySlug } from "@/lib/registry";
import { WORKFLOWS_INFO } from "@/lib/workflows-info";

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
  const info = WORKFLOWS_INFO[slug];
  if (!info) notFound();

  return (
    <DocsPage
      crumb={`Reference / Workflows / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href={`/docs/workflows/${slug}`}
    >
      <p>{info.what}</p>
      <ul>
        <li>
          <b>Lives in:</b> {info.livesIn}
        </li>
        <li>
          <b>Runs on:</b> {info.trigger}
        </li>
        <li>
          <b>Setting it up:</b> {info.install}
        </li>
      </ul>

      {info.steps.length > 0 && (
        <>
          <h2>What a run does</h2>
          <ol>
            {info.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      )}
      <p>
        <b>Leaves behind:</b> {info.output} More on{" "}
        <Link href={info.docs.href}>{info.docs.label}</Link>.
      </p>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
