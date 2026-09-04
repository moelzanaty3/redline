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
      intro="Four commands, deliberately. Two exist; two are designed and unbuilt, and are documented as such rather than left out."
      href="/docs/cli"
    >
      <p>
        The command surface is fixed at four on purpose — every capability that is
        not one of these is a control-plane job that runs on a schedule, not
        something a person types. <code>redline init</code> and{" "}
        <code>redline verify</code> are what an onboarded repository actually uses;{" "}
        <code>redline sync</code> and <code>redline review</code> are specified and
        sequenced but do not exist in <code>cli/commands/</code>.
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
