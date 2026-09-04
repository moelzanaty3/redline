import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { TEMPLATES, findBySlug } from "@/lib/registry";
import { TEMPLATES_INFO } from "@/lib/templates-info";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { TEMPLATE_EDIT } from "@/lib/lifecycle";

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
      href={`/docs/templates/${slug}`}
    >
      <h2>What this is</h2>
      <p>{info.what}</p>

      <h2>How to onboard it</h2>
      <ul>
        <li>
          <b>Installed as:</b>{" "}
          {info.installedAs ? <code>{info.installedAs}</code> : "Nowhere — not installed by anything."}
        </li>
        <li>
          <b>Installed by:</b> {info.installedBy}
        </li>
      </ul>

      <h2>How to use it</h2>
      <p>{info.action}</p>
      <ul>
        {info.detail.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h2>Expected output</h2>
      <p>{info.output}</p>

      <h2>How to edit it</h2>
      <p>
        <b>The real source:</b> {info.editWhere}
      </p>
      <LifecycleSteps steps={TEMPLATE_EDIT} />

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={420} />
    </DocsPage>
  );
}
