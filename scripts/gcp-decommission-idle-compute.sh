#!/usr/bin/env bash
# ==============================================================================
# GCP Decommission Script: Idle & Redundant Compute Resources
# Target Projects:
#   - axwise-v2-preview-001 (europe-west4)
#   - axwise-73425          (europe-west4)
# ==============================================================================

set -euo pipefail

REGION="europe-west4"
DRY_RUN=true
FORCE=false

# Protected services that MUST NEVER be deleted
PROTECTED_SERVICES=(
  "orqaly-v2-web-preview"
  "orqaly-v2-api-preview"
  "orqaly-v2-worker-preview"
  "axwise-flow"
  "axwise-backend"
)

# Idle services scheduled for decommissioning
CANDIDATES_PREVIEW=(
  "axwise-v2-preview"
  "axwise-v2-search-preview"
  "axwise-v2-worker-preview"
  "orqaly-agentic-n8n-preview"
)

CANDIDATES_PROD=(
  "axwise-searxng"
  "axwise-orqaly-scope-worker"
  "axwise-orqaly-worker"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --dry-run       Simulate the decommissioning without deleting anything (DEFAULT).
  --apply         Execute the deletion of confirmed idle services.
  --force         Bypass interactive confirmation prompt (use with care in CI).
  -h, --help      Show this help message.

Example:
  $(basename "$0") --dry-run
  $(basename "$0") --apply
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --apply)
      DRY_RUN=false
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

echo "===================================================================="
echo " GCP Compute Decommissioning Tool"
echo " Mode: $( [ "$DRY_RUN" = true ] && echo "DRY-RUN (Safe, no changes)" || echo "APPLY (DELETION ENABLED)" )"
echo " Region: $REGION"
echo "===================================================================="
echo ""

# Safety check helper
is_protected() {
  local svc="$1"
  for p in "${PROTECTED_SERVICES[@]}"; do
    if [[ "$p" == "$svc" ]]; then
      return 0
    fi
  done
  return 1
}

# 1. Preview Project Audit
PROJECT_PREVIEW="axwise-v2-preview-001"
echo "--- [Project: $PROJECT_PREVIEW] Candidates for Deletion ---"
for svc in "${CANDIDATES_PREVIEW[@]}"; do
  if is_protected "$svc"; then
    echo "  [SAFETY BLOCKED] $svc is in the protected list! Skipping."
    continue
  fi
  if gcloud run services describe "$svc" --project="$PROJECT_PREVIEW" --region="$REGION" --format="value(status.url)" >/dev/null 2>&1; then
    echo "  [FOUND] $svc (Active in Cloud Run)"
  else
    echo "  [NOT FOUND] $svc (Already absent or removed)"
  fi
done

echo ""

# 2. Prod Legacy Project Audit
PROJECT_PROD="axwise-73425"
echo "--- [Project: $PROJECT_PROD] Candidates for Deletion ---"
for svc in "${CANDIDATES_PROD[@]}"; do
  if is_protected "$svc"; then
    echo "  [SAFETY BLOCKED] $svc is in the protected list! Skipping."
    continue
  fi
  if gcloud run services describe "$svc" --project="$PROJECT_PROD" --region="$REGION" --format="value(status.url)" >/dev/null 2>&1; then
    echo "  [FOUND] $svc (Active in Cloud Run)"
  else
    echo "  [NOT FOUND] $svc (Already absent or removed)"
  fi
done

echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete. No resources were deleted or modified."
  echo "To proceed with decommissioning, run:"
  echo "  $0 --apply"
  exit 0
fi

# Confirmation prompt for Apply
if [ "$FORCE" = false ]; then
  echo "WARNING: You are about to permanently delete the services listed above."
  read -r -p "Are you sure you want to delete these Cloud Run services? (type 'yes' to proceed): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Operation aborted by user."
    exit 1
  fi
fi

# Deletion execution
echo ""
echo "--- Decommissioning services in $PROJECT_PREVIEW ---"
for svc in "${CANDIDATES_PREVIEW[@]}"; do
  if is_protected "$svc"; then
    continue
  fi
  echo "Deleting Cloud Run service: $svc from $PROJECT_PREVIEW..."
  gcloud run services delete "$svc" --project="$PROJECT_PREVIEW" --region="$REGION" --quiet || echo "Warning: Failed or already deleted: $svc"
done

echo ""
echo "--- Decommissioning services in $PROJECT_PROD ---"
for svc in "${CANDIDATES_PROD[@]}"; do
  if is_protected "$svc"; then
    continue
  fi
  echo "Deleting Cloud Run service: $svc from $PROJECT_PROD..."
  gcloud run services delete "$svc" --project="$PROJECT_PROD" --region="$REGION" --quiet || echo "Warning: Failed or already deleted: $svc"
done

echo ""
echo "===================================================================="
echo " Decommissioning completed successfully."
echo " Verifying health of protected services..."
echo "===================================================================="
curl -s -I "https://orqaly-v2-web-preview-161074549006.europe-west4.run.app" | head -n 1 || true
curl -s -I "https://axwise-flow-993236701053.europe-west4.run.app" | head -n 1 || true
echo "Done."
