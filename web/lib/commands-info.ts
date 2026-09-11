// Every command the CLI has, including the two that act on the estate rather
// than on a repository. All eleven are built; `built` stays on the type because
// a command that is later specified ahead of its implementation should be
// documented as unbuilt rather than omitted — "does redline review exist?" is a
// question people ask, and a page that lacks the answer reads as an oversight
// instead of a decision.
//
// The set here is the set `redline --help` prints. That is the invariant worth
// keeping: a command that exists and is documented nowhere is one nobody runs.
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
      "Run it from inside the repository you are onboarding, with no flags. At a terminal it walks a menu — standards, host, what runs your checks, which assistants, what to install, how hard the gate bites — with whatever it detected preselected and every term explained beside the choice that uses it. The last question offers Dry run before Apply. In CI, in a pipe, or with any flag present it prompts for nothing and behaves exactly as it always did. On GitHub it resolves the org's reusable gate in the .github repo BEFORE writing the caller that references it: if that workflow does not exist, no caller is written and the gate is recorded as awaiting an administrator, because a workflow that cannot start is a red X on every pull request that looks like Redline working.",
    usage: [
      "redline init                          # walk the menu; Dry run offered before Apply",
      "redline init --dry-run                # print the plan; writes nothing, contacts no host",
      "redline init --profile web-react      # name the profile instead of detecting it",
      "redline init --profile web-react,infra  # a React app with its own Terraform beside it",
      "redline init --pipeline azure-pipelines  # on GitHub, but built by Azure Pipelines",
      "redline init --vendors claude,copilot # render for these AI tools only",
      "redline init --blocking               # promote the gate from advisory to blocking",
      "redline init --skip gate              # this repository has its own; do not install one",
      "redline init --with review-ownership  # also seed CODEOWNERS; off unless asked for",
      "redline init --no-speckit             # drop the spec-first context section",
      "redline init --tmf                    # add the TM Forum context section",
      "redline init --repair                 # re-apply every capability on an already-onboarded repo",
    ],
    flags: [
      {
        flag: "(no flags)",
        detail:
          "At a terminal, walks the menu. Every question preselects what detection found and explains its own terms — what a rung is, what a capability installs, which tool already covers a check. The standards and assistants questions are multi-selects: a repository is routinely more than one profile, and a vendor the organisation has disabled is listed greyed with the reason rather than hidden. The last question offers Dry run before Apply, so the first run can see the whole plan without writing anything. Any flag, a pipe, or CI suppresses it — a prompt in a pipeline is a hang with nobody there to answer it. REDLINE_NO_PROMPT=1 forces the scripted path.",
      },
      {
        flag: "--profile <list>",
        detail:
          "One profile, or several separated by commas, whose stacks render together: a React application with its own Terraform beside it is web,infra, and a single choice made it pick the half that fitted worst. The recorded name is sorted and de-duplicated, so the order you type cannot change the artifacts. Omitted, the stack is detected from the checkout.",
      },
      {
        flag: "--pipeline <name>",
        detail:
          "github-actions or azure-pipelines — what actually runs this repository's pull request checks, asked separately from the host because the two come apart. A repository can live on GitHub and be built entirely by Azure Pipelines; deriving one from the other is what put an Actions workflow into a repository that runs no Actions. On a GitHub host, azure-pipelines writes an Azure pipeline definition with the pr: trigger GitHub-hosted repositories honour, and reports that a human still has to register it once — the build result is the check GitHub reads, so there is no status to post and no Build Validation policy to attach.",
      },
      {
        flag: "--dry-run",
        detail:
          "Prints the plan and writes nothing. It needs no credential and contacts no host, which makes it the safe way to see what onboarding would do to a repository you do not own.",
      },
      {
        flag: "--skip <list> / --with <list>",
        detail:
          "Deselects or re-selects a capability the repository already has its own answer for: gate, merge-policy, labels, review-ownership. A deselected capability is not attempted, not written and not reported as missing. review-ownership is the one that starts deselected — a CODEOWNERS file names owners Redline cannot verify exist, and a ruleset requiring code-owner review with no resolvable owner blocks every pull request in the repository, so it is written only when --with review-ownership asks for it. The security floor cannot be skipped — it is the org-wide minimum and is refused by name rather than recorded.",
      },
      {
        flag: "--speckit / --no-speckit, --tmf / --no-tmf",
        detail:
          "The optional context sections rendered into the standards artifacts beside the rules — background about how this repository works, not rules with ids. speckit says the repository is spec-first and is on by default; it is dropped automatically, with a note in the report, where the repository already runs Spec Kit, which is a separate tool with its own installer that Redline neither creates nor edits. tmf says the repository implements TM Forum interfaces and is off unless asked for. The selection is reversible: passing the negative on a later run removes a section already rendered, because the block is regenerated rather than appended to.",
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
      "Rendered standards artifacts for the detected vendors, the gate caller workflow, a pull request template, and .redline.json recording the profile, vendors, capability selections and onboarding date. The template is written only where the host would resolve none; a template the repository wrote for itself is never edited, and if it lacks a section the gate's checklist job reads, the run says so by name and tells you to add it or deselect the gate — a red check the install could have predicted is worse than a blunt sentence during onboarding. CODEOWNERS is written only under --with review-ownership. Anything it could not apply for lack of rights is recorded as a pendingAdmin entry rather than reported as success. Exit codes follow the CLI's own contract: 1 failed, 2 usage, 3 permission, 4 host.",
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
  remove: {
    what: "Takes Redline back out of a repository: the rendered standards, the gate machinery, the slash-command files, the host state init applied, and .redline.json last of all. It lands as a pull request on its own branch, exactly as onboarding does — backing out changes how this repository is reviewed and merged, which is a decision its own team reviews rather than one a command makes on a laptop.",
    built: true,
    onboard:
      "Nothing to install: it ships with the CLI. Run it from inside the repository, the same way as init — it reads .redline.json to know what was installed, and the git remote to know which host to withdraw from. A repository that was never onboarded exits 2 with \"nothing to remove\" rather than crashing.",
    usage: [
      "redline remove --dry-run              # print the plan; writes nothing, contacts no host",
      "redline remove                        # open the removal pull request",
    ],
    flags: [
      {
        flag: "--dry-run",
        detail:
          "Prints exactly the plan it would carry out and changes nothing — no file, no host setting, no branch. It needs no credential and contacts no host, which is what lets someone evaluating Redline find out what backing it out would cost before they adopt it. That question gets asked in the first five minutes, and \"by hand, and we haven't told you how\" is not an answer.",
      },
    ],
    output:
      "One line per path, saying whether it was removed outright, had only its REDLINE block taken out, or was left in place — and why, in every case. Nothing is deleted that Redline cannot prove it wrote: proof is the redline- prefix at a path a vendor's own prune rule owns, a REDLINE:BEGIN/END pair, the \"Managed by Redline\" attribution line, or a content identifier .redline.json recorded when Redline last wrote those bytes. A merged file keeps every byte outside its block; a file whose markers are half-edited is left completely alone and named, the same refusal the renderer already makes. A pre-existing CODEOWNERS, a workflow that carries no Redline attribution, and .redline/local.md are never touched. Host state Redline applied — the branch ruleset and its required check, the labels still carrying the descriptions Redline gave them, the repository property — is withdrawn; a capability the token cannot reach is reported denied and listed as needing an administrator, never silently skipped. The security floor is NOT withdrawn and there is no flag that withdraws it: secret scanning, push protection and dependency alerts are the organisation's minimum rather than Redline's own state, and removing Redline is not a reason to lower a repository's security. .redline.json goes last, and the report says what that means — redline verify stops recognising the repository and reports it as never onboarded.",
    edit: "cli/commands/remove.ts for the plan and the file work, cli/remove/host.ts for the host withdrawal. The removal surface is taken from the renderers themselves — each vendor's own PruneRule and merge flags — rather than restated, because a second list of those paths would drift from what init writes, and the entry that drifted out of it is the artifact nobody ever removes.",
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
    what: "Reviews a change against ONLY the rules that apply to the files it touches. Anyone can ask an assistant to review a diff; what this adds is the bound — a model handed the composed standard for a sixteen-stack profile spends most of its attention on languages the diff never touches, and the findings get worse rather than better.",
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
  status: {
    what: "Answers \"what is Redline doing in this repository?\" from the checkout alone. What is installed, which rung the gate sits at, what an administrator still owes you, and whether the standards this CLI carries have moved on from the ones the repository was rendered against.",
    built: true,
    onboard:
      "Nothing to install, and nothing to authorise. It reads .redline.json and the rendered artifacts in the working tree — it contacts no host and needs no credential, which is what makes it the right first command on a repository you have not seen before. On a repository that was never onboarded it says so and names the next command rather than failing at an API call it should not have attempted.",
    usage: [
      "redline status                        # what is installed here",
      "redline status --json                 # the same, for a wrapper that has to act on it",
    ],
    flags: [
      {
        flag: "--json",
        detail:
          "The whole report as a stable object — onboarded, profile, stacks, host, rung, vendors, capabilities, integrations, pendingAdmin, standardsVersion against currentStandards, drifted, and the two timestamps. Shaped so a script can branch on `drifted` or on a non-empty `pendingAdmin` without parsing prose.",
      },
    ],
    output:
      "Three or four lines on a healthy repository, naming the profile, the rung and the standards version it was rendered from. Two things it will not do: it will not report a repository healthy on the strength of a check it could not run, and it will not claim a host setting it never read — everything here comes from the working tree, so a ruleset edited by hand in the GitHub UI is invisible to it by design. That is what `redline verify` is for, and status says so rather than implying it covered it.",
    edit: "cli/commands/status.ts, reading cli/config/redline-json.ts for the recorded state and cli/render/manifest.ts for the standards version to compare against. The drift comparison is a version comparison, not a content diff: a repository that re-rendered from the same version is current even if a human has since edited an artifact, which is the case `redline verify` catches.",
  },
  explain: {
    what: "Turns the bracketed rule id in a finding back into the rule, the file it is defined in, and the profiles that receive it. Every finding Redline posts cites an id; this is the command that makes that id mean something to the person who has to act on it.",
    built: true,
    onboard:
      "Nothing to install. The rule catalogue is compiled from standards/ inside the CLI, so explain works in any directory — including one that has never been onboarded. It is the fastest route from a comment on a pull request to the line in standards/ a human would edit to change the rule.",
    usage: [
      "redline explain core/hardcoded-secrets    # what this rule is and where it came from",
      "redline explain --list                    # every rule id in the standards, with severity",
      "redline explain react/effect-derived-state --json",
    ],
    flags: [
      {
        flag: "--list",
        detail:
          "Every id in the standards with its severity, which is how you find the id you half-remember. It is also the check that a finding cited a real rule: an id that does not appear here was invented by the model, and the output contract treats it as untagged.",
      },
      {
        flag: "--json",
        detail:
          "The rule (id, stack, severity, text, source file and line) plus the full profile list. The source line is what makes this actionable — it is the exact place in standards/ to edit, not a paraphrase of it.",
      },
    ],
    output:
      "Severity and id, the rule text, then four attributions: who decided it, the standards file and line it is defined at, which files it is scoped to, and every profile that receives it. An unknown id is an error that names `--list` rather than a guess at what you meant — a rule explained approximately is worse than one not explained, because the reader acts on it.",
    edit: "cli/rules/catalogue.ts compiles the catalogue from standards/; the command surface is in cli/bin/redline.ts. Ids are permanent by design — reword a rule freely, but never edit its id, or every historical telemetry record for it orphans and its tuning history resets to nothing.",
  },
  registry: {
    what: "Derives the register of onboarded repositories by walking the organisation and reading the .redline.json each one carries. It is the input both redline sync and the estate dashboard run off — sync needs to know who to open a pull request on, and coverage needs to know the denominator.",
    built: true,
    onboard:
      "It runs in the source repository, nightly, from workflows/registry.yml — not in a product repository, where it would be meaningless. It needs a token with org read access and nothing more: the register is derived from what each repository already publishes about itself, so nothing here is hand-maintained. A repository that removes Redline stops appearing, and stops being a sync target, without anyone editing a list.",
    usage: [
      "redline registry --org acme --source acme/redline",
      "redline registry --org acme --source acme/redline --out registry.json",
    ],
    flags: [
      {
        flag: "--org <name>",
        detail: "The organisation to walk. Required — there is no default, because a default here would be a guess about whose estate you meant.",
      },
      {
        flag: "--source <owner/name>",
        detail:
          "This repository, recorded into the register so a consumer knows which estate the file describes. Required: a registry.json that does not say where it came from is one nobody can safely act on when two of them exist.",
      },
      {
        flag: "--token <string>, --out <path>",
        detail:
          "A token with org read access (or GH_TOKEN in the environment), and where to write the file — registry.json by default.",
      },
    ],
    output:
      "A JSON register of every onboarded repository with the profile, vendors, rung, capabilities and standards version each one recorded. Read-only on every repository it walks: deriving the register grants Redline no write access to anything in it.",
    edit: "cli/registry/discover.ts walks the org and reads each .redline.json; serialize.ts is the file shape. The register's contract matters more than its content — cli/sync/plan.ts and scripts/build-dashboard.mjs both consume it, so a field removed here goes missing in two places at once.",
  },
  metrics: {
    what: "The estate's measurement plane, as eight subcommands over the runners in scripts/. These act on an organisation or on its collected telemetry, never on the repository you are standing in — several of them are meaningless in a product repo, and each one says where it runs in its own --help rather than letting you find out the slow way.",
    built: true,
    onboard:
      "Mostly nothing you run by hand. collect, dashboard, digest and inbox are driven by the scheduled workflows in workflows/, in the metrics repo or the source repo; the CLI exists so the same run is reproducible in a terminal when a scheduled one looks wrong. baseline is run once, by a maintainer, before any of it means anything. What this layer adds over the runners is a front door: every flag has a type, a default and a help line, and an unknown value is refused by name instead of quietly becoming \"unknown\" inside a figure someone later quotes.",
    usage: [
      "redline metrics                                   # the eight subcommands",
      "redline metrics collect --help                    # and the flags for one",
      "redline metrics collect --org acme --days 8",
      "redline metrics dashboard --org acme --data data --out dist",
      "redline metrics digest --org acme --days 7",
      "redline metrics inbox --org acme --out dist",
      "redline metrics score-seeds --repo acme/pilot-web --pr 12 --history data/seed-scores.jsonl",
      "redline metrics roi --data data --spend-total 4200 --spend-grain org",
    ],
    flags: [
      {
        flag: "collect · dashboard · digest · inbox",
        detail:
          "The loop. collect pulls review outcomes for merged pull requests across the org with a read-only token; dashboard builds the static page (acted-on rate, trends, seed-recall history, the rule tuning queue); digest builds the weekly Adaptive Card; inbox builds the org-wide prioritised pull request page. Each is also a scheduled workflow — running one here reproduces that run.",
      },
      {
        flag: "score-seeds",
        detail:
          "Scores an automated reviewer against the seeded corpus on a pull request that carries it: recall, precision and attribution. --history appends to a JSONL so recall has a trend rather than a single reading, and --baseline records the first one as the line everything after is compared to. This is the command that tells \"no findings\" apart from \"nothing to find\".",
      },
      {
        flag: "baseline · roi · correlate",
        detail:
          "baseline computes the figures every later phase is judged against, once, from a maintainer terminal. roi sets what review cost against what it caught — and refuses to answer a per-repository question with an org-wide spend figure, which is why --spend-grain exists. correlate is explicitly research, not a loop: whether ignoring a finding cost anything later.",
      },
      {
        flag: "every flag has an environment variable",
        detail:
          "The runners under scripts/ are env-configured programs, so each flag maps to a documented variable (--days to DAYS, --data to DATA_DIR). The names are deliberately the same ones the workflows set, so somebody debugging a scheduled run reads one vocabulary and not two.",
      },
    ],
    output:
      "Per subcommand: JSONL telemetry, a static HTML page, an Adaptive Card, or a score. What none of them will do is invent a number — a figure that could not be computed states why instead of defaulting, because a measurement plane that fills gaps with zeros is one that reports a stalled collector as a quiet week.",
    edit: "cli/metrics/options.ts declares the whole flag surface as data — env name, type, default, help, and the accepted values for an enum. Adding a flag is a row in that table, and the tests assert the mapping (that --days 90 becomes DAYS=90, that --days banana is refused by name). The work itself stays in scripts/; this layer only configures and validates.",
  },
};
