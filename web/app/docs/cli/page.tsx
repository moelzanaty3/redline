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
        The surface is deliberately small — every capability that is not one of
        these is a scheduled control-plane job, not something a person types.{" "}
        <code>redline init</code> and <code>redline verify</code> are what an
        onboarded repository uses day to day; <code>redline review</code> reviews
        a diff against only the rules its files touch; <code>redline policy</code>{" "}
        and <code>redline exempt</code> are what the gate calls; and{" "}
        <code>redline sync</code> runs from a checkout of this repository to open
        a pull request on every registered repository whose standards are behind.
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
