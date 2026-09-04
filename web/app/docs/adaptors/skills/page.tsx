import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { loadManifest } from "@/lib/manifest";

export const metadata: Metadata = { title: "Claude skills adaptor" };

// Measured by scripts/measure-context.mjs against the shipped standards. Quoted
// rather than estimated, and the losing cases are quoted too — the roadmap makes
// this piece conditional on the number paying for itself, and a page that showed
// only the wins would be marketing.
const MEASURED = [
  { profile: "fullstack-node", stacks: 4, reduction: 48.3 },
  { profile: "service-node", stacks: 3, reduction: 37.2 },
  { profile: "mobile-rn", stacks: 3, reduction: 37.1 },
  { profile: "web", stacks: 2, reduction: 22.7 },
  { profile: "service-java", stacks: 2, reduction: 20.5 },
  { profile: "tooling", stacks: 1, reduction: -4.4 },
  { profile: "mobile-ios", stacks: 1, reduction: -4.7 },
  { profile: "infra", stacks: 1, reduction: -4.9 },
];

export default function Page() {
  const manifest = loadManifest();
  const enabled = manifest.vendors["skills"]?.enabled ?? false;

  return (
    <DocsPage
      crumb="Adaptors"
      title="Claude skills"
      intro="Per-stack rules that load only when that stack is in play, instead of the whole standard every turn."
      href="/docs/adaptors/skills"
    >
      <h2>What this is</h2>
      <p>
        An asymmetry in the vendor matrix. Copilot receives{" "}
        <code>.github/instructions/redline-*.instructions.md</code> with{" "}
        <code>applyTo</code> globs — conditional, per-stack loading. Claude
        receives <code>CLAUDE.md</code> → <code>@AGENTS.md</code>: the entire
        composed standard, every turn, for the life of every session. On a
        four-stack profile that is most of a context window spent on rules for
        languages the repository is not currently editing.
      </p>
      <p>
        This adaptor renders one skill per stack at{" "}
        <code>.claude/skills/redline-&lt;stack&gt;/SKILL.md</code>, plus a core
        skill that always applies. A skill loads on its description rather than a
        glob, so the description names the stack and its file extensions. That is
        the whole mechanism — the roadmap rates this the highest-exposure piece in
        the plan (per-file conditional loading is exactly what a platform makes
        free), so there is deliberately nothing clever here to maintain.
      </p>

      <h2>How to onboard it</h2>
      <p>
        It ships <b>{enabled ? "enabled" : "disabled"}</b> at the org level, and
        it is selected <b>instead of</b> <code>claude</code>, never alongside it —
        the two render the same rules in different shapes, and a repository with
        both loads every stack twice.
      </p>
      <CodeWindow
        title="terminal"
        copyText="npx redline-cli init --vendors skills,copilot,agents"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redline-cli init --vendors skills,copilot,agents</span>
      </CodeWindow>
      <p>
        The org manifest is a hard ceiling: while <code>skills</code> is disabled
        there, naming it in <code>--vendors</code> renders nothing. That is
        deliberate — a render target that changes what every Claude session loads
        should not switch itself on across an estate in a patch release.
      </p>

      <h2>How to use it</h2>
      <p>
        Nothing to run. A session editing a <code>.tsx</code> file loads the core
        skill and the React skill; the Go, Terraform and Python rules stay on
        disk. The rules themselves are the stack&apos;s own markdown from{" "}
        <code>standards/</code>, byte for byte: this is packaging, not authoring,
        and no Claude-shaped concept leaks backward into how a rule is written.
      </p>

      <h2>Expected output</h2>
      <p>
        One directory per stack in the profile, each with a <code>SKILL.md</code>{" "}
        carrying <code>name</code> and <code>description</code> frontmatter. A
        stack leaving the profile takes its skill with it, so a repository never
        keeps loading rules for a language it no longer has.
      </p>
      <p>
        <b>What it measurably costs and saves.</b> Run{" "}
        <Link href="/docs/scripts/measure-context">measure-context.mjs</Link> to
        reproduce this against the current standards:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Stacks</th>
              <th>Context reduction</th>
            </tr>
          </thead>
          <tbody>
            {MEASURED.map((row) => (
              <tr key={row.profile}>
                <td>
                  <code>{row.profile}</code>
                </td>
                <td>{row.stacks}</td>
                <td>
                  {row.reduction > 0 ? `${row.reduction}%` : `${row.reduction}% — costs more`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          <b>Do not select it on a single-stack profile.</b> With one stack there
          is no second one to avoid loading, so the frontmatter is pure overhead
          and the repository ends up about 5% worse off. The gain is real from two
          stacks and substantial from three.
        </p>
      </div>

      <h2>How to edit it</h2>
      <p>
        The renderer is one function in <code>cli/render/vendors.ts</code> —{" "}
        see <Link href="/docs/adaptors/custom">Add your own vendor</Link> for the
        adapter contract. Rules are never edited here: they live in{" "}
        <code>standards/</code>, and this file only decides how they are packaged.
      </p>
    </DocsPage>
  );
}
