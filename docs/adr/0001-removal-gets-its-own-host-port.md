# 1. Removal gets its own host port, not a wider `Platform`

- Status: accepted
- Date: 2026-09-05

## Context

`redline init` writes into a repository and turns on host state: a branch
ruleset, a required check, labels, a repository property, the security floor.
Until now nothing took any of it back out. "How do I back this out?" is a
question every engineering manager asks in the first five minutes of evaluating
a tool with that blast radius, and the honest answer was "by hand, and we have
not documented how" — which reads as a trap and costs adoptions.

`redline remove` answers it. The question this record exists for is where the
host half of it should live.

`Platform` (`cli/platforms/types.ts`) is the port `init` and `verify` share. It
is an install-and-verify interface: every method on it either creates host state
or reads it back. Not one of them removes anything. The obvious move is to add
`deleteRuleset`, `deleteLabel`, `clearRepositoryProperty` and their Azure
equivalents to it.

## Decision

Removal gets its own narrow port, `cli/remove/host.ts`, with GitHub and Azure
implementations beside it. `Platform` is left as it is.

## Consequences

**Why not widen `Platform`.** A destructive method on that interface is a method
every adapter has to implement and every command holding a `Platform` can reach.
`init` and `verify` both hold one. The type system would stop objecting to
`init` deleting a ruleset, and the only thing preventing it would be that nobody
wrote the call — which is not a guarantee, it is a hope. Keeping the third verb
in a third port means a command that should never remove host state cannot name
the operation that would.

**The cost is real and accepted.** There are now two places that know how to
reach a host, and a new capability that needs both installing and withdrawing
has to be added in both. That duplication is deliberate: it is the price of the
blast radius being visible in the type signature rather than in a comment.

**What the port is written to.** Ownership is proven from the object itself
before anything is deleted — the ruleset named `Redline`, a label whose
description is still the one the gate install wrote, an Azure policy carrying the
`Redline:` marker in its display name. A path or a name alone is never enough. A
capability the token cannot reach is reported `denied` and recorded in
`.redline.json`, never silently skipped.

**The security floor is out of scope, with no flag to reach it.** Secret
scanning, push protection and dependency alerts are the organisation's floor,
not Redline's state. A supported way to lower a repository's security is worse
than the inconvenience of leaving it on, so `redline remove` does not offer one.

**Azure is implemented but untested.** The GitHub path is unit-tested against a
fake client; Azure mirrors its structure and was written from the adapter, but
has no fake-client test yet. That gap is recorded here rather than in a comment
because it should close before the package is published.
