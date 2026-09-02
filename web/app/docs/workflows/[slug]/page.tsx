import type { Metadata } from "next";
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
      href="/docs/workflows"
    >
      {info.disabled && (
        <div className="callout info">
          <span className="ic">ℹ</span>
          <p>
            <b>Disabled in Phase 1.</b> This job carries <code>if: false</code> and
            does not run on its trigger, regardless of what fires it.
          </p>
        </div>
      )}

      <h2>What this is</h2>
      <p>{info.what}</p>

      <h2>When it applies to you</h2>
      <p>
        <b>Lives in:</b> {info.livesIn}
      </p>
      <p>
        <b>Trigger:</b> {info.trigger}
      </p>

      <h2>What it actually does</h2>
      <ul>
        {info.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      <p>{info.phase1}</p>

      <h2>What you do with it</h2>
      <p>{info.action}</p>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
