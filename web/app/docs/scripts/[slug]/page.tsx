import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { SCRIPTS, findBySlug } from "@/lib/registry";
import { SCRIPTS_INFO } from "@/lib/scripts-info";

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
  const info = SCRIPTS_INFO[slug];
  if (!info) notFound();

  return (
    <DocsPage
      crumb={`Maintaining Redline / Scripts / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href="/docs/scripts"
    >
      <h2>What this is</h2>
      <p>{info.what}</p>

      <h2>When it applies to you</h2>
      <p>
        Runs in: {info.runsIn} Trigger: {info.trigger}
      </p>

      <h2>What it actually does</h2>
      <CodeWindow title="terminal" copyText={info.command.join("\n")}>
        {info.command.map((line, i) => (
          <span key={i}>
            {i > 0 && "\n"}
            <span className="tk-prompt">$</span> <span className="tk-white">{line}</span>
          </span>
        ))}
      </CodeWindow>
      {info.env.length > 0 && (
        <>
          <p><b>Environment:</b></p>
          <ul>
            {info.env.map((e) => (
              <li key={e}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        <b>Produces:</b> {info.produces}
      </p>

      <h2>What you do with it</h2>
      <p>{info.action}</p>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
