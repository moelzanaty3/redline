import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { SCRIPTS } from "@/lib/registry";
import { SCRIPTS_INFO } from "@/lib/scripts-info";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Maintainer scripts" };

export default function Page() {
  const rows = SCRIPTS.flatMap((script) => {
    const info = SCRIPTS_INFO[script.slug];
    return info ? [{ ...script, info }] : [];
  });
  const runYourself = rows.filter((r) => r.info.when);

  return (
    <DocsPage
      crumb="Maintaining Redline"
      title="Maintainer scripts"
      intro="The scripts in scripts/ keep the Redline source repository itself honest, and do the work behind the measurement commands. Engineers in a product repository never run them."
      href="/docs/scripts"
    >
      <p>
        Redline holds hundreds of repositories to a standard, so its own source has
        to meet one too. Four scripts check that: rule ids are present, the
        rendered artifacts match <code>standards/</code>, the bundle is internally
        consistent, and every pinned dependency is still what its comment says.
        CI runs all four, and you run them yourself while editing.
      </p>
      <p>
        Nine more do the measurement work. You reach those through{" "}
        <Link href="/docs/cli/metrics">
          <code>redline metrics</code>
        </Link>{" "}
        and{" "}
        <Link href="/docs/cli/registry">
          <code>redline registry</code>
        </Link>
        , which check the flags and hand the script its environment — so their
        flags and output are documented there, not here.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Script</th>
              <th>What it does</th>
              <th>Who runs it</th>
              <th>How</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} id={r.slug}>
                <td>
                  <a href={`${GITHUB_URL}/blob/main/${r.file}`} rel="noreferrer" target="_blank">
                    <code>{r.title}</code>
                  </a>
                </td>
                <td>{r.description}</td>
                <td>{r.info.runBy}</td>
                <td>
                  {r.info.cli ? (
                    <Link href={r.info.cli.href}>
                      <code>{r.info.cli.command}</code>
                    </Link>
                  ) : (
                    <code>{r.info.command}</code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>When you run them yourself</h2>
      <p>
        From the root of a checkout of this repository. None of the four needs
        an install or a build, and none has an npm script.
      </p>
      <ul>
        {runYourself.map((r) => (
          <li key={r.slug}>
            <code>{r.info.command}</code> — {r.info.when}
          </li>
        ))}
      </ul>
      <p>
        The two local helpers do have npm scripts: <code>npm run stars</code>{" "}
        refreshes <code>web/lib/github-stars.json</code>, and{" "}
        <code>npm run publish:local</code> installs the working tree as your
        global <code>redline</code> (<code>npm run publish:local:clean</code>{" "}
        removes it).
      </p>

      <h2>Changing a script</h2>
      <p>
        Edit the <code>.mjs</code> file directly; nothing generates them. CI parses
        every file in <code>scripts/</code> with <code>node --check</code>, and{" "}
        <code>npm test</code> runs the tests under{" "}
        <code>scripts/**/__tests__/</code>. If the script sits behind a{" "}
        <code>metrics</code> or <code>registry</code> command, its flags are
        declared in <code>cli/metrics/options.ts</code> — change both together.
      </p>
    </DocsPage>
  );
}
