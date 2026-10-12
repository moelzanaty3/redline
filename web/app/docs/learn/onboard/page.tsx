import type { Metadata } from "next";
import { Quiz, Tabs } from "@/components/learn/interactive";
import { LearnPage, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: onboard" };

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <LearnPage
      slug="onboard"
      intro="One command reads the repository, works out its stack, and installs the rules, the review commands and a merge gate. Then it opens a pull request so the team reviews the change like any other."
      learn={[
        "What redline init installs, and where each piece acts",
        "What a merge gate and a rung are",
        "Why every repository starts at observe, where findings are reported but nothing is blocked",
      ]}
    >
      <h2>Run it</h2>
      <p>From the root of the repository, on an up-to-date <code>main</code>:</p>
      <Tabs
        label="Where you are following along"
        tabs={[
          {
            label: "On GitHub",
            content: (
              <>
                <p>
                  First put your repository on GitHub, with the{" "}
                  <a href="https://cli.github.com" rel="noopener noreferrer" target="_blank">
                    GitHub CLI
                  </a>{" "}
                  signed in (<code>gh auth login</code>):
                </p>
                <Terminal commands="gh repo create redline-demo --public --source . --remote origin --push" />
                <div className="callout info">
                  <span className="ic">ℹ</span>
                  <p>
                    Make it <b>public</b>. Dependency review and secret scanning, which step 06
                    relies on, are free on public repositories and need GitHub Advanced Security on
                    private ones. From here on, merge each step&apos;s pull request before you start
                    the next, and branch from an up-to-date <code>main</code>.
                  </p>
                </div>
                <p>Then onboard it:</p>
                <Terminal
                  commands={rl("init --gate-source local")}
                  output={`  profile tooling
  Files  21 written
   + AGENTS.md
   + CLAUDE.md
   + .github/copilot-instructions.md
   + .github/workflows/redline.yml
   + .github/workflows/redline-gate.yml
   + .github/pull_request_template.md
   + .redline.json
   …
  Repository settings  6 in place · 1 unavailable
   ✓ applied     labels             label "no-adr"
   ✓ applied     secret-scanning    secret scanning
   ✓ applied     push-protection    secret scanning push protection
   ✓ applied     dependency-alerts  dependabot alerts (vulnerability alerts)
   ✓ applied     merge-policy       branch ruleset
   · unsupported repo-property      repository property "redline=onboarded"
  Pull request
   https://github.com/<you>/redline-demo/pull/1`}
                />
                <p>
                  The first time, <code>npx</code> asks <code>Ok to proceed? (y)</code>; answer{" "}
                  <code>y</code>. <code>repo-property</code> needs a GitHub organisation, so it is
                  unavailable on a personal account. Nothing depends on it.
                </p>
              </>
            ),
          },
          {
            label: "Not on GitHub yet",
            content: (
              <>
                <Terminal
                  commands={rl("init")}
                  output={`  profile tooling
  ▲ this repository has no git remote, so Redline installed the rules and
    the local review only. The merge gate, branch policy, labels and security
    floor need a host: add a remote and run redline init again to install them
  Files  … written
   + AGENTS.md
   + CLAUDE.md
   + .claude/commands/redline-review.md
   + .redline.json
   …
  not committed — the files are in your working tree; commit them when you are ready`}
                />
                <p>
                  With no remote there is nowhere for a merge gate to run, so Redline installs what
                  works on your machine and stops. It contacts no host and commits nothing. Commit the
                  files yourself:
                </p>
                <Terminal commands={`git add -A && git commit -m "chore: onboard redline"`} />
                <p>
                  The parts below about GitHub settings and the pull request don&apos;t apply to you;
                  read them anyway, because steps 05 to 09 build on them.
                </p>
              </>
            ),
          },
        ]}
      />

      <h2>What it installed</h2>
      <p>Three kinds of thing, each catching mistakes at a different moment:</p>
      <Tabs
        label="What init installed"
        tabs={[
          {
            label: "Rules for assistants",
            content: (
              <>
                <p>
                  <code>AGENTS.md</code>, <code>CLAUDE.md</code>,{" "}
                  <code>.github/copilot-instructions.md</code> and <code>.cursor/rules/</code>: the
                  same rules, in the form each assistant reads on every request. Open{" "}
                  <code>AGENTS.md</code> and read a few; every rule has an id in backticks, like{" "}
                  <code>core/hardcoded-secrets</code>.
                </p>
                <p>
                  <code>.claude/commands/</code>, <code>.github/prompts/</code> and{" "}
                  <code>.cursor/commands/</code> add a <code>/redline-review</code> command to each
                  assistant. Step 02 uses it.
                </p>
              </>
            ),
          },
          {
            label: "A merge gate",
            content: (
              <>
                <p>
                  <code>.github/workflows/redline.yml</code> runs on every pull request and calls the
                  gate in <code>.github/workflows/redline-gate.yml</code>. The pull request template,{" "}
                  <code>.github/pull_request_template.md</code>, holds the checklist the gate reads.
                </p>
                <p>
                  <code>--gate-source local</code> keeps the gate inside this repository, so the demo
                  is self-contained. A real team references one gate from its organisation&apos;s{" "}
                  <code>.github</code> repository instead, which a pull request here cannot edit.{" "}
                  <code>init</code> prints that warning itself.
                </p>
              </>
            ),
          },
          {
            label: "GitHub settings",
            content: (
              <ul>
                <li>
                  <b>A branch ruleset on <code>main</code></b>: changes arrive through a pull request,
                  review threads are resolved, and <code>main</code> cannot be deleted or
                  force-pushed. It requires no approving review: Redline fails the pipeline, and
                  whether a person must also approve is your choice (<code>--approvals &lt;n&gt;</code>
                  ). That is why one person can follow this path alone.
                </li>
                <li>
                  <b>The security floor</b>: secret scanning, push protection and Dependabot alerts.
                </li>
                <li>
                  <b>The <code>no-adr</code> label</b>, which step 05 explains.
                </li>
              </ul>
            ),
          },
          {
            label: ".redline.json",
            content: (
              <p>
                A record of what was installed, at which version, and the choices made: the profile,
                the rung, the gate source. A later <code>init</code> reads it, so re-running keeps
                your choices instead of resetting them. It is reviewed in pull requests like any
                other file.
              </p>
            ),
          },
        ]}
      />

      <Term word="Merge gate">
        <p>
          One required-looking check on the pull request, <code>redline-gate / gate</code>, that
          combines several jobs into one verdict: the rule checker, the pull request checklist, the
          decision-record check, dependency review and a secret scan. You will meet each job in the
          next steps.
        </p>
      </Term>

      <h2>The pull request</h2>
      <p>
        <code>init</code> committed everything on a branch and opened the pull request itself. Its
        description lists every file and setting, and carries a ticked{" "}
        <code>## Launch readiness</code> checklist and the <code>no-adr</code> label, because the
        diff is generated rather than a decision. With Redline 0.2.7 or later its checklist and ADR jobs
        passes. Read the diff, then merge it.
      </p>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          The demo&apos;s own pull request #1 was opened by an earlier version, before onboarding
          filled those in, so two of its process jobs are red and the gate still passed. That is
          the rung at work, explained next.
        </p>
      </div>

      <h2>Every repository starts at observe</h2>
      <Term word="Rung">
        <p>
          How strict the gate is. The enforcement ladder has three rungs:{" "}
          <code>observe</code>, <code>block-blocker</code> and <code>block-high</code>. At{" "}
          <code>observe</code> a broken rule is reported, and the gate stays green. Moving up needs
          evidence that the rules are right, which step 09 covers.
        </p>
        <p>
          The one exception is the security floor (step 06): a vulnerable dependency or a leaked
          secret fails the gate at every rung, <code>observe</code> included.
        </p>
      </Term>
      <p>
        Starting at <code>observe</code> means the team sees what Redline <i>would</i> block before
        anything is blocked. Nobody&apos;s afternoon is ruined by a rule the team has never
        discussed. Ask the repository where it stands:
      </p>
      <Terminal
        commands={rl("status")}
        output={`profile      tooling (javascript, typescript)
host         github
checks       GitHub Actions
rung         observe — findings are reported, only the security floor fails the check
…`}
      />

      <Quiz
        question="Onboarding put the rules in AGENTS.md and also installed a merge gate. Why both?"
        options={[
          {
            text: "AGENTS.md is for documentation; only the gate is enforced",
            why: "AGENTS.md is read by the assistant on every request, so it shapes the code as it is written. That is prevention, not documentation.",
          },
          {
            text: "They catch mistakes at different moments: while writing, and before merge",
            correct: true,
            why: "The assistant follows the rules while it writes, and the gate checks what reaches the pull request anyway, whoever or whatever wrote it.",
          },
          {
            text: "The gate only runs when the assistant is not used",
            why: "The gate runs on every pull request, whoever wrote the change.",
          },
        ]}
      />
    </LearnPage>
  );
}
