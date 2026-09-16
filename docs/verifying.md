# Verifying your installation

Redline's hardest failure mode is not breaking. It is running, reporting green, and
looking at nothing. A gate that passed because the diff was empty, a hook git never
executed, a required check no build publishes — all four look identical from the outside,
and all four have happened.

So this page is not "check it installed". It is **break it on purpose and watch it
complain**. A green run you have never seen go red is not evidence.

Work through it once after onboarding. It takes about ten minutes and needs no
credential until step 6.

---

## 0. Can this machine run it at all?

```sh
redline doctor
```

Before asking what Redline installed, ask whether the tool can run here. `doctor`
contacts no host, needs no credential, and is the one command that still works on a Node
too old for the rest of them — which is the point, because that is exactly the machine
that needs the answer.

```
ok    node                   v22.11.0 — at or above the required 22
ok    git                    git version 2.50.1
ok    remote                 github — acme/widget
ok    credential             gh is logged in as octocat
warn  onboarded              no .redline.json here yet
        npx redlinegate init
```

Every line that is not `ok` prints the fix under it. The one worth knowing about in
advance:

**Node.** `npx redlinegate init` under Node 18 used to print npm's `EBADENGINE`
*warning* and then run anyway, so the first real symptom was a failure from inside a
dependency, partway through a command that had already written files. It now refuses,
and names three ways to run one command under a newer Node without touching a pin the
repository set deliberately:

```sh
volta run --node 22 -- npx redlinegate init
fnm exec --using 22 npx redlinegate init
nvm exec 22 npx redlinegate init
```

A `warn` is not a failure. `credential` warns on a machine that has deliberately not
logged in, and the preview commands — `redline init --dry-run`, `redline init
--no-commit` — are the ones that machine is meant to be running.

`redline doctor --json` for a wrapper that has to act on it.

---

## 1. What does it think it installed?

```sh
redline status
```

This contacts no host and needs no token, so it is the right first command anywhere.

```
profile      web-react (javascript, react)
host         github
checks       an agent on this machine — a pre-push hook, nothing on the host
rung         observe — findings are printed, the push is never blocked
assistants   copilot, agents
installed    gate, merge-policy, labels
standards    0.1.0 — current
onboarded    2026-09-15, last run 2026-09-15
```

Read three lines before anything else:

- **`checks`** — what actually runs them. If this says `GitHub Actions` on a repository
  built by Azure Pipelines, every later step is measuring a file nothing executes. Fix it
  with `redline init --pipeline azure-pipelines`.
- **`rung`** — how hard it bites. At `observe` and `warn` nothing is ever blocked. That is
  the correct place to start, but do not then go looking for a blocked merge.
- **`installed`** — if `gate` is absent, Redline installed no gate here and steps 3–5 have
  no subject.

A non-empty `pendingAdmin` line means the files landed but a repository setting did not.
It is a to-do list, not a failure — `redline init --repair` once an administrator has
granted the rights.

---

## 2. Do the deterministic rules fire at all?

This is the step people skip, and it is the one that catches the most.

**Know what you are testing first.** Only four rules can be decided without a model:

| Rule | Severity |
| --- | --- |
| `core/type-checker-suppression` | BLOCKER |
| `core/untracked-todo` | HIGH |
| `javascript/var-in-new-code` | HIGH |
| `javascript/unsafe-numeric-coercion` | HIGH |

Everything else in the standard — hardcoded secrets, SQL built by concatenation, missing
auth checks — is reviewed by a model, not by `redline policy`. **Testing the gate with a
hardcoded secret and seeing "no findings" is the single most common false alarm**, and it
is correct behaviour: that rule is real, it is just not one a checker decides.

Write a file that trips the ones that are:

```sh
cat > probe.js <<'EOF'
// TODO: no ticket here
var n = 0;
export const parse = (s) => parseInt(s);
EOF

git add probe.js
git diff --cached -- probe.js > /tmp/probe.patch
redline policy --diff-file /tmp/probe.patch
```

Expected — three findings, and **exit 0**:

```
probe.js:1
  Redline/HIGH [core/untracked-todo]: this TODO carries no ticket reference, so nothing
  will bring anyone back to it. Add the ticket id on the same line, or do the work now.
probe.js:2
  Redline/HIGH [javascript/var-in-new-code]: `var` is function-scoped and hoisted. Use
  `const`, or `let` where the binding is reassigned.
probe.js:3
  Redline/HIGH [javascript/unsafe-numeric-coercion]: `parseInt` without a radix. Pass 10
  explicitly: an input like "08" or "0x10" is otherwise parsed by a rule most readers do
  not have in mind.
3 finding(s) from 4 deterministic rule(s)
```

**The exit code answers "may this proceed", not "was anything found".** `policy` exits 1
only on a finding at or above its severity floor, which defaults to BLOCKER. Three HIGH
findings therefore exit 0. Prove the other half:

```sh
redline policy --diff-file /tmp/probe.patch --fail-on HIGH   # now exits 1
```

And prove a BLOCKER blocks by default:

```sh
printf '// @ts-ignore\nconst x: string = 1;\n' > sup.ts
git add sup.ts && git diff --cached -- sup.ts > /tmp/sup.patch
redline policy --diff-file /tmp/sup.patch   # Redline/BLOCKER, exits 1
```

The trailing count line is the important one. `4 rule(s) evaluated` means the checks ran;
`0 finding(s) from 4 deterministic rule(s)` means they ran and found nothing. If you ever
see findings you did not expect against files you did not write, see
[Redline's own files](#why-arent-redlines-own-files-flagged) below.

---

## 3. Does the gate actually refuse?

### If your gate is `local-agent` (a pre-push hook)

First prove git is even running it. The hook lives in the repository, but
`core.hooksPath` is per-clone configuration:

```sh
git config --get core.hooksPath     # must print .redline/hooks
ls -l .redline/hooks/pre-push       # must be executable: -rwxr-xr-x
```

If either is wrong the hook never runs and every push passes for the wrong reason. Both
are fixable in one line:

```sh
git config core.hooksPath .redline/hooks
```

**Every teammate runs that once in their own clone.** `redline init` does it for the clone
it ran in and nothing else — this is the honest cost of a gate that needs no CI.

Now push the probe file from step 2.

**At `observe` or `warn`** the findings print and the push proceeds:

```
redline: checking 4b825dc..a48bcb7
  Redline/HIGH [core/untracked-todo]: ...
  Redline/HIGH [javascript/var-in-new-code]: ...
redline: for the rules a checker cannot decide, ask your assistant:
         redline review --base 4b825dc...
```

Exit 0. That is not the gate failing — `observe` means measured and not yet enforced.

**At a blocking rung** the same push is refused. Note that `redline init --rung
block-blocker` will almost certainly **refuse** to promote you — that is the point of the
ladder, and it will tell you what is missing:

```
▲ enforcement stays at observe — cannot move to block-high:
  ▲ "observe" cannot jump to "block-high" — promote one rung at a time, through "warn"
  ▲ 50 reviewed pull requests are needed and 0 have been recorded
  ▲ the seeded corpus has never been scored for this stack
```

So to *test* enforcement, set the rung by hand, prove it, and put it back. The hook reads
`.redline.json` each time it runs, so no re-install is needed:

```sh
# temporarily, for this test only
node -e 'const f=".redline.json",fs=require("fs");const j=JSON.parse(fs.readFileSync(f,"utf8"));j.rung="block-high";fs.writeFileSync(f,JSON.stringify(j,null,2))'
```

Then commit a **new** offending line and push:

```
  Redline/HIGH [core/untracked-todo]: ...
redline: a finding at or above HIGH was found by the rules a checker can decide.
         Fix it, or push with --no-verify if you are accepting it deliberately.
```

Exit 1, and nothing left the machine. **This is the assertion that matters.** If the push
succeeds here, the gate is not enforcing and everything above it was theatre.

Put the rung back when you are done — `git checkout .redline.json`.

> One trap worth knowing: the hook reviews **what is being pushed**, not your working
> tree. A second push carrying only `.redline.json` reviews only `.redline.json` and
> passes — correctly. Add a new offending line in a new commit when you test enforcement.

**Prove the bypass works too**, because a gate nobody can get past at 2am is a gate that
gets uninstalled at 2.05:

```sh
git push --no-verify     # exits 0, gate skipped
```

That is deliberate and documented. A local gate is a fast feedback loop, not a control —
if you need something a developer cannot step around, you need a check on a host.

### If your gate is `github-actions` or `azure-pipelines`

The equivalent is a throwaway pull request containing the probe file. Confirm:

1. A check appears on the PR. If none does, the workflow is not triggering — check that
   `redline status` names the pipeline you actually run.
2. The findings are commented.
3. At a blocking rung, merge is prevented; at `observe`, it is not.

Then close the PR without merging.

---

## 4. Does your assistant read the standards?

The deterministic half is four rules. The model half is the rest of the standard, and it
is where most of the value is. Open the repository in your assistant and run:

```
/redline-review
```

It should narrow the standard to the rules your changed files actually scope to, then
report findings in the output contract — `Redline/HIGH [rule-id]: …`. Two failures to
watch for:

- **It cites a rule id that does not exist.** Check with `redline explain <id>`. An id
  `explain --list` does not know was invented, and any number keyed on it is fiction.
- **It reviews against rules your files do not touch.** The command exists to prevent
  exactly that; if it is happening, the artifacts may be stale — `redline status` will say
  `standards — behind` if so.

You can see the exact prompt it is given, offline, with:

```sh
redline review --base main
```

**If your assistant is not in this terminal** — a browser tab, a chat window, an IDE
panel — `--print-prompt` writes the prompt to stdout and everything else to stderr, so it
pipes cleanly:

```sh
redline review --base main --print-prompt | pbcopy     # macOS
redline review --base main --print-prompt | xclip -sel clip   # Linux
```

Paste that into any model you already have. It asks for JSON back in the output contract,
so the answer is comparable with what the gate would have said. No API key, no endpoint,
no configuration — the review half of Redline works with whatever model you can reach.

---

## 5. Would a reviewer see what you see?

```sh
redline explain core/untracked-todo
```

Every finding cites a rule id in brackets. If `explain` can resolve it, the loop between a
comment on a pull request and the file a human edits to change the rule is closed. If it
cannot, the finding is untraceable.

---

## 6. Does the host agree? (needs a credential)

```sh
redline verify
```

This is the first command that contacts the host. It reads back what is actually
configured and compares it to what `.redline.json` claims.

The failure it exists to catch: **a required check whose name nothing ever publishes** —
every pull request stuck on "Expected — waiting for status", forever.

Common results and what they mean:

| Result | What it means |
| --- | --- |
| `FAIL gate-machinery` naming a file you deliberately did not install | The recorded pipeline is wrong. `redline init --pipeline <name>` |
| `FAIL security-floor` | Secret scanning, push protection or dependency alerts are off. Usually needs an organisation administrator, not a re-run |
| `ok check-name-reported … no required check configured yet` | Normal on an advisory install. Nothing is required, so nothing can hang |
| `present but nothing runs it: core.hooksPath does not point at .redline/hooks` | Local gate, this clone only. The file is fine — see step 3 |

On a `local-agent` gate `verify` can only report on the clone it runs in, and says so.
Whether the hook runs on your teammate's laptop is not a question any API can answer.

---

## 7. Can you get back out?

Before you trust a tool with this blast radius, confirm the exit exists:

```sh
redline remove --dry-run
```

Writes nothing, contacts no host, needs no credential. It prints the plan — every file it
would delete and why it believes it owns it:

```
would remove   .redline/hooks/pre-push  — it carries the Redline ownership line
core.hooksPath is unset in this clone where it points at .redline/hooks. It is per-clone
configuration, so each teammate who enabled the hook unsets it themselves:
git config --unset core.hooksPath
```

Only content Redline can prove it wrote is removed. A merged file keeps every byte outside
its `REDLINE` block, and anything unattributable is left in place and named. The security
floor is the organisation's minimum, not Redline's state — no flag here turns it off.

---

## Clean up

```sh
git rm probe.js sup.ts && git commit -m "remove redline verification probes"
```

---

## Troubleshooting

### "no deterministic findings" on a file I know is bad

Almost always correct. Only the four rules in step 2 are decided without a model — a
hardcoded secret or a concatenated SQL string is a real BLOCKER in the standard and is
reviewed by the model half, not by `redline policy`. Test the deterministic half with a
`var`, a ticketless `TODO`, a radix-less `parseInt`, or a bare `@ts-ignore`.

`redline policy` now says this itself, on every run:

```
372 of the 376 rule(s) in the catalogue cannot be decided without a model and
were not checked here — run `redline review` for those
```

A clean `policy` means the four checkable rules found nothing. It does not mean the
standard found nothing, and the gap between those two readings is the single most common
way Redline gets mistaken for broken.

### The hook did not run at all

In order of likelihood:

```sh
git config --get core.hooksPath          # must be .redline/hooks
ls -l .redline/hooks/pre-push            # must be executable
command -v node                          # the hook needs node to read the rung
```

A hook in a directory git is not looking at is a file, not a gate.

### The hook ran and found nothing on a branch full of problems

It reviews **what is being pushed**, not the working tree. Commit first. If the branch was
already pushed, only the new commits are in range — which is correct, and the same thing a
pull request gate does.

### The push was not blocked, but findings were printed

Check the rung: `redline status`. At `observe` and `warn` nothing is ever blocked, by
design. An unrecognised value in `.redline.json` also reads back as `observe` — a typo must
never be able to make a repository stricter than anyone chose.

### Why aren't Redline's own files flagged?

They are excluded deliberately. The rendered standards quote the very patterns they ban —
`core/type-checker-suppression` has to spell out `@ts-ignore` to forbid it — so without
this the first diff the gate ever saw, the onboarding pull request, failed on Redline's own
artifacts. Files carrying the `Managed by Redline` ownership line, everything inside a
`REDLINE:BEGIN`/`END` block, and the wholly-generated `redline-*` artifacts are skipped. A
real suppression in a file you wrote is still a BLOCKER.

### `verify` fails on `security-floor`

That one is usually genuine and usually not yours to fix: Advanced Security is enabled at
the organisation, not the repository. Take the finding to whoever administers the org.

The finding now carries the address of the page that turns the settings on, so it can be
forwarded as-is:

```
FAIL  security-floor  disabled: secret-scanning, push-protection — turn them on at
      https://github.com/acme/widget/settings/security_analysis
```

No link appears when the capability is merely *unreadable* rather than off. The fix there
is a credential with the scope to see it, not a setting — and the page would have been
unreadable to that token too.
