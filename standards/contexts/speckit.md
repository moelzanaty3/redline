# Context: spec-driven development

This repository works spec-first. A change begins as a specification, becomes a
plan, becomes tasks, and only then becomes code. Treat the specification as the
statement of intent that the diff is measured against.

When reviewing:

- Measure the diff against the specification it claims to implement, not against
  what the code appears to be trying to do. Code that works and does something
  the spec does not ask for is still a finding — say which section it departs
  from.
- A change with no specification is not automatically wrong. Trivial fixes,
  dependency bumps and revert commits do not need one. A new capability does.
- Where the specification and the code disagree, the specification is not
  automatically right either. Say which one you believe is wrong and why, rather
  than silently assuming the text wins.
- Do not restate the specification back to the author. They wrote it.

Spec Kit is a separate tool with its own installer and its own templates.
Redline does not create, edit or version its files; this section only tells a
reviewer that the repository works this way.
