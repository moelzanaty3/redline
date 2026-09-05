// The commands a person types in a repository they are standing in. All six are
// built; `built` stays on the type because the estate-level commands (metrics,
// registry) are documented elsewhere and this shape is shared with them, and
// because a command that is later specified ahead of its implementation should
// be documented as unbuilt rather than omitted — "does redline review exist?"
// is a question people ask, and a page that lacks the answer reads as an
// oversight instead of a decision.
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
        flag: "--rung <name>",
        detail:
          "Where this repository sits on the enforcement ladder: observe, warn, block-blocker, block-high. A PROMOTION needs recorded evidence — seed BLOCKER recall at 100%, no false positive on the clean corpus, an acted-on rate above the threshold, and a sample large enough that the rate is not a coincidence — and is refused with the specific reason when the evidence is not there. A DEMOTION needs nothing at all: a repository whose gate is misfiring at 3am must be able to step back without waiting for anyone, and a ladder that made the safe direction hard would be switched off entirely rather than stepped down. Omitting the flag keeps whatever the repository already recorded, because a re-run for an unrelated reason silently promoting a repository is how a ladder loses the trust it exists to build.",
      },
      {
        flag: "--blocking",
        detail:
          "The older, binary switch: advisory or blocking. Prefer --rung, which is the same decision with evidence behind it and a step between.",
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
      "Nothing to install: it ships with the CLI. It runs against the current checkout by default, or against any repository over the API with --repo owner/name — which is what lets the weekly drift sweep verify the whole estate without cloning it.",
    usage: [
      "redline verify                        # report drift in this checkout",
      "redline verify --repo acme/web-app    # over the API, no checkout needed",
      "redline verify --gate                 # run as the Azure DevOps merge gate",
    ],
    flags: [
      {
        flag: "--repo <owner/name>",
        detail:
          "Verifies a repository over the API. Every check that can be sourced from the host is; one that genuinely needs a working tree reports ?? rather than passing, and an ?? never fails the report. That distinction is what makes this safe to schedule across an estate — a check reported as passing when it never ran is a false all-clear on every repository at once.",
      },
      {
        flag: "--gate",
        detail:
          "The mode the Azure pipeline template invokes. Materially weaker than the GitHub gate: it runs none of GitHub's dependency review or diff secret scan, which are the two hard-fail, never-exemptible checks there. It publishes this repository's own merge status, so it is refused together with --repo rather than silently ignoring one of them.",
      },
    ],
    output:
      "One line per check: ok, FAIL, or ?? for a check that could not run. Findings name what was checked and what was found — a gate that no longer publishes its check, a merge policy that exists but was switched out of enforcement, zero required approvals, artifacts left stale by an ignored sync pull request, work still waiting on an administrator. Exit 0 when clean, 1 on drift, 2 when the repository was never onboarded — a distinction that matters, because those two need different people to act.",
    edit: "cli/commands/verify.ts for the local path and cli/verify/remote.ts for --repo. Both parse the gate caller with the same function, deliberately: two independent answers to \"what does this file publish\" would eventually disagree, and that disagreement is the difference between a repository reported healthy and one reported broken.",
  },
  policy: {
    what: "Evaluates the rules a checker can decide, with no model call. A share of what the standard asserts needs no judgement — a ticket reference is present or it is not, a suppression carries one or it does not — and sending those to an LLM costs tokens and invites a false positive on a fact, which is the worst kind: an author cannot argue with a model about whether the word TODO appears.",
    built: true,
    onboard:
      "Nothing to install. The gate runs it as the `policy` job on every pull request. Which rules it evaluates is decided by standards/manifest.json → deterministic, not by the checker: a rule with an implementation but no classification does not run.",
    usage: [
      "git diff main...HEAD > change.diff",
      "redline policy --diff-file change.diff              # exit 1 on a BLOCKER",
      "redline policy --diff-file change.diff --fail-on HIGH",
    ],
    flags: [
      {
        flag: "--diff-file <path>",
        detail:
          "A unified diff. Only ADDED lines are examined, and that is a rule rather than an optimisation: flagging an existing `var` in a file the author merely renamed is exactly the noise the standard's \"what NOT to flag\" section forbids, and an author who is right to ignore one finding learns to ignore the next.",
      },
      {
        flag: "--fail-on <severity>",
        detail:
          "The floor, BLOCKER by default. Deliberately not HIGH: a deterministic tier that failed merges over a missing ticket reference on day one would be switched off by week two, and then nothing it decides is enforced at all.",
      },
    ],
    output:
      "One finding per violation in the output contract — severity, rule id, and the problem — each with the file and line a reviewer can open. The run always states how many rules were evaluated, including when it found nothing: silence has to be distinguishable from not having checked. A rule the manifest classifies as deterministic but which has no implementation is warned about by name, because a rule everyone believes is machine-checked and is in fact checked by nobody is worse than one left to the model.",
    edit: "cli/policy/checks.ts holds the checks and cli/policy/diff.ts the diff parse. The classification lives in standards/manifest.json → deterministic, NOT in the markdown: standards/*.md is what a reviewer reads, and removing a rule from it because a checker also covers it would narrow what the model considers. scripts/validate.mjs fails the build if a classified rule has no check.",
  },
  exempt: {
    what: "Decides whether a pull request carries a valid exemption for a failing process check. The gate calls it; you rarely will. It exists because `redline-exempt` was a bare label that recorded nothing — not who accepted the failing check, not why, not until when.",
    built: true,
    onboard:
      "Nothing to install. The gate invokes it when a soft-fail label is present and a process check has failed, and the pull request template carries the `## Redline exemption` section an author fills in. A repository moves from `warn` to `require` one standards version after the block was introduced, so nobody's open pull request is failed by a rule that did not exist when they opened it.",
    usage: [
      "redline exempt --body-file pr-body.md                 # is there a valid exemption at all?",
      "redline exempt --body-file pr-body.md --scope adr     # does it cover this check?",
    ],
    flags: [
      {
        flag: "--body-file <path>",
        detail:
          "The pull request body, as a file. A file rather than an argument on purpose: a pull request body is attacker-controlled text full of backticks and $(...), and anyone who can open a pull request can write it — interpolating that into a command is how a body becomes a command.",
      },
      {
        flag: "--scope <check>",
        detail:
          "The failing check the exemption is being asked to cover. An exemption scoped to `checklist` does not silently cover `adr`; omitting `scope:` in the block covers both, which is what the bare label meant implicitly.",
      },
    ],
    output:
      "Exit 0 and a line naming the expiry, scope and reason when a valid exemption applies. Exit 1 and the specific problem when it does not — no block at all, a reason under 20 characters, a missing or unparseable expiry, an expiry in the past, an expiry more than 90 days out, or a scope that does not cover the failing check. Exit 1, not 2: a pull request without a valid exemption is a normal answer the gate acts on, not the caller misusing the command.",
    edit: "cli/exempt/parse.ts holds the parse; scripts/lib/exemptions.mjs mirrors it for the collector, which runs in the metrics repo with no build step to import from. scripts/validate.mjs fails the build if the two diverge — the failure it guards is the gate accepting a block the audit cannot read, which is exactly the state this piece exists to end.",
  },
  sync: {
    what: "Lands the current standards on every registered repository as a pull request, quoting the version it came from. Targets come from registry.json, the register derived nightly from the estate — nobody maintains a list.",
    built: true,
    onboard:
      "Nothing to install in a product repository: sync runs in the Redline source repo, on a push to standards/ and on demand. It needs REDLINE_SYNC_TOKEN with contents:write, pull_requests:write and workflows:write on every target — without the workflows scope the push of .github/workflows/redline.yml is rejected and the whole pull request fails.",
    usage: [
      "redline sync --dry-run              # print the plan; pushes nothing, opens nothing",
      "redline sync                        # open a pull request on every repo that is behind",
      "redline sync --repo acme/web-app    # one repository",
      "redline sync --force                # re-render a repo already at the current version",
    ],
    flags: [
      {
        flag: "--dry-run",
        detail:
          "Plans and renders but never pushes a branch or opens a pull request. Unlike redline init --dry-run it still reads from the host — it has to fetch each target's .redline.json and current artifacts to know what would change — so it needs a read credential.",
      },
      {
        flag: "--repo <owner/name>",
        detail:
          "One repository instead of the estate. Every other registered repository is reported as skipped with the reason, so a narrowed run still shows you the whole picture.",
      },
      {
        flag: "--force",
        detail:
          "Re-renders a repository already recording the current standards version. For a renderer change that alters output without moving the standards version — otherwise nothing would be behind and nothing would sync.",
      },
    ],
    output:
      "One pull request per target that is behind, titled with the standards version and listing the generated files it changes. A repository whose artifacts already match gets nothing — no branch, no empty pull request. A target with an unmerged sync pull request already open has its branch updated and that pull request's body refreshed, never a second one opened. One unreachable repository is reported and the rest of the estate still syncs, but the run exits non-zero, because a distribution that reports success while missing repositories is how coverage silently rots.",
    edit: "cli/sync/ — plan.ts decides who is behind, render.ts produces each target's artifacts, run.ts drives the estate. The host calls live in cli/platforms/github/push.ts.",
  },
  review: {
    what: "Reviews a change against ONLY the rules that apply to the files it touches. Anyone can ask an assistant to review a diff; what this adds is the bound — a model handed the composed standard for a twelve-stack profile spends most of its attention on languages the diff never touches, and the findings get worse rather than better.",
    built: true,
    onboard:
      "Nothing to install. It reads the profile from the repository's .redline.json, or takes --profile. The embedded engine is the default and calls no model at all: it emits the bounded prompt for the assistant already running the command, which is the common case in Claude Code, Copilot or Cursor. --engine api makes the CLI call an endpoint itself.",
    usage: [
      "redline review                                  # working tree against the merge base",
      "redline review --staged                         # staged changes, before you commit",
      "redline review --diff-file change.diff          # any unified diff",
      "redline review --engine api --model qwen2.5-coder:14b   # a local model, no data leaves the machine",
      "redline review --engine api --provider anthropic --model <id>",
    ],
    flags: [
      {
        flag: "--engine embedded | api",
        detail:
          "embedded (the default) hands the prompt back for the assistant running the command to apply. That is the design, not a stub: the CLI is usually being run BY an assistant that already has a model and a context, and calling a second model from inside that session pays twice for a worse answer. api makes the CLI call an endpoint — OpenAI-compatible or Anthropic.",
      },
      {
        flag: "--provider openai | anthropic, --model, --base-url",
        detail:
          "openai covers every OpenAI-compatible endpoint, which is the fully local case for free: Ollama, LM Studio and vLLM all expose it, and a local endpoint needs no API key. That matters — a review that has to send a diff to a third party is a review several markets cannot run at all. The model is never baked in: one that is would be a model nobody can change when it is deprecated or when a regulator objects.",
      },
      {
        flag: "--base <ref>",
        detail:
          "What to diff against, the repository's default branch otherwise. The comparison is a three-dot merge-base diff: two dots would hand the model every commit that landed on the base branch since yours started, and it would dutifully review someone else's work.",
      },
    ],
    output:
      "One line per finding in the output contract, with the file and line. The CLI renders that line itself from the validated rule id and severity — a model that writes the prefix will eventually write a severity that does not exist or an id it invented, and every aggregate keyed on that line becomes fiction. A finding citing a rule the prompt did not carry is discarded with the reason said out loud. A changed file no stack covers is reported too, because that is a gap in the standard and reviewing it against core alone while saying nothing hides it. It always exits 0: a non-zero exit would invite someone to wire this into CI as a second gate, where it would enforce nothing while looking like it did.",
    edit: "cli/review/ — scope.ts resolves the applicable rules, prompt.ts builds the bounded prompt, schema.ts is the published findings contract, engines/ holds the two engines. Local findings are excluded from rule-tuning telemetry by construction and the report says so on every run: a local run has no thread to resolve and no reviewer to attribute, so counting it would compute acted-on rate partly from runs nobody can verify.",
  },
};
