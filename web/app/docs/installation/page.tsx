import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { PackageBadge } from "@/components/package-badge";
import { PACKAGE_NAME, installCommand, packageState, standardsVersion } from "@/lib/package-version";

export const metadata: Metadata = { title: "Installation" };

// Resolved at build time. A published package makes every command on this page
// name its version; a registry we could not reach renders them unpinned rather
// than quoting a number nobody checked.
export default async function Page() {
  const state = await packageState();
  const version = state.status === "published" ? state.version : null;
  const init = installCommand(state, "init");

  return (
    <DocsPage
      crumb="Installation"
      title="Installation"
      intro="A CLI, not a bundle. Install the reusable gate once per GitHub org, then onboard repos one command at a time — on GitHub or Azure DevOps."
      href="/docs/installation"
    >
      <h2>Which version to install</h2>
      <PackageBadge state={state} />
      <p>
        Two version lines run separately and neither is derived from the other.
        The <b>package version</b> is the CLI on npm, computed by semantic-release
        at publish time. The <b>standards version</b> is{" "}
        <code>standards/manifest.json</code> → <code>version</code>, currently{" "}
        <code>{standardsVersion()}</code>; every rendered artifact and every sync
        pull request names it, so a repository can always say which standard its
        files came from.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 22 or newer on the machine running the CLI.</li>
        <li>
          A git repository whose remote points at GitHub (including GitHub
          Enterprise Server, if the hostname contains <code>github</code>) or
          Azure DevOps.
        </li>
        <li>
          No install step for the CLI itself — <code>npx {PACKAGE_NAME}</code>{" "}
          fetches it on demand. The npm package is <code>{PACKAGE_NAME}</code>;
          the command it installs is <code>redline</code>.
        </li>
      </ul>

      <h2>GitHub only — install the reusable gate once</h2>
      <p>
        <code>redline init</code> writes a thin caller workflow into each repo
        that references a reusable workflow by org path. Copy{" "}
        <code>workflows/redline-gate.yml</code> into your org&apos;s{" "}
        <code>.github</code> repo as{" "}
        <code>.github/workflows/redline-gate.yml</code> once, so{" "}
        <code>uses: &lt;org&gt;/.github/.github/workflows/redline-gate.yml@main</code>{" "}
        resolves for every repo that onboards. The secret-scan action ships
        pinned to a full commit SHA; <code>scripts/check-pins.mjs</code> keeps it
        honest.
      </p>
      <p>
        Azure DevOps needs no equivalent step: <code>redline init</code> writes
        the whole pipeline template straight into the repo as{" "}
        <code>.azuredevops/redline-gate.yml</code>.
      </p>

      <h2>Onboard a repo</h2>
      <CodeWindow title="terminal" copyText={init}>
        <span className="tk-prompt">$</span> <span className="tk-white">{init}</span>
      </CodeWindow>
      <p>
        See <b>Onboard a repository</b> for what it installs, how it degrades
        without repo-admin rights, and the two hosts&apos; gate contracts.
      </p>

      <h2>Limitations, stated plainly</h2>
      <ul>
        <li>
          A self-hosted GitHub Enterprise Server on a hostname that doesn&apos;t
          contain <code>github</code> is not auto-detected.
        </li>
        <li>
          <code>redline sync</code> runs from a checkout of the Redline source
          repository, not from a product repo, and it needs{" "}
          <code>registry.json</code> — the register of onboarded repositories,
          derived nightly. A repository that is not in the register picks up a
          standards change by re-running <code>redline init</code>.
        </li>
        <li>
          No offline single-file executable yet, which matters for air-gapped
          Azure agents without npm registry access.
        </li>
        <li>
          The merge gate installs advisory-only on both hosts. Promoting it to
          blocking is a deliberate second step, after a soak period.
        </li>
      </ul>
      {version && (
        <p>
          <small>
            Version resolved from the npm registry when this page was built.
          </small>
        </p>
      )}
    </DocsPage>
  );
}
