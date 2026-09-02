import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { loadManifest } from "@/lib/manifest";
import { STANDARDS } from "@/lib/registry";
import { findRule, getRules } from "@/lib/rules";

export const metadata: Metadata = { title: "Standards" };

const EXAMPLE_RULE_ID = "core/query-string-concatenation";

export default function Page() {
  const rules = getRules();
  const manifest = loadManifest();
  const example = findRule(EXAMPLE_RULE_ID);
  const stackTitle = (id: string) => manifest.stacks[id]?.title ?? id;

  return (
    <DocsPage
      crumb="Reference"
      title="Standards"
      intro={`A versioned catalogue of ${rules.length} rules — core plus 12 stacks — and the only files a human edits. Everything a developer's tooling actually sees is generated from these.`}
      href="/docs/standards"
    >
      <h2>What a standard is here</h2>
      <p>
        <code>standards/core.md</code> and <code>standards/stacks/*.md</code>{" "}
        are the source of truth, versioned together in{" "}
        <code>standards/manifest.json</code>. Nobody edits anything else by
        hand: <code>.github/copilot-instructions.md</code>,{" "}
        <code>AGENTS.md</code>, <code>CLAUDE.md</code> and{" "}
        <code>.cursor/rules/</code> are all rendered from these files by the
        CLI, and written into a repo by <code>redline init</code>.
      </p>

      <h2>What a developer actually sees</h2>
      <p>
        A developer never opens <code>standards/</code>. They meet it as a
        review comment. This is the output contract the standard specifies
        for a reviewer — every finding begins with a machine-readable prefix,
        a real rule pulled straight out of <code>standards/core.md</code>:
      </p>
      {example && (
        <CodeWindow title="a real finding">
          <span className="tk-red">Redline/BLOCKER</span>{" "}
          <span className="tk-blue">[{example.id}]</span>:{" "}
          <span className="tk-white">{example.text}</span>
          {"\n"}
          <span className="tk-white">
            Use a parameterised query: db.Query(&quot;SELECT id FROM users
            WHERE name = $1&quot;, name)
          </span>
        </CodeWindow>
      )}
      <p>
        Then one or two sentences: why it breaks, and the concrete fix. One
        finding per comment. Full detail on the contract — including how it's
        enforced, not aspirational — is on{" "}
        <Link href="/docs/output-contract">The output contract</Link>.
      </p>

      <h2>Severity — what it obliges the developer to do</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Severity</th><th>Obligation</th></tr>
          </thead>
          <tbody>
            <tr><td>BLOCKER</td><td><b>Must not merge.</b> Security exposure, data loss, crash, silent corruption, or a contract break for live consumers.</td></tr>
            <tr><td>HIGH</td><td><b>Merge is a deliberate trade-off.</b> A reviewer must acknowledge it explicitly, not wave it through.</td></tr>
            <tr><td>SUGGESTION</td><td><b>Optional.</b> The author may dismiss it without justification — no back-and-forth required.</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Rule ids are permanent</h2>
      <p>
        Every rule carries a stable <code>&lt;stack&gt;/&lt;slug&gt;</code>{" "}
        id, written once into the source markdown and never changed again —
        the prose can be reworded freely, the id can&apos;t. That permanence
        is what makes a rule <b>measured</b>: ids are aggregated per rule
        across the org, which is how a rule that earns its place is told
        apart from one that only generates noise.
      </p>
      <p>
        <code>core/uncatalogued</code> exists for a real finding no rule
        covers — a reviewer confident something is wrong, with no id to cite.
        A rising count of <code>core/uncatalogued</code> is how a missing
        rule gets discovered. The same mechanism is a developer&apos;s route
        to push back: a rule that fires constantly and gets dismissed every
        time is data, and data is what changes a rule — not an argument in a
        PR thread.
      </p>

      <h2>A repo installs exactly one profile</h2>
      <p>
        Negated globs (<code>!**/*.native.*</code>) aren&apos;t part of
        Copilot&apos;s <code>applyTo</code> contract and have no{" "}
        <code>AGENTS.md</code> equivalent at all, so two rule sets that
        contradict each other are never installed side by side in the same
        repo. A profile is the disambiguation mechanism instead: it names
        exactly which stacks apply, and every stack&apos;s globs stay plain
        and unambiguous inside it. <code>redline init</code> proposes one by
        scanning the repo; <code>--profile &lt;name&gt;</code> overrides the
        guess.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Profile</th><th>Stacks</th></tr>
          </thead>
          <tbody>
            {Object.entries(manifest.profiles).map(([name, stacks]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{stacks.map(stackTitle).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What NOT to flag</h2>
      <p>
        Noise control is a rule, not a preference — every standard binds the
        reviewer to it. A developer should expect the reviewer to stay quiet
        on: formatting a linter already enforces, existing patterns a PR
        merely touches but doesn&apos;t change, &quot;consider using X
        instead&quot; when the current library works, naming preferences
        where the existing name is unambiguous, and re-raising the same issue
        on every occurrence instead of flagging the first and saying
        &quot;and N similar&quot;.
      </p>

      <h2>Browse the standards</h2>
      <p>
        The full source, plus a rule reference table grouped by severity, per
        stack.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {STANDARDS.map((s) => (
          <Link className="doc-card" href={`/docs/standards/${s.slug}`} key={s.slug}>
            <h3>{s.title} <span>→</span></h3>
            <p>{s.description}</p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
