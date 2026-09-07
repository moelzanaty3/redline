import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { repoRoot } from "@/lib/content";
import { loadManifest, type Manifest } from "@/lib/manifest";
import { JourneyTerminal, type Line, type Tok } from "@/components/journey-terminal";

// Everything printed in this transcript is a literal string from the CLI. Sources:
//   cli/bin/redline.ts:130     — the write line: `  ` + `write ` (padded to the
//                                width of `remove`) + `  ` + the path
//   cli/core/log.ts:34-35      — report(): `ok  ` / `FAIL` + `  ` +
//                                check.padEnd(22) + ` ` + detail
//   cli/bin/redline.ts:112,157 — `profile <name>`, `pull request: <url>`
//   cli/render/vendors.ts      — the rendered artifact paths
//   cli/render/commands.ts     — the slash-command paths
//   cli/platforms/github/install.ts — capability details, `.github/…` paths,
//                                REQUIRED_CHECK
//   cli/commands/init.ts       — ONBOARD_BRANCH, the PR title, the `redline-sync` label
//   cli/commands/verify.ts     — every `redline verify` finding detail
// Nothing here is invented: every command and every line of output is a literal
// CLI string. The single exception is the `# ...` line before `redline verify`,
// a shell comment narrating the gap between the two runs — the lead paragraph
// below names it rather than letting the page claim more than it delivers.
//
// The transcript is a selection of a longer real run, never a summary of one:
// the writes shown are four of the paths the run prints, and the count of the
// rest is stated in the caption outside the terminal rather than faked as a
// line the CLI never printed.

const PROFILE = "web";
const EXAMPLE_REPO = "acme/checkout-service";
const EXAMPLE_PR = 42;

// cli/platforms/github/install.ts — REQUIRED_CHECK.
const GATE_CHECK = "redline-gate / gate";
// cli/platforms/github/verify.ts — CALLER_WORKFLOW, the file readGateMachinery
// reads the published check name out of; also the path installGate syncs.
const CALLER_WORKFLOW = ".github/workflows/redline.yml";
// cli/platforms/github/install.ts — the default template path.
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
// parents first — including both of its throws. The caption's file count is
// derived from what this returns, so a profile the manifest cannot resolve has
// to fail the build: a smaller number rendered against a green build is exactly
// the silent degradation this page exists to avoid.
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

// Mirrors cli/render/commands.ts loadCommands: one slash command per .md file in
// commands/, rendered once per vendor host. Read at build time so the page
// cannot count files that are not on disk — and throws rather than degrading.
function commandCount(): number {
  const dir = join(repoRoot(), "commands");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
    const description = /description:\s*(.+)/.exec(front)?.[1]?.trim();
    if (description === undefined || description === "") {
      throw new Error(
        `commands/${file} has no frontmatter description; the CLI renders it verbatim`
      );
    }
  }
  if (files.length === 0) {
    throw new Error("commands/ holds no .md files; the home page counts what init writes");
  }
  return files.length;
}

export function Journey({ initCmd }: { initCmd: string }) {
  const manifest = loadManifest();
  const version = manifest.version;
  const stacks = resolveStacks(manifest, PROFILE);
  const commands = commandCount();

  // cli/render/vendors.ts PREFIX — one instructions file per resolved stack.
  const instructionFiles = stacks.map(
    (s) => `.github/instructions/redline-${s}.instructions.md`
  );
  // The full write list of the run: the three merged standards files, the
  // per-stack instructions, the slash commands rendered once per vendor host,
  // and the four host files.
  const totalWrites =
    3 + instructionFiles.length + commands * 2 + 4;

  // Four of the paths the run prints — the three files an AI tool opens, and
  // the workflow that publishes the check.
  const shownWrites = [
    ".github/copilot-instructions.md",
    "AGENTS.md",
    "CLAUDE.md",
    CALLER_WORKFLOW,
  ];

  // cli/commands/init.ts — [...gate.outcomes, ...ownership.outcomes,
  // ...security.outcomes, ...policy.outcomes], in that order.
  const outcomes: [string, string, string][] = [
    ["applied", "labels", 'label "no-adr"'],
    ["applied", "gate", `wrote ${PR_TEMPLATE}`],
    // review-ownership is deliberately absent: it is opt-in behind
    // `--with review-ownership`, so a default run never seeds CODEOWNERS and a
    // transcript of a default run must not show it doing so.
    ["applied", "secret-scanning", "secret scanning"],
    ["applied", "push-protection", "secret scanning push protection"],
    ["applied", "dependency-alerts", "dependabot alerts (vulnerability alerts)"],
    ["applied", "merge-policy", "branch ruleset"],
    ["applied", "repo-property", 'repository property "redline=onboarded"'],
  ];

  // cli/commands/verify.ts, in the order it calls add() — four of the eight
  // checks that run. Details are the healthy branch of each, for a repository
  // onboarded by `redline init` with its default menu.
  const findings: [string, string][] = [
    ["onboarded", `profile ${PROFILE}, standards v${version}`],
    ["gate-machinery", `${CALLER_WORKFLOW} publishes ${GATE_CHECK}`],
    ["security-floor", "security floor enabled"],
    ["artifacts-current", `rendered artifacts match standards v${version}`],
  ];

  const lines: Line[] = [
    cmd(initCmd),
    { toks: [dim("profile "), white(PROFILE)] },
    // cli/bin/redline.ts:130 — `write ` is padded to the width of `remove`, so
    // three spaces separate it from the path, not two.
    ...shownWrites.map((f) => ({ toks: [dim("  write   "), white(f)] })),
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

  return (
    <section className="hm-sec hm-journey" id="proof">
      <div className="container">
        <div className="hm-sec-head">
          <h2 className="hm-h2">One repository, start to finish</h2>
          <p className="hm-lead">
            <b>
              Every command and every line of output below is a string the CLI
              actually prints
            </b>{" "}
            — the file names are the ones it writes, the findings are the ones it
            reports. The one <code>#</code> line is ours, marking the gap between
            the two runs.
          </p>
        </div>

        <div className="hm-term-wrap">
          <JourneyTerminal lines={lines} title={`terminal — ${EXAMPLE_REPO}`} />
        </div>

        <p className="hm-term-cap">
          <b>One pull request on <code>{ONBOARD_BRANCH}</code>. Never a push.</b>{" "}
          Titled <code>chore(redline): onboard to standards v{version}</code> and
          labelled <code>{SYNC_LABEL}</code>, for the repository&apos;s own team to
          review and merge. Four of the {totalWrites} files it writes are shown;
          it merges into files you already have rather than overwriting them.{" "}
          <Link href="/docs/onboarding">Every file, and how the merge works →</Link>
        </p>
      </div>
    </section>
  );
}
