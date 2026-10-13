import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { SCRIPTS } from "@/lib/registry";
import { SCRIPTS_INFO, type ScriptGroup } from "@/lib/scripts-info";
import { GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Maintainer scripts" };

const GROUP_LABEL: Record<ScriptGroup, string> = {
  source: "Source check",
  measurement: "Measurement",
  local: "Local helper",
};

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
      intro="The Node scripts in scripts/. Some keep this repository honest; the rest do the work behind redline metrics and redline registry."
      href="/docs/scripts"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>For the platform team maintaining Redline.</b> Engineers in a
          product repository never run these.
        </p>
      </div>

      <h2>Why they exist</h2>
      <p>
        Redline holds every onboarded repository to a standard, so its own
        source has to meet one too. Four <b>source checks</b> do that. They
        confirm every rule has an id, the rendered files match{" "}
        <code>standards/</code>, the bundle is consistent, and every pinned
        dependency is what its comment says. CI runs them, and you run them
        while editing.
      </p>
      <p>
        Nine <b>measurement scripts</b> do the estate-wide work. You never call
        them directly. You run{" "}
        <Link href="/docs/cli/metrics">
          <code>redline metrics</code>
        </Link>{" "}
        or{" "}
        <Link href="/docs/cli/registry">
          <code>redline registry</code>
        </Link>
        , which validates the flags and then runs the script. Their flags and
        output are documented on those pages.
      </p>
      <p>Two more are local helpers for maintainers.</p>

      <h2>All scripts</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Script</th>
              <th>Kind</th>
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
                <td>{GROUP_LABEL[r.info.group]}</td>
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

      <h2>Running the source checks yourself</h2>
      <p>
        Run them from the root of a checkout of this repository. None needs an
        install or a build.
      </p>
      <ul>
        {runYourself.map((r) => (
          <li key={r.slug}>
            <code>{r.info.command}</code> — {r.info.when}
          </li>
        ))}
      </ul>
      <p>
        The two local helpers run through npm: <code>npm run stars</code>{" "}
        refreshes <code>web/lib/github-stars.json</code>, and{" "}
        <code>npm run publish:local</code> installs the working tree as your
        global <code>redline</code>. <code>npm run publish:local:clean</code>{" "}
        removes it again.
      </p>

      <h2>Changing a script</h2>
      <p>
        Edit the <code>.mjs</code> file directly; nothing generates them. Then
        run <code>npm test</code>, which includes the tests under{" "}
        <code>scripts/**/__tests__/</code>. CI also parses every{" "}
        <code>scripts/*.mjs</code> with <code>node --check</code>.
      </p>
      <p>
        If the script sits behind a <code>metrics</code> or{" "}
        <code>registry</code> command, its flags are declared in{" "}
        <code>cli/metrics/options.ts</code>. Change both in the same pull
        request.
      </p>
    </DocsPage>
  );
}
