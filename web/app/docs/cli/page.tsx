import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { DocsPage } from "@/components/docs-page";
import { RedlineTerminal } from "@/components/learn/parts";
import { COMMAND_GROUPS, COMMANDS_INFO } from "@/lib/commands-info";

export const metadata: Metadata = { title: "CLI commands" };

export default function Page() {
  return (
    <DocsPage
      crumb="CLI"
      title="CLI commands"
      intro="Every command redline --help prints, grouped by when you use it. Each page has the flags, real output and exit codes."
      href="/docs/cli"
    >
      <h2>Running a command</h2>
      <p>
        The package is <code>redlinegate</code>, and it installs two names for the same CLI:{" "}
        <code>redline</code> and <code>redlinegate</code>. In a product repository, run the copy
        pinned in the project&apos;s devDependencies, so everyone runs the same version.{" "}
        <code>redline init --pin-cli</code> adds it. Before that, or in a repository without it, run
        the published package with <code>npx redlinegate@latest</code>.
      </p>
      <RedlineTerminal commands={`{redline} --help\n{redline} init --help`} />
      <p>
        Estate commands are different: they run from the Redline source repository or the metrics
        repository, and each page says which.
      </p>

      {COMMAND_GROUPS.map((group) => (
        <Fragment key={group.id}>
          <h2>{group.title}</h2>
          <p>{group.blurb}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(COMMANDS_INFO)
                  .filter(([, info]) => info.group === group.id)
                  .map(([slug, info]) => (
                    <tr key={slug}>
                      <td>
                        <Link href={`/docs/cli/${slug}`}>
                          <code>redline {slug}</code>
                        </Link>
                      </td>
                      <td>{info.summary}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Fragment>
      ))}

      <h2 id="exit-codes">Exit codes</h2>
      <p>
        Every command uses the same codes, so a script can tell a finding from a broken run. Each
        command page lists the ones it returns.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>0</code>
              </td>
              <td>Success.</td>
            </tr>
            <tr>
              <td>
                <code>1</code>
              </td>
              <td>The command ran and the answer is no: drift, a BLOCKER, no valid exemption.</td>
            </tr>
            <tr>
              <td>
                <code>2</code>
              </td>
              <td>
                Usage: an unknown command, flag or value, a repository that is not onboarded, or Node
                older than 18.11.
              </td>
            </tr>
            <tr>
              <td>
                <code>3</code>
              </td>
              <td>Permission: the host refused the credential.</td>
            </tr>
            <tr>
              <td>
                <code>4</code>
              </td>
              <td>
                Host: the host could not be reached or the repository was not found. Also an
                unexpected error inside Redline; re-run with <code>REDLINE_DEBUG=1</code> for the stack
                trace.
              </td>
            </tr>
            <tr>
              <td>
                <code>130</code>
              </td>
              <td>
                Cancelled at an <code>init</code> menu prompt. Nothing was written.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/learn">Learn path</Link>: the commands in the order you would use them.
        </li>
        <li>
          <Link href="/docs/who-runs-what">Who runs what</Link>: which commands need which
          credential.
        </li>
        <li>
          <Link href="/docs/troubleshooting">Troubleshooting</Link>
        </li>
      </ul>
    </DocsPage>
  );
}
