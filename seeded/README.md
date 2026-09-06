# Validation corpus

Two corpora, because a review system has two ways to fail and only one of them is loud.

| Directory | Measures | Pass condition |
|---|---|---|
| `seeded/<stack>/` | **Recall** — does the reviewer catch real defects? | 100% of `[BLOCKER]` markers flagged |
| `seeded/clean/` | **Precision** — does it stay quiet on correct code? | **zero** comments |

A reviewer that flags everything scores perfect recall and is useless. Run both.

## Marker format

Every intentional defect carries a machine-readable marker on or just above its line:

```
SEED <n> [BLOCKER|HIGH|SUGGESTION] (<stack>/<rule-slug>) <short description>
```

The rule id names which rule in `standards/` the defect violates, so the scorer grades
attribution as well as detection: a reviewer that finds the bug but cites the wrong rule
is counted as caught, and separately as misattributed.

`scripts/score-seeds.mjs` parses these directly from the files, so adding a defect is a
one-line change with no separate expectations file to drift out of sync.
`scripts/validate.mjs` fails CI if a seed cites an unknown rule, or claims a severity
higher than that rule carries in the standard.

## Protocol

1. Pick a pilot repo for the stack under test and make sure it is fully onboarded
   (`npx redlinegate verify`).
2. Open a PR that adds the matching seed directory **and** `seeded/clean/`.
   Label it `redline-exempt` so the readiness gate does not block a PR nobody will merge.
3. Wait for the automated review to finish.
4. Score it:

   ```sh
   GH_TOKEN=... node scripts/score-seeds.mjs --repo <org>/<repo> --pr <n>
   ```

5. Record the numbers in `CHANGELOG.md` against the standards version under test.
6. **Close the PR. Never merge it.** These files contain live-looking credentials and
   deliberately broken code.

Once a pilot is stable, stop doing this by hand: set `CANARY_TARGETS` on the metrics repo
and `workflows/seed-canary.yml` runs the whole cycle weekly — open, wait for the review to
settle, score, append to `data/seed-scores.jsonl`, close, and fail the run on a
regression. The dashboard plots that history.

The script exits non-zero if BLOCKER recall is below 100%. Wire it into a pilot workflow
if you want the rollout to stop automatically on a regression.

## Reading the result

| Signal | Meaning | Action |
|---|---|---|
| Low BLOCKER recall | The rule is not reaching the model, or the glob does not match the file | Check `applyTo` in the rendered instruction file; check the profile |
| High recall, high false positives | Rules are too broad | Extend "What NOT to flag" in `standards/core.md` |
| Many `untagged` findings | The reviewer is ignoring the output contract | Telemetry severity counts are approximate until fixed |
| Zero comments at all | Review is not enabled, or the bot has no access | Check `automatic_copilot_code_review_enabled` in the ruleset |
| Low rule attribution | Defects found, rules not named | Rule wording is ambiguous, or the stack file is too long to hold in context |

## Cross-vendor comparison

The scorer attributes findings by reviewer login, so the same corpus scores Copilot,
Claude, Codex or any other reviewer on identical input. Open the same seed PR in repos
configured for each vendor and compare `blocker_recall` and `false_positives_on_clean`.
That comparison is the only defensible basis for choosing one.
