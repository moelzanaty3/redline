#!/usr/bin/env bash
# Onboard one repo onto Redline.
#
#   scripts/setup-repo.sh <org>/<repo> <profile> [--dry-run]
#   scripts/setup-repo.sh <org>/<repo> --verify      # check an already-onboarded repo
#
# Profiles: see standards/manifest.json. Example: web, mobile-rn, service-java, infra.
#
# What this does:
#   1. Enables the security floor (secret scanning + push protection + dependency graph)
#   2. Applies the Redline branch ruleset
#   3. Creates the labels the gate reads
#   4. Marks the repo with the `redline` custom property so the org ruleset picks it up
#   5. Adds it to sync-targets.txt and runs the sync for it
#   6. Verifies the required status check name actually matches what the gate reports
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${1:?usage: setup-repo.sh <org>/<repo> <profile> [--dry-run] | <org>/<repo> --verify}"
shift

PROFILE=""
DRY=false
VERIFY_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=true; shift ;;
    --verify)  VERIFY_ONLY=true; shift ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) PROFILE="$1"; shift ;;
  esac
done

ORG="${REPO%%/*}"
REQUIRED_CHECK="redline-gate / gate"

run() {
  if [[ "$DRY" == true ]]; then echo "DRY: $*"; else "$@"; fi
}

# --- verification -----------------------------------------------------------------
# The single most common way this system fails silently: the branch ruleset requires a
# status-check context that nothing ever reports, so every PR sits on "Expected".
verify() {
  echo "==> Verifying $REPO"
  local fail=0

  local required
  required=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name|startswith("Redline")) | .id' 2>/dev/null \
    | while read -r id; do
        gh api "repos/$REPO/rulesets/$id" \
          --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
      done | sort -u)

  if [[ -z "$required" ]]; then
    echo "  FAIL: no Redline ruleset with a required status check on $REPO"
    fail=1
  else
    echo "  ruleset requires: $required"
    if ! grep -qxF "$REQUIRED_CHECK" <<<"$required"; then
      echo "  FAIL: expected required context '$REQUIRED_CHECK'"
      fail=1
    fi
  fi

  local pr
  pr=$(gh pr list --repo "$REPO" --state all --limit 1 --json number --jq '.[0].number // ""')
  if [[ -z "$pr" ]]; then
    echo "  SKIP: no pull request yet — open one to confirm the check name reports."
  else
    local sha reported
    sha=$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq .headRefOid)
    reported=$(gh api "repos/$REPO/commits/$sha/check-runs" --jq '.check_runs[].name' | sort -u)
    echo "  checks reported on PR #$pr:"
    sed 's/^/    /' <<<"$reported"
    if ! grep -qxF "$REQUIRED_CHECK" <<<"$reported"; then
      echo "  FAIL: '$REQUIRED_CHECK' was never reported. The ruleset will block every PR."
      echo "        Fix the caller job id in .github/workflows/redline.yml, or point the"
      echo "        ruleset at a name from the list above."
      fail=1
    fi
  fi

  local ghas
  ghas=$(gh api "repos/$REPO" --jq '.security_and_analysis // {} | to_entries[] | "\(.key)=\(.value.status)"' 2>/dev/null || true)
  echo "  security: ${ghas:-unavailable}"
  grep -q 'secret_scanning_push_protection=enabled' <<<"$ghas" || {
    echo "  WARN: secret scanning push protection is off — the diff scan is the only net."
  }

  if [[ "$fail" -ne 0 ]]; then
    echo "==> $REPO is NOT correctly onboarded"
    return 1
  fi
  echo "==> $REPO verified"
}

if [[ "$VERIFY_ONLY" == true ]]; then
  verify
  exit $?
fi

: "${PROFILE:?a profile is required — see standards/manifest.json}"
node -e '
  const m = require(process.argv[1] + "/standards/manifest.json");
  const p = process.argv[2];
  if (!m.profiles[p] && !m.profileAliases[p]) {
    console.error(`unknown profile "${p}". Known: ${Object.keys(m.profiles).join(", ")}`);
    process.exit(1);
  }
' "$BUNDLE_DIR" "$PROFILE"

echo "==> Security floor"
# Advanced Security is licensed separately; if the org has no seats this call fails and
# the rest of onboarding still proceeds. Push protection is the part that actually stops
# a leaked credential from ever reaching the default branch.
run gh api -X PATCH "repos/$REPO" \
  -F 'security_and_analysis[secret_scanning][status]=enabled' \
  -F 'security_and_analysis[secret_scanning_push_protection][status]=enabled' \
  || echo "  WARN: could not enable secret scanning (licence or permission) — do it by hand"
run gh api -X PUT "repos/$REPO/vulnerability-alerts" \
  || echo "  WARN: could not enable Dependabot alerts — dependency review needs the dependency graph"
run gh api -X PUT "repos/$REPO/automated-security-fixes" \
  || echo "  WARN: could not enable Dependabot security updates"

echo "==> Ruleset"
existing=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="Redline") | .id' 2>/dev/null || true)
if [[ -n "$existing" ]]; then
  run gh api -X PUT "repos/$REPO/rulesets/$existing" --input "$BUNDLE_DIR/rulesets/redline-ruleset.json"
else
  run gh api -X POST "repos/$REPO/rulesets" --input "$BUNDLE_DIR/rulesets/redline-ruleset.json"
fi

echo "==> Labels"
run gh label create "no-adr" --repo "$REPO" --color "ededed" \
  --description "PR intentionally ships without an ADR" --force
run gh label create "redline-exempt" --repo "$REPO" --color "fbca04" \
  --description "Gate process checks soft-failed with reviewer sign-off" --force
run gh label create "redline-sync" --repo "$REPO" --color "0e8a16" \
  --description "Automated standards sync from the Redline source repo" --force

echo "==> Custom property (drives the org-level ruleset)"
run gh api -X PATCH "repos/$REPO/properties/values" \
  -f 'properties[][property_name]=redline' \
  -f 'properties[][value]=onboarded' \
  || echo "  WARN: custom property 'redline' not set — create it at org level first if you use rulesets/redline-org-ruleset.json"

echo "==> Sync target"
short="${REPO#*/}"
if grep -qE "^${short}[[:space:]]" "$BUNDLE_DIR/sync-targets.txt"; then
  echo "  already listed"
else
  if [[ "$DRY" == true ]]; then
    echo "DRY: append '$short $PROFILE' to sync-targets.txt"
  else
    printf '%s %s\n' "$short" "$PROFILE" >> "$BUNDLE_DIR/sync-targets.txt"
    echo "  added '$short $PROFILE' — commit sync-targets.txt to the Redline source repo"
  fi
fi

echo "==> Distributing standards and the gate caller"
if [[ "$DRY" == true ]]; then
  echo "DRY: ORG=$ORG scripts/sync.sh --only $short"
else
  ORG="$ORG" bash "$BUNDLE_DIR/scripts/sync.sh" --only "$short"
fi

echo
echo "==> Next"
echo "  1. Merge the sync PR opened on $REPO."
echo "  2. Fill the <org>/<team> placeholders in $REPO/.github/CODEOWNERS."
echo "  3. Copy templates/repo-context.md into the top of $REPO/AGENTS.md and fill it in."
echo "  4. Open a test PR, then run: scripts/setup-repo.sh $REPO --verify"
