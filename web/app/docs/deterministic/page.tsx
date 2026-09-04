import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { loadManifest } from "@/lib/manifest";
import { findRule } from "@/lib/rules";

export const metadata: Metadata = { title: "Deterministic rules" };

export default function Page() {
  const manifest = loadManifest();
  const ids = manifest.deterministic ?? [];

  return (
    <DocsPage
      crumb="Core Concepts"
      title="Deterministic rules"
      intro="A share of the standard needs no model. A ticket reference is present or it is not — and asking an LLM invites a false positive on a fact, which is the worst kind."
      href="/docs/deterministic"
    >
      <h2>Why split the standard at all</h2>
      <p>
        Sending a decidable rule to a model costs tokens and buys uncertainty. It
        also produces the one kind of finding an author cannot argue with
        productively: <b>you cannot debate a model about whether the word TODO
        appears on a line.</b> These rules are evaluated directly instead, in the
        gate&apos;s <code>policy</code> job, with no model call.
      </p>

      <h2>What is classified today</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Severity</th>
              <th>What the checker decides</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const rule = findRule(id);
              const stack = id.split("/")[0];
              return (
                <tr key={id}>
                  <td>
                    <Link href={`/docs/standards/${stack}`}>
                      <code>{id}</code>
                    </Link>
                  </td>
                  <td>{rule?.severity ?? "—"}</td>
                  <td>{rule?.text ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Everything not listed is a judgement rule and stays with the model. The
        classification is complete by construction — listed means deterministic,
        absent means judgement.
      </p>

      <h2>The classification lives in the manifest, not the markdown</h2>
      <p>
        This is the decision that removes most of the risk from splitting the
        source of truth. <code>standards/*.md</code> is what a reviewer reads, and
        deleting a rule from it because a checker also covers it would{" "}
        <b>narrow what the model considers</b>. So the list lives in{" "}
        <code>standards/manifest.json</code>, no rule text changed, and{" "}
        <b>not one rule id moved</b> — every historical telemetry record is keyed
        on them.
      </p>
      <p>
        Where a check can only decide <i>part</i> of a rule it decides that part
        and the model still sees the whole rule.{" "}
        <code>javascript/unsafe-numeric-coercion</code> is checked for a missing{" "}
        <code>parseInt</code> radix; whether a <code>Number()</code> coercion is
        applied to user input is judgement and stays where judgement belongs.
      </p>

      <h2>Only added lines</h2>
      <p>
        A checker that read whole files would flag every <code>var</code> in a
        legacy file the author merely renamed — which the standard&apos;s own
        &ldquo;what NOT to flag&rdquo; section forbids. An author who is right to
        ignore one finding learns to ignore the next one too.
      </p>

      <h2>Running it yourself</h2>
      <CodeWindow
        title="terminal"
        copyText={"git diff main...HEAD > change.diff\nnpx redline-cli policy --diff-file change.diff"}
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">git diff main...HEAD &gt; change.diff</span>
        {"\n"}
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redline-cli policy --diff-file change.diff</span>
      </CodeWindow>
      <p>
        The floor is <code>BLOCKER</code>, not <code>HIGH</code>, on purpose: a
        deterministic tier that failed merges over a missing ticket reference on
        day one would be switched off by week two, and then nothing it decides is
        enforced at all.
      </p>

      <h2>What is deliberately not in the tier</h2>
      <p>
        <code>core/hardcoded-secrets</code>. A regex over added lines is how a
        secret scanner earns a reputation for false positives; the gate already
        runs a real one against verified secrets, and the model keeps the rule for
        what a scanner misses — a credential in a comment, for instance.
      </p>
      <p>
        A rule classified as machine-checked with no implementation is a build
        failure. That state — everyone believes it is covered, and it is enforced
        by nobody — is worse than leaving it to the model, which would at least
        have looked.
      </p>
    </DocsPage>
  );
}
