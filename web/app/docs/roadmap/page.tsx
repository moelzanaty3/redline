import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { PLANS } from "@/lib/registry";

export const metadata: Metadata = { title: "Roadmap" };

export default function Page() {
  return (
    <DocsPage
      crumb="Roadmap"
      title="Roadmap, specs and plans"
      intro="Where Redline is going, why it stops where it does, and the record of how each piece was actually built."
      href="/docs/roadmap"
    >
      <p>
        A <b>spec</b> agrees the shape and the order of a body of work and decides
        nothing about implementation. A <b>plan</b> is what a spec&apos;s phase was
        executed from, task by task, written before the code and kept afterwards.
        Neither is distributed to onboarded repositories, and no CI check reads
        them — which also means nothing catches a stale claim in one, so treat the
        repository as the authority where they disagree.
      </p>
      <p>
        Start with{" "}
        <Link href="/docs/roadmap/roadmap">the roadmap</Link>: eight pieces across
        five phases, with Phase 0 — distribution and a baseline measurement —
        gating everything after it, because the rest does not compound until a
        standards change can reach the estate without human shepherding.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {PLANS.map((p) => (
          <Link className="doc-card" href={`/docs/roadmap/${p.slug}`} key={p.slug}>
            <h3>
              {p.title} <span>→</span>
            </h3>
            <p>{p.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
