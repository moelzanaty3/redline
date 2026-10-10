# DO NOT MERGE — Redline validation seed (anti-slop rules).

variable "subnet_ids" {
  type        = list(string)
  description = "Subnets"
}

resource "aws_db_subnet_group" "this" {
  # SEED 1 [HIGH] (terraform/empty-list-equality) == [] is always false
  count      = var.subnet_ids == [] ? 0 : 1
  subnet_ids = var.subnet_ids
}

resource "aws_instance" "app" {
  ami           = "ami-0abcdef1234567890"
  instance_type = "m6i.large"
  lifecycle {
    # SEED 2 [HIGH] (terraform/ignore-changes-all) later changes are never applied
    ignore_changes = all
  }
}

# SEED 3 [BLOCKER] (terraform/authoritative-iam-resource) detaches the policy from every other role
resource "aws_iam_policy_attachment" "read_only" {
  name       = "read-only"
  roles      = ["app"]
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

module "app" {
  source     = "./modules/app"
  subnet_ids = module.network.private_subnet_ids
  # SEED 4 [HIGH] (terraform/depends-on-instead-of-reference) makes every plan show replacements
  depends_on = [module.network]
}

locals {
  tags = {
    Environment = "prod"
    # SEED 5 [HIGH] (terraform/map-duplicate-keys) the last value silently wins
    Environment = "dev"
  }
}
