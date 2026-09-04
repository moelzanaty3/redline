import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { WORKFLOWS, findBySlug } from "@/lib/registry";
import { WORKFLOWS_INFO } from "@/lib/workflows-info";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { WORKFLOW_EDIT } from "@/lib/lifecycle";

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

      <h2>How to onboard it</h2>
      <p>{info.onboard}</p>
      <ul>
        <li>
          <b>Lives in:</b> {info.livesIn}
        </li>
        <li>
          <b>Trigger:</b> {info.trigger}
        </li>
      </ul>

      <h2>How to use it</h2>
      <p>{info.action}</p>
      <p>
        <b>What a run does, in order:</b>
      </p>
      <ul>
        {info.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      <p>{info.phase1}</p>

      <h2>Expected output</h2>
      <p>{info.output}</p>

      <h2>How to edit it</h2>
      <LifecycleSteps steps={WORKFLOW_EDIT} />

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
