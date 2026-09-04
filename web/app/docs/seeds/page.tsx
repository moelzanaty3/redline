import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { SEEDS } from "@/lib/registry";
import { seedCorpora } from "@/lib/seeds";

export const metadata: Metadata = { title: "Seeded corpus" };

export default function Page() {
  const corpora = seedCorpora();
  const total = [...corpora.values()].reduce((n, c) => n + c.defects.length, 0);

  return (
    <DocsPage
      crumb="Validation"
      title="Seeded corpus"
      intro="Known-bad code with known-good code beside it. It is how Redline answers whether the reviewer still works, rather than assuming it does."
      href="/docs/seeds"
    >
      <p>
        A review system has two ways to fail and only one of them is loud. It can
        stop catching things, which no amount of ordinary telemetry distinguishes
        from a quiet week — or it can start flagging everything, which looks like
        diligence. {total} deliberate defects across {corpora.size - 1} stacks
        measure the first; <Link href="/docs/seeds/clean">seeded/clean</Link>{" "}
        measures the second, with a pass condition of zero comments.
      </p>
      <p>
        Nothing here is ever merged. It is opened as a throwaway pull request on a
        pilot repository, scored, and closed — by hand for a one-off, or weekly by{" "}
        <Link href="/docs/workflows/seed-canary">seed-canary.yml</Link>.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {SEEDS.map((s) => {
          const corpus = corpora.get(s.slug);
          const blockers = corpus?.defects.filter((d) => d.severity === "BLOCKER").length ?? 0;
          return (
            <Link className="doc-card" href={`/docs/seeds/${s.slug}`} key={s.slug}>
              <h3>
                {s.title} <span>→</span>
              </h3>
              <p>
                {s.slug === "clean"
                  ? "Pass condition: zero comments. "
                  : `${corpus?.defects.length ?? 0} defects, ${blockers} of them BLOCKER. `}
                {s.description}
              </p>
            </Link>
          );
        })}
      </div>
    </DocsPage>
  );
}
