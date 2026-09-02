import { readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@/lib/content";
import { loadManifest, type Manifest } from "@/lib/manifest";
import { JourneyTerminal, type Line, type Tok } from "@/components/journey-terminal";

// Everything printed in this transcript is a literal string from the CLI. Sources:
//   cli/core/log.ts            — the `  write  `, `  <status> <capability>  <detail>`
//                                and `ok    <check> <detail>` line formats
//   cli/bin/redline.ts         — `profile <name>`, `pull request: <url>`
//   cli/render/vendors.ts      — the rendered artifact paths
//   cli/render/commands.ts     — the slash-command paths
//   cli/platforms/github/install.ts — capability details, `.github/…` paths,
//                                REQUIRED_CHECK, the seeded CODEOWNERS message
//   cli/commands/init.ts       — ONBOARD_BRANCH, the PR title, the `redline-sync` label
//   cli/commands/verify.ts     — every `redline verify` finding detail
// Nothing here is invented. If the CLI does not print it, it is not on this page.

const PROFILE = "web";
const EXAMPLE_REPO = "acme/checkout-service";
const EXAMPLE_PR = 42;

// cli/platforms/github/install.ts — REQUIRED_CHECK.
const GATE_CHECK = "redline-gate / gate";
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

// Mirrors cli/render/profile.ts resolveProfile — stacks in declaration order, parents first.
function resolveStacks(manifest: Manifest, profile: string): string[] {
  const out: string[] = [];
  const visit = (id: string): void => {
    for (const parent of manifest.stacks[id]?.extends ?? []) visit(parent);
    if (!out.includes(id)) out.push(id);
  };
  (manifest.profiles[profile] ?? []).forEach(visit);
  return out;
}

function commandNames(): string[] {
  return readdirSync(join(repoRoot(), "commands"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function Journey() {
  const manifest = loadManifest();
  const version = manifest.version;
  const stacks = resolveStacks(manifest, PROFILE);
  const commands = commandNames();

  // cli/render/vendors.ts — copilot, agents and claude are the manifest's enabled vendors.
  const standardsFiles = [
    ".github/copilot-instructions.md",
    ...stacks.map((s) => `.github/instructions/redline-${s}.instructions.md`),
    "AGENTS.md",
    "CLAUDE.md",
  ];
  // cli/render/commands.ts — COMMAND_HOSTS entries for the enabled vendors.
  const commandFiles = [
    ...commands.map((c) => `.github/prompts/${c}.prompt.md`),
    ...commands.map((c) => `.claude/commands/${c}.md`),
  ];
  // cli/platforms/github/install.ts installGate + ensureReviewOwnership,
  // then cli/config/redline-json.ts CONFIG_FILE.
  const hostFiles = [
    ".github/workflows/redline.yml",
    ".github/pull_request_template.md",
    ".github/CODEOWNERS",
    ".redline.json",
  ];
  const writes = [...standardsFiles, ...commandFiles, ...hostFiles];

  const outcomes: [string, string, string][] = [
    ["applied", "labels", 'label "no-adr"'],
    ["applied", "review-ownership", "seeded .github/CODEOWNERS"],
    ["applied", "secret-scanning", "secret scanning"],
    ["applied", "push-protection", "secret scanning push protection"],
    ["applied", "dependency-alerts", "dependabot alerts (vulnerability alerts)"],
    ["applied", "merge-policy", "branch ruleset"],
    ["applied", "repo-property", 'repository property "redline=onboarded"'],
  ];

  const findings: [string, string][] = [
    ["onboarded", `profile ${PROFILE}, standards v${version}`],
    ["merge-policy", "policy is advisory, config says advisory"],
    [
      "check-name-reported",
      `no required check configured yet (advisory gate) — PR #${EXAMPLE_PR} reported: ${GATE_CHECK}`,
    ],
    ["security-floor", "security floor enabled"],
    ["artifacts-current", `rendered artifacts match standards v${version}`],
    ["pending-admin", "nothing awaiting an administrator"],
  ];

  const lines: Line[] = [
    cmd("npm i -g redline-cli"),
    cmd("redline init"),
    { toks: [dim("profile "), white(PROFILE)] },
    ...writes.map((f) => ({ toks: [dim("  write  "), white(f)] })),
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
    cmd("redline verify"),
    ...findings.map(([check, detail]) => ({
      toks: [green("ok  "), dim("  "), white(check.padEnd(22)), dim(` ${detail}`)],
    })),
  ];

  const rows = [
    {
      k: "Standards in the files your AI tools read",
      before: "not present",
      beforeDetail: "nothing for Copilot, Claude, Codex-style agents or Cursor to open",
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
      after: `${findings.length} checks, read off the host`,
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
            <b>Every line of the transcript is a string the CLI actually prints</b> — the
            file names are the ones it writes, the findings are the ones it reports.
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
            <p className="jr-probe">
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
            </p>
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
          </div>

          <p className="jr-foot">
            None of it was pushed. It arrived as one pull request —{" "}
            <code>chore(redline): onboard to standards v{version}</code> on branch{" "}
            <code>{ONBOARD_BRANCH}</code>, labelled <code>{SYNC_LABEL}</code> — for the
            repository&apos;s own team to review and merge.
          </p>
        </div>
      </div>
    </section>
  );
}
