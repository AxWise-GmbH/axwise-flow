#!/usr/bin/env bash
set -euo pipefail
set +x

# One source commit; three images; five independently operated Cloud Run services.
repo_root="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)"
export ORQALY_REPOSITORY="${repo_root}/apps/orqaly"
export AXWISE_REPOSITORY="${repo_root}"
export ORQALY_API_ORIGIN="https://orqaly-v2-api-preview-161074549006.europe-west4.run.app"
export CLERK_PUBLISHABLE_KEY_VERSION="${CLERK_PUBLISHABLE_KEY_VERSION:?pin the enabled numeric publishable-key version}"
export BUILD_ATTESTATION_OUTPUT="${BUILD_ATTESTATION_OUTPUT:?absolute create-only path outside the worktree}"

exec bash "${ORQALY_REPOSITORY}/infra/gcp/workflow-v2/build-preview-images.sh"
