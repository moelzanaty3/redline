import type { ReactNode } from "react";
import { loadManifest } from "@/lib/manifest";
import { findRule, getRules } from "@/lib/rules";
import { Reveal } from "@/components/reveal";

// The rule the section's opening story is about. Named here and resolved from
// the catalogue for the same reason every other figure on this page is: a story
// that cites a rule id must stop the build rather than print a stale one.
const STORY_RULE_ID = "core/type-checker-suppression";

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

  const suppression = findRule(STORY_RULE_ID);
  if (suppression === undefined) {
    throw new Error(
      `standards/ no longer defines "${STORY_RULE_ID}"; the home page tells its story`,
    );
  }

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
          {/* The section used to open straight onto the grid, which states the
              problem as a process complaint. This is the same problem with a
              cost attached, and it is ours rather than a hypothetical — which
              is the only version a sceptical reader has any reason to believe. */}
          <div className="hm-prob-story">
            <p className="hm-prob-story-lead">
              <b>A rule that cannot fire reports clean.</b> Redline shipped{" "}
              <code>{suppression.id}</code> as a {suppression.severity} to every
              onboarded repository. Its checker knew four suppression dialects;
              Redline ships rules for {stackCount} stacks. In a Swift, Kotlin, C#
              or Go repository the rule was installed, was listed in the
              standard, ran on every pull request — and no line written in that
              repository&apos;s own language could trip it.
            </p>
            <p>
              It was found by onboarding one repository by hand and watching the
              gate, not by any dashboard, because a control that never fires and
              a control with nothing to find produce the identical green tick.
              The fix and the corpus that now proves it is in{" "}
              <a href="/docs/changes">the changelog</a>. That is the failure
              Redline is built to make visible — including in itself.
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
