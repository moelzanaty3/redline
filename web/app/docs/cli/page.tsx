import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { COMMANDS } from "@/lib/registry";
import { COMMANDS_INFO } from "@/lib/commands-info";

export const metadata: Metadata = { title: "CLI commands" };

export default function Page() {
  return (
    <DocsPage
      crumb="CLI"
      title="CLI commands"
      intro="The commands you run in a repository, and the two that act on the estate. Every one of them is built — each page below is written against what the command actually prints."
      href="/docs/cli"
    >
      <p>
        <code>redline init</code> and <code>redline verify</code> are what an
        onboarded repository uses day to day; <code>redline status</code> answers
        what is installed here without contacting a host or needing a credential;{" "}
        <code>redline review</code> reviews a diff against only the rules its
        files touch; <code>redline explain</code> turns the bracketed id in a
        finding back into the rule and the line in <code>standards/</code> that
        defines it; <code>redline policy</code> and <code>redline exempt</code>{" "}
        are what the gate calls; <code>redline remove</code> takes Redline back
        out as a pull request; and <code>redline sync</code> runs from a checkout
        of this repository to open a pull request on every registered repository
        whose standards are behind. Two more —{" "}
        <code>redline registry</code> and <code>redline metrics</code> — act on
        the estate rather than on a repository, and are documented under
        Scripts and Telemetry.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {COMMANDS.map((c) => (
          <Link className="doc-card" href={`/docs/cli/${c.slug}`} key={c.slug}>
            <h3>
              {c.title} <span>→</span>
            </h3>
            <p>
              {COMMANDS_INFO[c.slug]?.built === false ? "Not built. " : ""}
              {c.description}
            </p>
          </Link>
        ))}
      </div>
    </DocsPage>
  );
}
