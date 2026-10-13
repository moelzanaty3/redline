import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { loadManifest } from "@/lib/manifest";

export const metadata: Metadata = { title: "Profiles & stacks" };

// What the stack ids alone do not say: the framework or kind of code a profile
// is for. The composition itself is read from standards/manifest.json.
const PROFILE_NOTES: Record<string, string> = {
  "web-nextjs": "Next.js App Router",
  "web-svelte": "Svelte and SvelteKit",
  "javascript-typescript-browser": "browser code with no framework",
  "service-java": "Spring Boot",
  "service-node": "NestJS",
  "infra-terraform": "Terraform / HCL",
  "javascript-typescript": "no framework: CLIs, libraries, scripts",
  "typescript-effect": "added on top of another profile",
};

export default function Page() {
  const manifest = loadManifest();
  const stackCount = Object.keys(manifest.stacks).length;
  const profiles = Object.entries(manifest.profiles);

  return (
    <DocsPage
      crumb="Core Concepts"
      title="Profiles & stacks"
      intro="A rule written for React is wrong on a NestJS service. A profile is the list of rule sets that fit one kind of repository, and each repository installs exactly one, so it only ever gets rules that apply to it."
      href="/docs/profiles"
    >
      <h2>The problem a profile solves</h2>
      <p>
        Redline has {stackCount} <b>stack</b> rule sets: one per language, framework or platform,
        such as <code>react</code>, <code>nodejs</code> or <code>terraform</code>. Each says which
        files it applies to with a glob, like <code>**/*.tsx</code>. A glob cannot tell a React
        component from a NestJS controller: both are TypeScript. Install every stack everywhere
        and React&apos;s rules about effects and rendering fire on a service that has neither,
        and the review teaches its readers to skip findings.
      </p>
      <p>
        Excluding files with a negated glob (<code>!**/*.native.*</code>) is not the fix: it is
        not part of Copilot&apos;s <code>applyTo</code> contract, and <code>AGENTS.md</code> has
        no equivalent at all. So the choice is made one level up. A <b>profile</b> names the
        stacks that belong together, a repository installs one, and no profile contains two
        stacks that contradict each other. Inside any one repository, a plain glob is then
        unambiguous. <code>scripts/validate.mjs</code> fails the build if a negated or
        brace-expanded glob is ever added.
      </p>

      <h2>The profiles</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Stacks</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(([name, stacks]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>
                  {stacks.join(" · ")}
                  {PROFILE_NOTES[name] ? ` (${PROFILE_NOTES[name]})` : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The one deliberate overlap, <code>mobile-react-native</code> installing both React and
        React Native, is additive by design, and each file says so in its own text.
      </p>

      <h3>How profiles are named</h3>
      <p>
        <code>&lt;kind&gt;-&lt;technology&gt;</code>, in full words: <code>web-react</code>,{" "}
        <code>service-go</code>, <code>infra-terraform</code>. With no framework, the languages
        and platform the rules cover: <code>javascript-typescript</code>,{" "}
        <code>javascript-typescript-browser</code>. No abbreviations, because the name is all a
        reader has when picking one.
      </p>
      <p>
        Short and older names (<code>web</code>, <code>mobile</code>, <code>node</code>,{" "}
        <code>tooling</code>…) are accepted as aliases wherever a profile is named and resolve to
        the names above; a repository is recorded under the resolved name on its next{" "}
        <code>init</code>. The full list is <code>profileAliases</code> in{" "}
        <code>standards/manifest.json</code>, and the rename that introduced most of them is in{" "}
        <Link href="/docs/changes">What changed</Link>.
      </p>

      <h2>How detection picks one</h2>
      <p>
        <code>web-nextjs</code> and <code>service-express</code> are both cases where a broader
        profile would otherwise claim the repo. Every Next.js repo also depends on React, and
        detection tries <code>web-nextjs</code> first so a Next codebase is not reviewed with
        nothing covering Server Actions, the client boundary or <code>NEXT_PUBLIC_</code>.
        Express runs the other way: it is a dev dependency in a great many front-end repos, so
        it is tried <em>last</em>, below every web framework. A React app with an express dev
        server is a React app. A NestJS service that lists express directly stays{" "}
        <code>service-node</code>, because the Express rules say in their own scope section that
        they do not apply to Nest.
      </p>
      <p>
        <code>javascript-typescript-browser</code> is never proposed by detection, only chosen.
        Plain browser JavaScript and a build script are indistinguishable from the outside, and
        guessing wrong installs DOM rules on a repo with no DOM. Its rule set covers what a
        framework normally hides: <code>innerHTML</code> sinks, <code>postMessage</code> origin
        checks, listeners and observers that outlive their widget.
      </p>

      <h2>What is not covered</h2>
      <p>
        Shell, Dockerfile and Gherkin have no stack on purpose: a linter serves them better than
        a model review. A changed file no stack matches is reported by{" "}
        <Link href="/docs/local-review">local review</Link> rather than silently reviewed against
        the core rules alone.
      </p>
    </DocsPage>
  );
}
