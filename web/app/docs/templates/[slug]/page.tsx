import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { TEMPLATES, findBySlug } from "@/lib/registry";
import { TEMPLATE_KIND_LABEL, TEMPLATES_INFO } from "@/lib/templates-info";

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
      <p>{info.what}</p>

      <div className="table-scroll">
        <table>
          <tbody>
            <tr>
              <th scope="row">Lands at</th>
              <td>
                {info.installedAs ? <code>{info.installedAs}</code> : "Nowhere. Nothing installs it."}
              </td>
            </tr>
            <tr>
              <th scope="row">Put there by</th>
              <td>{info.installedBy}</td>
            </tr>
            <tr>
              <th scope="row">Editing this file</th>
              <td>{TEMPLATE_KIND_LABEL[info.kind]}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What to know</h2>
      <ul>
        {info.detail.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h2>Changing it</h2>
      <p>{info.editWhere}</p>
      <p>
        The full checklist is on{" "}
        <Link href="/docs/templates#changing-a-template">Changing a template</Link>.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/onboarding">Onboard a repository</Link> — what{" "}
          <code>redline init</code> installs, and what it asks an administrator for.
        </li>
        <li>
          <Link href="/docs/gate">The merge gate</Link> — the required check these
          files feed.
        </li>
        <li>
          <Link href="/docs/templates">All templates and rulesets</Link>
        </li>
      </ul>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={420} />
    </DocsPage>
  );
}
