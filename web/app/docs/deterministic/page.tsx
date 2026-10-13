import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";
import { loadManifest } from "@/lib/manifest";
import { findRule, getRules } from "@/lib/rules";

export const metadata: Metadata = { title: "Deterministic rules" };

export default function Page() {
  const manifest = loadManifest();
  const ids = manifest.deterministic ?? [];
  const total = getRules().length;

  // Real `redline policy` output for a small function with a TODO, a `var`,
  // a radix-less parseInt and a double assertion; the two count lines are
  // computed from the catalogue so they cannot drift from it.
  const policyOutput = `a.ts:2
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it. Add the ticket id on the same line, or do the work now.
a.ts:3
  Redline/HIGH [javascript/unsafe-numeric-coercion]: \`parseInt\` without a radix. Pass 10 explicitly: an input like "08" or "0x10" is otherwise parsed by a rule most readers do not have in mind.
a.ts:3
  Redline/HIGH [javascript/var-in-new-code]: \`var\` is function-scoped and hoisted. Use \`const\`, or \`let\` where the binding is reassigned.
a.ts:4
  Redline/BLOCKER [core/unsafe-assertion]: a double assertion overrides the type checker with no stated reason. Fix the types, or add a \`// SAFETY: <why this holds>\` comment on this line or the line above.
4 finding(s) from ${ids.length} deterministic rule(s)
${total - ids.length} of the ${total} rule(s) in the catalogue cannot be decided without a model and were not checked here — run \`redline review\` for those`;

  return (
    <DocsPage
      crumb="Core Concepts"
      title="Deterministic rules"
      intro="Some rules need no model. Whether a TODO carries a ticket reference is a fact, so a checker decides it: instantly, for free, and the same way every time."
      href="/docs/deterministic"
    >
      <h2>Why some rules skip the model</h2>
      <p>
        A model reviewing code is sometimes wrong. On a judgement call (&ldquo;is this error
        handled well enough?&rdquo;) that is a fair trade. On a fact (&ldquo;does this line contain
        a <code>TODO</code> with no ticket?&rdquo;) it is not: a model can only add cost and the
        chance of a false finding that nobody can argue with productively.
      </p>
      <p>
        So the standard is split in two. The table below compares them:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Deterministic rules</th>
              <th>Judgement rules</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Decided by</td>
              <td>
                a checker in the CLI (<code>redline policy</code>)
              </td>
              <td>a model, in your assistant or the pull request reviewer</td>
            </tr>
            <tr>
              <td>How many</td>
              <td>{ids.length}</td>
              <td>{total - ids.length}</td>
            </tr>
            <tr>
              <td>Same answer every run</td>
              <td>yes</td>
              <td>no</td>
            </tr>
            <tr>
              <td>Runs in the gate</td>
              <td>
                yes, as the <code>Deterministic policy</code> check
              </td>
              <td>no: posted as review comments</td>
            </tr>
            <tr>
              <td>Cost</td>
              <td>none</td>
              <td>model tokens</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Both kinds write findings in the same{" "}
        <Link href="/docs/output-contract">output contract</Link>, with the same rule ids.
      </p>

      <h2>The deterministic rules</h2>
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
        Every rule not in this table is a judgement rule. The list is the{" "}
        <code>deterministic</code> array in <code>standards/manifest.json</code>: listed means a
        checker decides it, absent means a model does.
      </p>

      <h2>How the checker behaves</h2>
      <ul>
        <li>
          <b>It reads added lines only.</b> A line you did not write is not your finding. A checker
          that read whole files would flag every <code>var</code> in a legacy file you only renamed,
          and an author who rightly ignores that finding learns to ignore the next one too.
        </li>
        <li>
          <b>The model still sees every rule.</b> The rule text stays in the standard, so a model
          reviewing the same change can still raise it. Where a checker decides only part of a rule,
          the model keeps the rest: <code>javascript/unsafe-numeric-coercion</code> is checked for a{" "}
          <code>parseInt</code> with no radix, while whether a <code>Number()</code> call is applied
          to user input stays a judgement.
        </li>
        <li>
          <b>Every listed rule has a checker.</b> <code>scripts/validate.mjs</code> fails the build
          if a rule is listed with no implementation. Otherwise everyone would believe a rule is
          enforced while nothing enforces it.
        </li>
        <li>
          <b>Rule ids never move.</b> A rule keeps its id when it becomes deterministic, so its
          telemetry history carries on unbroken.
        </li>
      </ul>

      <h2>Running it yourself</h2>
      <p>
        The same check the gate runs, on your machine, before you push. It needs no network and no
        model. Save the change as a diff and pass it in:
      </p>
      <RedlineTerminal
        commands={`git diff main...HEAD > change.diff
{redline} policy --diff-file change.diff`}
        output={policyOutput}
      />
      <p>
        It exits 1 when a finding is at or above <code>--fail-on</code> (default{" "}
        <code>BLOCKER</code>), and 0 otherwise. The last line is a reminder that most of the
        standard is judgement: a clean <code>policy</code> run does not mean a clean review.
      </p>

      <h3>In the gate</h3>
      <p>
        The gate&apos;s <code>Deterministic policy</code> check runs the same command on the pull
        request&apos;s diff. The repository&apos;s <Link href="/docs/enforcement">rung</Link> sets
        the threshold:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>The check fails on</th>
              <th>Locally, pass</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>observe</code>, <code>block-blocker</code>
              </td>
              <td>a BLOCKER</td>
              <td>nothing (the default)</td>
            </tr>
            <tr>
              <td>
                <code>block-high</code>
              </td>
              <td>a BLOCKER or a HIGH</td>
              <td>
                <code>--fail-on HIGH</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        At <code>observe</code> the check can turn red, but the gate as a whole still passes. See{" "}
        <Link href="/docs/gate">The merge gate</Link> for how the result is used.{" "}
        <Link href="/docs/learn/earn-a-rung">Learn step 09</Link> runs it on a real fix.
      </p>

      <h2>What is deliberately not deterministic</h2>
      <p>
        <code>core/hardcoded-secrets</code>. A regular expression over added lines is how a secret
        scanner earns a reputation for false positives. The gate already runs a real one,
        TruffleHog, which only reports credentials it has verified. The model keeps the rule for
        what a scanner misses, such as a credential written in a comment.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/cli/policy">
            <code>redline policy</code>
          </Link>
          : every flag.
        </li>
        <li>
          <Link href="/docs/local-review">Reviewing before you push</Link>: the judgement half,
          bounded to your files.
        </li>
        <li>
          <Link href="/docs/gate">The merge gate</Link>: where the check runs on every pull request.
        </li>
      </ul>
    </DocsPage>
  );
}
