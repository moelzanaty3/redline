import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { COMMANDS, findBySlug } from "@/lib/registry";
import { COMMANDS_INFO } from "@/lib/commands-info";
import { installCommand, packageState } from "@/lib/package-version";

export function generateStaticParams() {
  return COMMANDS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(COMMANDS, slug);
  return { title: entry ? `${entry.title} — CLI` : "CLI" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findBySlug(COMMANDS, slug);
  if (!entry) notFound();
  const info = COMMANDS_INFO[slug];
  if (!info) notFound();

  // Commands are shown with the runner that actually resolves today, so a
  // reader can copy the line rather than translate it.
  const state = await packageState();
  const lines = info.built
    ? info.usage.map((u) => u.replace(/^redline /, `${installCommand(state, "").trim()} `))
    : info.usage;

  return (
    <DocsPage
      crumb={`CLI / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href={`/docs/cli/${slug}`}
    >
      {!info.built && (
        <div className="callout warn">
          <span className="ic">!</span>
          <p>
            <b>Not built.</b> This command is designed and sequenced but does not
            exist in <code>cli/commands/</code>. Everything below describes what it
            is specified to do, not what you can run today.
          </p>
        </div>
      )}

      <h2>What this is</h2>
      <p>{info.what}</p>

      <h2>How to onboard it</h2>
      <p>{info.onboard}</p>

      <h2>How to use it</h2>
      <CodeWindow title="terminal" copyText={lines.join("\n")}>
        {lines.map((line, i) => (
          <span key={line}>
            {i > 0 && "\n"}
            <span className="tk-prompt">$</span> <span className="tk-white">{line}</span>
          </span>
        ))}
      </CodeWindow>
      {info.flags.length > 0 && (
        <>
          <p>
            <b>The flags that change behaviour materially:</b>
          </p>
          <ul>
            {info.flags.map((f) => (
              <li key={f.flag}>
                <code>{f.flag}</code> — {f.detail}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Expected output</h2>
      <p>{info.output}</p>

      <h2>How to edit it</h2>
      <p>{info.edit}</p>
      {info.built && (
        <p>
          Run <code>npm test</code> and <code>npm run typecheck</code> before
          pushing: the command surface is unit-tested against a fake host client,
          so a behaviour change shows up as a failing assertion rather than as a
          surprise on someone&apos;s repository.
        </p>
      )}

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
