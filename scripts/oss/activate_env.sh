#!/usr/bin/env bash
# Activate local Python venv and load backend/.env.oss into current shell
#
# Usage (persist env in your shell):
#   source scripts/oss/activate_env.sh
#
# Optional: run from anywhere
#   source /Users/admin/Downloads/axwise-flow-oss/scripts/oss/activate_env.sh

# Don't use set -e when sourced, as it affects the parent shell
# Instead, we'll handle errors explicitly

# Resolve repo root (two levels up from this script), compatible with bash and zsh
if [ -n "${BASH_SOURCE[0]+x}" ]; then
  SCRIPT_FILE="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION-}" ]; then
  # zsh: %x expands to the current sourced script path
  SCRIPT_FILE="${(%):-%x}"
else
  SCRIPT_FILE="$0"
fi
REPO_ROOT="$(cd "$(dirname "$SCRIPT_FILE")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
ENV_FILE="$BACKEND_DIR/.env.oss"

# Guard: only operate when current directory is inside this repo, unless forced
IN_REPO=0
case "$PWD" in
  "$REPO_ROOT"*) IN_REPO=1 ;;
  *) IN_REPO=0 ;;
esac
if [ "$IN_REPO" -ne 1 ] && [ "${AXWISE_FORCE_ACTIVATE:-0}" != "1" ]; then
  echo "Skipping activation: current directory (PWD=$PWD) is not under $REPO_ROOT"
  echo "Hint: cd $REPO_ROOT and re-run, or set AXWISE_FORCE_ACTIVATE=1 to override"
  return 0 2>/dev/null || exit 0
fi

# Pick a venv to activate (first match wins)
CANDIDATE_VENVS=(
  "$REPO_ROOT/.venv/bin/activate"
  "$REPO_ROOT/venv_py-flow-oss/bin/activate"
  "$REPO_ROOT/venv_py311/bin/activate"  # backward compatibility
  "$BACKEND_DIR/venv/bin/activate"
  "$REPO_ROOT/venv/bin/activate"
)

VENVSRC=""
for v in "${CANDIDATE_VENVS[@]}"; do
  if [ -f "$v" ]; then VENVSRC="$v"; break; fi
done

# Note about sourcing (works for any shell)
echo "Note: To persist activation and env vars in your current shell, run: source scripts/oss/activate_env.sh"

# Activate venv (auto-deactivate conflicting one)
if [ -n "$VENVSRC" ]; then
  TARGET_VENV_DIR="$(cd "$(dirname "$VENVSRC")/.." && pwd 2>/dev/null || echo "")"
  if [ -n "${VIRTUAL_ENV-}" ] && [ -n "$TARGET_VENV_DIR" ] && [ "$VIRTUAL_ENV" != "$TARGET_VENV_DIR" ]; then
    # Deactivate any other active venv to avoid cross-project contamination
    if command -v deactivate >/dev/null 2>&1; then deactivate; fi
  fi
  # shellcheck disable=SC1090
  source "$VENVSRC"
else
  echo "WARNING: No Python venv found. Expected one of:" >&2
  printf '  - %s\n' "${CANDIDATE_VENVS[@]}" >&2
  echo "Create one, e.g.:" >&2
  echo "  cd $BACKEND_DIR && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt" >&2
fi

# Load backend environment
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Missing $ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Summary
PY_VER="$(python -V 2>/dev/null || true)"
WHICH_PY="$(command -v python || true)"
VENV_DIR="${VIRTUAL_ENV:-}"

echo ""
echo "=== Local dev environment activated ==="
echo "Repo root: $REPO_ROOT"
echo "Python:   ${PY_VER:-unknown} ($WHICH_PY)"
echo "Venv:     ${VENV_DIR:-none}"
echo "OSS_MODE: ${OSS_MODE:-}"
echo "DB URL:   ${DATABASE_URL:-not set}"
if [ -n "$GEMINI_API_KEY" ]; then
  echo "GEMINI:   ${GEMINI_API_KEY:0:10}..."
else
  echo "GEMINI:   (not set)"
fi
echo "======================================="

echo "Tips:"
echo "- Start backend: python -m uvicorn backend.api.app:app --host 0.0.0.0 --port \"${UVICORN_PORT:-8000}\" --reload"
echo "- Start via script (also loads env): scripts/oss/run_backend_oss.sh"

