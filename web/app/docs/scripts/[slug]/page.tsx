import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { SCRIPTS, findBySlug } from "@/lib/registry";
import { SCRIPTS_INFO } from "@/lib/scripts-info";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { SCRIPT_EDIT } from "@/lib/lifecycle";

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
      href={`/docs/scripts/${slug}`}
    >
      <h2>What this is</h2>
      <p>{info.what}</p>

      <h2>How to onboard it</h2>
      <p>
        Nothing to onboard, and nothing an onboarded repository ever runs. This is
        maintainer tooling: it ships in this repository and runs where it already
        has an environment.
      </p>
      <ul>
        <li>
          <b>Runs in:</b> {info.runsIn}
        </li>
        <li>
          <b>Trigger:</b> {info.trigger}
        </li>
      </ul>
      <p>
        To run it yourself you need a checkout of this repository and Node 22 or
        newer. There are no runtime dependencies to install — every script uses
        only Node builtins — so a clone and the environment below is the whole
        setup.
      </p>

      <h2>How to use it</h2>
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
      <p>{info.action}</p>

      <h2>Expected output</h2>
      <p>{info.produces}</p>

      <h2>How to edit it</h2>
      <LifecycleSteps steps={SCRIPT_EDIT} />

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
