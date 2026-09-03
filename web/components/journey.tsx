import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { repoRoot } from "@/lib/content";
import { loadManifest, type Manifest } from "@/lib/manifest";
import { JourneyTerminal, type Line, type Tok } from "@/components/journey-terminal";

// Everything printed in this transcript is a literal string from the CLI. Sources:
//   cli/bin/redline.ts:130     — the write line: `  ` + `write ` (padded to the
//                                width of `remove`) + `  ` + the path
//   cli/bin/redline.ts:133     — the capability line: `  ` + status.padEnd(11) +
//                                ` ` + capability + `  ` + detail
//   cli/core/log.ts:34-35      — report(): `ok  ` / `FAIL` + `  ` +
//                                check.padEnd(22) + ` ` + detail
//   cli/bin/redline.ts:112,157 — `profile <name>`, `pull request: <url>`
//   cli/render/vendors.ts      — the rendered artifact paths
//   cli/render/commands.ts     — the slash-command paths
//   cli/platforms/github/install.ts — capability details, `.github/…` paths,
//                                REQUIRED_CHECK, the seeded CODEOWNERS message
//   cli/commands/init.ts       — ONBOARD_BRANCH, the PR title, the `redline-sync` label
//   cli/commands/verify.ts     — every `redline verify` finding detail
// Nothing here is invented: every command and every line of output is a literal
// CLI string. The single exception is the `# ...` line before `redline verify`,
// a shell comment narrating the gap between the two runs — the lead paragraph
// below names it rather than letting the page claim more than it delivers.

const PROFILE = "web";
const EXAMPLE_REPO = "acme/checkout-service";
const EXAMPLE_PR = 42;

// cli/platforms/github/install.ts — REQUIRED_CHECK.
const GATE_CHECK = "redline-gate / gate";
// cli/platforms/github/verify.ts — CALLER_WORKFLOW, the file readGateMachinery
// reads the published check name out of; also the path installGate syncs.
const CALLER_WORKFLOW = ".github/workflows/redline.yml";
// cli/platforms/github/install.ts — the default template path, written when the
// host would resolve none.
const PR_TEMPLATE = ".github/pull_request_template.md";
// cli/commands/init.ts — ONBOARD_BRANCH and the sync label applied to the onboarding PR.
const ONBOARD_BRANCH = "redline/onboard";
const SYNC_LABEL = "redline-sync";

const dim = (t: string): Tok => ({ t, c: "tk-dim" });
const white = (t: string): Tok => ({ t, c: "tk-white" });
const green = (t: string): Tok => ({ t, c: "tk-green" });
const blue = (t: string): Tok => ({ t, c: "tk-blue" });

const cmd = (text: string): Line => ({
  cmd: true,
  toks: [{ t: "$ ", c: "tk-prompt" }, white(text)],
});

// Mirrors cli/render/profile.ts resolveProfile — stacks in declaration order,
// parents first — including both of its throws. The transcript's write list and
// the after-band's file chips are both derived from what this returns, so a
// profile the manifest cannot resolve has to fail the build: rendering two
// short lists against a green build is the silent degradation this page exists
// to avoid.
function resolveStacks(manifest: Manifest, profile: string): string[] {
  const key = manifest.profileAliases[profile] ?? profile;
  const stacks = manifest.profiles[key];
  if (stacks === undefined) {
    throw new Error(
      `standards/manifest.json has no profile "${profile}"; the home page renders its resolved file list`
    );
  }
  const out: string[] = [];
  const visit = (id: string): void => {
    const stack = manifest.stacks[id];
    if (stack === undefined) {
      throw new Error(
        `standards/manifest.json profile "${key}" references unknown stack "${id}"`
      );
    }
    for (const parent of stack.extends ?? []) visit(parent);
    if (!out.includes(id)) out.push(id);
  };
  stacks.forEach(visit);
  return out;
}

interface CommandDoc {
  name: string;
  description: string;
}

// Mirrors cli/render/commands.ts loadCommands: the name is the filename, the
// description is the frontmatter line that renderer copies into every vendor's
// file. Read from commands/ at build time so the page cannot describe a command
// that is not on disk — and throws rather than degrading, because a heading and
// an explanatory note rendered over an empty list is worse than a failed build.
function loadCommandDocs(): CommandDoc[] {
  const dir = join(repoRoot(), "commands");
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(dir, file), "utf8");
      const front = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
      const description = /description:\s*(.+)/.exec(front)?.[1]?.trim();
      if (description === undefined || description === "") {
        throw new Error(
          `commands/${file} has no frontmatter description; the home page renders it verbatim`
        );
      }
      return { name: file.replace(/\.md$/, ""), description };
    });
  if (docs.length === 0) {
    throw new Error("commands/ holds no .md files; the home page renders a section describing them");
  }
  return docs;
}

export function Journey() {
  const manifest = loadManifest();
  const version = manifest.version;
  const stacks = resolveStacks(manifest, PROFILE);
  const commands = loadCommandDocs();

  // cli/render/vendors.ts — the three `merge: true` renderers: copilot
  // (.github/copilot-instructions.md), agents (AGENTS.md), claude (CLAUDE.md).
  // They are also the manifest's three enabled vendors.
  const mergedStandardsFiles = [
    ".github/copilot-instructions.md",
    "AGENTS.md",
    "CLAUDE.md",
  ];
  // cli/render/vendors.ts PREFIX — the one filename glob the renderer enforces,
  // and the one its prune rule matches on.
  const instructionFiles = stacks.map(
    (s) => `.github/instructions/redline-${s}.instructions.md`
  );
  const standardsFiles = [
    ".github/copilot-instructions.md",
    ...instructionFiles,
    "AGENTS.md",
    "CLAUDE.md",
  ];
  // cli/render/commands.ts — COMMAND_HOSTS entries for the enabled vendors. The
  // renderer takes the name straight from the filename, so these are derived
  // rather than globbed: nothing constrains a command file to a redline- prefix.
  const commandFiles = [
    ...commands.map((c) => `.github/prompts/${c.name}.prompt.md`),
    ...commands.map((c) => `.claude/commands/${c.name}.md`),
  ];
  // cli/platforms/github/install.ts installGate + ensureReviewOwnership,
  // then cli/config/redline-json.ts CONFIG_FILE.
  const hostFiles = [CALLER_WORKFLOW, PR_TEMPLATE, ".github/CODEOWNERS", ".redline.json"];
  const writes = [...standardsFiles, ...commandFiles, ...hostFiles];
  // Written whole on every run: the non-merge branch of cli/render/standards.ts,
  // cli/render/commands.ts, and syncFile on the gate caller workflow.
  const ownedFiles = [...instructionFiles, ...commandFiles, CALLER_WORKFLOW];

  // cli/commands/init.ts — [...gate.outcomes, ...ownership.outcomes,
  // ...security.outcomes, ...policy.outcomes]. installGate returns two: the
  // labels outcome and the pull-request-template one, in that order.
  const outcomes: [string, string, string][] = [
    ["applied", "labels", 'label "no-adr"'],
    ["applied", "gate", `wrote ${PR_TEMPLATE}`],
    ["applied", "review-ownership", "seeded .github/CODEOWNERS"],
    ["applied", "secret-scanning", "secret scanning"],
    ["applied", "push-protection", "secret scanning push protection"],
    ["applied", "dependency-alerts", "dependabot alerts (vulnerability alerts)"],
    ["applied", "merge-policy", "branch ruleset"],
    ["applied", "repo-property", 'repository property "redline=onboarded"'],
  ];

  // cli/commands/verify.ts, in the order it calls add(). Details are the
  // healthy branch of each: an advisory gate applied by `redline init` with its
  // default menu (requiredApprovals 1, requireCodeOwnerReview from
  // sensitivePathReviewers, which defaults true — cli/commands/init.ts:33,395-397).
  const findings: [string, string][] = [
    ["onboarded", `profile ${PROFILE}, standards v${version}`],
    [
      "merge-policy",
      "policy is advisory as configured, 1 approval(s), code-owner review on",
    ],
    ["gate-machinery", `${CALLER_WORKFLOW} publishes ${GATE_CHECK}`],
    [
      "check-name-reported",
      `no required check configured yet (advisory gate) — PR #${EXAMPLE_PR} reported: ${GATE_CHECK}`,
    ],
    ["security-floor", "security floor enabled"],
    ["artifacts-current", `rendered artifacts match standards v${version}`],
    [
      "pull-request-template",
      `${PR_TEMPLATE} — maintained inside REDLINE markers`,
    ],
    ["pending-admin", "nothing awaiting an administrator"],
  ];

  const lines: Line[] = [
    cmd("npm i -g redline-cli"),
    cmd("redline init"),
    { toks: [dim("profile "), white(PROFILE)] },
    // cli/bin/redline.ts:130 — `write ` is padded to the width of `remove`, so
    // three spaces separate it from the path, not two.
    ...writes.map((f) => ({ toks: [dim("  write   "), white(f)] })),
    ...outcomes.map(([status, capability, detail]) => ({
      toks: [
        green(`  ${status.padEnd(11)} `),
        blue(capability),
        dim("  "),
        dim(detail),
      ],
    })),
    {
      toks: [
        dim("pull request: "),
        blue(`https://github.com/${EXAMPLE_REPO}/pull/${EXAMPLE_PR}`),
      ],
    },
    { toks: [] },
    { toks: [dim(`# the gate workflow has since run on PR #${EXAMPLE_PR}`)] },
    cmd("redline verify"),
    ...findings.map(([check, detail]) => ({
      toks: [green("ok  "), dim("  "), white(check.padEnd(22)), dim(` ${detail}`)],
    })),
  ];

  const rows = [
    {
      k: "Standards in the files your AI tools read",
      before: "not present",
      beforeDetail: "nothing for Copilot, Claude or Codex-style agents to open",
      after: `${standardsFiles.length + commandFiles.length} files rendered`,
      afterDetail: `standards v${version}, profile ${PROFILE} — regenerated, never hand-edited`,
    },
    {
      k: "Gate on every pull request",
      before: "not present",
      beforeDetail: "no workflow reports a merge-readiness result",
      after: `${GATE_CHECK} — advisory`,
      afterDetail: "reports on every pull request; promoted to blocking as a second, deliberate step",
    },
    {
      k: "Branch policy and security floor",
      before: "never read back",
      beforeDetail: "whatever someone set by hand, whenever that was",
      after: `${findings.length} checks, read back every run`,
      afterDetail: "redline verify fails the moment one of them stops matching",
    },
  ];

  return (
    <section className="section journey" id="journey">
      <div className="container">
        <div className="jr-head">
          <h2 className="vv-lbl">Before, one command, after</h2>
          <p className="jr-lead">
            One repository, start to finish.{" "}
            <b>
              Every command and every line of output below is a string the CLI actually
              prints
            </b>{" "}
            — the file names are the ones it writes, the findings are the ones it
            reports, for a repository onboarding fresh with{" "}
            <code>redline init</code>&rsquo;s own defaults. The one <code>#</code> line
            is ours, marking the gap between the two runs.
          </p>
        </div>

        <div className="jr-card">
          <div className="jr-band">
            <h3 className="jr-band-h">Before — the repository as it stands</h3>
            <ul className="jr-rows">
              {rows.map((r) => (
                <li key={r.k}>
                  <span className="jr-k">{r.k}</span>
                  <span className="jr-v jr-v-none">{r.before}</span>
                  <span className="jr-d">{r.beforeDetail}</span>
                </li>
              ))}
            </ul>
            <pre className="jr-probe">
              <span className="tk-prompt">$ </span>
              <span className="tk-white">redline verify</span>
              {"\n"}
              <span className="tk-red">FAIL</span>
              <span className="tk-dim">{"  "}</span>
              <span className="tk-white">{"onboarded".padEnd(22)}</span>
              <span className="tk-dim">
                {" "}
                no /src/checkout-service/.redline.json — run: npx
                --package=redline-cli@latest redline init
              </span>
            </pre>
          </div>

          <JourneyTerminal lines={lines} title={`terminal — ${EXAMPLE_REPO}`} />

          <div className="jr-band jr-band-after">
            <h3 className="jr-band-h">After — the same three things</h3>
            <ul className="jr-rows">
              {rows.map((r) => (
                <li key={r.k}>
                  <span className="jr-k">{r.k}</span>
                  <span className="jr-v jr-v-set">{r.after}</span>
                  <span className="jr-d">{r.afterDetail}</span>
                </li>
              ))}
            </ul>

            <h4 className="jr-sub-h">What it did to files you already had</h4>
            <ul className="jr-files">
              <li>
                <span className="jr-fk">Merged — your file keeps its content</span>
                <span className="jr-fp">
                  {mergedStandardsFiles.map((f) => (
                    <code key={f}>{f}</code>
                  ))}
                </span>
                <span className="jr-fd">
                  Your content stays — Redline writes only between its{" "}
                  <code>&lt;!-- REDLINE:BEGIN</code> and{" "}
                  <code>&lt;!-- REDLINE:END --&gt;</code> markers. A file without them
                  gets the block appended; one that has them keeps everything outside
                  untouched, and malformed markers — unpaired, duplicated, out of order —
                  are left alone rather than guessed at.{" "}
                  <Link href="/docs/adaptors/agents-md">How the markers work →</Link>
                </span>
              </li>
              <li>
                <span className="jr-fk">
                  Merged into the template the host actually serves
                </span>
                <span className="jr-fp">
                  <code>.github/pull_request_template.md</code>
                </span>
                <span className="jr-fd">
                  Merges into the template your host already serves — it never creates a
                  second one. It adds only the sections the gate checks for —{" "}
                  <code>## Launch readiness</code>, and{" "}
                  <code>## Architecture decision</code> unless the file already links a{" "}
                  <code>docs/adr/</code> — inside the same markers as above. A template
                  that already answers both is left untouched.
                </span>
              </li>
              <li>
                <span className="jr-fk">Redline&apos;s own — rewritten in full</span>
                <span className="jr-fp">
                  {ownedFiles.map((f) => (
                    <code key={f}>{f}</code>
                  ))}
                </span>
                <span className="jr-fd">
                  Generated, never hand-authored — an edit made in place does not survive
                  the next run, and a stack no longer in the profile has its instructions
                  file removed rather than left behind. Every instructions file it writes
                  carries the <code>redline-</code> prefix, so a custom instructions file
                  of your own is never touched.
                </span>
              </li>
              <li>
                <span className="jr-fk">Seeded only if you have none</span>
                <span className="jr-fp">
                  <code>.github/CODEOWNERS</code>
                </span>
                <span className="jr-fd">
                  A CODEOWNERS already in <code>.github/</code>, the repository root or{" "}
                  <code>docs/</code> is left untouched, and the run reports{" "}
                  <code>already</code> against it instead of <code>applied</code>.
                </span>
              </li>
              <li>
                <span className="jr-fk">The record the next run reads</span>
                <span className="jr-fp">
                  <code>.redline.json</code>
                </span>
                <span className="jr-fd">
                  What this repository chose and what the host was asked for: profile,
                  vendors, the menu options selected, and the capabilities the host
                  refused. It is what <code>redline verify</code> reads back — without it
                  the run above is a one-off, and with it every later check is scored
                  against what this repository actually agreed to.
                </span>
              </li>
            </ul>
            <p className="jr-note">
              Those are the paths of the GitHub run above; on Azure DevOps the host
              files sit elsewhere.{" "}
              <Link href="/docs/onboarding">Onboarding, host by host →</Link>
            </p>

            <h4 className="jr-sub-h">The slash commands it installs</h4>
            <ul className="jr-cmds">
              {commands.map((c) => (
                <li key={c.name}>
                  <code>/{c.name}</code>
                  <span>{c.description}</span>
                </li>
              ))}
            </ul>
            <p className="jr-note">
              Each is rendered once per AI tool from a single source —{" "}
              <code>.github/prompts/</code> for Copilot Chat,{" "}
              <code>.claude/commands/</code> for Claude Code — so the same{" "}
              <code>/name</code> is there in whichever one a developer already uses. Each
              tells the agent to run the real CLI and report what it printed; the files
              carry no logic of their own.
            </p>
          </div>

          <p className="jr-foot">
            None of it was pushed. It arrived as one pull request —{" "}
            <code>chore(redline): onboard to standards v{version}</code> on branch{" "}
            <code>{ONBOARD_BRANCH}</code>, labelled <code>{SYNC_LABEL}</code> — for the
            repository&apos;s own team to review and merge.
          </p>
          <p className="jr-foot jr-caveat">
            Run above with an admin-scoped token. Without one it still onboards: the
            capabilities the token cannot reach come back <code>denied</code>, are recorded
            in <code>.redline.json</code>, and <code>redline verify</code> reports{" "}
            <b>partially onboarded</b> until an administrator enables them.{" "}
            <Link href="/docs/onboarding">That path, step by step →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
