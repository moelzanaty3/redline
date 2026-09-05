import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { PackageBadge } from "@/components/package-badge";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { PACKAGE_NAME, installCommand, packageState, standardsVersion } from "@/lib/package-version";

export const metadata: Metadata = { title: "Installation" };

// Resolved at build time. A published package makes every command on this page
// name its version; an unpublished one makes them install from source instead,
// rather than printing an npx line that cannot resolve.
export default async function Page() {
  const state = await packageState();
  const published = state.status === "published";
  const init = installCommand(state, "init");
  const version = published ? state.version : null;

  const fromSource = [
    {
      label: "git clone <this repo> && cd redline",
      detail: "The CLI is built from this repository. There is no other distribution while the package is unpublished.",
    },
    {
      label: "npm ci",
      detail: "Installs the dev toolchain only — the CLI itself declares no runtime dependencies, so nothing it needs at run time comes from here.",
    },
    {
      label: "npm run build",
      detail: "Compiles cli/ to dist/ with the TypeScript compiler. dist/bin/redline.js is the entry point the published package would expose as redline.",
    },
    {
      label: "node dist/bin/redline.js init",
      detail: "Run from inside the repository you are onboarding, pointing at this checkout's dist/. Identical behaviour to the npx form; only the path to the binary differs.",
    },
  ];

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
        at publish time — <code>package.json</code> in the repository says{" "}
        <code>0.0.0-development</code> and always will, so it is not the number to
        quote. The <b>standards version</b> is{" "}
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
          {published ? (
            <>
              No install step for the CLI itself — <code>npx {PACKAGE_NAME}</code>{" "}
              fetches it on demand. The npm package is <code>{PACKAGE_NAME}</code>;
              the command it installs is <code>redline</code>.
            </>
          ) : (
            <>
              A checkout of this repository, because <code>{PACKAGE_NAME}</code> is
              not on the registry yet. The steps are below.
            </>
          )}
        </li>
      </ul>

      {!published && (
        <>
          <h2>Install from source</h2>
          <p>
            Every command elsewhere in these docs is written as{" "}
            <code>npx {PACKAGE_NAME} &lt;command&gt;</code>, which is what it will
            be once the package publishes. Until then, substitute{" "}
            <code>node dist/bin/redline.js &lt;command&gt;</code> from a built
            checkout:
          </p>
          <LifecycleSteps steps={fromSource} />
        </>
      )}

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
        {!published && (
          <li>
            <b>The package is unpublished.</b> Nothing installs by{" "}
            <code>npx</code> today. The release workflow refuses to publish until
            the release line is anchored — <code>git tag v0.0.0</code> on the root
            commit, once — because without a <code>v*</code> tag semantic-release
            treats this as a first release and computes <code>1.0.0</code>, a
            number npm will not let you take back. Anchored at zero, the first
            published version is <code>0.0.1</code>.
          </li>
        )}
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
