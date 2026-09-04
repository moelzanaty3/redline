import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { PLANS, findBySlug } from "@/lib/registry";

export function generateStaticParams() {
  return PLANS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(PLANS, slug);
  return { title: entry ? `${entry.title} — Roadmap` : "Roadmap" };
}

const KIND = (file: string) => (file.includes("/specs/") ? "spec" : "plan");

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findBySlug(PLANS, slug);
  if (!entry) notFound();
  const kind = KIND(entry.file);

  return (
    <DocsPage
      crumb={`Roadmap / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href={`/docs/roadmap/${slug}`}
    >
      <h2>What this is</h2>
      <p>
        {kind === "spec" ? (
          <>
            A <b>spec</b>: it agrees the shape and the order of a body of work, and
            decides nothing about implementation. Each phase in it needs its own
            plan before any code.
          </>
        ) : (
          <>
            A <b>plan</b>: the task-by-task record a body of work was executed
            from, written before the code and kept afterwards. It is history, not
            instruction — where it disagrees with the repository, the repository is
            right.
          </>
        )}{" "}
        It lives at <code>{entry.file}</code>.
      </p>

      <h2>How to onboard it</h2>
      <p>
        Nothing to install. These documents describe this repository&apos;s own
        direction and are not distributed to onboarded repositories — a standards
        change reaches the estate as a pull request, a roadmap does not reach it at
        all.
      </p>

      <h2>How to use it</h2>
      <p>
        {kind === "spec"
          ? "Read it to see which pieces are sequenced where and why, and what each phase's kill criteria are — a phase that cannot meet its exit condition is meant to be stopped, not quietly extended. The ordering past the first phase is explicitly provisional: it is a hypothesis until the baseline measurement exists, and the baseline is allowed to reorder it."
          : "Read it to see what was actually built and in what order. A plan's assertions about the tree — test counts, file contents, line numbers — are true as of the day it was written and go stale; treat the repository and its CI as the authority."}
      </p>

      <h2>Expected output</h2>
      <p>
        {kind === "spec"
          ? "No code. A spec produces agreement on scope and sequence, and a set of acceptance criteria and kill criteria each later plan is written against."
          : "The commits that implemented it. Where a plan is finished, its steps are the changelog entry and the tests that now guard the behaviour."}
      </p>

      <h2>How to edit it</h2>
      <p>
        Edit the markdown directly. Nothing renders or validates these documents —
        they are not part of <code>standards/</code>, carry no rule ids, and no CI
        check reads them. That also means nothing catches a claim in one going
        stale, so prefer superseding a document with a dated successor over
        rewriting it in place: the record of what was decided when is the point.
      </p>

      <h2>The full file</h2>
      <FileViewer file={entry.file} maxHeight={900} />
    </DocsPage>
  );
}
