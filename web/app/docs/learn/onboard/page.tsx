import type { Metadata } from "next";
import { PackageManagerTabs, Quiz, RedlineCode, Tabs } from "@/components/learn/interactive";
import { LearnPage, PrivateRepo, RedlineTerminal, Term, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: onboard" };

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);
  const tag = state.status === "published" ? "@latest" : "";

  return (
    <LearnPage
      slug="onboard"
      intro="One command reads the repository, works out its stack, and installs the rules, the review commands and a merge gate. You review what it wrote, then open a pull request so the team reviews the change like any other."
      learn={[
        "What redline init installs, and where each piece acts",
        "What a merge gate and a rung are",
        "Why every repository starts at observe, where findings are reported but nothing is blocked",
      ]}
    >
      <h2>Why</h2>
      <p>
        Step 00 ended with two gaps. Nothing checks <i>how</i> the code is written, only that it
        compiles and the tests pass. And nothing tells a coding assistant what this team expects,
        so it guesses. <code>init</code> closes both: it writes the rules where every assistant
        reads them, and adds a gate that checks every pull request against the same rules, whoever
        or whatever wrote the code.
      </p>

      <h2>Run it</h2>
      <p>
        From the root of your repository, on an up-to-date <code>main</code>, with the package
        manager you picked in step 00:
      </p>
      <PackageManagerTabs
        panels={[
          { name: "pnpm", content: <Terminal commands={`pnpm dlx redlinegate${tag} init`} /> },
          { name: "npm", content: <Terminal commands={rl("init")} /> },
          { name: "yarn", content: <Terminal commands={`yarn dlx redlinegate${tag} init`} /> },
          { name: "bun", content: <Terminal commands={`bunx redlinegate${tag} init`} /> },
        ]}
      />
      <p>
        Each runs Redline once without installing it; <code>init</code> then adds it to your
        project. If it asks to download <code>redlinegate</code> first, answer <code>y</code>. Then{" "}
        <code>init</code> asks a few questions about the repository. Space ticks a box, Enter moves
        on. Keep the default everywhere except the three in bold:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>It asks</th>
              <th>Answer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Which standards apply here?</b>
              </td>
              <td>
                <b>
                  Tick <code>javascript-typescript</code>
                </b>{" "}
                (JavaScript, TypeScript). Nothing is ticked for you: which rules a repository is held
                to is your decision.
              </td>
            </tr>
            <tr>
              <td>Where does this repository live?</td>
              <td>GitHub</td>
            </tr>
            <tr>
              <td>What runs your pull request checks?</td>
              <td>GitHub Actions</td>
            </tr>
            <tr>
              <td>Which assistants should read the standards?</td>
              <td>The ones already ticked</td>
            </tr>
            <tr>
              <td>Extra context to render beside the rules</td>
              <td>Spec-driven development, already ticked</td>
            </tr>
            <tr>
              <td>What should Redline set up alongside its own checks?</td>
              <td>Nothing. GitHub&apos;s own secret scanning and dependency alerts are switched on anyway.</td>
            </tr>
            <tr>
              <td>What should Redline install?</td>
              <td>
                <code>gate</code>, <code>merge-policy</code> and <code>labels</code>, already ticked
              </td>
            </tr>
            <tr>
              <td>
                <b>Where should the merge gate live?</b>
              </td>
              <td>
                <b>in this repository</b>. See below for why.
              </td>
            </tr>
            <tr>
              <td>How hard should the check bite?</td>
              <td>
                <code>observe</code>
              </td>
            </tr>
            <tr>
              <td>Add Redline to this project&apos;s devDependencies?</td>
              <td>
                yes, pin it, already selected. Your package manager adds <code>redlinegate</code> at
                this exact version, so you, your team and your assistant all run the same Redline.
              </td>
            </tr>
            <tr>
              <td>
                <b>Ready?</b>
              </td>
              <td>
                <b>Write the files, commit nothing</b>. You read what it wrote before anything
                reaches GitHub; the commit and the pull request come after.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Term word="Where the merge gate lives">
        <p>
          The merge gate is a GitHub Actions workflow, and <code>init</code> can put it in one of two
          places:
        </p>
        <ul>
          <li>
            <b>in the organisation</b>, the default. The gate lives once, in the organisation&apos;s{" "}
            <code>.github</code> repository, and every repository calls it from there. A pull request
            cannot edit the gate that judges it, and fixing the gate fixes it everywhere. It needs the
            organisation to publish a gate first, which is what a real team should do.
          </li>
          <li>
            <b>in this repository</b>. The gate is copied into the repository itself, so it works
            with no organisation set up: right for a personal account, and for this path. It is
            weaker: the gate runs from the pull request&apos;s own commit, so a pull request can edit
            the gate judging it, even to switch off the secret and dependency checks.{" "}
            <code>init</code> says so on every run.
          </li>
        </ul>
        <p>
          Choosing the organisation when it publishes no gate is not a dead end: <code>init</code>{" "}
          notices, and asks again whether to skip the gate for now or copy it in.
        </p>
      </Term>
      <p>Once you answer the last question, it writes the files and stops:</p>
      <Terminal
        commands="# after Ready?"
        output={`  profile javascript-typescript
  ▲ the gate is vendored at .github/workflows/redline-gate.yml rather than
    referenced from <you>/.github. It runs from the pull request's own head
    commit, so a pull request that edits it changes the gate judging it …
  ▲ redlinegate is a devDependency now (pnpm add …)

  Files  … written
   + package.json
   + AGENTS.md
   + CLAUDE.md
   + .github/copilot-instructions.md
   + .github/instructions/redline-javascript.instructions.md
   + .github/instructions/redline-typescript.instructions.md
   + .cursor/rules/redline-core.mdc
   + .cursor/rules/redline-javascript.mdc
   + .cursor/rules/redline-typescript.mdc
   + .claude/commands/redline-review.md
   + .github/prompts/redline-review.prompt.md
   + .cursor/commands/redline-review.md
   …
   + .github/workflows/redline.yml
   + .github/workflows/redline-gate.yml
   + .github/pull_request_template.md
   + .redline.json

  not committed — the files are in your working tree, and you are on main …`}
      />
      <p>
        Nothing has reached GitHub yet: no commit, no pull request, no repository setting. Running
        it from a script, with no questions? Add{" "}
        <code>--gate-source local --pin-cli --no-commit</code> to the same command for the same
        result.
      </p>
      <p>
        Redline is in your <code>package.json</code> now, so from here on every command runs your
        project&apos;s own copy: <code>pnpm redline &lt;command&gt;</code>, or{" "}
        <code>npx redlinegate</code>, <code>yarn redline</code> or <code>bun run redline</code>.
      </p>

      <h2>What it wrote</h2>
      <p>
        Every file is in your working tree, so <code>git status</code> lists them and your editor
        opens them. They catch mistakes at three different moments: while the assistant writes the
        code, when you ask for a review, and when the pull request asks to merge. Take a tab at a
        time, and open each file beside it.
      </p>
      <Tabs
        label="What init wrote"
        tabs={[
          {
            label: "Rules for assistants",
            content: (
              <>
                <p>
                  The same rules, written once per assistant in the form that assistant reads on
                  every request. They act <i>while the code is written</i>.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Read by</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <code>AGENTS.md</code>
                        </td>
                        <td>
                          Codex and every assistant that reads <code>AGENTS.md</code>. The core
                          rules and the JavaScript and TypeScript rules, in one file.
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <code>CLAUDE.md</code>
                        </td>
                        <td>
                          Claude Code. It imports <code>AGENTS.md</code> with{" "}
                          <code>@AGENTS.md</code>, so the rules exist once.
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <code>.github/copilot-instructions.md</code>
                        </td>
                        <td>GitHub Copilot, on every request: the core rules.</td>
                      </tr>
                      <tr>
                        <td>
                          <code>.github/instructions/redline-*.instructions.md</code>
                        </td>
                        <td>
                          GitHub Copilot, by file type: its <code>applyTo</code> line loads the
                          TypeScript rules only for <code>.ts</code> and <code>.tsx</code> files.
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <code>.cursor/rules/redline-*.mdc</code>
                        </td>
                        <td>
                          Cursor: <code>redline-core.mdc</code> always, the others by their{" "}
                          <code>globs</code> line.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  Open <code>AGENTS.md</code> and read a few rules. Each has an id in backticks,
                  like <code>core/hardcoded-secrets</code>, and a severity: <code>BLOCKER</code>,{" "}
                  <code>HIGH</code> or <code>SUGGESTION</code>. Because you kept spec-driven
                  development ticked, each file also carries a short section on working spec-first.
                </p>
                <p>
                  Redline&apos;s part of each file sits between <code>REDLINE:BEGIN</code> and{" "}
                  <code>REDLINE:END</code> markers, and the next <code>init</code> rewrites it.
                  Rules of your own go in <code>.redline/local.md</code>, which <code>init</code>{" "}
                  renders into every one of these files.
                </p>
              </>
            ),
          },
          {
            label: "Review commands",
            content: (
              <>
                <p>
                  Three commands, written once per assistant. They act <i>when you ask</i>.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Assistant</th>
                        <th>Files</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Claude Code</td>
                        <td>
                          <code>.claude/commands/redline-*.md</code>
                        </td>
                      </tr>
                      <tr>
                        <td>GitHub Copilot</td>
                        <td>
                          <code>.github/prompts/redline-*.prompt.md</code>
                        </td>
                      </tr>
                      <tr>
                        <td>Cursor</td>
                        <td>
                          <code>.cursor/commands/redline-*.md</code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul>
                  <li>
                    <code>/redline-review</code> reviews your current change against the rules and
                    lists what breaks them, each with its rule id. Step 02 uses it.
                  </li>
                  <li>
                    <code>/redline-verify</code> checks that the repository still matches the
                    standards and guardrails it claims.
                  </li>
                  <li>
                    <code>/redline-init</code> has the assistant run onboarding for you, the way you
                    just did by hand.
                  </li>
                </ul>
                <p>
                  <code>.redline.json</code> records a hash of each command file, so a later{" "}
                  <code>init</code> can tell a file you edited from one it may safely replace.
                </p>
              </>
            ),
          },
          {
            label: "redline.yml",
            content: (
              <>
                <p>
                  <code>.github/workflows/redline.yml</code> is the small file that decides{" "}
                  <i>when</i> the gate runs and <i>with which settings</i>. It has no checks of its
                  own:
                </p>
                <ul>
                  <li>
                    <b>When</b>: on every pull request event that can change the verdict: opened,
                    new commits, reopened, description edited, a label added or removed, and marked
                    ready for review. A newer run cancels the older one on the same pull request.
                  </li>
                  <li>
                    <b>What it calls</b>: one job, <code>redline-gate</code>, which runs{" "}
                    <code>./.github/workflows/redline-gate.yml</code>. Keep that job id: the check
                    GitHub shows is named after it.
                  </li>
                  <li>
                    <b>The settings it passes</b>: <code>rung: observe</code>,{" "}
                    <code>adr-diff-threshold: 300</code>,{" "}
                    <code>fail-on-dependency-severity: high</code>,{" "}
                    <code>soft-fail-labels: redline-exempt,redline-sync</code> and an empty{" "}
                    <code>stand-down</code>. The <code>redline-gate.yml</code> tab explains each.
                  </li>
                </ul>
                <p>
                  The file says <i>Managed by Redline</i> at the top. Change a setting with{" "}
                  <code>init</code> rather than by hand: the next run rewrites the file.
                </p>
              </>
            ),
          },
          {
            label: "redline-gate.yml",
            content: (
              <>
                <p>
                  <code>.github/workflows/redline-gate.yml</code> is the merge gate itself: a GitHub
                  Actions workflow that runs five checks on every pull request and turns them into
                  one verdict. It acts <i>before the merge</i>, on every change, whoever or whatever
                  wrote it.
                </p>
                <h3>The five checks</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>What it checks</th>
                        <th>Fails the gate at observe?</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>PR checklist</td>
                        <td>
                          Every box under <code>## Launch readiness</code> in the pull request
                          description is ticked.
                        </td>
                        <td>No, reported only</td>
                      </tr>
                      <tr>
                        <td>ADR required for significant changes</td>
                        <td>
                          A change over 300 lines links a decision record in <code>docs/adr/</code>,
                          or carries the <code>no-adr</code> label.
                        </td>
                        <td>No, reported only</td>
                      </tr>
                      <tr>
                        <td>Deterministic policy</td>
                        <td>
                          The rules a program can decide without a model, on the diff only. It
                          installs Redline into a temporary folder on the runner, never into your
                          checkout, and runs <code>redline policy</code>.
                        </td>
                        <td>No, reported only</td>
                      </tr>
                      <tr>
                        <td>Dependency review</td>
                        <td>
                          No dependency the pull request adds has a known vulnerability of{" "}
                          <code>high</code> severity or worse.
                        </td>
                        <td>
                          <b>Yes</b>, at every rung
                        </td>
                      </tr>
                      <tr>
                        <td>Secret scan (diff)</td>
                        <td>
                          TruffleHog scans the commits in the pull request for secrets it can verify
                          are live.
                        </td>
                        <td>
                          <b>Yes</b>, at every rung
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <h3>The verdict</h3>
                <p>
                  A sixth job, <code>gate</code>, reads the five results and writes a summary on the
                  workflow run. GitHub shows it on the pull request as{" "}
                  <code>redline-gate / gate</code>: the caller&apos;s job id, then this one.
                </p>
                <ul>
                  <li>
                    A failed dependency review or secret scan fails the gate, always. No label and
                    no rung waives them: they are the security floor.
                  </li>
                  <li>
                    The other three are process checks. At <code>observe</code> a failure is a
                    warning and the gate stays green. At <code>block-blocker</code> or{" "}
                    <code>block-high</code> it fails the gate, unless the pull request carries a
                    soft-fail label <i>and</i> a <code>## Redline exemption</code> block with a
                    reason and an end date.
                  </li>
                </ul>
                <h3>The settings it accepts</h3>
                <p>
                  <code>redline.yml</code> passes these in. Each has a default, so the gate runs
                  without them:
                </p>
                <ul>
                  <li>
                    <code>rung</code>: how hard the process checks bite. Explained below.
                  </li>
                  <li>
                    <code>adr-diff-threshold</code>: the changed lines above which a decision record
                    is required.
                  </li>
                  <li>
                    <code>fail-on-dependency-severity</code>: the lowest vulnerability severity that
                    fails dependency review.
                  </li>
                  <li>
                    <code>soft-fail-labels</code>: the labels that can turn a failing process check
                    into a warning, with an exemption block.
                  </li>
                  <li>
                    <code>stand-down</code>: jobs another tool in the repository already does,
                    skipped and counted as passed. <code>init</code> fills it only from tools you
                    named, never from a guess.
                  </li>
                </ul>
                <h3>A copy in your repository</h3>
                <p>
                  Because you answered <i>in this repository</i>, this file is a copy of
                  Redline&apos;s gate. Its header names the Redline version that wrote it, and that
                  version is the one the gate installs on the runner, so the gate changes only when
                  you re-run <code>init</code>. <code>redline verify</code> compares the two and
                  tells you when the copy falls behind.
                </p>
                <p>
                  The cost, which the header and <code>init</code> both state: the gate runs from
                  the pull request&apos;s own commit, so a pull request that edits this file changes
                  the gate judging it. Read every change to it in review. A team hosts the gate in
                  its organisation&apos;s <code>.github</code> repository instead, where a pull
                  request here cannot touch it.
                </p>
                <p>
                  Don&apos;t edit the file by hand: <code>init --repair</code> rewrites it.
                </p>
              </>
            ),
          },
          {
            label: "PR template",
            content: (
              <>
                <p>
                  <code>.github/pull_request_template.md</code> is what GitHub puts in the
                  description of every new pull request. Two of its sections are read by the gate:
                </p>
                <ul>
                  <li>
                    <b>Summary</b> and <b>Change type</b>: for the reviewer. Not checked.
                  </li>
                  <li>
                    <b>
                      <code>## Launch readiness</code>
                    </b>
                    : seven boxes, from &quot;no secrets, keys, or customer data&quot; to &quot;no
                    unrelated changes&quot;. The PR checklist job fails while any is unticked, or if
                    the heading is missing. A box that does not apply is deleted, with the reason in
                    the summary.
                  </li>
                  <li>
                    <b>Architecture decision</b>: where the link to a decision record goes. Step 05
                    covers it.
                  </li>
                  <li>
                    <b>
                      <code>## Redline exemption</code>
                    </b>
                    : a reason, an end date at most 90 days out, and which checks it covers. Only
                    for merging past a failing process check, and never for the security floor.
                  </li>
                </ul>
                <p>
                  A repository that already has a template keeps it: Redline adds its sections
                  inside its own markers.
                </p>
              </>
            ),
          },
          {
            label: "package.json",
            content: (
              <p>
                <code>redlinegate</code> is in <code>devDependencies</code> at the exact version
                that ran, and your lockfile records it. You, your team and your assistant run the
                same Redline, and moving to a newer one is a pull request like any other dependency.
                The gate does not use this copy: it installs its own on the runner.
              </p>
            ),
          },
          {
            label: ".redline.json",
            content: (
              <>
                <p>
                  The record of this onboarding. A later <code>init</code> reads it, so re-running
                  keeps your choices instead of resetting them. Its first lines explain every field;
                  the ones worth reading now:
                </p>
                <ul>
                  <li>
                    <code>profile</code>, <code>vendors</code>: the standards and the assistants you
                    chose.
                  </li>
                  <li>
                    <code>rung</code>: <code>observe</code>.
                  </li>
                  <li>
                    <code>gateSource</code> and <code>gateVersion</code>: <code>local</code>, and
                    the version that wrote the gate.
                  </li>
                  <li>
                    <code>capabilities</code>: what Redline installs and reports. A{" "}
                    <code>false</code> here means the repository has its own.
                  </li>
                  <li>
                    <code>pendingAdmin</code>: settings an administrator still has to grant. Empty
                    on a repository you own.
                  </li>
                  <li>
                    <code>requiredApprovals</code>: <code>0</code>. The branch ruleset Redline
                    applies in step 07 asks for no approving review, so one person can follow this
                    path alone.
                  </li>
                </ul>
                <p>
                  Edit it with <code>init</code>, not by hand. It is reviewed in the pull request
                  like any other file.
                </p>
              </>
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

      <h2>Commit it and open the pull request</h2>
      <p>Once you have read the files, take them to a pull request the way you would any change.</p>
      <h3>1. Commit on a branch</h3>
      <Terminal
        commands={`git checkout -b redline/standards
git add -A
git commit -m "chore: onboard to Redline"`}
      />
      <p>
        <code>git add -A</code> is safe here because the repository was clean before{" "}
        <code>init</code>. On a repository with work in progress, add only the files{" "}
        <code>init</code> listed.
      </p>
      <h3>2. Open the pull request</h3>
      <Terminal
        commands={`git push -u origin redline/standards
gh label create no-adr --description "Large change with no architecture decision"
gh pr create --title "chore: onboard to Redline" --body-file .github/pull_request_template.md --label no-adr
gh pr comment --body "Generated by redline init: rules, review commands and gate. No design decision."`}
      />
      <ul>
        <li>
          <b>The description</b> is the pull request template <code>init</code> just wrote. GitHub
          only fills a new pull request from the template once it is on <code>main</code>, and this
          pull request is the one that puts it there, so it is passed in by hand.
        </li>
        <li>
          <b>The <code>no-adr</code> label.</b> A change over 300 lines must link an architecture
          decision record, so a large change carries the reasoning behind it. This one is about
          2,000 lines but decides nothing: it is generated. The label says so, and the comment says
          why, so the next reader does not have to guess. The label is new to the repository, so it
          is created first. Step 05 covers the decision records themselves.
        </li>
      </ul>
      <h3>3. Watch the checks</h3>
      <p>
        The gate starts the moment the pull request opens. Follow it from the terminal, or open the
        pull request in the browser:
      </p>
      <Terminal
        commands={`gh pr checks --watch
gh pr view --web`}
      />

      <h2>It goes red</h2>
      <p>
        Your first pull request under Redline has a red check. That is expected, and it teaches the
        first thing about the gate:
      </p>
      <Terminal
        commands="gh pr checks"
        output={`X  Redline / redline-gate / PR checklist
✓  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Deterministic policy
✓  Redline / redline-gate / Dependency review
✓  Redline / redline-gate / Secret scan (diff)
✓  Redline / redline-gate / gate                   passes, with a warning`}
      />
      <p>
        The ADR check passes on the label. The checklist failed, and the <code>gate</code> still
        passed. The checklist is a <i>process check</i>: at <code>observe</code> it is reported,
        and the gate stays green. Open it and the reason is one line:
      </p>
      <Terminal
        commands="# PR checklist"
        output={`- [ ] No secrets, keys, or customer data in code, logs, or fixtures
…
Error: 7 unchecked launch-readiness item(s). Tick each one, or delete the line
and say why in the PR description.`}
      />
      <p>
        The section is in the description, but nobody has vouched for it. That is the point of the
        check: a person, not the template, says each item is true. Open the pull request on GitHub
        and read the seven boxes under <code>## Launch readiness</code>. Tick each one that is true
        of this change; boxes in a description can be ticked without editing it. If one does not
        apply, delete the line and say why in the summary. Each change to the description runs the
        job again, and it goes green.
      </p>
      <PrivateRepo title="Dependency review and the gate are red too">
        <p>On a private repository, two more checks fail:</p>
        <Terminal
          commands="gh pr checks"
          output={`X  Redline / redline-gate / PR checklist
X  Redline / redline-gate / Dependency review
X  Redline / redline-gate / gate
✓  Redline / redline-gate / ADR required for significant changes
✓  Redline / redline-gate / Deterministic policy
✓  Redline / redline-gate / Secret scan (diff)`}
        />
        <p>Open Dependency review and the reason is one line:</p>
        <Terminal
          commands="# Dependency review"
          output={`Error: Dependency review is not supported on this repository. Please ensure
that Dependency graph is enabled along with GitHub Advanced Security`}
        />
        <p>
          Dependency review is part of the <b>security floor</b>: the checks that fail the gate at
          every rung, <code>observe</code> included, so this one turns the gate red where the
          checklist did not. Step 06 is about the floor. On a public repository GitHub gives all of
          it away. On a private one, two pieces are part of GitHub Advanced Security, which an
          organisation buys on a Team or Enterprise plan, per active committer:
        </p>
        <ul>
          <li>
            <b>GitHub Code Security</b> runs dependency review: a pull request that adds a package
            with a known <code>high</code> or <code>critical</code> vulnerability is stopped before
            it reaches <code>main</code>.
          </li>
          <li>
            <b>GitHub Secret Protection</b> runs secret scanning and push protection: a key pushed
            to GitHub is refused at the push, before it lands in history and has to be rotated.
          </li>
        </ul>
        <p>
          That is what a breach costs to prevent. A vulnerable package or a leaked token caught
          here costs a commit; the same one found in production costs an incident, a rotation and
          an explanation. Redline does not skip the job quietly when the licence is missing: a floor
          that switches itself off is not a floor. Answer it one of two ways.
        </p>
        <p>
          <b>Switch Advanced Security on.</b> The right fix for a team&apos;s real repositories. An
          organisation owner makes GitHub Code Security and GitHub Secret Protection available to
          the repository; until then the options are greyed out. Then, in{" "}
          <b>Settings → Advanced Security</b>, enable <b>Code Security</b>,{" "}
          <b>Secret Protection</b> and <b>Push protection</b>, and on the pull request&apos;s{" "}
          <b>Checks</b> tab choose <b>Re-run failed jobs</b>. On a personal account there is no
          Code Security to switch on; making the repository public is the equivalent.
        </p>
        <p>
          <b>Hand it to Dependabot.</b> When Advanced Security is not available. Dependabot is free
          on private repositories. On your branch:
        </p>
        <RedlineTerminal commands="{redline} init --setup dependabot --integrations dependabot --no-commit" />
        <Terminal
          commands="# after init"
          output={`  ▲ this repository already runs Dependabot (you said so …), so the gate's
    dependencies job is stood down here rather than run a second time …
  Files  3 written
   + .github/workflows/redline.yml
   + .github/dependabot.yml
   + .redline.json`}
        />
        <p>
          <code>.github/dependabot.yml</code> switches on Dependabot&apos;s version updates, and{" "}
          <code>redline.yml</code> now passes <code>stand-down: &apos;dependencies&apos;</code>, so
          the gate skips the job and counts it as passed. Read the three files, then push them:
        </p>
        <Terminal
          commands={`git add -A
git commit -m "chore: hand dependency checks to Dependabot"
git push`}
        />
        <p>Be clear about what that trades away:</p>
        <ul>
          <li>
            A vulnerable dependency is no longer <i>blocked</i> in the pull request. It merges,
            then Dependabot raises an alert and opens a pull request to update it. Step 06 shows
            the difference on a real change.
          </li>
          <li>
            Secret scanning and push protection stay off. The gate&apos;s own secret scan still runs
            on every pull request.
          </li>
        </ul>
        <p>
          In <b>Settings → Advanced Security</b>, switch on <b>Dependabot alerts</b>,{" "}
          <b>Dependabot security updates</b>, the one that opens the fix pull request, and{" "}
          <b>Malware alerts</b>. Having the dependency graph and Dependabot alerts on is not Code
          Security: the gate&apos;s dependency review still cannot run. When the repository gets
          Code Security, or goes public, put the job back with{" "}
          <RedlineCode args={'init --integrations "" --no-commit'} />.
        </p>
      </PrivateRepo>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>Redline can do this part for you.</b> At <code>init</code>&apos;s last question,{" "}
          <b>Write, commit and open a pull request</b> commits on <code>redline/onboard</code>,
          opens the pull request with the template filled in, the checklist ticked and the{" "}
          <code>no-adr</code> label applied, and switches on the GitHub settings: a branch ruleset
          on <code>main</code>, secret scanning, push protection and Dependabot alerts. You did it
          by hand once, so you know what it does when it does it for you. Step 07 runs it to make
          the gate required.
        </p>
      </div>

      <h2>Merge it</h2>
      <p>
        With the checks green, review the diff on GitHub, merge it,
        and bring the merged files back to your machine:
      </p>
      <Terminal
        commands={`gh pr merge --squash
git checkout main
git pull`}
      />
      <p>
        Every later step starts from this <code>main</code>, so the rules and review commands are in
        place before you write any code.
      </p>

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
      <RedlineTerminal
        commands="{redline} status"
        output={`profile      javascript-typescript (javascript, typescript)
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
