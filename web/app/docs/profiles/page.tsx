import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Profiles & stacks" };

const PROFILES: ReadonlyArray<readonly [string, string]> = [
  ["web-react", "javascript · react"],
  ["web-angular", "javascript · angular"],
  ["web-vue", "javascript · vue"],
  ["web-svelte", "javascript · svelte / sveltekit"],
  ["web-vanilla", "javascript · browser / dom"],
  ["mobile-rn", "javascript · react · react-native"],
  ["mobile-android", "kotlin"],
  ["mobile-ios", "swift"],
  ["service-java", "microservices · java (Spring Boot)"],
  ["service-go", "microservices · go"],
  ["service-node", "javascript · microservices · nodejs (NestJS)"],
  ["service-python", "microservices · python"],
  ["service-dotnet", "microservices · csharp"],
  ["fullstack-node", "javascript · react · microservices · nodejs"],
  ["infra", "terraform / hcl"],
  ["tooling", "javascript"],
];

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Profiles & stacks"
      intro="Sixteen stack rule sets, composed into profiles. A repo installs exactly one profile — that is the entire disambiguation mechanism."
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
        The one deliberate overlap — <code>mobile-rn</code> installing both
        React and React Native — is additive by design, and each file says so
        in its own text. Legacy names (<code>mobile</code>, <code>node</code>,{" "}
        <code>java</code>…) are accepted as aliases.
      </p>
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
        <code>web-vanilla</code> is never proposed by detection, only chosen.
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
        why there are five web profiles and one <code>javascript</code> stack
        underneath all of them.
        Shell, Dockerfile and Gherkin are intentionally uncovered: linters
        serve better than LLM review there.
      </p>
    </DocsPage>
  );
}
