import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { File, LearnPage, PrivateRepo, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";
import { DEMO_RAW } from "@/lib/learn";

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
      <h2>Why two checks are different</h2>
      <p>
        Most mistakes can wait. An untracked <code>TODO</code> that merges is fixed in the next pull
        request, and nobody is hurt in between. That is why the gate starts at{" "}
        <code>observe</code> and only reports them.
      </p>
      <p>Two mistakes cannot wait, because merging them is the damage:</p>
      <ul>
        <li>
          <b>A dependency with a known vulnerability.</b> Once it is on <code>main</code> it can be
          deployed, and the advisory is public, so attackers know what to look for. Reverting
          afterwards does not undo what ran.
        </li>
        <li>
          <b>A secret in a commit.</b> Once it is pushed it is in the history, and in every clone and
          fork. Deleting it does not help; the credential has to be rotated.
        </li>
      </ul>
      <Term word="Security floor">
        <p>
          The two checks in the gate that are not on the enforcement ladder: <b>dependency review</b>{" "}
          (does this pull request add a dependency with a known vulnerability?) and the{" "}
          <b>secret scan</b> (does it add a credential?). Both fail the gate at every rung,{" "}
          <code>observe</code> included, and no label waives them.
        </p>
      </Term>

      <h2>Add an old dependency</h2>
      <p>
        Group step 05&apos;s country table by initial with lodash, pinning an old version the way a
        copied snippet or a stale lockfile does:
      </p>
      <Terminal
        commands={`git checkout -b feat/directory
pnpm add lodash@4.17.20 --save-exact
pnpm add -D @types/lodash
curl -fsSL --remote-name-all --output-dir src "${DEMO_RAW}/step-06/src/{directory,directory.test}.ts"
pnpm test`}
      />
      <p>The file you downloaded:</p>
      <File name="src/directory.ts" text={DIRECTORY_TS} />
      <p>
        The tests pass. Nothing about the code is wrong; the version is. Commit, push and open a
        pull request:
      </p>
      <Terminal
        commands={`git add -A
git commit -m "feat: group countries by initial"
git push -u origin feat/directory
gh pr create --title "feat: group countries by initial" --body-file .github/pull_request_template.md
gh pr checks --watch`}
      />
      <p>
        Tick the <code>## Launch readiness</code> boxes that hold, as in step 02.
      </p>

      <h2>What the pipeline says</h2>
      <Tabs
        label="Pipeline output"
        tabs={[
          {
            label: "Dependency review",
            content: (
              <>
                <Terminal
                  commands="gh pr checks"
                  output={`✓  CI / test
✓  Redline / redline-gate / Deterministic policy
✓  Redline / redline-gate / PR checklist
✓  Redline / redline-gate / ADR required for significant changes
X  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
X  Redline / redline-gate / gate`}
                />
                <p>
                  Open <code>Redline / redline-gate / Dependency review</code>. The job is
                  GitHub&apos;s <code>dependency-review-action</code>, and its log has three parts:
                </p>
                <Terminal
                  commands="# from the Dependency review job"
                  output={`▼ Vulnerabilities
  package.json » lodash@4.17.20 – Command Injection in lodash (high severity)
    ↪ https://github.com/advisories/GHSA-35jh-r3h4-6jhm
  package.json » lodash@4.17.20 – lodash vulnerable to Code Injection via \`_.template\` imports key names (high severity)
    ↪ https://github.com/advisories/GHSA-r5fr-rjxr-66jc
  Error: Dependency review detected vulnerable packages.
▼ Scorecard
  npm/lodash: OpenSSF Scorecard Score: 6.5
  npm/@types/lodash: OpenSSF Scorecard Score: undefined
▼ Dependency Changes
  File: package.json
  + lodash@4.17.20
  + @types/lodash@^4.17.26`}
                />
                <ul>
                  <li>
                    <b>Vulnerabilities</b> is the verdict: every package the pull request adds or
                    changes, checked against GitHub&apos;s advisory database. Two{" "}
                    <code>high</code> advisories, each with a link that says what an attacker can
                    do and which version fixes it.
                  </li>
                  <li>
                    <b>Scorecard</b> is context, not a verdict: the OpenSSF Scorecard rates how a
                    package is maintained, out of 10. <code>undefined</code> means it has not been
                    scored.
                  </li>
                  <li>
                    <b>Dependency Changes</b> is what the pull request changed in{" "}
                    <code>package.json</code>, so you can see exactly what the verdict is about.
                  </li>
                </ul>
                <p>
                  <code>fail-on-dependency-severity: high</code> in{" "}
                  <code>.github/workflows/redline.yml</code> sets the threshold: moderate advisories
                  are reported without failing.
                </p>
              </>
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
                  checks only. Take the label off again:
                </p>
                <Terminal commands="gh pr edit --remove-label redline-exempt" />
              </>
            ),
          },
        ]}
      />
      <PrivateRepo title="Dependency review says Skipped">
        <p>
          If you handed dependency checks to Dependabot in step 01, the job does not run, and the
          pull request is green:
        </p>
        <Terminal
          commands="gh pr checks"
          output={`✓  CI / test
✓  Redline / redline-gate / Deterministic policy
✓  Redline / redline-gate / PR checklist
✓  Redline / redline-gate / ADR required for significant changes
-  Redline / redline-gate / Dependency review                 skipped
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate`}
        />
        <p>
          This is the trade-off step 01 described, now on a real change. Nothing in the pull
          request stops lodash 4.17.20. If it merged, Dependabot would raise an alert on{" "}
          <code>main</code> and open a pull request for a safe version, after the vulnerable one
          could already have shipped. You know the version is vulnerable, so fix it before merging
          anyway.
        </p>
        <p>
          The dependency graph and Dependabot alerts being on in <b>Settings → Advanced Security</b>{" "}
          does not change this: the gate&apos;s dependency review needs GitHub Code Security on a
          private repository. To watch it block, make the repository public, or switch on Code
          Security, then put the job back and push:
        </p>
        <RedlineTerminal
          commands={`{redline} init --integrations "" --no-commit
git add -A
git commit -m "chore: run dependency review in the gate again"
git push`}
        />
      </PrivateRepo>

      <h2>Fix it</h2>
      <p>Upgrade past both advisories, on the same branch:</p>
      <Terminal
        commands={`pnpm add lodash@4.18.1 --save-exact
pnpm test
git commit -am "fix(deps): lodash 4.18.1"
git push
gh pr checks --watch`}
        output={`✓  CI / test
✓  Redline / redline-gate / Deterministic policy
✓  Redline / redline-gate / PR checklist
✓  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate`}
      />
      <p>
        Deleting the dependency would have fixed it too: <code>Object.groupBy</code>, in Node 21 and
        later, does the same job with no package at all.
      </p>

      <h2>Merge it</h2>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull`}
      />

      <h2>The other half: the secret scan</h2>
      <p>
        <code>Redline / redline-gate / Secret scan (diff)</code> runs TruffleHog over the commits in
        the pull request and behaves the same way: it fails at every rung, and no label waives it.
        It runs on every repository, private ones included, with no licence. Where GitHub&apos;s
        push protection is on, it usually stops a recognised token before it is even pushed, so the
        gate is the second line, not the first.
      </p>
      <p>
        This path does not commit a fake secret to show it. A credential in a repository&apos;s
        history stays there, even after a revert, and that is exactly the lesson.
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
