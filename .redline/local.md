## Blast radius — confirm before acting outside this repository

Redline's job is to write CI configuration, security machinery and ownership
files into *other people's* repositories. That is the whole product, and it is
also the reason an unattended run here can have consequences a normal coding
task cannot. The rules below are about where a change lands, not about how it is
written.

Ask first — every time, regardless of how routine the change looks:

- **Before writing to any repository other than this one.** A path handed to the
  session, an additional working directory, or a remote discovered while working
  is not permission to modify it. Name the repository and the files, and wait.
- **Before pushing to a remote this repository does not own.** Running `redline
  init` against a third-party repository opens a pull request under someone
  else's organisation, in their audit log, under their policy. That is their
  decision to invite, not ours to assume.
- **Before modifying security machinery anywhere.** Secret-scanning
  configuration, scanner flags and pins, gate workflows, `CODEOWNERS`, branch
  rulesets. A correct change to a security control still trips detection rules
  and still lands in someone's incident queue — intent does not suppress an
  alert. State what will change and why before touching it.
- **Before running the CLI against a repository that is not a fixture.** `seeded/`
  and the test corpus are ours. Anything else belongs to somebody.

One session, one repository. If work appears to need a second one, that is the
moment to stop and say so, not to widen the scope and report it afterwards.
