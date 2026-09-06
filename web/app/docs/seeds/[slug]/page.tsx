import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { FileViewer } from "@/components/file-viewer";
import { SEEDS, findBySlug } from "@/lib/registry";
import { seedCorpus, type SeededDefect } from "@/lib/seeds";
import { findRule } from "@/lib/rules";

export function generateStaticParams() {
  return SEEDS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(SEEDS, slug);
  return { title: entry ? `${entry.title} — Seeded corpus` : "Seeded corpus" };
}

const RANK = { BLOCKER: 3, HIGH: 2, SUGGESTION: 1 } as const;

function DefectTable({ defects }: { defects: SeededDefect[] }) {
  const ordered = [...defects].sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || a.n - b.n,
  );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Seed</th>
            <th>Severity</th>
            <th>Rule it violates</th>
            <th>Defect</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((d) => {
            // A seed citing a rule that no longer exists is a real failure, not a
            // rendering detail — validate.mjs fails CI on it, and the page says so
            // rather than linking into nothing.
            const known = findRule(d.ruleId);
            const stack = d.ruleId.split("/")[0];
            return (
              <tr key={`${d.n}-${d.ruleId}`}>
                <td>{d.n}</td>
                <td>{d.severity}</td>
                <td>
                  {known ? (
                    <Link href={`/docs/standards/${stack}`}>
                      <code>{d.ruleId}</code>
                    </Link>
                  ) : (
                    <code>{d.ruleId} (unknown)</code>
                  )}
                </td>
                <td>{d.description}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findBySlug(SEEDS, slug);
  if (!entry) notFound();
  const corpus = seedCorpus(slug);
  if (!corpus) notFound();

  const isClean = slug === "clean";
  const counts = corpus.defects.reduce<Record<string, number>>((acc, d) => {
    acc[d.severity] = (acc[d.severity] ?? 0) + 1;
    return acc;
  }, {});
  const blockers = counts["BLOCKER"] ?? 0;

  const score = `GH_TOKEN=... npx redline-cli metrics score-seeds --repo <org>/<repo> --pr <n>`;

  return (
    <DocsPage
      crumb={`Validation / Seeded corpus / ${entry.title}`}
      title={entry.title}
      intro={entry.description}
      href={`/docs/seeds/${slug}`}
    >
      <h2>What this is</h2>
      {isClean ? (
        <p>
          Correct code with nothing wrong in it. It measures <b>precision</b>, and
          its pass condition is the strict one: <b>zero comments</b>. A reviewer
          that flags everything scores perfect recall on every other corpus here
          and is useless — this is the half that catches that, and it is why the
          canary runs both together.
        </p>
      ) : (
        <p>
          {corpus.defects.length} deliberate defects, each carrying a marker naming
          the rule in <code>standards/</code> it violates. It measures{" "}
          <b>recall</b>, and its pass condition is that every one of the{" "}
          {blockers} BLOCKER markers is flagged. The rule id in each marker means
          the scorer grades attribution too: a reviewer that finds the bug but
          cites the wrong rule counts as caught, and separately as misattributed.
        </p>
      )}

      <h2>How to onboard it</h2>
      <p>
        Nothing is installed and nothing here is ever merged. The corpus is used
        by opening a throwaway pull request on a pilot repository already
        onboarded for this stack, adding this directory <b>and</b>{" "}
        <Link href="/docs/seeds/clean">seeded/clean</Link> together. Label it{" "}
        <code>redline-exempt</code> so the readiness gate does not block a pull
        request nobody will merge, wait for the automated review to finish, then
        score it.
      </p>
      <p>
        <Link href="/docs/workflows/seed-canary">seed-canary.yml</Link> does exactly
        this on a schedule and closes the pull request afterwards, including when
        the run fails.
      </p>

      <h2>How to use it</h2>
      <CodeWindow title="terminal" copyText={score}>
        <span className="tk-prompt">$</span> <span className="tk-white">{score}</span>
      </CodeWindow>
      {!isClean && <DefectTable defects={corpus.defects} />}

      <h2>Expected output</h2>
      {isClean ? (
        <p>
          Zero review comments. Any comment on this corpus is a false positive and
          fails the canary run outright — there is no threshold to tune, because a
          reviewer allowed a few false positives on known-correct code cannot be
          trusted to be quiet on real code.
        </p>
      ) : (
        <p>
          A score from <code>scripts/score-seeds.mjs</code>: BLOCKER recall, false
          positives, and rule attribution. The canary appends it to{" "}
          <code>data/seed-scores.jsonl</code> and fails the run if BLOCKER recall
          drops below 1.0 or the clean corpus attracts a false positive. Of the{" "}
          {corpus.defects.length} defects here,{" "}
          {(["BLOCKER", "HIGH", "SUGGESTION"] as const)
            .filter((s) => counts[s])
            .map((s) => `${counts[s]} ${s}`)
            .join(", ")
            .replace(/, ([^,]*)$/, " and $1")}{" "}
          — only the BLOCKER count is a pass condition.
        </p>
      )}

      <h2>How to edit it</h2>
      <p>
        Add a defect by adding the code and one marker line above it. There is no
        separate expectations file to keep in sync —{" "}
        <code>scripts/score-seeds.mjs</code> parses the markers straight out of the
        source:
      </p>
      <CodeWindow
        title="marker format"
        copyText="SEED <n> [BLOCKER|HIGH|SUGGESTION] (<stack>/<rule-slug>) <short description>"
      >
        <span className="tk-white">
          SEED &lt;n&gt; [BLOCKER|HIGH|SUGGESTION] (&lt;stack&gt;/&lt;rule-slug&gt;)
          &lt;short description&gt;
        </span>
      </CodeWindow>
      <p>
        <code>scripts/validate.mjs</code> fails CI if a seed cites a rule that does
        not exist, or claims a severity higher than that rule carries in the
        standard — so a marker cannot quietly drift away from the rule it is
        testing.
      </p>

      <h2>The full file</h2>
      {corpus.files.map((file) => (
        <FileViewer file={file} key={file} maxHeight={720} />
      ))}
    </DocsPage>
  );
}
