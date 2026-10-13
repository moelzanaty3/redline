import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal, Terminal } from "@/components/learn/parts";
import { COMMANDS, findBySlug } from "@/lib/registry";
import { COMMANDS_INFO, type CommandExample } from "@/lib/commands-info";
import { installCommand, packageState, type PackageState } from "@/lib/package-version";

export function generateStaticParams() {
  return COMMANDS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(COMMANDS, slug);
  return { title: entry ? `${entry.title} — CLI` : "CLI" };
}

// `{npx}` is the published package, for runs before a pinned copy exists.
// `{redline}` is the pinned copy, shown in the package manager the reader picked.
function Example({ example, state }: { example: CommandExample; state: PackageState }) {
  const commands = example.commands.replaceAll("{npx}", installCommand(state, "").trim());
  return commands.includes("{redline}") ? (
    <RedlineTerminal commands={commands} output={example.output} />
  ) : (
    <Terminal commands={commands} output={example.output} />
  );
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findBySlug(COMMANDS, slug);
  if (!entry) notFound();
  const info = COMMANDS_INFO[slug];
  if (!info) notFound();
  const state = await packageState();

  return (
    <DocsPage
      crumb={`CLI / ${entry.title}`}
      title={entry.title}
      intro={info.summary}
      href={`/docs/cli/${slug}`}
    >
      <p>{info.what}</p>
      <p>
        <b>Where it runs:</b> {info.runsIn}
      </p>

      <h2>Synopsis</h2>
      <CodeWindow title="synopsis">
        <span className="tk-white">{info.synopsis.join("\n")}</span>
      </CodeWindow>

      {info.flags.length > 0 ? (
        <>
          <h2>Flags</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Default</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {info.flags.map((f) => (
                  <tr key={f.flag}>
                    <td>
                      <code>{f.flag}</code>
                    </td>
                    <td>{f.default}</td>
                    <td>{f.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <code>--help</code> prints the same list from the CLI you have installed.
          </p>
        </>
      ) : null}

      <h2>Examples</h2>
      {info.examples.map((example) => (
        <Fragment key={example.title}>
          <h3>{example.title}</h3>
          <Example example={example} state={state} />
        </Fragment>
      ))}

      <h2>Exit codes</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {info.exitCodes.map((e) => (
              <tr key={e.code}>
                <td>
                  <code>{e.code}</code>
                </td>
                <td>{e.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Related</h2>
      <ul>
        {info.related.map((r) => (
          <li key={r.href}>
            <Link href={r.href}>{r.label}</Link>
          </li>
        ))}
        <li>
          <Link href="/docs/cli">All commands and the shared exit codes</Link>
        </li>
        <li>
          Source: <code>{info.source}</code>
        </li>
      </ul>
    </DocsPage>
  );
}
