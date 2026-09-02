import type { ReactNode } from "react";
import { loadManifest } from "@/lib/manifest";
import { getRules } from "@/lib/rules";
import { Reveal } from "@/components/reveal";

type Pair = {
  n: string;
  problem: string;
  cost: ReactNode;
  answer: ReactNode;
  facts: string[];
};

export function ValueCase() {
  const rules = getRules();
  const manifest = loadManifest();
  const ruleCount = rules.length;
  const severityCount = new Set(rules.map((r) => r.severity)).size;
  const stackCount = Object.keys(manifest.stacks).length;
  const profileCount = Object.keys(manifest.profiles).length;
  const vendorCount = Object.keys(manifest.vendors).length;

  const pairs: Pair[] = [
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
          <b>Written once, rewritten into the files your AI tools already read.</b>{" "}
          The AI writing the code works from the same list the reviewer does.
        </>
      ),
      facts: [
        `${stackCount} rule sets`,
        `${profileCount} project types`,
        `${vendorCount} AI-tool formats`,
        "GitHub & Azure DevOps",
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
          <b>Three levels, one fixed meaning each.</b> BLOCKER — don&apos;t merge.
          HIGH — merge only if a reviewer says so out loud. SUGGESTION — take it
          or leave it. Every rule has a permanent id, so a finding always names
          the exact rule behind it.
        </>
      ),
      facts: [
        `${severityCount} levels`,
        `${ruleCount} rules, ${ruleCount} permanent ids`,
        "one comment format",
      ],
    },
    {
      n: "03",
      problem: "Someone turns a check off and forgets",
      cost: (
        <>
          A setting gets switched off to unblock a release and never switched
          back. Nothing announces it.
        </>
      ),
      answer: (
        <>
          <code>redline verify</code>{" "}
          <b>reads the real settings back and fails if they changed.</b> Setup you
          can re-check, not setup you hope survived.
        </>
      ),
      facts: ["read back from GitHub or Azure DevOps", "never taken on trust"],
    },
    {
      n: "04",
      problem: "Rules you can't change are rules nobody follows",
      cost: (
        <>
          If updating one rule means hand-editing every repository, it never gets
          updated.
        </>
      ),
      answer: (
        <>
          Change it once, in one place.{" "}
          <b>
            A repository picks the change up the next time someone runs{" "}
            <code>redline init</code> there
          </b>{" "}
          — as a pull request its own team reviews, never a direct push. Sending
          that change out across the estate automatically is later-phase work.
        </>
      ),
      facts: [
        `standards v${manifest.version}`,
        "one place to edit",
        "arrives as a pull request",
        "never a direct push",
      ],
    },
  ];

  return (
    <section className="section value-case" id="why">
      <div className="container">
        <Reveal>
          <div className="vc-head">
            <h2 className="vv-lbl">What goes wrong today — and what changes</h2>
            <p className="vc-lead">
              AI writes a lot of your code now, and it has never read your
              team&apos;s rules.{" "}
              <b>
                Redline moves them into the files your AI tools actually read —
                and keeps them there.
              </b>
            </p>
          </div>
          <div className="vc-card">
            <div className="vc-cols">
              <span>Today</span>
              <span className="vc-cols-fix">With Redline</span>
            </div>
            {pairs.map((p) => (
              <article className="vc-row" key={p.n}>
                <div className="vc-problem">
                  <div className="vc-meta">
                    <span className="vc-n">{p.n}</span>
                    <span className="vc-tag">Today</span>
                  </div>
                  <h3>{p.problem}</h3>
                  <p>{p.cost}</p>
                </div>
                <div className="vc-answer">
                  <div className="vc-meta">
                    <span className="vc-tag vc-tag-fix">With Redline</span>
                  </div>
                  <p>{p.answer}</p>
                  <ul className="vc-facts">
                    {p.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
            <p className="vc-foot">
              Two commands, once: <code>npm i -g redline-cli</code>, then{" "}
              <code>redline init</code> in any repository.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
