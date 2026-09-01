# Measurement

Redline's claim is that standards evolve from data. This is the data.

The system measures four things, and each exists because a specific failure is invisible
without it.

| Measure | Failure it catches | Where it comes from |
|---|---|---|
| **Acted-on rate** | Review is running and being ignored | Resolved vs stale review threads |
| **Per-rule ignored rate** | One rule is generating most of the noise | Rule id on every finding |
| **Seed recall** | Review silently stopped catching things | `seeded/<stack>/` corpus |
| **Precision** | Review catches everything by flagging everything | `seeded/clean/` corpus |

Volume — "we posted 4,000 findings this quarter" — measures none of them.

## The rule id contract

Every rule in `standards/` carries a permanent id at the start of its line:

```markdown
- `react/effect-derived-state` — **`useEffect` for derived state.** State computable from
  existing props/state must be computed during render, never synced via effect.
```

The core standard requires every finding to cite one:

```
Redline/BLOCKER [core/query-string-concatenation]: user-supplied `name` is concatenated
into the SQL string, so a crafted value changes the query.
```

**Ids are permanent.** Reword the rule as often as you like; never change its id. An id
change orphans every historical record for that rule and silently resets its tuning
history. `scripts/assign-rule-ids.mjs` assigns ids to new rules and `--check` fails CI if
any rule lacks one; `scripts/validate.mjs` enforces format, uniqueness, and that the
stack prefix matches the file the rule lives in.

`core/uncatalogued` is reserved for a real finding no rule covers. It is a feature, not a
gap: a rising `core/uncatalogued` count is how a missing rule gets discovered. Forcing a
bad rule match to avoid it destroys that signal.

## Where the numbers come from

```
   product repos                 redline-metrics                  humans
 ┌──────────────────┐   pull    ┌──────────────────────┐
 │ review comments  │ ────────► │ collect-telemetry    │ ──► data/YYYY-MM.jsonl
 │ (any vendor)     │           │ (read-only token)    │           │
 └──────────────────┘           └──────────────────────┘           │
                                                                    ├─► build-dashboard ──► Pages
   canary repo                  ┌──────────────────────┐           │
 ┌──────────────────┐   score   │ seed-canary          │ ──► data/seed-scores.jsonl
 │ seeded PR        │ ────────► │ score-seeds          │           │
 └──────────────────┘           └──────────────────────┘           └─► build-digest ──► Teams
```

Nothing is pushed from a product repo, and no Redline secret is stored in one. The
collector reads; it never writes outside the metrics repo.

## Reading the dashboard

**Hero: findings acted on.** The one number. Rising volume with a falling acted-on rate
means the standards are getting noisier, not stricter.

**Noisiest rules.** Rules that fire often and are rarely resolved, worst first. This is a
work queue, not a report: cut, narrow, or downgrade the top entries before adding any new
rule. A rule at 80% ignored is costing every reviewer in the org attention and buying
nothing.

**Seed BLOCKER recall over time.** Should be a flat line at 100%. A dip means the reviewer
stopped catching defects it used to catch — a model change, a lost entitlement, a glob
that no longer matches. Nothing else in the system detects this, because a repo with no
findings looks exactly like a repo with no defects.

**Warnings panel.** Findings with no rule id (that repo has not merged the current
standards yet), findings citing ids outside the catalogue, and stale data.

## Interpreting a seed score

```sh
GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-web --pr 12
```

| Signal | Means | Do |
|---|---|---|
| Low BLOCKER recall | Rule is not reaching the model, or the glob does not match | Check `applyTo` in the rendered instruction file, and the repo's profile |
| High recall, false positives on `clean` | Rules are too broad | Extend "What NOT to flag" in `standards/core.md` |
| High recall, low rule attribution | Reviewer finds defects but cannot name the rule | Rule text is ambiguous, or the file is too long to hold in context — split the stack file |
| Many untagged findings | Output contract is being ignored | Severity counts are approximate until the repo merges current standards |
| Zero comments at all | Review is not enabled, or the bot lost access | Check `automatic_copilot_code_review_enabled` and the app installation |

The scorer exits non-zero below 100% BLOCKER recall or above zero false positives, so it
works as a gate as well as a report.

## Vendor comparison

Every measurement attributes findings by reviewer login and reads severity and rule id
from the text, so nothing in the pipeline is vendor-specific. Running the same corpus
through two reviewers is the only defensible way to choose between them:

```sh
GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-copilot --pr 4 --json
GH_TOKEN=... node scripts/score-seeds.mjs --repo acme/pilot-claude  --pr 7 --json
```

Compare `blocker_recall`, `false_positives_on_clean`, and `rule_attribution`.

## What this deliberately does not measure

- **Defects found in production that review missed.** That is the number everyone wants
  and nobody can attribute honestly — the counterfactual is unknowable. Seed recall is the
  closest defensible proxy.
- **Developer sentiment.** Ask people; do not infer it from thread counts.
- **Per-author quality.** The data would support it and the system deliberately does not
  surface it. A review layer that becomes a performance-management instrument stops
  getting honest engagement, and every number above degrades within a quarter.
