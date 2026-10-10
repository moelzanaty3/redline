import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { loadManifest } from "@/lib/manifest";

// The two things a first-time reader assumes Redline is, and what it is
// instead. Every count is derived from the manifest and the rule catalogue.
export function WhatItIs() {
  const manifest = loadManifest();
  const checked = manifest.deterministic?.length ?? 0;
  const vendorCount = Object.values(manifest.vendors).filter((v) => v.enabled).length;

  return (
    <section className="hm-sec hm-is" id="what">
      <div className="container">
        <Reveal>
          <div className="hm-sec-head">
            <span className="hm-eyebrow">What Redline is</span>
            <h2 className="hm-h2">Not a linter. Not a reviewer.</h2>
            <p className="hm-lead">
              The system around review: <b>one written standard</b>, applied at
              the three moments a change passes through.
            </p>
          </div>

          <div className="hm-is-grid">
            <div className="hm-is-card">
              <span className="hm-is-tag">Not a linter</span>
              <p>
                A linter checks syntax, file by file. Redline&apos;s rules include
                what syntax cannot show: a route with no auth check, input
                nobody validated, a change unrelated to the pull request. Keep
                your linter: the standard tells every reviewer to leave its job
                alone.
              </p>
            </div>
            <div className="hm-is-card">
              <span className="hm-is-tag">Not a reviewer</span>
              <p>
                Your people and the AI tools you already use still do the
                reviewing. Redline decides what <i>reviewed</i> means — one rule
                set, one severity scale, one output format — and holds every
                reviewer to the same one.
              </p>
            </div>
            <div className="hm-is-card hm-is-yes">
              <span className="hm-is-tag">The system around review</span>
              <ul>
                <li>
                  <b>Less arrives.</b> The AI read the rules before it wrote.
                </li>
                <li>
                  <b>Facts are settled first.</b> {checked} rules are checked with
                  no model, before a person looks.
                </li>
                <li>
                  <b>Attention goes to judgement.</b> Every finding names its rule,
                  and is counted.
                </li>
              </ul>
            </div>
          </div>

          <ol className="hm-steps hm-is-steps">
            <li>
              <span className="hm-step-n">01 · while it is written</span>
              <h3>Your AI follows the rules</h3>
              <p>
                <code>redline init</code> renders the standard into the{" "}
                {vendorCount} formats your AI tools already read — only the rules
                for the stacks this repository uses.
              </p>
            </li>
            <li>
              <span className="hm-step-n">02 · before you push</span>
              <h3>You get a list of issues</h3>
              <p>
                Ask your assistant for <code>/redline-review</code>: it replies with
                every issue, by rule id — or <b>No Redline issues in this
                change.</b>
              </p>
              <div className="hm-step-cmd">
                <span className="tk-prompt">$ </span>redline review
              </div>
            </li>
            <li>
              <span className="hm-step-n">03 · before it merges</span>
              <h3>The gate checks the pull request</h3>
              <p>
                <code>redline-gate / gate</code> runs the same standard on every
                pull request. It starts <b>advisory</b> and blocks only once you
                promote it. <Link href="/docs/gate">How the gate works →</Link>
              </p>
            </li>
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
