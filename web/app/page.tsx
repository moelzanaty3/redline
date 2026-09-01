import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { Counter } from "@/components/counter";
import { Reveal } from "@/components/reveal";
import { VERSION } from "@/lib/site";

const HERO_CMD = `scripts/setup-repo.sh acme/checkout-service service-node
scripts/setup-repo.sh acme/checkout-service --verify`;

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-lines" aria-hidden="true" />
        <div className="container">
          <div className="hero-badge">
            <span className="dot" aria-hidden="true" />
            <b>Redline v{VERSION}</b>&nbsp;· vendor-neutral · GitHub-native
          </div>
          <h1>
            AI writes the code.
            <br />
            <span className="grad">Redline holds the line.</span>
          </h1>
          <p className="sub">
            The engineering oversight layer for AI-assisted development:
            versioned standards, automated review with a measurable output
            contract, hard readiness gates and org-wide telemetry.{" "}
            <b>No servers. No SaaS. No per-seat fee.</b>
          </p>
          <div className="ctas">
            <Link className="btn btn-red" href="/docs/installation">
              Get Started
            </Link>
            <Link className="btn btn-outline" href="/docs">
              Read the Docs
            </Link>
          </div>
          <CodeWindow title="terminal — onboard a repository" copyText={HERO_CMD}>
            <span className="tk-prompt">$</span> <span className="tk-white">scripts/setup-repo.sh acme/checkout-service service-node</span>{"\n"}
            <span className="tk-green">✓</span> <span className="tk-dim">security floor</span>      secret scanning · push protection · dependabot · dependency review{"\n"}
            <span className="tk-green">✓</span> <span className="tk-dim">branch ruleset</span>      1 human approval · thread resolution · <span className="tk-blue">redline-gate / gate</span> required{"\n"}
            <span className="tk-green">✓</span> <span className="tk-dim">standards synced</span>    profile: service-node → copilot · AGENTS.md · claude{"\n"}
            <span className="tk-prompt">$</span> <span className="tk-white">scripts/setup-repo.sh acme/checkout-service --verify</span>{"\n"}
            <span className="tk-green">✓</span> <span className="tk-dim">verified</span>            <span className="tk-blue">redline-gate / gate</span> reported on a real PR — the gate is live
          </CodeWindow>
        </div>
      </section>

      <section className="works-with">
        <div className="container inner">
          <span className="lbl">Reviews through</span>
          <Link className="chip" href="/docs/adaptors/github-copilot"><i />GitHub Copilot</Link>
          <Link className="chip" href="/docs/adaptors/claude"><i />Claude</Link>
          <Link className="chip" href="/docs/adaptors/agents-md"><i />OpenAI Codex</Link>
          <Link className="chip" href="/docs/adaptors/agents-md"><i />Devin</Link>
          <Link className="chip" href="/docs/adaptors/agents-md"><i />Jules</Link>
          <Link className="chip" href="/docs/adaptors/cursor"><i />Cursor</Link>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="pill">Why Redline</span>
              <h2>Everything the delivery loop needs.</h2>
              <p>
                One system covering the full loop — AI writes code, automated
                review against versioned standards, readiness gates, and the
                measurement that lets it evolve from <b>data, not opinion</b>.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="bento">
              <div className="bento-card wide">
                <h3>A measurable output contract</h3>
                <p>
                  Every finding carries a severity and a permanent rule id.
                  Parseable, aggregatable, tunable — per rule, per stack, per week.
                </p>
                <div className="bento-visual">
                  <div className="bento-code">
{`Redline/BLOCKER [core/query-string-concatenation]:
user-supplied \`name\` is concatenated into the SQL
string. Use a parameterised query:
db.Query("SELECT id FROM users WHERE name = $1", name)`}
                  </div>
                </div>
              </div>
              <div className="bento-card wide">
                <h3>Hard readiness gates</h3>
                <p>
                  Org-level ruleset, one human approval always, and a required
                  check whose name is verified in three places.
                </p>
                <div className="bento-visual">
                  <div className="gate-check"><span className="st ok">✓</span> redline-gate / gate — checklist · ADR · deps · secret scan</div>
                  <div className="gate-check"><span className="st ok">✓</span> 1 human approval — cannot be lowered, CI enforces it</div>
                  <div className="gate-check"><span className="st no">✗</span> merge blocked — BLOCKER finding unresolved</div>
                </div>
              </div>
              <div className="bento-card">
                <h3>One source of truth</h3>
                <p>
                  Rules live once in <code>standards/</code> and render to four
                  vendor formats per profile.
                </p>
                <div className="bento-visual">
                  <div className="flow">
                    <span className="hot">standards/</span><b>→</b>
                    <span>render.mjs</span><b>→</b>
                    <span>4 vendors</span><b>→</b>
                    <span>sync PRs</span>
                  </div>
                </div>
              </div>
              <div className="bento-card">
                <h3>Telemetry that counts</h3>
                <p>
                  Measures findings <b>acted on</b> — not fired. Noisy rules are
                  named in the Monday digest, then tuned or cut.
                </p>
                <div className="bento-visual">
                  <div className="bars" aria-hidden="true">
                    <i style={{ height: "42%" }} /><i style={{ height: "60%" }} />
                    <i style={{ height: "38%" }} /><i style={{ height: "78%" }} />
                    <i style={{ height: "55%" }} /><i style={{ height: "92%" }} />
                    <i style={{ height: "70%" }} />
                  </div>
                </div>
              </div>
              <div className="bento-card">
                <h3>A real security floor</h3>
                <p>
                  Secret scanning with push protection, Dependabot, dependency
                  review and a SHA-pinned diff secret scan — enabled by
                  onboarding, never assumed, never label-exemptable.
                </p>
              </div>
              <div className="bento-card">
                <h3>Noise control as a rule</h3>
                <p>
                  AI review dies by nitpick spam. Every standard ships a
                  “what NOT to flag” section, and the clean-code corpus allows{" "}
                  <b>zero</b> false positives.
                </p>
              </div>
              <div className="bento-card">
                <h3>PRs, never pushes</h3>
                <p>
                  Standards reach every repo as reviewable pull requests. Teams
                  own their gates; telemetry is pulled with a read-only token.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="stats-band">
        <div className="container inner">
          <div className="stat">
            <span className="num"><Counter value={249} /></span>
            <span className="lbl">rules, each with a permanent id</span>
          </div>
          <div className="stat">
            <span className="num"><Counter value={12} /></span>
            <span className="lbl">stack rule sets, composed by profile</span>
          </div>
          <div className="stat">
            <span className="num"><Counter value={105} /></span>
            <span className="lbl">seeded findings in the validation corpus</span>
          </div>
          <div className="stat">
            <span className="num"><Counter value={100} /><em>%</em></span>
            <span className="lbl">BLOCKER recall target, zero noise on clean code</span>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="pill">How it works</span>
              <h2>Edit a rule once. It reaches every repo.</h2>
              <p>
                Rendered per vendor, distributed as PRs, gated on merge,
                measured nightly.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="how">
              <div className="how-card">
                <span className="n">01 — Author</span>
                <h3>Edit one place</h3>
                <p>Vendor-neutral rules in <code>standards/</code>. Bump the version, note the change. Nothing else is hand-written.</p>
              </div>
              <div className="how-card">
                <span className="n">02 — Render</span>
                <h3>Four formats</h3>
                <p><code>render.mjs</code> emits Copilot instructions, <code>AGENTS.md</code>, <code>CLAUDE.md</code> and Cursor rules per profile.</p>
              </div>
              <div className="how-card">
                <span className="n">03 — Distribute</span>
                <h3>Sync as PRs</h3>
                <p>Merging to main opens a sync PR on every onboarded repo. Each PR runs the readiness gate.</p>
              </div>
              <div className="how-card">
                <span className="n">04 — Measure</span>
                <h3>Evolve from data</h3>
                <p>Nightly telemetry, Monday digest, org inbox, weekly seed canary. Noisy rules get tuned or cut.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section" id="docs-preview" style={{ paddingTop: 0 }}>
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="pill">Documentation</span>
              <h2>Everything is in the docs — and copyable.</h2>
              <p>
                The full standards, scripts, workflows and templates ship in the
                documentation, ready to copy into your org. Press <b>⌘K</b> to
                search.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="doc-cards">
              <Link className="doc-card" href="/docs/installation">
                <h3>Installation <span>→</span></h3>
                <p>The eight-step org rollout: source repo, gate, metrics, secrets, ruleset, pilot, validation, widening.</p>
              </Link>
              <Link className="doc-card" href="/docs/standards">
                <h3>Standards <span>→</span></h3>
                <p>Core + 12 stack rule sets — 249 rules with permanent ids, viewable and copyable in full.</p>
              </Link>
              <Link className="doc-card" href="/docs/adaptors/github-copilot">
                <h3>Adaptors <span>→</span></h3>
                <p>Connect GitHub Copilot, Claude, Codex-style agents and Cursor to one rendered source of truth.</p>
              </Link>
              <Link className="doc-card" href="/docs/output-contract">
                <h3>Output contract <span>→</span></h3>
                <p>Machine-readable severities and rule ids — the part that turns review comments into metrics.</p>
              </Link>
              <Link className="doc-card" href="/docs/scripts">
                <h3>Scripts <span>→</span></h3>
                <p>Render, sync, onboarding, validation, scoring and telemetry — every script, ready to copy.</p>
              </Link>
              <Link className="doc-card" href="/docs/workflows">
                <h3>Workflows <span>→</span></h3>
                <p>The reusable gate, sync, collection, digest, inbox and canary GitHub Actions workflows.</p>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="final-cta">
        <div className="glow" aria-hidden="true" />
        <div className="container">
          <h2>Ship at AI speed.<br />The line still holds.</h2>
          <p>
            Security floor, branch ruleset, standards sync and a verified gate —
            from a single onboarding command.
          </p>
          <div className="ctas">
            <Link className="btn btn-red" href="/docs/installation">
              Get Started
            </Link>
            <Link className="btn btn-outline" href="/docs/standards">
              Browse the Standards
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
