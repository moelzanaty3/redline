# 2. A gate that runs on the engineer's machine, not on a host

- Status: accepted
- Date: 2026-09-15

## Context

Redline's gate has always assumed CI. `--pipeline github-actions` writes an
Actions workflow; `--pipeline azure-pipelines` writes a pipeline definition. Both
end the same way: something runs on a build agent, publishes a check to the host,
and a branch ruleset can be made to require that check by name.

Repositories that have neither had no answer. The wizard asked "what runs your
pull request checks?" and offered two things they do not have, so the only way
through was to answer wrongly and then deselect the gate two questions later —
after which Redline rendered the standards and installed nothing that read them.
That is the outcome this product exists to avoid: running, looking green, and
doing nothing.

Two distinct repositories arrive at that question. One genuinely wants no gate
and only wants the standards rendered for its assistants. The other wants the
rules enforced but has nowhere to run them. Answering both with "no gate" loses
the second.

## Decision

A third pipeline, `local-agent`. The gate is a `pre-push` git hook committed at
`.redline/hooks/pre-push`; `core.hooksPath` is pointed at the directory holding
it. It runs `redline policy` over the range being pushed, and then hands the rest
to whichever assistant the engineer already uses, via `/redline-review`.

The wizard's separate "Nothing" answer is kept, and stays the answer for a
repository that wants no gate at all.

## Consequences

**It publishes no check, and that is load-bearing.** There is no build, no app
and no status call, so there is no check name for a branch ruleset to require.
`redline init --blocking` is refused on this pipeline before anything is written,
for the same reason it is refused on a GitHub repository built by Azure Pipelines
and on a repository with no gate: a required check that nothing publishes blocks
every pull request in the repository forever. Three routes to one deadlock, all
closed at the same guard.

**`GatePipeline` stays the single record of what runs the gate, and
`capabilities.gate` the single record of whether one exists.** `none` sets
`gate: false` and leaves `pipeline` inert; `local-agent` sets `gate: true` with a
real pipeline value. Recording "no gate" as a third pipeline value would have
been a second record of the same fact, free to disagree with the first — which is
how a gate goes missing.

**The hook is committed, not written into `.git/hooks`.** A hook in `.git/hooks`
is unversioned: it cannot be reviewed, cannot be synced when the standards move,
and cannot be removed by `redline remove`. The trade is that `core.hooksPath` has
to be pointed at the directory once per clone, per engineer. `init` does it for
the clone it runs in and says so; a teammate who never runs it has a hook on disk
that never fires, which `redline verify` reports as present-but-not-wired rather
than passing.

**It refuses to take a hooks path somebody else set.** `core.hooksPath` is a
single repository-wide value, so pointing it at Redline's directory silently
stops husky — or whatever a team wired deliberately — from ever running again.
Installing a gate by disabling somebody else's is the failure this product exists
to catch, not one it may commit. The file is still written, the path is reported
`denied`, and the exact command to finish the job is printed.

**The enforcement rung governs it, read at run time.** `observe` and `warn`
report and let the push through; `block-blocker` and `block-high` refuse. This is
not a courtesy — a local gate that enforced at every rung would make the
promotion ladder mean one thing in CI and another here, and `redline status`
would go on reporting "comments only" about a gate that was refusing pushes. The
rung is read from `.redline.json` when the hook runs rather than substituted into
it at install time, so there is one record of it rather than two free to
disagree. An unrecognised value is non-enforcing, matching `cli/config` and the
CI gate: a typo must never make a repository stricter than anyone chose.

**It is bypassable, and the documentation says so.** `git push --no-verify`
skips it, and nothing on a host will notice. That is the honest trade for a gate
that needs no CI, no credential and no network, and it is why `local-agent` is
positioned as better than nothing rather than as equivalent to a required check.
A repository that acquires CI should move to a real pipeline; `redline init
--pipeline <name>` reconciles.

**`externallyNamed` now carries a second meaning.** It already meant "the
machinery is wired and will run, judged by something other than a check name" for
Azure-on-GitHub, where it reports whether the `pr:` trigger is present. Here it
reports whether `core.hooksPath` points at the hook and the file is executable.
Both are the same question — is this gate actually going to run — asked of
different evidence, which is why it was extended rather than duplicated.

**The execute bit is checked on every run, not just the content.** A hook whose
bytes are correct but whose execute bit was lost — restored from an archive,
checked out on a filesystem that drops it — is skipped by git without a word. A
plain content comparison writes nothing and the gate never runs again, so the
installer re-checks the mode independently.

**Tested on POSIX shells only.** The hook is `/bin/sh` and has been exercised on
macOS. Git for Windows ships a shell that should run it unchanged, but that has
not been verified, and it is recorded here rather than in a comment because it
should close before the package is published.
