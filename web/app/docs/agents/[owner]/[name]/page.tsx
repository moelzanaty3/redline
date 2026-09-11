import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogDetail } from "@/components/catalog-detail";
import { DocsPage } from "@/components/docs-page";
import { AGENTS, findEntryOfKind, hrefOf, publisherOf } from "@/lib/skills-catalog";
import "../../../../skills-catalog.css";

type Params = { owner: string; name: string };

export function generateStaticParams(): Params[] {
  return AGENTS.map((e) => ({ owner: publisherOf(e).owner, name: e.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { owner, name } = await params;
  const entry = findEntryOfKind("agent", owner, name);
  if (!entry) return { title: "Not found" };
  return { title: entry.title, description: entry.summary };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { owner, name } = await params;
  // Scoped to the kind, so a skill's slug under /docs/agents 404s rather than
  // rendering it under the wrong breadcrumb with the wrong sibling list.
  const entry = findEntryOfKind("agent", owner, name);
  if (!entry) notFound();

  return (
    <DocsPage
      crumb={`Agents / ${entry.title}`}
      title={entry.title}
      intro={entry.summary}
      href={hrefOf(entry)}
    >
      <CatalogDetail entry={entry} />
    </DocsPage>
  );
}
