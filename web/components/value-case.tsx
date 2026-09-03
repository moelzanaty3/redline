import type { ReactNode } from "react";
import { loadManifest } from "@/lib/manifest";
import { getRules } from "@/lib/rules";
import { Reveal } from "@/components/reveal";

// A counted fact — the numeral is always a build-time derivation, never a literal.
type Stat = { value: string; label: string };

type Pair = {
  n: string;
  // The same geometry twice: broken and grey on the Today side, joined and in
  // the accent on the Redline side. The pair is the section's argument in one look.
  artBefore: ReactNode;
  art: ReactNode;
  problem: string;
  cost: ReactNode;
  answer: ReactNode;
  cmd?: string;
  stats?: Stat[];
  // Stated properties, deliberately typographically weaker than a counted fact.
  props: string[];
};

const ART_SCATTER = (
  <svg viewBox="0 0 240 56" className="vc-art vc-art-mute" aria-hidden="true" focusable="false">
    <rect className="vc-art-node" x="1" y="17" width="52" height="22" rx="4" />
    <path className="vc-art-line vc-art-dash" d="M53 28 H 80" />
    <path className="vc-art-line vc-art-dash" d="M53 28 C 68 28 72 12 86 10" />
    <path className="vc-art-line vc-art-dash" d="M53 28 C 68 28 72 44 86 46" />
    <rect className="vc-art-node" x="177" y="1" width="62" height="14" rx="3" />
    <rect className="vc-art-node" x="177" y="21" width="62" height="14" rx="3" />
    <rect className="vc-art-node" x="177" y="41" width="62" height="14" rx="3" />
  </svg>
);

const ART_DRIFT = (
  <svg viewBox="0 0 240 56" className="vc-art vc-art-mute" aria-hidden="true" focusable="false">
    <rect className="vc-art-node" x="1" y="5" width="9" height="9" rx="2" />
    <rect className="vc-art-node" x="18" y="5" width="118" height="9" rx="4.5" />
    <rect className="vc-art-node" x="1" y="24" width="9" height="9" rx="2" />
    <rect className="vc-art-node" x="18" y="24" width="196" height="9" rx="4.5" />
    <rect className="vc-art-node" x="1" y="43" width="9" height="9" rx="2" />
    <rect className="vc-art-node" x="18" y="43" width="62" height="9" rx="4.5" />
  </svg>
);

const ART_ONEWAY = (
  <svg viewBox="0 0 240 56" className="vc-art vc-art-mute" aria-hidden="true" focusable="false">
    <rect className="vc-art-node" x="1" y="9" width="66" height="22" rx="4" />
    <rect className="vc-art-node" x="173" y="9" width="66" height="22" rx="4" />
    <path className="vc-art-line" d="M67 20 H 167" />
    <path className="vc-art-arrow" d="M166 16.5 L 172.5 20 L 166 23.5 Z" />
    <path className="vc-art-line vc-art-dash" d="M206 31 V 44 H 152" />
  </svg>
);

const ART_MANUAL = (
  <svg viewBox="0 0 240 56" className="vc-art vc-art-mute" aria-hidden="true" focusable="false">
    <rect className="vc-art-node" x="1" y="1" width="44" height="14" rx="3" />
    <rect className="vc-art-node" x="1" y="21" width="44" height="14" rx="3" />
    <rect className="vc-art-node" x="1" y="41" width="44" height="14" rx="3" />
    <path className="vc-art-line vc-art-dash" d="M45 8 H 176" />
    <path className="vc-art-line vc-art-dash" d="M45 28 H 176" />
    <path className="vc-art-line vc-art-dash" d="M45 48 H 176" />
    <rect className="vc-art-node" x="177" y="1" width="62" height="14" rx="3" />
    <rect className="vc-art-node" x="177" y="21" width="62" height="14" rx="3" />
    <rect className="vc-art-node" x="177" y="41" width="62" height="14" rx="3" />
  </svg>
);

// Hairline schematics, one per row. Each redraws the sentence beside it as a
// mechanism; none of them asserts anything the copy does not already say.
const ART_RENDER = (
  <svg viewBox="0 0 240 56" className="vc-art" aria-hidden="true" focusable="false">
    <rect className="vc-art-src" x="1" y="17" width="52" height="22" rx="4" />
    <path className="vc-art-line vc-art-flow" d="M53 28 C 100 28 110 8 176 8" />
    <path className="vc-art-line vc-art-flow" d="M53 28 H 176" />
    <path className="vc-art-line vc-art-flow" d="M53 28 C 100 28 110 48 176 48" />
    <rect className="vc-art-node" x="177" y="1" width="62" height="14" rx="3" />
    <rect className="vc-art-node" x="177" y="21" width="62" height="14" rx="3" />
    <rect className="vc-art-node" x="177" y="41" width="62" height="14" rx="3" />
  </svg>
);

const ART_SEVERITY = (
  <svg viewBox="0 0 240 56" className="vc-art" aria-hidden="true" focusable="false">
    <rect className="vc-art-mark" x="1" y="5" width="9" height="9" rx="2" />
    <rect className="vc-art-bar" x="18" y="5" width="200" height="9" rx="4.5" />
    <rect className="vc-art-mark" x="1" y="24" width="9" height="9" rx="2" opacity="0.72" />
    <rect className="vc-art-bar" x="18" y="24" width="138" height="9" rx="4.5" opacity="0.72" />
    <rect className="vc-art-mark" x="1" y="43" width="9" height="9" rx="2" opacity="0.46" />
    <rect className="vc-art-bar" x="18" y="43" width="84" height="9" rx="4.5" opacity="0.46" />
  </svg>
);

const ART_READBACK = (
  <svg viewBox="0 0 240 56" className="vc-art" aria-hidden="true" focusable="false">
    <rect className="vc-art-src" x="1" y="9" width="66" height="22" rx="4" />
    <rect className="vc-art-node" x="173" y="9" width="66" height="22" rx="4" />
    <path className="vc-art-line" d="M67 20 H 167" />
    <path className="vc-art-arrow" d="M166 16.5 L 172.5 20 L 166 23.5 Z" />
    <path className="vc-art-line vc-art-flow" d="M206 31 V 44 H 34 V 34" />
    <path className="vc-art-arrow" d="M30.5 34 L 34 27.5 L 37.5 34 Z" />
  </svg>
);

const ART_PROPAGATE = (
  <svg viewBox="0 0 240 56" className="vc-art" aria-hidden="true" focusable="false">
    <rect className="vc-art-src" x="1" y="17" width="46" height="22" rx="4" />
    <path className="vc-art-line" d="M47 28 H 92" />
    <rect className="vc-art-pr" x="93" y="19" width="54" height="18" rx="9" />
    <path className="vc-art-line vc-art-dash" d="M147 28 C 172 28 176 9 200 9" />
    <path className="vc-art-line vc-art-dash" d="M147 28 H 200" />
    <path className="vc-art-line vc-art-dash" d="M147 28 C 172 28 176 47 200 47" />
    <rect className="vc-art-node" x="201" y="2" width="38" height="14" rx="3" />
    <rect className="vc-art-node" x="201" y="21" width="38" height="14" rx="3" />
    <rect className="vc-art-node" x="201" y="40" width="38" height="14" rx="3" />
  </svg>
);

const INSTALL_CMD = "npm i -g redline-cli";
const ONBOARD_CMD = "redline init";

export function ValueCase() {
  const rules = getRules();
  const manifest = loadManifest();
  const ruleCount = rules.length;
  const severityCount = new Set(rules.map((r) => r.severity)).size;
  const stackCount = Object.keys(manifest.stacks).length;
  const profileCount = Object.keys(manifest.profiles).length;
  const vendorCount = Object.values(manifest.vendors).filter((v) => v.enabled).length;

  const pairs: Pair[] = [
    {
      n: "01",
      artBefore: ART_SCATTER,
      art: ART_RENDER,
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
          The AI writing the code works from the same list the reviewer does.
        </>
      ),
      stats: [
        { value: String(stackCount), label: "stack rule sets" },
        { value: String(profileCount), label: "project types" },
        { value: String(vendorCount), label: "AI-tool formats" },
      ],
      props: ["GitHub & Azure DevOps"],
    },
    {
      n: "02",
      artBefore: ART_DRIFT,
      art: ART_SEVERITY,
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
      stats: [
        { value: String(severityCount), label: "severity levels" },
        { value: String(ruleCount), label: "rules, each with an id" },
      ],
      props: ["one comment format"],
    },
    {
      n: "03",
      artBefore: ART_ONEWAY,
      art: ART_READBACK,
      problem: "Someone turns a check off and forgets",
      cost: (
        <>
          A setting gets switched off to unblock a release and never switched
          back. Nothing announces it.
        </>
      ),
      answer: (
        <>
          <b>
            Redline reads the settings back off the host and fails when they no
            longer match what it installed.
          </b>{" "}
          Setup you can re-check, not setup you hope survived.
        </>
      ),
      cmd: "redline verify",
      props: ["read back from GitHub or Azure DevOps", "never taken on trust"],
    },
    {
      n: "04",
      artBefore: ART_MANUAL,
      art: ART_PROPAGATE,
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
            A repository picks the change up the next time that command runs
            there
          </b>{" "}
          — as a pull request its own team reviews, never a direct push. Sending
          the change out across the estate automatically is later-phase work.
        </>
      ),
      cmd: ONBOARD_CMD,
      props: [
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
              <span className="vc-cols-rail" />
              <span>Today</span>
              <span className="vc-cols-fix">With Redline</span>
            </div>
            {pairs.map((p, i) => (
              <article
                className={`vc-row${i === 0 ? " vc-row-lead" : ""}`}
                key={p.n}
              >
                <div className="vc-rail">
                  <span className="vc-n">{p.n}</span>
                </div>
                <div className="vc-problem">
                  <span className="vc-tag">Today</span>
                  <h3>{p.problem}</h3>
                  <p>{p.cost}</p>
                  {p.artBefore}
                </div>
                <div className="vc-answer">
                  <span className="vc-tag vc-tag-fix">With Redline</span>
                  <p>{p.answer}</p>
                  {p.art}
                  <div className="vc-proof">
                    {p.cmd ? (
                      <div className="vc-cmd">
                        <span className="tk-prompt">$ </span>
                        {p.cmd}
                      </div>
                    ) : null}
                    {p.stats ? (
                      <ul className="vc-stats">
                        {p.stats.map((s) => (
                          <li key={s.label}>
                            <b>{s.value}</b>
                            <span>{s.label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ul className="vc-props">
                      {p.props.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
            <div className="vc-cta">
              <span className="vc-cta-lbl">Two commands, once</span>
              <div className="vc-cta-lines">
                <code>
                  <span className="tk-prompt">$ </span>
                  {INSTALL_CMD}
                </code>
                <code>
                  <span className="tk-prompt">$ </span>
                  {ONBOARD_CMD}
                </code>
              </div>
              <span className="vc-cta-note">in any repository</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
