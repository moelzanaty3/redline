# DO NOT MERGE — Redline validation seed.
# Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
# citing that rule id. Score with scripts/score-seeds.mjs.

# SEED 1 [BLOCKER] (terraform/unpinned-source) provider unpinned — floats to whatever is latest at apply time
provider "aws" {
  region = "eu-west-1"
}

# SEED 2 [BLOCKER] (terraform/secrets-in-config) secret committed in a .tf file
variable "db_password" {
  type    = string
  default = "Pr0d-Sup3r-S3cret-2026!"
}

resource "aws_db_instance" "billing" {
  identifier = "billing-prod"
  engine     = "postgres"
  password   = var.db_password

  # SEED 3 [BLOCKER] (terraform/public-exposure) database exposed to the public internet
  publicly_accessible = true

  # SEED 4 [HIGH] (terraform/missing-backup-retention) no backup retention on a new stateful resource
  backup_retention_period = 0

  # SEED 5 [HIGH] (terraform/missing-encryption) encryption at rest not enabled on a new data store
  storage_encrypted = false
}

resource "aws_security_group_rule" "wide_open" {
  type        = "ingress"
  from_port   = 5432
  to_port     = 5432
  protocol    = "tcp"
  # SEED 6 [BLOCKER] (terraform/public-exposure) 0.0.0.0/0 ingress on a database port
  cidr_blocks = ["0.0.0.0/0"]
  security_group_id = "sg-0123456789abcdef0"
}

resource "aws_iam_role_policy" "billing" {
  name = "billing"
  role = "billing-role"

  # SEED 7 [BLOCKER] (terraform/overly-broad-iam) fully unscoped IAM policy
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# SEED 8 [HIGH] (terraform/count-vs-for-each) count on an identity-bearing resource — index shift recreates siblings
resource "aws_s3_bucket" "reports" {
  count  = length(var.markets)
  bucket = "reports-${var.markets[count.index]}"
}

# SEED 9 [SUGGESTION] (terraform/variable-metadata) variable missing description and type
variable "markets" {
  default = ["uk", "de", "es"]
}
