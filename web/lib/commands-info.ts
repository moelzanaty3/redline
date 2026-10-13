// The content of every /docs/cli/<command> page. The set of commands is the set
// `redline --help` prints, and every flag, default and output line below was
// checked against `redline <command> --help` and a real run. Change the CLI,
// change this.
//
// In `commands`, `{redline}` is the project's pinned copy (the reader's package
// manager picks the runner) and `{npx}` is the published package, for the runs
// that happen before a pinned copy exists. Estate commands are written out in
// full, because they run from a checkout of the source repository or from the
// metrics repository rather than from a product repository.
export type CommandGroup = "setup" | "everyday" | "estate";

export type CommandExample = {
  title: string;
  commands: string;
  output?: string;
};

export type CommandInfo = {
  group: CommandGroup;
  // One line, for the index table and the page intro.
  summary: string;
  // What it does and when you would run it.
  what: string;
  // Where the command runs, and with which copy of the CLI.
  runsIn: string;
  synopsis: string[];
  flags: { flag: string; default: string; detail: string }[];
  examples: CommandExample[];
  exitCodes: { code: string; meaning: string }[];
  related: { href: string; label: string }[];
  source: string;
};

export const COMMAND_GROUPS: { id: CommandGroup; title: string; blurb: string }[] = [
  {
    id: "setup",
    title: "Set up a repository",
    blurb: "Run once per machine or repository, and again when you change what is installed.",
  },
  {
    id: "everyday",
    title: "Everyday work",
    blurb: "Run while you write and review code. The gate runs verify, policy and exempt for you on every pull request.",
  },
  {
    id: "estate",
    title: "Across the organisation",
    blurb: "Run by the platform team, from the Redline source repository or the metrics repository. Not from a product repository.",
  },
];

const PRODUCT_REPO =
  "Inside the product repository, through the copy pinned in its devDependencies.";

const EXIT_OK = { code: "0", meaning: "Success." };
const EXIT_USAGE = { code: "2", meaning: "Usage error: an unknown flag or value, or a Node version below 18.11." };

export const COMMANDS_INFO: Record<string, CommandInfo> = {
  init: {
    group: "setup",
    summary: "Onboard this repository: assistant rules, security floor, merge gate and a pull request with all of it.",
    what: "Onboards the repository you are in. It writes the standards into the files each AI assistant reads, turns on the organisation's security floor (secret scanning, push protection, dependency alerts), installs the merge gate in advisory mode, and records every choice in .redline.json. On a repository with a remote, everything lands as one pull request on the redline/onboard branch. Run it once to onboard, and again whenever you want to change what is installed: omitted flags keep what .redline.json already recorded.",
    runsIn:
      "Inside the product repository. The first run uses the published package; after that, use the pinned copy (add it with --pin-cli). With no flags at a terminal, init walks a menu with what it detected preselected and offers a dry run before applying. Any flag, a pipe, CI, or REDLINE_NO_PROMPT=1 skips the menu.",
    synopsis: [
      "redline init [--profile <list>] [--vendors <list>] [--blocking] [--no-a11y] [--dry-run] [--repair]",
      "             [--adopt-caller] [--skip <list>] [--with <list>] [--pipeline <name>]",
      "             [--gate-source org|local] [--docs-url <base>] [--approvals <n>] [--no-commit]",
    ],
    flags: [
      { flag: "--dry-run", default: "off", detail: "Print the plan. Writes nothing, needs no credential, contacts no host." },
      { flag: "--no-commit", default: "off", detail: "Write the files into the working tree and stop. No repository setting, branch, commit or pull request. Works offline. Commit the files, then run init again to apply the settings." },
      { flag: "--profile <list>", default: "detected", detail: "One profile, or several separated by commas, rendered together (web,infra for a React app with Terraform beside it). Short aliases such as web and infra work. Order does not matter." },
      { flag: "--vendors <list>", default: "recorded, else detected", detail: "Which assistants to write files for: copilot, agents, codex, claude, cursor. Replaces both detection and the recorded list. A vendor the organisation has disabled never renders. See Adaptors." },
      { flag: "--pipeline <name>", default: "recorded, else follows the host", detail: "What runs this repository's pull request checks: github-actions, azure-pipelines or local-agent. Set it when the host and the CI differ, such as a GitHub repository built by Azure Pipelines. local-agent installs no CI: the gate is a pre-push hook." },
      { flag: "--skip <list>", default: "review-ownership", detail: "Capabilities not to install: gate, merge-policy, labels, review-ownership. Use it when the repository already has its own. The security floor cannot be skipped." },
      { flag: "--with <list>", default: "none", detail: "The same names, selected again. --with review-ownership writes CODEOWNERS, which is off by default." },
      { flag: "--review-owners <list>", default: "the platform team", detail: "Who owns the paths seeded into CODEOWNERS: teams, users or emails, comma separated. GitHub ignores an owner it cannot resolve, so set this to someone who exists." },
      { flag: "--rung <name>", default: "recorded, else observe", detail: "How hard the gate blocks: observe, block-blocker or block-high. Moving up needs recorded evidence (see redline evidence). Moving down is always allowed." },
      { flag: "--blocking", default: "off", detail: "Make the merge gate blocking instead of advisory. --rung is the finer-grained version of the same choice." },
      { flag: "--gate-source org|local", default: "recorded, else org", detail: "org references the reusable gate in <org>/.github. local copies the gate into .github/workflows/redline-gate.yml. local is weaker: a pull request can edit the gate that judges it, so protect .github/workflows/ with CODEOWNERS." },
      { flag: "--approvals <n>", default: "recorded, else 0", detail: "Approving reviews the branch policy requires, 0 to 10." },
      { flag: "--branches <patterns>", default: "the default branch", detail: "Branches the merge policy governs, comma separated, in the host's syntax (~DEFAULT_BRANCH, refs/heads/release/*). Never detected." },
      { flag: "--docs-url <base>", default: "unset", detail: "Where your organisation publishes the standard. Each finding then links to <base>/r/<rule-id>. Pass an empty string to clear it." },
      { flag: "--integrations <list>", default: "detected", detail: "Controls this repository already runs: sonarqube, snyk, mend, dependabot, renovate, gitleaks, trufflehog, codeql. Corrects detection, which cannot see a scanner wired through a shared pipeline template." },
      { flag: "--setup <list>", default: "none", detail: "Extra controls to install: dependabot, renovate, codeql. Writes .github/dependabot.yml, renovate.json or .github/workflows/codeql.yml. Never overwrites an existing file." },
      { flag: "--pin-cli", default: "off", detail: "Add redlinegate to devDependencies at this exact version, with the project's package manager, in the same pull request. The team then runs pnpm redline, yarn redline or npx redlinegate." },
      { flag: "--speckit / --no-speckit", default: "on", detail: "Add the spec-first context section to the assistant files. Dropped automatically where the repository already runs Spec Kit." },
      { flag: "--tmf / --no-tmf", default: "off", detail: "Add the TM Forum context section. The negative removes a section rendered earlier." },
      { flag: "--adr / --no-adr", default: "on", detail: "Require a pull request over 300 changed lines to link a decision record in docs/adr/. One pull request can skip it with the no-adr label." },
      { flag: "--repair", default: "off", detail: "Re-apply every capability even if the repository looks onboarded. Use it to clear an item still waiting on an administrator. Works with --dry-run." },
      { flag: "--adopt-caller", default: "off", detail: "Take over an existing .github/workflows/redline.yml or .azuredevops/redline-gate.yml that nothing marks as Redline's. Without it, init refuses to overwrite the file." },
      { flag: "--no-a11y", default: "off", detail: "Recorded in .redline.json. Changes nothing yet." },
    ],
    examples: [
      {
        title: "See the plan first",
        commands: "{npx} init --dry-run",
        output: `  profile web-react · dry run
  opted out: review-ownership

  Files  22 to write
   + .github/copilot-instructions.md
   + .github/instructions/redline-javascript.instructions.md
   …
   + AGENTS.md
   + CLAUDE.md
   + .cursor/rules/redline-core.mdc
   …
   + .github/workflows/redline.yml
   + .github/pull_request_template.md
   + .redline.json

  Repository settings  4 to apply
   → merge gate machinery on github
   → security floor: secret scanning, push protection, dependency alerts
   → branch policy: no approving review, gate advisory
   → pull request on redline/onboard

  menu: blockingGate=false adrForLargeDiffs=true accessibility=true speckit=true tmf=false sensitivePathReviewers=false

dry run — nothing was written, read or changed on the host`,
      },
      {
        title: "Onboard, and pin the CLI for the team",
        commands: "{npx} init --pin-cli",
      },
      {
        title: "Change one choice later",
        commands: "{redline} init --vendors copilot,claude\n{redline} init --pipeline azure-pipelines\n{redline} init --with review-ownership --review-owners @acme/platform",
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Onboarded, already onboarded, or the dry run finished. Items an administrator still has to enable are printed as a warning, not an error." },
      { code: "1", meaning: "The changes are committed on the onboarding branch, but the pull request could not be opened. Push the branch and open it by hand." },
      EXIT_USAGE,
      { code: "3", meaning: "The host refused the credential." },
      { code: "4", meaning: "The host could not be reached, or the repository was not found." },
      { code: "130", meaning: "Cancelled at a menu prompt. Nothing was written." },
    ],
    related: [
      { href: "/docs/onboarding", label: "Onboarding: every file init writes" },
      { href: "/docs/adaptors", label: "Adaptors: the files for each assistant" },
      { href: "/docs/enforcement", label: "Enforcement rungs" },
      { href: "/docs/cli/remove", label: "redline remove" },
    ],
    source: "cli/commands/init.ts",
  },

  doctor: {
    group: "setup",
    summary: "Check this machine can run Redline here: Node, git, the remote, a credential, onboarding.",
    what: "Checks whether this machine can run Redline against the repository you are in: the Node version, git, whether origin points at a host Redline supports, a credential, and whether .redline.json is present. Every line that is not ok prints the fix beneath it. Run it first on a new laptop, and paste its output into a bug report.",
    runsIn:
      "Anywhere, including before onboarding. It contacts no host, needs no credential, and runs on a Node version too old for every other command.",
    synopsis: ["redline doctor [--json]"],
    flags: [
      { flag: "--json", default: "off", detail: "Every check as JSON on stdout: name, status, detail and fix, plus an overall ok." },
    ],
    examples: [
      {
        title: "Before onboarding",
        commands: "{npx} doctor",
        output: `ok    node                   v24.21.0 — at or above the required 18.11
ok    git                    git version 2.54.0 (Apple Git-157)
ok    remote                 github — acme/web-app
ok    credential             gh is logged in as your-user
warn  onboarded              no .redline.json here yet
        npx redlinegate init`,
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Every check is ok or warn. A warning is not a failure." },
      { code: "1", meaning: "At least one check is FAIL." },
    ],
    related: [
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
      { href: "/docs/cli/status", label: "redline status" },
    ],
    source: "cli/commands/doctor.ts",
  },

  status: {
    group: "setup",
    summary: "What is installed here, how hard the gate blocks, and what an administrator still owes you.",
    what: "Reports what Redline has installed in this repository: the profile, the host and CI, the enforcement rung, the assistants, the capabilities, anything still waiting on an administrator, and whether the standards have moved on since the repository was rendered. Run it when you arrive at a repository and want to know what Redline does there.",
    runsIn: `${PRODUCT_REPO} It reads the checkout only, so it needs no credential and cannot see a setting changed on the host. Use redline verify for that.`,
    synopsis: ["redline status [--json]"],
    flags: [
      { flag: "--json", default: "off", detail: "The whole report as JSON on stdout: onboarded, profile, stacks, host, pipeline, rung, vendors, capabilities, integrations, pendingAdmin, standardsVersion, currentStandards, drifted and the timestamps." },
    ],
    examples: [
      {
        title: "An onboarded repository",
        commands: "{redline} status",
        output: `profile      javascript-typescript (javascript, typescript)
host         github
checks       GitHub Actions
rung         observe — findings are reported, only the security floor fails the check
assistants   claude
installed    gate, merge-policy, labels
standards    0.2.2 — current
onboarded    2026-10-13, last run 2026-10-13`,
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Always, including when the repository is not onboarded. Not onboarded is an answer, not a failure." },
      EXIT_USAGE,
    ],
    related: [
      { href: "/docs/cli/verify", label: "redline verify: check the host too" },
      { href: "/docs/cli/doctor", label: "redline doctor" },
    ],
    source: "cli/commands/status.ts",
  },

  remove: {
    group: "setup",
    summary: "Take Redline back out of this repository, as a pull request.",
    what: "Removes what init installed: the assistant files, the gate machinery, the slash commands, the host settings Redline applied, and .redline.json last. It only deletes what it can prove Redline wrote. A file you also edited keeps every byte outside the Redline block. It never turns off the security floor. On a repository with a remote, the removal lands as a pull request on the redline/remove branch for your team to review.",
    runsIn: `${PRODUCT_REPO} --dry-run needs no credential.`,
    synopsis: ["redline remove [--dry-run] [--json]"],
    flags: [
      { flag: "--dry-run", default: "off", detail: "Print the plan. Writes nothing, needs no credential, contacts no host." },
      { flag: "--json", default: "off", detail: "The whole report as JSON on stdout." },
    ],
    examples: [
      {
        title: "See what removal would do",
        commands: "{redline} remove --dry-run",
        output: `  would remove   AGENTS.md  — nothing but the Redline block was in it
  would remove   CLAUDE.md  — nothing but the Redline block was in it
  would remove   .claude/commands/redline-init.md  — its frontmatter carries the Redline ownership line
  …
  would remove   .github/workflows/redline.yml  — it references Redline's reusable gate and publishes redline-gate / gate
  would unmerge  .github/pull_request_template.md  — the Redline block only — every byte outside it is kept as it is
  would remove   .redline.json  — Redline's own record of this repository — removed last
  would apply   withdraw Redline's own state on github: the merge policy it applied, the labels it created, and the repository property it set where the host has them
  would apply   pull request on redline/remove
dry run — nothing was written, read or changed on the host

warn  what this did not do
warn    · the security floor stays on: secret scanning, push protection and dependency alerts are the organisation's minimum, not Redline's own state, and removing Redline is not a reason to lower them. This command has no flag that turns them off
warn    · once .redline.json is gone, redline verify stops recognising this repository: it reports "not onboarded" and exits 2 rather than reporting drift — which reads identically to a repository that was never onboarded, so record this removal somewhere verify cannot`,
      },
    ],
    exitCodes: [
      EXIT_OK,
      { code: "1", meaning: "The removal is on the redline/remove branch, but the pull request could not be opened." },
      { code: "2", meaning: "Usage error, or the repository was never onboarded." },
      { code: "3 / 4", meaning: "The host refused the credential, or could not be reached." },
    ],
    related: [
      { href: "/docs/removing", label: "Removing Redline" },
      { href: "/docs/cli/init", label: "redline init" },
    ],
    source: "cli/commands/remove.ts",
  },

  completion: {
    group: "setup",
    summary: "Print a tab-completion script for bash, zsh or fish.",
    what: "Prints a shell script that tab-completes every command, every flag, and the metrics subcommands. It completes both redline and redlinegate. Load it once from your shell's startup file.",
    runsIn: "Anywhere. It needs redline or redlinegate on your PATH, for example from a global install.",
    synopsis: ["redline completion bash|zsh|fish"],
    flags: [],
    examples: [
      {
        title: "Load it in your shell",
        commands: `# bash, in ~/.bashrc
source <(redline completion bash)
# zsh, in ~/.zshrc, after compinit
source <(redline completion zsh)
# fish
redline completion fish > ~/.config/fish/completions/redline.fish`,
      },
    ],
    exitCodes: [
      { code: "0", meaning: "The script was printed on stdout." },
      { code: "2", meaning: "No shell, or a shell other than bash, zsh or fish." },
    ],
    related: [{ href: "/docs/cli", label: "All commands" }],
    source: "cli/bin/commands.ts",
  },

  review: {
    group: "everyday",
    summary: "Review your change against only the rules that apply to the files it touches.",
    what: "Reviews your change before you push, against the rules for the stacks your diff actually touches. At a terminal with no --engine, it prints what a checker can decide without a model, straight away. Inside an assistant's shell or a pipe, it prints a prompt for that assistant to apply. With --engine api, it sends the diff to a model endpoint you configure, which can be local. Results are never recorded and never fail anything.",
    runsIn: `${PRODUCT_REPO} The profile comes from .redline.json unless you pass --profile.`,
    synopsis: [
      "redline review [--staged] [--diff-file <path>] [--base <ref>] [--engine <name>] [--print-prompt]",
      "               [--provider openai|anthropic] [--model <name>] [--base-url <url>] [--json]",
    ],
    flags: [
      { flag: "--staged", default: "off", detail: "Review only what is staged." },
      { flag: "--diff-file <path>", default: "none", detail: "Review a unified diff from a file instead of the checkout." },
      { flag: "--base <ref>", default: "the default branch", detail: "The branch to diff against. The diff is taken from the merge base, so commits that landed on the base since you branched are not reviewed." },
      { flag: "--profile <name>", default: "from .redline.json", detail: "The profile whose rules apply." },
      { flag: "--engine embedded", default: "see above", detail: "Print the bounded prompt for the assistant running the command." },
      { flag: "--engine api", default: "off", detail: "Call a model endpoint and print its findings. Nothing is sent unless you pass this flag." },
      { flag: "--provider openai|anthropic", default: "from the API key", detail: "Which API the api engine speaks. Inferred from OPENAI_API_KEY or ANTHROPIC_API_KEY. openai covers any OpenAI-compatible server, such as Ollama, LM Studio or vLLM." },
      { flag: "--model <name>", default: "REDLINE_REVIEW_MODEL", detail: "The model the api engine calls. Required one way or the other." },
      { flag: "--base-url <url>", default: "the provider's", detail: "The endpoint the api engine calls. A local OpenAI-compatible server needs no key." },
      { flag: "--print-prompt", default: "off", detail: "Write only the prompt to stdout, everything else to stderr, so redline review --print-prompt | pbcopy copies the prompt alone. Not with --engine api." },
      { flag: "--json", default: "off", detail: "Scope, prompt and findings as JSON on stdout." },
    ],
    examples: [
      {
        title: "At a terminal",
        commands: "{redline} review",
        output: `profile javascript-typescript — rules in scope: core, typescript
src/a.ts:2
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it. Add the ticket id on the same line, or do the work now.
1 finding(s)
that is every rule a checker can decide; the rest of the standard needs a model — run /redline-review in your assistant, or \`redline review --engine api\`
local review — not recorded, and not counted in rule-tuning telemetry`,
      },
      {
        title: "With a local model",
        commands: "{redline} review --engine api --provider openai --base-url http://localhost:11434/v1 --model qwen2.5-coder:14b",
      },
      {
        title: "Paste the prompt into any assistant",
        commands: "{redline} review --print-prompt | pbcopy",
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Always when the review ran, whatever it found. It is a pre-push check, not a gate." },
      EXIT_USAGE,
    ],
    related: [
      { href: "/docs/local-review", label: "Reviewing before you push" },
      { href: "/docs/output-contract", label: "The output contract" },
      { href: "/docs/cli/policy", label: "redline policy" },
    ],
    source: "cli/commands/review.ts",
  },

  explain: {
    group: "everyday",
    summary: "Turn the rule id in a finding into the rule, where it is defined, and who receives it.",
    what: "Every finding cites a rule id in brackets, such as [core/hardcoded-secrets]. explain prints that rule's text, whether a checker or review judgement decides it, the standards file and line that defines it, the files it applies to, and every profile that receives it. Run it when a finding on your pull request is not clear.",
    runsIn: "Anywhere, including a directory that was never onboarded. The rules are built into the CLI.",
    synopsis: ["redline explain <rule-id> [--json]", "redline explain --list"],
    flags: [
      { flag: "--list", default: "off", detail: "Every rule id in the standards, with its severity." },
      { flag: "--json", default: "off", detail: "The rule, its scope and the profiles it reaches, as JSON on stdout." },
    ],
    examples: [
      {
        title: "Explain a finding",
        commands: "{redline} explain core/hardcoded-secrets",
        output: `BLOCKER core/hardcoded-secrets

  No hardcoded secrets, API keys, tokens, or credentials — including in test files, fixtures, config samples, and comments.

  decided by   review judgement
  defined in   standards/core.md:64
  applies to   every file — the core standard is not scoped by stack
  reaches      javascript-typescript, web-react, web-nextjs, …`,
      },
      {
        title: "Find an id you half remember",
        commands: "{redline} explain --list | grep secret",
      },
    ],
    exitCodes: [
      EXIT_OK,
      { code: "2", meaning: "No rule id given, or no rule with that id. The error points at --list." },
    ],
    related: [
      { href: "/docs/standards", label: "The standards" },
      { href: "/docs/output-contract", label: "The output contract" },
    ],
    source: "cli/rules/catalogue.ts",
  },

  verify: {
    group: "everyday",
    summary: "Check the repository and its host settings still match what .redline.json claims.",
    what: "Checks that the repository still matches what .redline.json records: the gate still publishes its check, the branch policy is still enforced, the security floor is still on, and the rendered assistant files are not stale. Run it after a re-onboard, after someone changes repository settings, or when a pull request is not being gated as you expect. With --gate it is the merge gate itself in Azure Pipelines.",
    runsIn: `${PRODUCT_REPO} It reads host settings, so it needs a credential. With --repo it checks any repository over the API, with no checkout.`,
    synopsis: ["redline verify [--gate] [--repo <owner/name>] [--json]"],
    flags: [
      { flag: "--repo <owner/name>", default: "this checkout", detail: "Check a repository over the API. A check that needs a working tree reports ?? instead of passing, and ?? never fails the run." },
      { flag: "--gate", default: "off", detail: "Run as the merge gate in CI. A setting the build identity cannot see does not fail the pull request. Ends on a pass/fail line. Not with --repo." },
      { flag: "--json", default: "off", detail: "The whole report as JSON on stdout." },
    ],
    examples: [
      {
        title: "In a repository that was never onboarded",
        commands: "{redline} verify",
        output: `FAIL  onboarded              no /path/to/repo/.redline.json — run: npx redlinegate init`,
      },
      {
        title: "Another repository, without cloning it",
        commands: "{redline} verify --repo acme/web-app",
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Every check passed or could not run (??)." },
      { code: "1", meaning: "Drift: at least one check is FAIL." },
      { code: "2", meaning: "The repository was never onboarded, there is no git remote, or a usage error." },
      { code: "3 / 4", meaning: "The host refused the credential, or could not be reached." },
    ],
    related: [
      { href: "/docs/distribution", label: "Distribution and drift" },
      { href: "/docs/gate", label: "The merge gate" },
      { href: "/docs/cli/status", label: "redline status" },
    ],
    source: "cli/commands/verify.ts",
  },

  policy: {
    group: "everyday",
    summary: "Evaluate the rules a checker can decide, with no model call.",
    what: "Some rules need no judgement: a TODO has a ticket reference or it does not. policy checks those rules against the added lines of a diff, with no model, and fails on a BLOCKER. The gate runs it as the policy job on every pull request. Run it yourself to reproduce that job. It also says how many rules it could not decide; redline review covers those.",
    runsIn: "Inside the product repository, or anywhere you have a diff. The gate runs it in CI.",
    synopsis: ["redline policy --diff-file <path> [--fail-on <severity>] [--json]"],
    flags: [
      { flag: "--diff-file <path>", default: "required", detail: "The unified diff to evaluate. Only added lines are checked." },
      { flag: "--fail-on <severity>", default: "BLOCKER", detail: "The lowest severity that fails the run: BLOCKER, HIGH or SUGGESTION." },
      { flag: "--json", default: "off", detail: "ok, findings, the rules evaluated, and how many need a model, as JSON on stdout." },
    ],
    examples: [
      {
        title: "Check your branch",
        commands: "git diff main...HEAD > change.diff\n{redline} policy --diff-file change.diff",
        output: `src/a.ts:2
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing will bring anyone back to it. Add the ticket id on the same line, or do the work now.
1 finding(s) from 53 deterministic rule(s)
443 of the 496 rule(s) in the catalogue cannot be decided without a model and were not checked here — run \`redline review\` for those`,
      },
      {
        title: "Fail on HIGH as well",
        commands: "{redline} policy --diff-file change.diff --fail-on HIGH",
      },
    ],
    exitCodes: [
      { code: "0", meaning: "No finding at or above --fail-on. The example above exits 0: one HIGH does not fail the BLOCKER default." },
      { code: "1", meaning: "At least one finding at or above --fail-on." },
      { code: "2", meaning: "No --diff-file, or an unknown severity." },
    ],
    related: [
      { href: "/docs/deterministic", label: "Deterministic rules" },
      { href: "/docs/gate", label: "The merge gate" },
      { href: "/docs/cli/review", label: "redline review" },
    ],
    source: "cli/policy/checks.ts",
  },

  exempt: {
    group: "everyday",
    summary: "Decide whether a pull request carries a valid exemption for a failing process check.",
    what: "Reads the ## Redline exemption section of a pull request description and decides whether it covers a failing process check, such as the ADR or checklist check. A valid exemption has a reason of at least 20 characters, an until date no more than 90 days away, and a scope that covers the check. The gate runs it for you. Run it yourself to test a description before you push it.",
    runsIn: "Anywhere you have the pull request description in a file. The gate runs it in CI.",
    synopsis: ["redline exempt --body-file <path> [--scope <check>] [--json]"],
    flags: [
      { flag: "--body-file <path>", default: "required", detail: "The pull request description, as a file. A file, not an argument, because the description is untrusted text." },
      { flag: "--scope <check>", default: "any", detail: "The failing check the exemption has to cover. An exemption with no scope: line covers every check." },
      { flag: "--json", default: "off", detail: "Whether it applies, and why, as JSON on stdout." },
    ],
    examples: [
      {
        title: "Test an exemption",
        commands: `cat > body.md <<'EOF'
## Redline exemption
reason: vendor SDK upgrade lands next sprint, ADR to follow
until: 2026-11-30
scope: adr
EOF
{redline} exempt --body-file body.md --scope adr
{redline} exempt --body-file body.md --scope checklist`,
        output: `exempt until 2026-11-30 (adr): vendor SDK upgrade lands next sprint, ADR to follow
warn  the exemption covers adr — it does not cover "checklist". Widen its scope deliberately, or fix the check.`,
      },
    ],
    exitCodes: [
      { code: "0", meaning: "A valid exemption applies." },
      { code: "1", meaning: "No valid exemption: missing, too short a reason, a bad or expired date, more than 90 days out, or the wrong scope." },
      { code: "2", meaning: "No --body-file." },
    ],
    related: [
      { href: "/docs/exemptions", label: "Exemptions" },
      { href: "/docs/gate", label: "The merge gate" },
    ],
    source: "cli/commands/exempt.ts",
  },

  evidence: {
    group: "everyday",
    summary: "Show the measurement behind this repository's rung, and record a new one.",
    what: "A repository starts at the observe rung, where the gate reports findings but blocks only on the security floor. To move up, it needs recorded evidence that the reviewer is accurate. evidence shows what is recorded and what the next rung asks for. evidence record writes a new measurement into .redline.json, with its source. Once eligible, raise the rung with redline init --rung.",
    runsIn: `${PRODUCT_REPO} It reads and writes the checkout only. The figures themselves come from the metrics dashboard.`,
    synopsis: [
      "redline evidence [--json]",
      "redline evidence record --source <where> [--seed-recall <0..1>] [--acted-on-rate <0..1>]",
      "                        [--sample-size <n>] [--false-positives <n>]",
    ],
    flags: [
      { flag: "--source <where>", default: "required for record", detail: "Where the figures came from: a workflow run, a dashboard, a report." },
      { flag: "--seed-recall <0..1>", default: "none", detail: "Share of seeded-corpus BLOCKERs the reviewer caught for this stack. A value outside 0..1 is refused." },
      { flag: "--acted-on-rate <0..1>", default: "none", detail: "Share of findings acted on over the window." },
      { flag: "--sample-size <n>", default: "0", detail: "Pull requests the rate is computed from." },
      { flag: "--false-positives <n>", default: "none", detail: "Findings raised on the clean corpus. Any at all blocks a blocking rung." },
      { flag: "--json", default: "off", detail: "The whole report as JSON on stdout." },
    ],
    examples: [
      {
        title: "Nothing recorded yet",
        commands: "{redline} evidence",
        output: `rung         observe
evidence     none recorded — nothing can raise the rung until something does

not yet eligible for block-blocker:
  - 20 reviewed pull requests are needed and 0 have been recorded — a perfect rate over a handful is a coincidence, not evidence
  - the seeded corpus has never been scored for this stack, so there is no evidence the reviewer catches known defects at all
  - the clean corpus has never been scored, so nothing shows the reviewer stays quiet on correct code
  - too few findings have fired to compute an acted-on rate

what block-blocker asks for:
  sample size      >= 20 reviewed pull requests
  seed recall      >= 100%
  acted-on rate    >= 60%
  false positives  <= 0
  measured within  90 days`,
      },
      {
        title: "Record a measurement",
        commands:
          "{redline} evidence record --source <dashboard-url> --seed-recall 1 --acted-on-rate 0.72 --sample-size 40 --false-positives 0",
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Reported or recorded. Not eligible is an answer, not a failure." },
      { code: "2", meaning: "The repository is not onboarded, a figure is not a number or out of range, or --source is missing." },
    ],
    related: [
      { href: "/docs/enforcement", label: "Enforcement rungs" },
      { href: "/docs/telemetry", label: "Telemetry and validation" },
    ],
    source: "cli/commands/evidence.ts",
  },

  funnel: {
    group: "everyday",
    summary: "Where your own runs of the CLI succeed and fail. Off by default, local only.",
    what: "Summarises your own runs of the CLI: runs, successes, failures and median time per command, and the most common errors. Recording is off until you set REDLINE_TELEMETRY=1. The record is a file on your machine that holds only a command name, an outcome, a duration and an error kind. Nothing sends it anywhere. Use it when you want to report where the CLI gets in your way.",
    runsIn: "Anywhere. The record is ~/.redline/funnel.jsonl.",
    synopsis: ["redline funnel [--json]", "redline funnel clear"],
    flags: [
      { flag: "--json", default: "off", detail: "The summary, the file path and whether recording is on, as JSON." },
      { flag: "clear", default: "", detail: "Delete the record." },
    ],
    examples: [
      {
        title: "Before recording is on",
        commands: "{redline} funnel",
        output: `off — export REDLINE_TELEMETRY=1 to record locally
nothing recorded yet
  it would be written to /Users/you/.redline/funnel.jsonl, on this machine, and sent nowhere`,
      },
      {
        title: "Record, then read it back",
        commands: "export REDLINE_TELEMETRY=1\n{redline} funnel",
      },
    ],
    exitCodes: [EXIT_OK, { code: "2", meaning: "A subcommand other than clear." }],
    related: [{ href: "/docs/troubleshooting", label: "Troubleshooting" }],
    source: "cli/core/telemetry.ts",
  },

  sync: {
    group: "estate",
    summary: "Open a pull request on every registered repository whose standards are behind.",
    what: "Re-renders the current standards for every repository in registry.json and opens a pull request on each one that is behind. A repository that is already current gets nothing. A repository with a sync pull request still open has that pull request updated, not a second one opened. Run it after a standards release; the redline-sync workflow runs it on a push to standards/.",
    runsIn:
      "From a built checkout of the Redline source repository (npm ci && npm run build), never from a product repository. GH_TOKEN needs contents, pull_requests and workflows write on every target; without workflows the push of .github/workflows/redline.yml is rejected.",
    synopsis: ["redline sync [--dry-run] [--repo <owner/name>] [--force] [--concurrency <n>] [--json]"],
    flags: [
      { flag: "--dry-run", default: "off", detail: "Plan and render, but push nothing and open nothing. It still reads every target, so it needs a read credential." },
      { flag: "--repo <owner/name>", default: "every registered repository", detail: "One repository instead of the estate." },
      { flag: "--force", default: "off", detail: "Re-render a repository already at the current standards version, for a renderer change that did not move the version." },
      { flag: "--concurrency <n>", default: "8", detail: "Repositories in flight at once. Lower it if the host rate limits; a 429 is waited out." },
      { flag: "--json", default: "off", detail: "Per-repository outcomes as JSON on stdout, with no progress lines." },
    ],
    examples: [
      {
        title: "Preview, then sync",
        commands: "node dist/bin/redline.js sync --dry-run\nnode dist/bin/redline.js sync",
      },
      {
        title: "One repository",
        commands: "node dist/bin/redline.js sync --repo acme/web-app",
      },
    ],
    exitCodes: [
      { code: "0", meaning: "Every target synced, was current, or was skipped." },
      { code: "1", meaning: "At least one repository failed. The rest of the estate still synced." },
      EXIT_USAGE,
    ],
    related: [
      { href: "/docs/distribution", label: "Distribution and drift" },
      { href: "/docs/cli/registry", label: "redline registry" },
      { href: "/docs/who-runs-what", label: "Who runs what" },
    ],
    source: "cli/commands/sync.ts",
  },

  registry: {
    group: "estate",
    summary: "Build registry.json, the list of onboarded repositories, by walking the organisation.",
    what: "Walks the organisation, reads the .redline.json each repository carries, and writes registry.json: every onboarded repository with its profile, vendors, rung, capabilities and standards version. redline sync uses it to know who to update, and the dashboard uses it for coverage. Nobody edits the list by hand; a repository that removes Redline drops out on the next run.",
    runsIn:
      "From a built checkout of the Redline source repository. The registry workflow runs it nightly. It needs a token with organisation read access, and writes to nothing it walks.",
    synopsis: ["redline registry --org <name> --source <owner/name> [--token <string>] [--out <path>]"],
    flags: [
      { flag: "--org <string>", default: "required", detail: "The GitHub organisation. Environment variable: ORG." },
      { flag: "--source <string>", default: "required", detail: "owner/name of the Redline source repository, recorded so a reader knows which estate the file describes. Environment variable: SOURCE." },
      { flag: "--token <string>", default: "GH_TOKEN", detail: "A token with organisation read access." },
      { flag: "--out <path>", default: "registry.json", detail: "Where to write the register." },
    ],
    examples: [
      {
        title: "Build the register",
        commands: "GH_TOKEN=<org-read-token> node dist/bin/redline.js registry --org acme --source acme/redline",
      },
    ],
    exitCodes: [
      EXIT_OK,
      { code: "2", meaning: "A required option is missing, or a usage error." },
      { code: "4", meaning: "The organisation walk failed, for example on a bad token." },
    ],
    related: [
      { href: "/docs/cli/sync", label: "redline sync" },
      { href: "/docs/distribution", label: "Distribution and drift" },
    ],
    source: "cli/registry/discover.ts",
  },

  metrics: {
    group: "estate",
    summary: "Collect review telemetry and build the dashboard, digest, inbox and ROI pages.",
    what: "Eight subcommands that measure Redline across the organisation. collect pulls review outcomes for merged pull requests; dashboard, digest, inbox and roi build pages from them; baseline records the starting figures; correlate is a research tool; score-seeds scores a reviewer against the seeded corpus. Scheduled workflows run most of them. Run one by hand to reproduce a scheduled run that looks wrong.",
    runsIn:
      "collect, dashboard, digest, roi and correlate run in the metrics repository, through the published package. inbox runs in the source repository. baseline runs once from a maintainer's terminal. score-seeds runs anywhere. Each subcommand's --help says where it runs, and every option can also be set as an environment variable.",
    synopsis: ["redline metrics <command> [options]", "redline metrics <command> --help"],
    flags: [
      { flag: "collect", default: "", detail: "Pull review outcomes for merged pull requests across the org. --org (required), --days (8), --since, --out (data), --dry-run, --skip-sarif, --token." },
      { flag: "dashboard", default: "", detail: "Build the telemetry dashboard page. --org (required), --data (data), --days (90), --out (dist), --registry (registry.json), --seed-scores, --onboarded, --standards-version." },
      { flag: "digest", default: "", detail: "Build the weekly digest as an Adaptive Card. --org (required), --data, --days (7), --out (stdout), --open-prs, --stale-prs, --seed-scores, --dashboard-url." },
      { flag: "inbox", default: "", detail: "Build the org-wide prioritised pull request inbox. --org (required), --out (dist), --max-pages (10), --token." },
      { flag: "baseline", default: "", detail: "Compute the baseline later phases are measured against. --data, --org, --registry, --days (90), --out (baseline.json), --spend-total, --spend-currency (USD), --spend-grain (org)." },
      { flag: "roi", default: "", detail: "Build the page that sets review cost against what it caught. --data, --days (90), --out (roi.json), --html (roi.html), --spend-total, --spend-currency, --spend-grain (org), --spend-source." },
      { flag: "correlate", default: "", detail: "Research: whether ignoring a finding cost anything later. --data, --days (180), --window-days (30), --min-sample (10), --out (correlation.json)." },
      { flag: "score-seeds", default: "", detail: "Score a reviewer against the seeded corpus on a pull request. --repo and --pr (required), --window (4), --history, --baseline, --json, --token." },
    ],
    examples: [
      {
        title: "List the subcommands",
        commands: "npx redlinegate@latest metrics",
        output: `redline metrics <command>

  collect        pull review outcomes for merged pull requests across the org
  dashboard      build the telemetry dashboard page
  digest         build the weekly stakeholder digest as an Adaptive Card
  inbox          build the org-wide prioritised pull request inbox
  baseline       compute the baseline every roadmap phase is measured against
  roi            build the page that says what review cost against what it caught
  correlate      research: whether ignoring a finding cost anything
  score-seeds    score an automated reviewer against the seeded corpus

Run \`redline metrics <command> --help\` for its flags.`,
      },
      {
        title: "Reproduce the scheduled collection and dashboard, in the metrics repository",
        commands:
          "GH_TOKEN=<org-read-token> npx redlinegate@latest metrics collect --org acme --days 8 --out data\nnpx redlinegate@latest metrics dashboard --org acme --data data --out dist",
      },
    ],
    exitCodes: [
      EXIT_OK,
      { code: "2", meaning: "No subcommand, an unknown option, a missing required option, or a value of the wrong type." },
      { code: "4", meaning: "The run itself failed, for example on a bad token or an unreadable data file." },
    ],
    related: [
      { href: "/docs/telemetry", label: "Telemetry and validation" },
      { href: "/docs/scripts", label: "Scripts" },
      { href: "/docs/who-runs-what", label: "Who runs what" },
    ],
    source: "cli/metrics/options.ts",
  },
};
