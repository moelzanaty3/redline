// The command surface v3 fixes at four. Two are built and two are not, and the
// unbuilt pair is documented rather than omitted: "does redline review exist?"
// is a question people keep asking, and a page that simply lacks the answer
// reads as an oversight instead of a decision.
export type CommandInfo = {
  what: string;
  built: boolean;
  onboard: string;
  usage: string[];
  flags: { flag: string; detail: string }[];
  output: string;
  edit: string;
};

export const COMMANDS_INFO: Record<string, CommandInfo> = {
  init: {
    what: "Onboards this repository: renders the standards into whichever AI tools it uses, applies the organisation's security floor, installs the merge gate advisory-by-default, and records what it did in .redline.json. It is idempotent — a re-run reconciles rather than reinstalls.",
    built: true,
    onboard:
      "Run it from inside the repository you are onboarding. It reads the git remote to decide whether it is talking to GitHub or Azure DevOps, and detects the profile from what is actually in the tree. On GitHub the org's reusable gate must already exist in the .github repo — see Installation — because init only writes the thin caller that references it.",
    usage: [
      "redline init                          # detect everything, onboard",
      "redline init --dry-run                # print the plan; writes nothing, contacts no host",
      "redline init --profile web            # name the profile instead of detecting it",
      "redline init --vendors claude,copilot # render for these AI tools only",
      "redline init --blocking               # promote the gate from advisory to blocking",
      "redline init --skip gate              # this repository has its own; do not install one",
      "redline init --repair                 # re-apply every capability on an already-onboarded repo",
    ],
    flags: [
      {
        flag: "--dry-run",
        detail:
          "Prints the plan and writes nothing. It needs no credential and contacts no host, which makes it the safe way to see what onboarding would do to a repository you do not own.",
      },
      {
        flag: "--skip <list> / --with <list>",
        detail:
          "Deselects or re-selects a capability the repository already has its own answer for: gate, merge-policy, labels, review-ownership. A deselected capability is not attempted, not written and not reported as missing. The security floor cannot be skipped — it is the org-wide minimum and is refused by name rather than recorded.",
      },
      {
        flag: "--repair",
        detail:
          "Re-applies every capability even where the repository looks onboarded already. It exists for the capabilities whose recorded pendingAdmin entry a plain re-run can never clear on its own — labels, review-ownership, repo-property, gate, merge-policy. Composes with --dry-run.",
      },
      {
        flag: "--adopt-caller",
        detail:
          "Lets Redline take over an existing gate machinery file that carries nothing attributing it to Redline — a 2.1-era caller, in practice. Without it the run refuses rather than overwrite a file that may be the repository's own.",
      },
      {
        flag: "--blocking",
        detail:
          "Promotes the merge gate from advisory to blocking. A deliberate second step after a soak period, not part of a first onboarding.",
      },
    ],
    output:
      "Rendered standards artifacts for the detected vendors, the gate caller workflow, a CODEOWNERS file where the repository has none, a pull request template (written whole, or merged into an existing one inside REDLINE:BEGIN/END markers), and .redline.json recording the profile, vendors, capability selections and onboarding date. Anything it could not apply for lack of rights is recorded as a pendingAdmin entry rather than reported as success. Exit codes follow the CLI's own contract: 1 failed, 2 usage, 3 permission, 4 host.",
    edit: "cli/commands/init.ts, with the install path unit-tested against a fake host client in cli/platforms/*/__tests__/install.test.ts.",
  },
  verify: {
    what: "Checks that a repository still matches what its own .redline.json claims — the gate still reports, the ruleset was not edited by hand, push protection is still on, the rendered artifacts are not stale. With --gate it is also the Azure gate itself.",
    built: true,
    onboard:
      "Nothing to install: it ships with the CLI and reads .redline.json from the current checkout. That is also its limitation — it has no --repo owner/name mode that works over the API, so verifying the estate on a schedule needs a clone-then-verify loop. That is why workflows/verify-onboarding.yml is switched off.",
    usage: [
      "redline verify          # report drift in this checkout",
      "redline verify --gate   # run as the Azure DevOps merge gate",
    ],
    flags: [
      {
        flag: "--gate",
        detail:
          "The mode the Azure pipeline template invokes. Materially weaker than the GitHub gate: it runs none of GitHub's dependency review or diff secret scan, which are the two hard-fail, never-exemptible checks there.",
      },
    ],
    output:
      "One finding per drift, each naming what it checked and what it found — a gate that no longer publishes its check, a merge policy Redline applied and stopped maintaining, artifacts stale against the current standards version, repo-local rules that were present at the last run and are now gone. A clean repository produces no findings and exits 0.",
    edit: "cli/commands/verify.ts, with per-host assertions in cli/platforms/github/verify.ts and cli/platforms/azure/verify.ts.",
  },
  sync: {
    what: "Would land a standards change on every registered repository as a pull request, quoting the standards version it came from. Designed as the third of v3's four commands; not built.",
    built: false,
    onboard:
      "Nothing to onboard — the command does not exist. workflows/redline-sync.yml is left in place as a shape to rewire, not something to un-comment: its job carries if: false and the script it called was deleted.",
    usage: ["# not implemented"],
    flags: [],
    output:
      "Nothing today. Until it exists, an onboarded repository picks up a standards change only by re-running redline init by hand — which is why the roadmap makes distribution Phase 0 and gates everything else behind it. The half that was missing is no longer missing: registry.json now derives the list of repositories to target from the estate itself.",
    edit: "Unbuilt. The roadmap's Phase 0.2 is where it is specified; nothing in cli/commands/ implements it yet.",
  },
  review: {
    what: "Would review the working tree, staged changes or an existing pull request against exactly the rules that apply to the changed files, in either an embedded or an API engine, returning findings against a published schema. Designed in full in v3 §6.2; not built.",
    built: false,
    onboard:
      "Nothing to onboard — the command does not exist. Every request for \"catch it before I push\" is a request for this.",
    usage: ["# not implemented"],
    flags: [],
    output:
      "Nothing today. When it exists, its findings will carry the same output contract as a PR review — severity, rule id, one-line problem. One thing is settled in advance: local findings must be excluded from, or separately tagged in, rule-tuning telemetry, because a local run nobody can verify would distort acted-on rate. A local command is also opt-in and therefore enforces nothing; the merge gate stays the system of record.",
    edit: "Unbuilt. Specified in the v3 design, sequenced last in the roadmap because its value depends on voluntary adoption.",
  },
};
