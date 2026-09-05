import type { ReactNode } from "react";
import { loadManifest } from "@/lib/manifest";
import { getRules } from "@/lib/rules";
import { Reveal } from "@/components/reveal";

type Row = {
  n: string;
  problem: string;
  // What it costs today. The strongest writing on the page — kept verbatim.
  cost: ReactNode;
  answer: ReactNode;
  // Counted facts only: every value is a build-time derivation.
  facts: string[];
};

// Short names for the vendor ids the manifest enables, so the row can say which
// files get written without printing a title long enough to wrap twice. An id
// with no entry falls back to itself rather than disappearing — a new vendor
// must show up here as its id, never as a silent omission.
const VENDOR_FILE: Record<string, string> = {
  copilot: ".github/copilot-instructions.md",
  agents: "AGENTS.md",
  claude: "CLAUDE.md",
};

export function ValueCase() {
  const rules = getRules();
  const manifest = loadManifest();
  const stackCount = Object.keys(manifest.stacks).length;
  const severityCount = new Set(rules.map((r) => r.severity)).size;
  const enabledVendors = Object.keys(manifest.vendors).filter(
    (id) => manifest.vendors[id]?.enabled === true,
  );

  const rows: Row[] = [
    {
      n: "01",
      problem: "Nobody told the AI your rules",
      cost: (
        <>
          They live in a wiki, an onboarding doc, and one reviewer&apos;s memory.
          The AI has read none of it — so a person catches every miss by hand,
          one pull request at a time.
        </>
      ),
      answer: (
        <>
          <b>Written once, rendered into the files your AI tools already read.</b>{" "}
          The AI writing the code works from the same list the reviewer does —{" "}
          {enabledVendors.map((id, i) => (
            <span key={id}>
              {i > 0 ? ", " : ""}
              <code>{VENDOR_FILE[id] ?? id}</code>
            </span>
          ))}
          , composed for the stacks this repository actually uses.
        </>
      ),
      facts: [
        `${stackCount} stack rule sets`,
        `${enabledVendors.length} formats rendered`,
        `standards v${manifest.version}`,
      ],
    },
    {
      n: "02",
      problem: "Every reviewer draws the line somewhere else",
      cost: (
        <>
          The same change passes with one reviewer and is blocked by the next.
          Nobody can tell which rules really matter.
        </>
      ),
      answer: (
        <>
          <b>One fixed meaning per level.</b> BLOCKER — don&apos;t merge. HIGH —
          merge only if a reviewer says so out loud. SUGGESTION — take it or
          leave it. Every rule carries a permanent id, so a finding always names
          the exact rule behind it.
        </>
      ),
      facts: [
        `${severityCount} severity levels`,
        `${rules.length} rules, each with an id`,
      ],
    },
  ];

  return (
    <section className="hm-sec hm-problem" id="problem">
      <div className="container">
        <Reveal>
          <div className="hm-sec-head">
            <h2 className="hm-h2">What goes wrong today — and what changes</h2>
            <p className="hm-lead">
              AI writes a lot of your code now, and it has never read your
              team&apos;s rules.
            </p>
          </div>
          <div className="hm-prob-grid">
            <div className="hm-prob-cols">
              <span>Today</span>
              <span className="hm-prob-col-fix">With Redline</span>
            </div>
            {rows.map((row) => (
              <div className="hm-prob-row" key={row.n}>
                <div className="hm-prob-today">
                  <span className="hm-prob-n">{row.n}</span>
                  <h3>{row.problem}</h3>
                  <p>{row.cost}</p>
                </div>
                <div className="hm-prob-fix">
                  <p>{row.answer}</p>
                  <ul className="hm-facts">
                    {row.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
