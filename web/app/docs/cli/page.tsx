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
      intro="One page per command, each written against what the command actually prints rather than against its help text."
      href="/docs/cli"
    >
      <p>
        Every command <code>redline --help</code> prints. Most act on the
        repository you are standing in; <code>sync</code>,{" "}
        <code>registry</code> and <code>metrics</code> act on the estate instead,
        and running them in a product repo is a wasted afternoon rather than an
        error message. For what any of it is <i>for</i>, start with{" "}
        <Link href="/docs/success">What success looks like</Link>, which walks
        them in the order you would reach for them; for who may run what, under
        which credential, see{" "}
        <Link href="/docs/who-runs-what">Who runs what</Link>.
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
