# Terraform / HCL Review Rules

## BLOCKER — request changes

- `terraform/secrets-in-config` — **Secrets in `.tf`/`.tfvars`** — passwords, keys, tokens, connection strings. Reference Secrets Manager / SSM / vault data sources; mark variables `sensitive = true`.
- `terraform/public-exposure` — **Public exposure**: `0.0.0.0/0` ingress on non-public ports, public S3 bucket ACLs/policies, `publicly_accessible = true` on databases — without an explicit justification comment and approval.
- `terraform/missing-moved-block` — **Resource rename/move without `moved {}` block** — plan shows destroy+create; data loss on stateful resources.
- `terraform/overly-broad-iam` — **Overly broad IAM**: `Action: "*"`, `Resource: "*"`, or `iam:PassRole` unscoped — least privilege, scoped ARNs.
- `terraform/prevent-destroy-removed` — **`prevent_destroy` removed** or lifecycle guards deleted on stateful resources (DBs, buckets, tables) without stated intent.
- `terraform/unpinned-source` — **Provider or module source unpinned** — exact version or bounded constraint (`~>`), never floating latest.
- `terraform/authoritative-iam-resource` — **Authoritative IAM resource used for an additive grant.**
  `aws_iam_policy_attachment` owns every attachment of that policy across the account, and
  `google_{project,folder,organization}_iam_policy` replaces the whole IAM policy — either one silently revokes
  access granted anywhere else, and the Google ones can lock operators out of the project. Use
  `aws_iam_role_policy_attachment` / `google_project_iam_member`. Not when the resource is the documented sole
  owner of that policy, with a comment saying so.

## HIGH

- `terraform/count-vs-for-each` — `count` on identity-bearing resources where `for_each` is correct — index shifts destroy/recreate siblings.
- `terraform/hardcoded-env-values` — Cross-environment values hardcoded in modules (account IDs, ARNs, CIDRs) — pass as variables.
- `terraform/missing-required-tags` — Missing required tags on new resources (owner, cost-centre, environment — per org tagging policy).
- `terraform/wide-open-egress` — Wide-open egress added without comment.
- `terraform/ambiguous-data-source` — Data sources fetching by name/tag that may match multiple resources — brittle; use IDs where stable.
- `terraform/missing-backup-retention` — New stateful resource without backup/retention configuration (RDS retention, S3 versioning, DynamoDB PITR).
- `terraform/missing-encryption` — Encryption not explicit on new data stores (at-rest KMS, in-transit enforced).
- `terraform/empty-list-equality` — **Comparing a collection to `[]`.** `var.x == []` is always false and `var.x
  != []` always true — `[]` is an empty tuple and `==` needs identical types — so `count = var.subnets == [] ? 0
  : 1` creates the resource whether or not the list is empty. Use `length(var.x) == 0`.
- `terraform/ignore-changes-all` — **`lifecycle { ignore_changes = all }`.** Terraform stops proposing any
  update to the resource, so a later change to its arguments merges, plans as "No changes" and is never applied.
  List only the attributes something outside Terraform genuinely owns, with a comment naming that owner.
- `terraform/sg-inline-and-standalone-rules` — **A security group managed both inline and by standalone rule
  resources.** Inline `ingress`/`egress` blocks re-assert their set on every apply and delete rules added by
  `aws_vpc_security_group_*_rule`/`aws_security_group_rule` for the same group, so the plan never converges and
  connectivity flaps. Pick one; new code uses the standalone rule resources only.
- `terraform/depends-on-instead-of-reference` — **`depends_on` where an attribute reference would express the
  dependency** — above all on a `module`. It makes everything downstream "known after apply", so every plan
  shows updates or replacements and reviewers learn to ignore the diff. Reference the upstream attribute; keep
  `depends_on` for a genuinely hidden dependency, with a comment naming it.
- `terraform/remote-state-coupling` — **A new `terraform_remote_state` consumer.** It needs read access to the
  producer's whole state snapshot, secrets included, and breaks when the producer renames an output or moves its
  backend key. Publish the value deliberately (SSM parameter, `tfe_outputs`, a data source looked up by id) and
  read that.
- `terraform/provider-in-shared-module` — **A `provider` block inside a reusable child module.** Callers can no
  longer use `count`/`for_each`/`depends_on` on it, and removing the module call removes the provider its
  resources need to be destroyed, leaving orphaned infrastructure. Declare `required_providers` (with
  `configuration_aliases` if needed) and pass providers in from the root.
- `terraform/ignored-input-variable` — **A module variable declared but never referenced.** The caller sets it,
  Terraform accepts it, and nothing changes — `enable_versioning = true` that no resource reads leaves
  versioning off with no error. Wire it in or delete it.
- `terraform/map-duplicate-keys` — **A duplicate key in a map or object literal.** Terraform keeps the last
  value without an error, so `tags = { Environment = "prod", …, Environment = "dev" }` labels production `dev`
  and environment-scoped policies act on the wrong set. Remove the duplicate.

## SUGGESTION

- `terraform/variable-metadata` — Variables missing `description` and `type`.
- `terraform/output-metadata` — Outputs missing `description`; sensitive outputs not marked `sensitive`.
- `terraform/prefer-jsonencode` — Inline JSON policies over `jsonencode()`/data-source policy documents.
- `terraform/repeated-literal` — Repeated literal in 3+ places — promote to local.
