---
description: Review the current change against this repository's Redline standards and list the issues
---

Review the engineer's change against the standards this repository carries, and reply with the
list of issues, or with `No Redline issues in this change.` Nothing else: no preamble, no summary
of the change, no JSON.

## 1. Get the rules and the change

If `redline` runs on this machine (it needs Node 18.11 or later), let it do the work:

```
redline review --engine embedded
```

It works out which stacks the changed files belong to, so a React rule never lands on a build
script. It also runs the rules a checker decides without a model, and it prints one prompt
carrying the applicable rules, the diff, the checker's findings and the reply format. Follow that
prompt exactly. Add `--staged`, `--base <ref>` or `--diff-file <path>` only when the engineer named
a different range.

Where it will not run (an older Node, no network to fetch the package, no shell), assemble the same
thing yourself:

- **The rules:** the block between `<!-- REDLINE:BEGIN -->` and `<!-- REDLINE:END -->` in whichever of
  `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` or `.cursor/rules/redline-core.mdc`
  exists. Each one carries the whole standard for this repository's profile. Do not apply rules you
  remember from elsewhere; if a rule is not in that block, it does not apply here.
- **The change:** `git --no-pager diff --merge-base HEAD @{upstream} 2>/dev/null || git --no-pager diff HEAD`.
  Review only the lines it adds or changes, and read the surrounding file only when you need it to
  judge a line.

## 2. Reply

One block per finding, BLOCKER first, then HIGH, then SUGGESTION:

```
src/billing/load.ts:4
  Redline/BLOCKER [core/unsafe-assertion]: a double assertion overrides the type checker.
  Parse the response into an Invoice, or state why the cast holds in a `// SAFETY:` comment.
```

Quote the rule id exactly as the standard writes it. One rule per finding. Where something is
clearly wrong and no rule covers it, use `core/uncatalogued` and name the principle. End with one
line counting each severity: `1 BLOCKER · 0 HIGH · 0 SUGGESTION`.

If nothing qualifies, reply with exactly `No Redline issues in this change.` An invented finding
costs more trust than a missed one. The standard's "What NOT to flag" section binds this review:
no formatting, no naming preferences, nothing you cannot describe a breaking input for.

This is advice to the engineer. It changes no file unless they ask for a fix, and it decides
nothing. Where the repository runs the Redline gate, the gate's own deterministic checks decide the
merge.
