import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Scanner ingestion" };

const MAP = [
  ["error, critical, high", "BLOCKER"],
  ["warning, medium, moderate", "HIGH"],
  ["note, none, low, info", "SUGGESTION"],
  ["anything unrecognised", "SUGGESTION, and reported"],
];

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Scanner ingestion"
      intro="Redline consumes the scanners a repository already runs rather than competing with them — one severity contract across every producer, and one measure of whether anyone acted."
      href="/docs/ingestion"
    >
      <h2>The argument this ends</h2>
      <p>
        Redline produces findings, and so do CodeQL, Snyk, Semgrep and whatever
        else an organisation already licenses. Each has its own severity
        vocabulary, its own dashboard, and its own answer to &ldquo;did anyone act
        on this&rdquo;. Nobody can see the estate.
      </p>
      <p>
        Redline&apos;s own diff secret scan and dependency review are weaker than
        a real scanner stack and always will be. Consuming those tools turns that
        weakness into the product: <b>one severity contract and one acted-on
        measure</b> across LLM review and static analysis together.{" "}
        <b>Redline never runs a scanner</b>, and no repository is asked to change
        which ones it runs.
      </p>

      <h2>Ingested findings are always distinguishable</h2>
      <div className="callout">
        <span className="ic">!</span>
        <p>
          This is the one way ingestion could make things worse than not doing it.
          Rule tuning reads the finding stream, so a view that could not tell a
          CodeQL finding from a Redline one would <b>tune Redline&apos;s rules on
          another tool&apos;s noise</b>. Every ingested finding carries its source
          and its tool, keeps the producer&apos;s own rule id, and aggregates in
          its own bucket.
        </p>
      </div>
      <p>
        An ingested rule id is <b>never rewritten into a Redline id</b>. A
        scanner&apos;s finding is that scanner&apos;s claim; relabelling it would
        make every rule aggregate in the estate fiction. Acted-on rate is computed
        within each source and never across — Redline&apos;s is a resolved review
        thread, a scanner&apos;s is a closed alert, and averaging two definitions
        describes neither.
      </p>

      <h2>They are measured, never gating</h2>
      <p>
        An ingested finding does not block a merge, at any{" "}
        <Link href="/docs/enforcement">rung</Link>. Gating on another tool&apos;s
        output makes Redline responsible for that tool&apos;s false positives, and
        the bundle self-check fails the build if the gate ever starts reading code
        scanning.
      </p>

      <h2>Severity mapping is configurable and visible</h2>
      <p>
        Mapping a foreign vocabulary onto three levels is a judgement call that
        will be wrong somewhere. So the default table is overridable per
        repository, and every finding carries <b>both</b> the mapped severity and
        the producer&apos;s own word — a disagreement about the mapping is
        arguable from the record rather than requiring a re-ingest.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Their word</th>
              <th>Redline severity</th>
            </tr>
          </thead>
          <tbody>
            {MAP.map(([theirs, ours]) => (
              <tr key={theirs}>
                <td>{theirs}</td>
                <td>
                  <code>{ours}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        An unrecognised severity falls back to <code>SUGGESTION</code>, never{" "}
        <code>BLOCKER</code>, and says so. The asymmetry is deliberate:{" "}
        <b>a wrong BLOCKER blocks a merge and teaches people the gate is noise; a
        wrong SUGGESTION is a line in a report.</b>
      </p>

      <h2>Where it shows up</h2>
      <p>
        The dashboard&apos;s <b>Finding sources</b> view shows both catalogues side
        by side without merging them. When it is empty, that is itself the answer
        to whether ingestion was worth building for your estate — and the signal
        that the effort belongs elsewhere.
      </p>
    </DocsPage>
  );
}
