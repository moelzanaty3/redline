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

      <div className="table-scroll">
        <table>
          <tbody>
            <tr>
              <th scope="row">Runs in</th>
              <td>{info.livesIn}</td>
            </tr>
            <tr>
              <th scope="row">Runs on</th>
              <td>{info.trigger}</td>
            </tr>
            <tr>
              <th scope="row">Credential</th>
              <td>{info.credential}</td>
            </tr>
            <tr>
              <th scope="row">Leaves behind</th>
              <td>{info.output}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {info.steps.length > 0 ? (
        <>
          <h2>What a run does</h2>
          <ol>
            {info.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      ) : null}

      <h2>Setting it up</h2>
      <p>{info.install}</p>

      <h2>Changing it</h2>
      <p>
        Edit <code>{entry.file}</code> in this repository, then follow{" "}
        <Link href="/docs/workflows#changing-a-workflow">Changing a workflow</Link>
        . {info.home === "metrics"
          ? "The copy in redline-metrics does not update itself: copy the file across again after the change merges."
          : info.home === "source"
            ? "It runs from this repository, so the change takes effect when it merges."
            : "The org gate is a separate copy in <org>/.github: copy the merged file there. Callers reference it at @main, so every repository runs the new version on its next pull request. A vendored copy (--gate-source local) is rewritten only when redline init runs in that repository again."}
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href={info.docs.href}>{info.docs.label}</Link>
        </li>
        <li>
          <Link href="/docs/who-runs-what">Who runs what</Link> — every
          credential, side by side.
        </li>
        <li>
          <Link href="/docs/workflows">All workflows</Link>
        </li>
      </ul>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={720} />
    </DocsPage>
  );
}
