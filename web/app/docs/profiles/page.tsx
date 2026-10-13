import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { RedlineCode } from "@/components/learn/interactive";
import { RedlineTerminal } from "@/components/learn/parts";
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
      intro="A rule written for React is wrong on a NestJS service. A profile is the set of rule sets that fit one kind of repository, so each repository only gets rules that apply to it."
      href="/docs/profiles"
    >
      <h2>Why profiles exist</h2>
      <p>
        React&apos;s rules about effects and rendering make no sense on a backend service. Fire
        them there and every finding is noise, and people learn to skip findings. The problem is
        that both a React component and a NestJS controller are <code>.tsx</code> or{" "}
        <code>.ts</code> files, so a file pattern alone cannot tell them apart.
      </p>
      <p>
        Redline makes that choice once per repository instead of once per file. The repository
        picks a profile, and only that profile&apos;s rules are installed.
      </p>

      <h2>Stacks and profiles</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Term</th>
              <th>What it is</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Stack</b>
              </td>
              <td>
                One rule set for a language, framework or platform. Each says which files it
                applies to with a glob. Redline has {stackCount}.
              </td>
              <td>
                <code>react</code>, applies to <code>**/*.tsx</code> and <code>**/*.jsx</code>, among others
              </td>
            </tr>
            <tr>
              <td>
                <b>Profile</b>
              </td>
              <td>A named list of stacks that belong together for one kind of repository.</td>
              <td>
                <code>web-react</code> = javascript · typescript · react
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The core standard applies to every profile and is not listed. Within one repository the
        installed stacks never contradict each other, so a plain glob is enough to say which rules
        apply to which file.
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
        <code>mobile-react-native</code> installs both React and React Native on purpose: the React
        Native rules extend the React ones, and each file says so.
      </p>

      <h2>How a profile is chosen</h2>
      <p>
        <RedlineCode args="init" /> proposes a profile from the files and dependencies in the
        checkout, and you can accept it or name another. Detection tries the more specific
        frameworks first:
      </p>
      <ul>
        <li>
          <b>Next.js before React.</b> Every Next.js app also depends on React, so checking React
          first would review a Next.js codebase with nothing covering Server Actions, the client
          boundary or <code>NEXT_PUBLIC_</code>.
        </li>
        <li>
          <b>Express after every web framework.</b> Many front-end repositories list Express as a
          dev dependency for a dev server or mock API. A React app with an Express dev server is
          still a React app. A NestJS service stays <code>service-node</code>, because the Express
          rules say they do not apply to Nest.
        </li>
        <li>
          <b>Effect is added, not chosen.</b> A repository that depends on <code>effect</code> gets{" "}
          <code>typescript-effect</code> on top of whatever else it is.
        </li>
        <li>
          <b>
            <code>javascript-typescript-browser</code> is never proposed.
          </b>{" "}
          Plain browser JavaScript looks the same as a build script from the outside, and guessing
          wrong would install DOM rules where there is no DOM. Choose it yourself.
        </li>
      </ul>

      <h2>Choosing or combining profiles</h2>
      <p>
        Name a profile to override detection. A repository that is two kinds of code at once names
        several, separated by commas, and gets every stack from each:
      </p>
      <RedlineTerminal
        commands={`{redline} init --profile javascript-typescript-browser
# a React app with its own Terraform beside it
{redline} init --profile web-react,infra-terraform`}
      />
      <p>
        The choice is recorded in <code>.redline.json</code> and kept on every later{" "}
        <code>init</code>. The list is stored sorted, so the order you type it in never changes the
        result.
      </p>

      <h3>Names and aliases</h3>
      <p>
        Profiles are named <code>&lt;kind&gt;-&lt;technology&gt;</code> in full words:{" "}
        <code>web-react</code>, <code>service-go</code>, <code>infra-terraform</code>. With no
        framework, the name lists the languages and platform the rules cover:{" "}
        <code>javascript-typescript</code>, <code>javascript-typescript-browser</code>.
      </p>
      <p>
        Short and older names such as <code>web</code>, <code>node</code>, <code>infra</code> and{" "}
        <code>tooling</code> still work anywhere a profile is named. They resolve to the full name,
        and the repository is recorded under that name on its next <code>init</code> or sync. The
        full list is <code>profileAliases</code> in <code>standards/manifest.json</code>.
      </p>

      <h2>Files no stack covers</h2>
      <p>
        Shell scripts, Dockerfiles and Gherkin have no stack on purpose: a linter serves them better
        than a model review. When a change touches a file no installed stack matches,{" "}
        <Link href="/docs/local-review">local review</Link> says so and applies only the core rules
        to it:
      </p>
      <RedlineTerminal
        commands="{redline} review --staged"
        output={`warn  no stack covers 1 changed file(s), so only the core rules applied to them: run.sh`}
      />
      <p>
        <Link href="/docs/learn/first-finding">Learn step 02</Link> runs a review bounded to your
        profile.
      </p>

      <h2>Related</h2>
      <ul>
        <li>
          <Link href="/docs/standards">Standards</Link>: every stack and its rules.
        </li>
        <li>
          <Link href="/docs/onboarding">Onboarding</Link>: where the profile is chosen.
        </li>
        <li>
          <Link href="/docs/changes">What changed</Link>: the rename that introduced most aliases.
        </li>
      </ul>
    </DocsPage>
  );
}
