import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { loadManifest } from "@/lib/manifest";
import { findRule } from "@/lib/rules";

// The habits behind the rules, each pinned to a real rule id. Resolved against
// the catalogue at build time: a pattern that cites a rule the standard no
// longer has must stop the build, not render a dead link.
const PATTERNS: { looks: string; hides: string; asks: string; rule: string }[] = [
  {
    looks: "return body as unknown as Invoice",
    hides: "A cast where a parse should be. Wrong data reaches runtime typed as right.",
    asks: "Parse at the boundary — or a // SAFETY: comment saying why the cast holds.",
    rule: "core/unsafe-assertion",
  },
  {
    looks: "catch (e) { log(e) }  return true",
    hides: "A failure logged, then reported as success.",
    asks: "Handle it where it happened, or let it propagate.",
    rule: "core/silent-async-failure",
  },
  {
    looks: "vi.mock('./billing')",
    hides: "A test that replaces the code it claims to test, and passes when the wiring breaks.",
    asks: "Inject a real interface and pass a faithful test implementation.",
    rule: "typescript/module-mocking",
  },
  {
    looks: "if (user == null) return",
    hides: "A guard against a state the types already rule out — noise that hides real bugs.",
    asks: "Trust the type; guard only at real boundaries.",
    rule: "core/unreachable-defensive-guard",
  },
  {
    looks: "class PaymentProviderFactory",
    hides: "An abstraction with one implementation, for a need nobody has yet.",
    asks: "The smallest change that solves the problem in front of you.",
    rule: "core/speculative-abstraction",
  },
];

// The same thinking carried into other stacks — one rule from each.
const ELSEWHERE = [
  "go/error-laundered-to-nil",
  "java/test-without-assertion",
  "python/return-in-finally",
  "kotlin/dropped-exception-cause",
  "csharp/rethrow-loses-stack",
  "swift/concurrency-checking-opt-out",
];

const SO_SURVEY = "https://survey.stackoverflow.co/2025/ai";

function mustExist(id: string): string {
  if (findRule(id) === undefined) {
    throw new Error(`standards/ no longer defines "${id}"; the home page cites it`);
  }
  return id;
}

export function LowEvidence() {
  const stackCount = Object.keys(loadManifest().stacks).length;
  PATTERNS.forEach((p) => mustExist(p.rule));
  ELSEWHERE.forEach(mustExist);

  return (
    <section className="hm-sec hm-slop" id="low-evidence">
      <div className="container">
        <Reveal>
          <div className="hm-sec-head">
            <span className="hm-eyebrow">Anti-slop: the thinking behind the rules</span>
            <h2 className="hm-h2">AI slop looks finished. Redline asks for proof.</h2>
            <p className="hm-lead">
              AI writes <b>slop</b>: code that compiles, reads well, and proves
              nothing. 66% of developers surveyed name AI answers that are{" "}
              <a href={SO_SURVEY} rel="noopener noreferrer" target="_blank">
                &ldquo;almost right, but not quite&rdquo;
              </a>{" "}
              as a frustration. Redline&apos;s rules ask for evidence instead.
            </p>
          </div>

          <div className="hm-slop-table" role="table" aria-label="Low-evidence patterns and what Redline asks for">
            <div className="hm-slop-head" role="row">
              <span role="columnheader">Looks like</span>
              <span role="columnheader">What it hides</span>
              <span role="columnheader">Redline asks for</span>
            </div>
            {PATTERNS.map((p) => (
              <div className="hm-slop-row" role="row" key={p.rule}>
                <code className="hm-slop-code" role="cell">
                  {p.looks}
                </code>
                <p role="cell">{p.hides}</p>
                <p role="cell">
                  {p.asks}{" "}
                  <Link className="hm-slop-id" href={`/r/${p.rule}`}>
                    {p.rule}
                  </Link>
                </p>
              </div>
            ))}
          </div>

          <p className="hm-slop-more">
            <span>The same thinking, in all {stackCount} stacks:</span>
            {ELSEWHERE.map((id) => (
              <Link className="hm-slop-chip" href={`/r/${id}`} key={id}>
                {id}
              </Link>
            ))}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
