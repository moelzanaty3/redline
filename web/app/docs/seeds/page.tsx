import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { SEEDS } from "@/lib/registry";
import { seedCorpora } from "@/lib/seeds";

export const metadata: Metadata = { title: "Seeded corpus" };

const MARKER = "SEED <n> [BLOCKER|HIGH|SUGGESTION] (<stack>/<rule-slug>) <short description>";

export default function Page() {
  const corpora = seedCorpora();
  const total = [...corpora.values()].reduce((n, c) => n + c.defects.length, 0);

  return (
    <DocsPage
      crumb="Validation"
      title="Seeded corpus"
      intro="Code with known defects planted in it, and code with none. It tests whether the AI reviewer still catches what the standards say it should."
      href="/docs/seeds"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>For product engineers</b> who want to see what each rule catches in
          real code, and for the platform team testing a reviewer or a standards
          change.
        </p>
      </div>

      <h2>Why it exists</h2>
      <p>
        A reviewer can fail in two ways. It can stop catching bugs, which looks
        exactly like a quiet week. Or it can flag everything, which looks like
        diligence. Ordinary telemetry cannot tell either apart from a reviewer
        that works.
      </p>
      <p>
        The seeded corpus can, because the right answers are known in advance.
        It measures two things:
      </p>
      <ul>
        <li>
          <b>Recall</b>: of the defects planted, how many the reviewer flagged at
          the right severity or higher. {total} seeded defects across{" "}
          {corpora.size - 1} stacks measure this. The pass condition is that
          every BLOCKER is caught.
        </li>
        <li>
          <b>False positives</b>: comments on code that has nothing wrong with
          it. <Link href="/docs/seeds/clean">seeded/clean</Link> measures this.
          The pass condition is zero comments.
        </li>
      </ul>
      <p>
        Nothing here is ever merged. A run opens a throwaway pull request on a
        pilot repository, scores the review, and closes it. You can do that by
        hand, and{" "}
        <Link href="/docs/workflows/seed-canary">seed-canary.yml</Link> does it
        every week.
      </p>

      <h2>All corpora</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Corpus</th>
              <th>Defects</th>
              <th>BLOCKER</th>
              <th>What it plants</th>
            </tr>
          </thead>
          <tbody>
            {SEEDS.map((s) => {
              const corpus = corpora.get(s.slug);
              const defects = corpus?.defects ?? [];
              const blockers = defects.filter((d) => d.severity === "BLOCKER").length;
              return (
                <tr key={s.slug}>
                  <td>
                    <Link href={`/docs/seeds/${s.slug}`}>
                      <code>{s.title}</code>
                    </Link>
                  </td>
                  <td>{s.slug === "clean" ? "None" : defects.length}</td>
                  <td>{s.slug === "clean" ? "—" : blockers}</td>
                  <td>{s.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Adding a defect</h2>
      <p>
        Add the defective code to the stack&apos;s file under <code>seeded/</code>, with
        one marker comment above it naming the rule it breaks. The scorer reads
        the markers straight from the source, so there is no separate answer key
        to keep in step:
      </p>
      <CodeWindow title="marker format" copyText={MARKER}>
        <span className="tk-white">{MARKER}</span>
      </CodeWindow>
      <p>
        Then run <code>node scripts/validate.mjs</code>. CI runs it too, and
        fails if a marker cites a rule that does not exist, claims a higher
        severity than the rule carries, or reuses a number. It also fails if a
        stack has fewer than four BLOCKER seeds, or if <code>seeded/clean</code>{" "}
        contains a marker.
      </p>
    </DocsPage>
  );
}
