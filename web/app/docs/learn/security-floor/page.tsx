import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, Term, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Learn: the security floor" };

const DIRECTORY_TS = `import groupBy from 'lodash/groupBy.js'
import { COUNTRIES, type Country } from './countries.js'

export function countriesByInitial(): Record<string, Country[]> {
  return groupBy(COUNTRIES, (country) => country.name.charAt(0))
}
`;

export default function Page() {
  return (
    <LearnPage
      slug="security-floor"
      intro="Every failure so far was soft: at observe the gate reports a broken rule and still passes. Two checks never work that way. A vulnerable dependency or a leaked secret fails the gate at every rung, and no label waives it."
      learn={[
        "What the security floor is, and why it blocks from day one",
        "What a failing dependency review looks like, and how to fix it",
        "Why the exemption label is ignored here",
      ]}
    >
      <Term word="Security floor">
        <p>
          The two checks in the gate that are not on the enforcement ladder: <b>dependency review</b>{" "}
          (does this pull request add a dependency with a known vulnerability?) and the{" "}
          <b>secret scan</b> (does it add a credential?). Both fail the gate at every rung,{" "}
          <code>observe</code> included. A mistake here cannot be fixed later by reverting: a
          vulnerable version may already be deployed, and a pushed secret has to be rotated.
        </p>
      </Term>

      <h2>Add an old dependency</h2>
      <p>
        Group the country table by initial with lodash, pinning an old version the way a copied
        snippet or a stale lockfile does:
      </p>
      <Terminal
        commands={`git checkout -b feat/directory
pnpm add lodash@4.17.20 --save-exact
pnpm add -D @types/lodash
git checkout step-06 -- src/directory.ts src/directory.test.ts
pnpm test`}
      />
      <File name="src/directory.ts" text={DIRECTORY_TS} />
      <p>
        The tests pass. Nothing about the code is wrong; the version is. Commit, push and open a
        pull request:
      </p>
      <Terminal
        commands={`git add -A && git commit -m "feat: group countries by initial"
git push -u origin feat/directory
gh pr create --fill`}
      />

      <h2>What the pipeline says</h2>
      <Tabs
        label="Pipeline output"
        tabs={[
          {
            label: "Dependency review",
            content: (
              <Terminal
                commands="# from the dependency review job"
                output={`package.json » lodash@4.17.20 – Command Injection in lodash (high severity)
  ↪ https://github.com/advisories/GHSA-35jh-r3h4-6jhm
package.json » lodash@4.17.20 – lodash vulnerable to Code Injection via \`_.template\` imports key names (high severity)
  ↪ https://github.com/advisories/GHSA-r5fr-rjxr-66jc
Error: Dependency review detected vulnerable packages.`}
              />
            ),
          },
          {
            label: "Gate",
            content: (
              <>
                <Terminal
                  commands="# from the gate job"
                  output={`Error: Redline gate failed on security checks (not label-exemptible,
       and not on the enforcement ladder): dependency-review`}
                />
                <p>
                  Compare step 02: there, a failing job left the gate green. Same rung, opposite
                  result, because this failure is on the floor.
                </p>
              </>
            ),
          },
          {
            label: "With the exempt label",
            content: (
              <>
                <Terminal
                  commands="gh pr edit --add-label redline-exempt"
                  output={`Soft-fail label present: redline-exempt
Error: Redline gate failed on security checks (not label-exemptible,
       and not on the enforcement ladder): dependency-review`}
                />
                <p>
                  The gate sees the label and fails anyway. Exemptions (step 08) cover process
                  checks only. Remove the label again with{" "}
                  <code>gh pr edit --remove-label redline-exempt</code>.
                </p>
              </>
            ),
          },
        ]}
      />
      <p>
        <code>fail-on-dependency-severity: high</code> in <code>.github/workflows/redline.yml</code>{" "}
        sets the threshold: moderate advisories are reported without failing.
      </p>

      <h2>Fix it</h2>
      <p>Upgrade past both advisories:</p>
      <Terminal
        commands={`pnpm add lodash@4.18.1 --save-exact
pnpm test
git commit -am "fix(deps): lodash 4.18.1"
git push`}
      />
      <p>
        Every check goes green. Deleting the dependency would have fixed it too:{" "}
        <code>Object.groupBy</code>, in Node 21 and later, does the same job with no package at all.
      </p>

      <h2>The other half: the secret scan</h2>
      <p>
        <b>Secret scan (diff)</b> runs trufflehog over the commits in the pull request and behaves
        the same way: it fails at every rung, and no label waives it. GitHub&apos;s push protection,
        switched on in step 01, usually stops a recognised token before it is even pushed. This
        path does not commit a fake secret to show it, because a credential in a public
        repository&apos;s history stays there, even after a revert.
      </p>

      <Quiz
        question="A repository is at observe. A pull request adds a dependency with a high-severity advisory and has the redline-exempt label. Can it pass the gate?"
        options={[
          {
            text: "Yes: observe never blocks",
            why: "observe never blocks on rules and process checks. The security floor is off the ladder and fails at every rung.",
          },
          {
            text: "Yes: the exempt label waives it",
            why: "The gate notices the label and fails anyway. Exemptions cover process checks only, never the security floor.",
          },
          {
            text: "No: upgrade or remove the dependency",
            correct: true,
            why: "The only way past dependency review is a dependency without the advisory, or no dependency.",
          },
        ]}
      />
    </LearnPage>
  );
}
