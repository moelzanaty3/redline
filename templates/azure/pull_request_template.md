# Summary

<!-- What and why, 2-3 sentences. Link the ticket. -->

Ticket:

## Change type

<!-- Tick the one that applies. This section is NOT gated — pick one and move on. -->

- [ ] Feature
- [ ] Bugfix
- [ ] Refactor (approved beforehand)
- [ ] Chore/config

## Launch readiness

<!--
GATED SECTION. `redline-gate` fails while any box here is unticked.
If an item genuinely does not apply, delete the line and say why in the Summary.
Do not delete the heading — the gate fails if the section is missing.
-->

- [ ] No secrets, keys, or customer data in code, logs, or fixtures
- [ ] Input validated at boundaries touched by this change
- [ ] Typecheck and lint pass with no new errors
- [ ] Tested on: <!-- iOS / Android / web / staging -->
- [ ] Error states handled (network failure, empty, loading)
- [ ] Rollback is safe (no destructive migration, no breaking contract change)
- [ ] No unrelated changes in the diff

## Architecture decision

<!-- If this PR makes a non-obvious technical choice, add an ADR and link it. Otherwise delete this section. -->

ADR: `docs/adr/NNNN-*.md`

## Automated review

- [ ] Review comments addressed, or dismissed in-thread with a reason

<!--
Gate stuck on a process check you cannot satisfy? Add the `redline-exempt` label to
this pull request and leave a comment explaining why. That downgrades the checklist
and ADR checks to warnings. It does NOT bypass dependency review or the secret scan —
those never soft-fail.
-->
