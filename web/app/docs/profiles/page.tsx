import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Profiles & stacks" };

const PROFILES: ReadonlyArray<readonly [string, string]> = [
  ["web-react", "javascript · react"],
  ["web-nextjs", "javascript · react · nextjs (App Router)"],
  ["web-angular", "javascript · angular"],
  ["web-vue", "javascript · vue"],
  ["web-svelte", "javascript · svelte / sveltekit"],
  ["javascript-typescript-browser", "javascript · typescript · browser / dom, no framework"],
  ["mobile-react-native", "javascript · react · react-native"],
  ["mobile-android", "kotlin"],
  ["mobile-ios", "swift"],
  ["service-java", "microservices · java (Spring Boot)"],
  ["service-go", "microservices · go"],
  ["service-node", "javascript · microservices · nodejs (NestJS)"],
  ["service-express", "javascript · microservices · express"],
  ["service-python", "microservices · python"],
  ["service-dotnet", "microservices · csharp"],
  ["fullstack-react-node", "javascript · react · microservices · nodejs"],
  ["infra-terraform", "terraform / hcl"],
  ["javascript-typescript", "javascript · typescript, no framework: CLIs, libraries, scripts"],
  ["typescript-effect", "effect, added on top of another profile"],
];

// standards/manifest.json profileAliases — the names standards 0.2.2 replaced.
const RENAMED: ReadonlyArray<readonly [string, string]> = [
  ["tooling", "javascript-typescript"],
  ["web-vanilla", "javascript-typescript-browser"],
  ["web-next", "web-nextjs"],
  ["mobile-rn", "mobile-react-native"],
  ["infra", "infra-terraform"],
  ["fullstack-node", "fullstack-react-node"],
  ["lib-effect", "typescript-effect"],
];

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Profiles & stacks"
      intro="Eighteen stack rule sets, composed into profiles. A repo installs exactly one profile — that is the entire disambiguation mechanism."
      href="/docs/profiles"
    >
      <h2>Why profiles, not glob negation</h2>
      <p>
        Negated globs (<code>!**/*.native.*</code>) are not part of
        Copilot&apos;s <code>applyTo</code> contract and have no AGENTS.md
        equivalent at all — relying on them meant React rules silently firing
        on NestJS files. Instead, a profile never contains two rule sets that
        contradict each other, so plain globs are unambiguous inside any single
        repo. <code>scripts/validate.mjs</code> fails the build if a negated or
        brace-expanded glob is ever reintroduced.
      </p>

      <h2>The profiles</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Profile</th><th>Stacks</th></tr>
          </thead>
          <tbody>
            {PROFILES.map(([name, stacks]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{stacks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The one deliberate overlap — <code>mobile-react-native</code> installing
        both React and React Native — is additive by design, and each file says
        so in its own text. Short names (<code>mobile</code>, <code>node</code>,{" "}
        <code>java</code>…) are accepted as aliases.
      </p>
      <h3>How profiles are named</h3>
      <p>
        <code>&lt;kind&gt;-&lt;technology&gt;</code>, in full words:{" "}
        <code>web-react</code>, <code>service-go</code>, <code>infra-terraform</code>. With
        no framework, the languages and platform the rules cover: <code>javascript-typescript</code>,{" "}
        <code>javascript-typescript-browser</code>. No abbreviations and no
        slang, because the name is all a reader has when picking one.
      </p>
      <p>
        Standards 0.2.2 renamed the profiles that broke that rule. The old names still work
        everywhere a profile is named (<code>--profile</code>, <code>.redline.json</code>,{" "}
        <code>sync-targets.txt</code>), and a repository is recorded under the new name on its
        next <code>init</code> or sync.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Was</th><th>Now</th></tr>
          </thead>
          <tbody>
            {RENAMED.map(([was, now]) => (
              <tr key={was}>
                <td>{was}</td>
                <td>{now}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <code>web</code> is one of those aliases. It used to mean React, because
        React was the only web framework Redline carried; it now resolves to{" "}
        <code>web-react</code> and renders the same rules it always did. A repo
        onboarded before the split needs no change: the only difference in its
        artifacts is the marker line, which names the resolved profile and so
        reads <code>profile: web-react</code>. Naming the framework in{" "}
        <code>.redline.json</code> is still clearer for whoever reads it next.
      </p>
      <p>
        <code>web-nextjs</code> and <code>service-express</code> are both cases
        where a broader profile would otherwise claim the repo. Every Next.js
        repo also depends on React, and detection tries <code>web-nextjs</code>
        first so a Next codebase is not reviewed with nothing covering Server
        Actions, the client boundary or <code>NEXT_PUBLIC_</code>. Express runs
        the other way: it is a dev dependency in a great many front-end repos,
        so it is tried <em>last</em>, below every web framework — a React app
        with an express dev server is a React app. A NestJS service that lists
        express directly stays <code>service-node</code>, because the Express
        rules say in their own scope section that they do not apply to Nest.
      </p>
      <p>
        <code>javascript-typescript-browser</code> is never proposed by detection, only chosen.
        Plain browser JavaScript and a build script are indistinguishable from
        the outside, and guessing wrong installs DOM rules on a repo with no DOM.
        Its rule set covers what a framework normally hides:{" "}
        <code>innerHTML</code> sinks, <code>postMessage</code> origin checks,
        listeners and observers that outlive their widget.
      </p>

      <h2>Stack coverage vs org reality</h2>
      <p>
        Primary-language tally across the org&apos;s active repos: Java 187 ·
        TypeScript 86 · Python 47 · JavaScript 32 · HCL 24 · C# 22 · Kotlin 14
        · Swift 9 · Go 6 — all covered, including plain JavaScript. On the web
        side the framework is what decides the rules, not the language, which is
        why there are six web profiles and one <code>javascript</code> stack
        underneath all of them.
        Shell, Dockerfile and Gherkin are intentionally uncovered: linters
        serve better than LLM review there.
      </p>
    </DocsPage>
  );
}
