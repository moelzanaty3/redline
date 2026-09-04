import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Counter } from "@/components/counter";
import { Journey } from "@/components/journey";
import { Reveal } from "@/components/reveal";
import { ValueCase } from "@/components/value-case";
import { ValueViz } from "@/components/value-viz";
import { loadManifest } from "@/lib/manifest";
import { getRules } from "@/lib/rules";
import { seededFindingCount } from "@/lib/seeds";

// Declared, not inherited from Next's default. Journey's loaders throw when
// standards/manifest.json or commands/ cannot be resolved, and those throws are
// a build gate only while this page is prerendered — anything that made it
// dynamic would move them to request time and disarm them silently.
export const dynamic = "force-static";

const INSTALL_CMD = "npm i -g redline-cli";
const ONBOARD_CMD = "redline init";

export default function Home() {
  const ruleCount = getRules().length;
  const manifest = loadManifest();
  const stackCount = Object.keys(manifest.stacks).length;
  const vendorCount = Object.values(manifest.vendors).filter((v) => v.enabled).length;
  const seedCount = seededFindingCount();
  return (
    <main>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-lines" aria-hidden="true" />
        <div className="container">
          <h1>
            AI writes the code.
            <br />
            <span className="grad">Redline holds the line.</span>
          </h1>
          <p className="sub">
            Your team&apos;s engineering standards, written once and rendered into
            the files your AI coding tools already read — with a merge gate the
            CLI installs and re-checks on GitHub and Azure DevOps.
          </p>
          <p className="hero-claim">
            <span>No servers</span>
            <span>No SaaS</span>
            <span>No per-seat fee</span>
          </p>
          <div className="hero-cmd">
            <div className="hc-row">
              <span className="hc-step">once</span>
              <code>
                <span className="tk-prompt">$ </span>
                {INSTALL_CMD}
              </code>
              <CopyButton
                text={INSTALL_CMD}
                label="Copy"
                ariaLabel={`Copy ${INSTALL_CMD}`}
              />
            </div>
            <div className="hc-row">
              <span className="hc-step">per repo</span>
              <code>
                <span className="tk-prompt">$ </span>
                {ONBOARD_CMD}
              </code>
              <CopyButton
                text={ONBOARD_CMD}
                label="Copy"
                ariaLabel={`Copy ${ONBOARD_CMD}`}
              />
            </div>
          </div>
          <div className="ctas">
            <Link className="btn btn-red" href="/docs/installation">
              Get Started
            </Link>
            <Link className="btn btn-outline" href="/docs">
              Read the Docs
            </Link>
          </div>
          <p className="hero-proof">
            <span>{ruleCount} rules, each with a permanent id</span>
            <span>{stackCount} stack rule sets</span>
            <span>{vendorCount} AI-tool formats</span>
            <span>GitHub &amp; Azure DevOps</span>
            <span>standards v{manifest.version}</span>
          </p>
        </div>
      </section>

      <Journey />

      <ValueViz />

      <ValueCase />

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
                <h3>A merge-readiness gate, host-verified</h3>
                <p>
                  One human approval always, and a required check whose name
                  is confirmed against what the host actually reported —{" "}
                  <code>redline-gate / gate</code> on GitHub,{" "}
                  <code>redline/gate</code> on Azure DevOps.
                </p>
                <div className="bento-visual">
                  <div className="gate-check"><span className="st ok">✓</span> redline-gate / gate — checklist · ADR · deps · secret scan</div>
                  <div className="gate-check"><span className="st ok">✓</span> 1 human approval — cannot be lowered, CI enforces it</div>
                  <div className="gate-check"><span className="st ok">✓</span> advisory by default — promoted to blocking after a soak</div>
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
                    <span>redline init</span><b>→</b>
                    <span>4 vendors</span><b>→</b>
                    <span>1 pull request</span>
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
                  Standards reach a repository as a reviewable pull request when{" "}
                  <code>redline init</code> runs there — opened on{" "}
                  <code>redline/onboard</code> for that repository&apos;s own team
                  to merge. Redline never pushes to your default branch.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div className="roadmap-note">
              <h3>What is not built yet</h3>
              <p>
                Automated review against a measurable output contract, and
                org-wide telemetry across both hosts, are later-phase work. There
                is no <code>redline sync</code> either — until it ships, an
                already-onboarded repository picks up a standards change by
                re-running <code>redline init</code>.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="stats-band">
        <div className="container inner">
          <div className="stat">
            <span className="num"><Counter value={ruleCount} /></span>
            <span className="lbl">rules, each with a permanent id</span>
          </div>
          <div className="stat">
            <span className="num"><Counter value={stackCount} /></span>
            <span className="lbl">stack rule sets, composed by profile</span>
          </div>
          <div className="stat">
            <span className="num"><Counter value={seedCount} /></span>
            <span className="lbl">seeded findings in the validation corpus</span>
          </div>
          <div className="stat">
            <span className="num"><Counter value={100} /><em>%</em></span>
            <span className="lbl">BLOCKER recall — the target the corpus is scored against</span>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <span className="pill">How it works</span>
              <h2>Author once. It reaches the estate, and comes back measured.</h2>
              <p>
                Rendered per vendor, installed by one command, distributed as
                pull requests, gated on merge, and measured against whether
                anyone acted.
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
                <h3>Five formats</h3>
                <p>Copilot instructions, <code>AGENTS.md</code>, <code>CLAUDE.md</code>, Cursor rules and per-stack Claude skills — from one source, per profile.</p>
              </div>
              <div className="how-card">
                <span className="n">03 — Onboard</span>
                <h3><code>redline init</code></h3>
                <p>Detects GitHub or Azure DevOps, installs the floor, opens one pull request. Never a direct push.</p>
              </div>
              <div className="how-card">
                <span className="n">04 — Distribute</span>
                <h3><code>redline sync</code></h3>
                <p>A rule change reaches every registered repository as a pull request. Nobody re-runs anything by hand.</p>
              </div>
              <div className="how-card">
                <span className="n">05 — Verify</span>
                <h3><code>redline verify</code></h3>
                <p>Confirms the gate reported for real, locally or across the estate. A check that could not run says so rather than passing.</p>
              </div>
              <div className="how-card">
                <span className="n">06 — Measure</span>
                <h3><code>redline metrics</code></h3>
                <p>Acted-on rate, seed recall, how much of the estate enforces, and what review cost against what it caught.</p>
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
                Every rule, command, workflow and template — with the decision
                behind it, not just the mechanism. Press <b>⌘K</b> to search.
              </p>
            </div>
          </Reveal>
          <Reveal>
            <div className="doc-cards">
              <Link className="doc-card" href="/docs/installation">
                <h3>Installation <span>→</span></h3>
                <p>Install the gate workflow into the org, then run <code>npx redline-cli init</code> per repo — GitHub or Azure DevOps.</p>
              </Link>
              <Link className="doc-card" href="/docs/standards">
                <h3>Standards <span>→</span></h3>
                <p>Core + 12 stack rule sets — 249 rules with permanent ids, viewable and copyable in full.</p>
              </Link>
              <Link className="doc-card" href="/docs/adaptors/github-copilot">
                <h3>Adaptors <span>→</span></h3>
                <p>Connect GitHub Copilot, Claude, Codex-style agents and Cursor to one rendered source of truth.</p>
              </Link>
              <Link className="doc-card" href="/docs/cost">
                <h3>Cost and value <span>→</span></h3>
                <p>Cost per BLOCKER caught — a figure no cost tool and no DORA tool can compute on its own.</p>
              </Link>
              <Link className="doc-card" href="/docs/output-contract">
                <h3>Output contract <span>→</span></h3>
                <p>Machine-readable severities and rule ids — the part that turns review comments into metrics.</p>
              </Link>
              <Link className="doc-card" href="/docs/enforcement">
                <h3>Enforcement ladder <span>→</span></h3>
                <p>Four rungs a repository climbs on recorded evidence — and steps back from without asking anyone.</p>
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
            Security floor, rendered standards and a verified merge gate —
            from a single onboarding command, on GitHub or Azure DevOps.
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
