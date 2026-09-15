---
description: Review the current change against this repository's Redline standards
---

Review the engineer's change against the standards this repository already carries, and report
findings in Redline's output contract. This is the review the merge gate performs, run locally by
whatever assistant the engineer has. It needs no CI, no credential and no network: everything it
judges against is committed in this repository.

Run it when asked to review a change, before raising a pull request, or in a repository that
installed the standards without a gate — `redline init` can be answered "nothing" when asked what
runs the pull request checks, and this command is then the whole of the review.

## The rules to apply

If `redline` is on this machine, ask it rather than assembling the rules yourself:

```
redline review --engine embedded
```

It narrows the standard to the stacks the changed files actually belong to and emits the diff
alongside them, so a React rule is never applied to a build script. Take the prompt it prints as
your instructions and review against exactly what it contains. `--staged`, `--base <ref>` and
`--diff-file <path>` choose a different range.

That command needs Node 22. Where it will not run — an older Node, no network to fetch the package,
an assistant with no shell — read the standards out of this repository instead. They are rendered
into whichever of these files exists, between the `<!-- REDLINE:BEGIN -->` and
`<!-- REDLINE:END -->` markers:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `CLAUDE.md`
- `.cursor/rules/redline.mdc`

Any one of them carries the whole standard — core rules, the stack rules for this repository's
profile, and any repository-local rules from `.redline/local.md`. Read one; they are renderings of
the same source. Per-stack files under `.github/instructions/redline-*.instructions.md` carry the
same stack rules with the globs they apply to, and are worth reading when the diff spans languages.

Do not review against rules you remember from elsewhere. If a rule is not in those files, it does
not apply here, and the repository's own version of a rule wins over the general one.

## The change to review

Unless the engineer named a different range, review the working change:

```
git --no-pager diff --merge-base HEAD @{upstream} 2>/dev/null || git --no-pager diff HEAD
```

Fall back to `git --no-pager diff` plus `git --no-pager diff --cached` when there is no upstream.
Review **only the lines the diff adds or changes**. Read the surrounding file when you need the
context to judge a line — a rule about a missing auth check cannot be decided from the diff alone —
but do not report what the change merely sits next to.

## How to report

Every finding starts with the machine-readable prefix on its own first line, exactly as the
standard specifies:

```
Redline/BLOCKER [rule-id]: <one-line problem>
Redline/HIGH [rule-id]: <one-line problem>
Redline/SUGGESTION [rule-id]: <one-line problem>
```

Then one or two sentences: why it breaks, and the concrete fix. Quote the rule id exactly as the
standards file writes it — `core/query-string-concatenation`, `react/effect-derived-state`. One rule
per finding; a line that breaks two rules gets two findings. Where you are confident something is
wrong and no rule covers it, use `core/uncatalogued` and name the principle it offends.

Give each finding its file and line. Order them BLOCKER, then HIGH, then SUGGESTION. Finish with a
one-line verdict: the count at each severity, and whether anything blocks.

If nothing qualifies, say so in one line. Do not pad the report to look thorough — an invented
finding costs more trust than a missed one.

## What not to report

The standard's own noise rules bind this command. Do not report formatting, import order, or
anything a linter or formatter already enforces; existing patterns the change only touches; missing
tests for code outside the diff; alternative libraries where the current one works; or naming
preferences where the name is unambiguous. Report the first instance of a repeated problem and say
"and N similar". If you cannot describe the input that breaks it, it is not a finding.

## What this command is not

It is a review, not an enforcement point. It changes no file, applies no fix unless the engineer
asks for one, and its verdict gates nothing on the host. Where this repository also runs the Redline
gate, that gate is what decides a merge; where it does not, this report is advice a human acts on.

`redline verify` is the other question and a different command: it checks that the repository's
own guardrails are still in place, not that a change is any good.
