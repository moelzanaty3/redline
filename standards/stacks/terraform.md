# Terraform / HCL Review Rules

## BLOCKER — request changes

- `terraform/secrets-in-config` — **Secrets in `.tf`/`.tfvars`** — passwords, keys, tokens, connection strings. Reference Secrets Manager / SSM / vault data sources; mark variables `sensitive = true`.
- `terraform/public-exposure` — **Public exposure**: `0.0.0.0/0` ingress on non-public ports, public S3 bucket ACLs/policies, `publicly_accessible = true` on databases — without an explicit justification comment and approval.
- `terraform/missing-moved-block` — **Resource rename/move without `moved {}` block** — plan shows destroy+create; data loss on stateful resources.
- `terraform/overly-broad-iam` — **Overly broad IAM**: `Action: "*"`, `Resource: "*"`, or `iam:PassRole` unscoped — least privilege, scoped ARNs.
- `terraform/prevent-destroy-removed` — **`prevent_destroy` removed** or lifecycle guards deleted on stateful resources (DBs, buckets, tables) without stated intent.
- `terraform/unpinned-source` — **Provider or module source unpinned** — exact version or bounded constraint (`~>`), never floating latest.

## HIGH

- `terraform/count-vs-for-each` — `count` on identity-bearing resources where `for_each` is correct — index shifts destroy/recreate siblings.
- `terraform/hardcoded-env-values` — Cross-environment values hardcoded in modules (account IDs, ARNs, CIDRs) — pass as variables.
- `terraform/missing-required-tags` — Missing required tags on new resources (owner, cost-centre, environment — per org tagging policy).
- `terraform/wide-open-egress` — Wide-open egress added without comment.
- `terraform/ambiguous-data-source` — Data sources fetching by name/tag that may match multiple resources — brittle; use IDs where stable.
- `terraform/missing-backup-retention` — New stateful resource without backup/retention configuration (RDS retention, S3 versioning, DynamoDB PITR).
- `terraform/missing-encryption` — Encryption not explicit on new data stores (at-rest KMS, in-transit enforced).

## SUGGESTION

- `terraform/variable-metadata` — Variables missing `description` and `type`.
- `terraform/output-metadata` — Outputs missing `description`; sensitive outputs not marked `sensitive`.
- `terraform/prefer-jsonencode` — Inline JSON policies over `jsonencode()`/data-source policy documents.
- `terraform/repeated-literal` — Repeated literal in 3+ places — promote to local.
