# Redline

Engineering oversight layer for AI-assisted development at enterprise scale, built on
GitHub-native primitives: automated code review against versioned standards, branch
rulesets, reusable Actions workflows, and Pages. No servers, no SaaS, no per-seat fee
beyond the AI licences already paid for.

One system covering the full delivery loop: AI writes code, automated review against
versioned standards, readiness gates, decision log, org-wide inbox — plus the measurement
and distribution that let it evolve from data rather than opinion.

**Vendor-neutral.** The rules live once in `standards/` and render to GitHub Copilot,
OpenAI Codex / `AGENTS.md`, and Claude. A Cursor adapter exists but ships disabled
(`vendors.cursor.enabled: false` in `standards/manifest.json`). See
[docs/vendors.md](docs/vendors.md).

## What's in the box

| Path | What | Where it lives in production |
| --- | --- | --- |
| `standards/core.md` | Core standards: security, type safety, error handling, scope, and the severity output contract | source of truth — **the only file a human edits** |
| `standards/stacks/*.md` | Per-stack rules: javascript, react, react-native, nodejs, microservices, java, go, python, csharp, kotlin, swift, terraform | source of truth |
| `standards/manifest.json` | Stack globs, profiles, vendor toggles, standards version | source of truth |
| `cli/` | The `redline` CLI (`redline init`, `redline verify`) — detects the platform, renders standards, installs the gate | run via `npx redlinegate`, or `redline` once installed with `npm i -g redlinegate` |
| `.github/pull_request_template.md` | Readiness checklist + ADR link | every onboarded repo |
| `templates/repo-context.md` | Per-repo context template | reference only — a human copies it above the generated block in `AGENTS.md`; `redline init` never installs it |
| `templates/CODEOWNERS` | Reference shape of the CODEOWNERS pattern that makes `require_code_owner_review` real and protects the enforcement surface | `redline init` writes `.github/CODEOWNERS` on GitHub repos with equivalent content built in code — it does not read this file |
| `templates/redline.yml` | Thin caller installed as `.github/workflows/redline.yml` | every onboarded repo |
| `rulesets/redline-ruleset.json` | Reference shape of the per-repo branch ruleset: 1 human approval, thread resolution, automatic review, required `redline-gate / gate` check | nothing reads this file — `redline init` builds the equivalent ruleset at runtime |
| `rulesets/redline-org-ruleset.json` | Same rules applied org-wide by custom repository property — no per-repo drift | applied once at org level |
| `workflows/redline-gate.yml` | Reusable gate: checklist, ADR-for-big-diffs, dependency review, diff secret scan, label-aware aggregation | org `.github` repo |
| `workflows/redline-sync.yml` | Distributes standards, gate caller and template to onboarded repos as PRs. **Live** — runs `redline sync` on a push to `main` touching `standards/**`, `cli/render/**` or `templates/**`, and on `workflow_dispatch` | this (source) repo |
| `workflows/redline-collect.yml` + `scripts/collect-telemetry.mjs` | Nightly central pull of review outcomes across the org | `redline-metrics` repo |
| `workflows/weekly-digest.yml` + `scripts/build-digest.mjs` | Monday Teams digest as an Adaptive Card | `redline-metrics` repo |
| `workflows/inbox.yml` + `scripts/build-inbox.mjs` | Org-wide prioritised PR inbox on GitHub Pages | this (source) repo |
| `workflows/dashboard.yml` + `scripts/build-dashboard.mjs` | Static dashboard on Pages: acted-on rate, trends, seed recall history, the rule tuning queue | `redline-metrics` repo |
| `workflows/seed-canary.yml` | Weekly regression test of the reviewer itself: opens a seeded PR, scores it, closes it | `redline-metrics` repo |
| `workflows/verify-onboarding.yml` | Weekly re-verification of every onboarded repo; opens an issue on drift. **Live** — cron `0 6 * * 2`, plus `workflow_dispatch` | this (source) repo |
| `scripts/validate.mjs` | Bundle self-check, run by this repo's CI | this repo |
| `scripts/check-pins.mjs` | Re-resolves SHA-pinned actions against their upstream tag | this repo's CI |
| `scripts/assign-rule-ids.mjs` | Assigns and verifies the stable `<stack>/<slug>` id on every rule | this repo |
| `seeded/` | Recall corpus (16 stacks, 117 BLOCKER seeds) + precision corpus, scored by `scripts/score-seeds.mjs` | validation only, never merged |

## Language coverage vs org reality

Primary-language tally across the org's active repos (2026-09-01):
Java 187 · TypeScript 86 · Python 47 · JavaScript 32 · HCL 24 · C# 22 ·
Kotlin 14 · Swift 9 · Go 6. All covered — including plain JavaScript, which the
TypeScript-only globs previously missed. Shell/Dockerfile/Gherkin intentionally uncovered
(linters serve better than LLM review there).

## Onboard a repository

```sh
cd your-repo
npx redlinegate init
```

That is the whole procedure. With no flags, at a terminal, it asks before it writes:
which standards apply, where the repository lives, what runs your pull request checks,
which assistants should read the rules, what to install, and how hard the gate should
bite. Whatever it detected is preselected, so pressing enter through it accepts detection,
and the last question offers **Dry run** before Apply.

Choose Apply and it renders the standards, installs the merge-readiness template and the
gate (advisory — it reports, it does not block), turns on the security floor, and opens a
pull request on `redline/onboard`. It never pushes to your default branch, so `git status`
stays clean. Anything that needed repository admin rights you do not have is listed at the
end for an administrator to run.

In CI, in a pipe, or with any flag present it prompts for nothing and takes the scripted
path — a prompt in a pipeline is a hang with nobody there to answer it:

```sh
npx redlinegate init --dry-run                 # the plan; writes nothing, contacts no host
npx redlinegate init --profile web-react,infra # a React app with its own Terraform beside it
npx redlinegate init --pipeline azure-pipelines  # on GitHub, but built by Azure Pipelines
```

Install it once and the everyday command is shorter:

```sh
npm i -g redlinegate
redline verify
```

The package is named `redlinegate`, not `redline` — that name is already taken on the public
npm registry by an unrelated package, so `npx redline …` always resolves to the wrong thing.
The binary it installs is named `redline`, which is why the everyday command reads `redline
init` / `redline verify` once it is installed rather than `redlinegate init`.

`redline verify` checks the repository still matches what it claims. Run it any time.
Estate-wide re-verification runs on a schedule from `workflows/verify-onboarding.yml`
(weekly, Tuesday 06:00 UTC) against the register, and opens one tracking issue on drift.

Both GitHub and Azure DevOps are supported. Redline detects which from your git remote.

## The whole command surface

`init` and `verify` are what a repository uses day to day, but they are two of eleven.
`redline --help` prints every flag; this is the map.

**In a repository you are standing in:**

| Command | What it does |
| --- | --- |
| `redline init` | Onboard: render standards, apply the security floor, install the gate (advisory), register. Idempotent — a re-run reconciles |
| `redline status` | What is installed here, how hard it bites, what an administrator still owes you, and whether the standards have moved on. Reads the checkout only — no credential, no host |
| `redline verify` | Check the repository still matches what `.redline.json` claims. `--repo owner/name` checks over the API with no checkout; `--json` for a wrapper |
| `redline review` | Review a change against **only** the rules its files touch. `--engine embedded` (default) hands the bounded prompt to the assistant running it; `--engine api` calls a configured endpoint, local or hosted. Findings never reach rule-tuning telemetry |
| `redline explain <rule-id>` | What a rule means, who decided it, which files it scopes to, which profiles receive it. `--list` prints every id with its severity |
| `redline remove` | Take Redline back out, as a pull request. Only content it can prove it wrote; the security floor is the org's minimum and no flag here turns it off |

**What the gate calls** (no model, deterministic, exit code is the answer):

| Command | What it does |
| --- | --- |
| `redline policy --diff-file <path>` | Evaluate the rules a checker can decide without a model call. Exit 1 on a BLOCKER |
| `redline exempt --body-file <path>` | Decide whether a pull request carries a *valid* exemption for a failing process check — a reason, an actor and an expiry, not a bare label |

**Estate-level, from a checkout of this repository:**

| Command | What it does |
| --- | --- |
| `redline sync` | Open a pull request on every registered repository whose standards are behind. `--dry-run` prints the plan and opens nothing; `--repo` for one; `--force` to re-render one already current |
| `redline registry` | Derive the register of onboarded repositories by walking the org. Runs nightly in the source repo |
| `redline metrics <cmd>` | The measurement plane: `collect`, `dashboard`, `digest`, `inbox`, `baseline`, `roi`, `correlate`, `score-seeds`. `redline metrics <cmd> --help` for flags |

Two things worth knowing before you reach for these:

- **`redline status` is the cheapest question you can ask.** It contacts no host and needs
  no credential, so it is the right first command on an unfamiliar repository — it will
  tell you it is not onboarded rather than failing at an API call.
- **`redline explain` is how a finding becomes actionable.** Every finding cites a rule id
  in brackets; paste it into `explain` and you get the rule, its source line in
  `standards/`, and the profiles it reaches. That closes the loop between a comment on a
  pull request and the file a human edits to change it.

## Is it working?

Redline's hardest failure mode is not breaking — it is running, looking green, and doing
nothing. Each checkpoint below has a command that proves it, and a quiet failure that
looks identical from the outside. The long version, with the numbers to expect, is
[docs/success](https://redline-gate.vercel.app/docs/success).

| Question | Command | Quiet failure it rules out |
| --- | --- | --- |
| What is installed here? | `redline status` | A non-empty `pendingAdmin` nobody read — the files landed, the merge policy never applied. Fix with `--repair` once an admin grants the rights |
| Does the host agree? | `redline verify` | A required check whose name nothing reports: every PR stuck on "Expected — waiting for status" forever |
| What does this finding mean? | `redline explain <id>` | An id `explain --list` does not know was invented by the model, and every aggregate keyed on it is fiction |
| Would this diff pass? | `redline review` | — run it before you push, against only the rules your files touch |
| Who is onboarded? | `redline registry` | A register nobody derived, so `sync` reaches a stale list |
| Is review being acted on? | `redline metrics dashboard` | Review running and being ignored. The hero number is **findings acted on**; the rule tuning queue names the rules responsible |
| Does it still catch defects? | `redline metrics score-seeds` | "No findings" and "nothing to find" are indistinguishable without it. Recall below 100% means do not widen the rollout |
| What did it cost? | `redline metrics roi` | Spend measured against what was caught — it refuses to answer a per-repo question with an org-wide figure |

A dashboard built in week one is empty, and that is a sample size, not a failure. Nothing
in the measurement plane reports a number it could not compute: a missing figure states
why rather than defaulting to zero, because filling gaps with zeros reports a stalled
collector as a quiet week.

**Where this honestly stands:** no seed scores have been recorded yet. Until a recall
number exists, every repository is legitimately at `observe` or `warn`, and a blocking
rung is not something to reach for. See [CHANGELOG.md](CHANGELOG.md).

## Verify before you trust

The single most common silent failure in a system like this is a required status check
whose name nothing ever reports: every PR sits on "Expected — waiting for status" forever.

Reusable workflows report as `<caller job id> / <called job id>`. Here that is
**`redline-gate / gate`**, and the name is pinned in two places: the ruleset JSON's
reference shape, and `scripts/validate.mjs` (CI fails if the job is renamed).
On GitHub, whether `redline init` makes it a *required* check depends on `--blocking`:
the default advisory install adds no `required_status_checks` rule at all, but
`redline init --blocking` writes `redline-gate / gate` into the ruleset
(`cli/platforms/github/install.ts`'s `REQUIRED_CHECK` constant, not a caller-supplied
value). `redline verify` reads back whatever the host currently has required and compares
it to what actually reported on the latest pull request: on a blocking install this is a
real assertion, failing if the check is required but never reported; on the default
advisory install nothing is required yet, so `verify` only surfaces the reported name for
a human to eyeball. See [CHANGELOG.md](CHANGELOG.md) known limitation 5. Run it on every
onboarded repo either way.

## Making a change to the standards

```sh
$EDITOR standards/stacks/react.md          # 1. edit the source, never the output
node scripts/assign-rule-ids.mjs           # 2. give any new rule a permanent id
$EDITOR standards/manifest.json            # 3. bump version
node scripts/render-self.mjs               # 4. re-render this repo's own artifacts
node scripts/validate.mjs                  # 5. self-check
$EDITOR CHANGELOG.md                       # 6. say what changed and why
```

Rule ids are permanent. Reword a rule freely; never edit its id, or every historical
telemetry record for it orphans and the tuning history resets.

Merging that change to `main` triggers `workflows/redline-sync.yml`, which runs `redline
sync` and opens a pull request on every registered repository whose standards are behind.
Rehearse it first — `redline sync --dry-run` prints the plan and opens nothing. Redline
never pushes to a default branch; every change lands as a pull request a team reviews and
merges itself.

## Two version axes

Redline carries two versions that move independently. Do not conflate them.

| Axis | Lives in | Bumped by | Example |
| --- | --- | --- | --- |
| **CLI version** | `redlinegate` on npm (git `v*` tags) | semantic-release, from conventional commits on `main` | `0.0.2` |
| **Standards version** | `standards/manifest.json` → `version` | A human, in the same PR as the rule change (see above) | `0.0.2` |

The CLI version is the tool's release line: [CHANGELOG.md](CHANGELOG.md) tracks it, and
semantic-release computes the next one from commit messages — never edit
`package.json`'s `version` by hand. The standards version is the rules' release line:
sync PRs and rendered artifacts quote it, so a repo always knows which ruleset it is
running. A CLI release does not imply a standards change, and vice versa.

Each onboarded repo's `.redline.json` records both — `cliVersion` (the tool that
onboarded it) and `standardsVersion` (the ruleset it was rendered from) — so `redline
verify` can tell "old tool" apart from "old rules".

Releases publish from `.github/workflows/release.yml`: every same-repo PR checks that
the pinned release toolchain still resolves from the lockfile (`semantic-release
--dry-run`, which exits early on PR context — no secrets in the job), a manual
`workflow_dispatch` rehearses the real publish path with a throwaway build on the npm
`canary` dist-tag without touching `latest`, and the real publish on `main` runs the
exact semantic-release version pinned in the lockfile.

## Why this works at enterprise scale

- **Feedback loop that measures the right thing.** Every rule carries a permanent id,
  every finding cites one, and telemetry records not just how often a rule fired but how
  often it was *acted on* — resolved threads versus findings left stale and outdated. The
  dashboard turns that into a tuning queue: the specific rules to cut, named. See
  [docs/measurement.md](docs/measurement.md).
- **The reviewer itself is regression-tested.** A weekly canary opens a PR of known-bad
  code against a pilot repo, scores what came back against 117 seeded BLOCKER defects and
  a corpus of correct code that must draw zero comments, then closes it. "No findings"
  and "nothing to find" are otherwise indistinguishable.
- **Distribution.** One source of truth, rendered per profile. `redline sync` lands the
  current standards on every registered repository as a reviewable pull request, driven
  off the register `redline registry` derives nightly from the estate. Never copy-paste
  per project, never a stale rule file left behind when a repo changes stack.
- **Hard enforcement.** Org-level ruleset plus a required check that is name-verified.
  CODEOWNERS on the enforcement surface, so nobody can weaken their own gate unreviewed.
- **A real security floor.** Secret scanning with push protection, Dependabot alerts,
  dependency review and a diff secret scan — enabled by `redline init`, not assumed.
  Security checks in the gate can never be label-exempted. On GitHub, that is; see
  [CHANGELOG.md](CHANGELOG.md) for what Azure DevOps does not yet get at the gate.
- **Least privilege.** Telemetry is pulled centrally with a read-only token. Onboarding a
  repo grants Redline no write access to it.
- **Enterprise shape.** Per-stack rule composition, human approval always required, full
  audit trail native to GitHub.

## Design decisions

- Automated review is **advisory input to a human**, never the approver. The ruleset
  requires one human approval regardless, and `validate.mjs` fails if that is ever
  lowered to zero.
- Standards carry an explicit **output contract** (`Redline/BLOCKER:` …). Without it,
  severity is unparseable and every metric downstream is a guess.
- Standards carry explicit **What NOT to flag** sections — AI review dies by nitpick
  spam, so noise control is a first-class rule and a measured one.
- Everything distributes as **PRs, never pushes** — teams see and own changes to their
  gates.
- The gate separates **process checks from security checks**. `redline-exempt` downgrades
  the checklist and ADR requirements to warnings for a reviewer who accepts the
  trade-off; it does nothing to dependency review or the secret scan.
- **Profiles, not glob negation.** Rule sets that would contradict each other are never
  installed in the same repo, so no rule depends on unsupported negation syntax.
