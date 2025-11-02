#!/usr/bin/env bash
set -euo pipefail
set -f

# This script creates a local mirror of the current repo,
# runs BFG Repo-Cleaner with comprehensive secret patterns from bfg-replacements.txt,
# and optionally force-pushes the cleaned history.
#
# Usage:
#   DRY_RUN=1 ./run-bfg-clean.sh  # Default: no push, safe review
#   PUSH=1 ./run-bfg-clean.sh     # Force-push cleaned history (destructive!)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/scripts/security/tmp"
BFG_JAR="$WORK_DIR/bfg-repo-cleaner-1.14.0.jar"
REPL_FILE="$ROOT_DIR/bfg-replacements.txt"  # Use comprehensive repo patterns
MIRROR_DIR="$WORK_DIR/axwise-flow-oss-mirror.git"
VERIFY_DIR="$WORK_DIR/axwise-flow-oss-verify"
PUSH="${PUSH:-0}"  # 0=dry-run (default), 1=force-push

mkdir -p "$WORK_DIR"

echo "========================================="
echo "  BFG Repo-Cleaner - Secret Purge"
echo "========================================="
echo "Repository root: $ROOT_DIR"
echo "Work directory: $WORK_DIR"
echo "Replacements file: $REPL_FILE"
echo "Mirror directory: $MIRROR_DIR"
echo "Push mode: $([ "$PUSH" = "1" ] && echo "ENABLED (will force-push)" || echo "DISABLED (dry-run)")"
echo ""

# 1) Verify replacements file exists
if [ ! -f "$REPL_FILE" ]; then
  echo "Error: Replacements file not found: $REPL_FILE"
  exit 1
fi
echo "✓ Using comprehensive replacements from: $REPL_FILE"
echo ""

# 2) Ensure BFG jar
if [ ! -f "$BFG_JAR" ]; then
  echo "Downloading BFG Repo-Cleaner 1.14.0..."
  curl -L -o "$BFG_JAR" \
    https://repo1.maven.org/maven2/com/madgag/bfg-repo-cleaner/1.14.0/bfg-repo-cleaner-1.14.0.jar
  echo "✓ Downloaded BFG jar"
  echo ""
fi

# 3) Create fresh mirror from current repo
echo "Creating mirror from current repository..."
rm -rf "$MIRROR_DIR"
git clone --mirror "$ROOT_DIR" "$MIRROR_DIR"
echo "✓ Mirror created"
echo ""

# 4) Run BFG
echo "Running BFG Repo-Cleaner..."
echo "This will rewrite history to remove secrets matching patterns in $REPL_FILE"
echo ""
cd "$MIRROR_DIR"
java -jar "$BFG_JAR" --replace-text "$REPL_FILE" --no-blob-protection .
echo ""
echo "✓ BFG completed"
echo ""

# 5) Garbage collect
echo "Running garbage collection..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive
echo "✓ Garbage collection completed"
echo ""

# 6) Push or report
if [ "$PUSH" = "1" ]; then
  echo "========================================="
  echo "  Force-pushing cleaned history"
  echo "========================================="
  echo "WARNING: This will rewrite remote history!"
  echo "Press Ctrl+C within 5 seconds to abort..."
  sleep 5
  git push --force --mirror
  echo "✓ Force-push completed"
  echo ""
else
  echo "========================================="
  echo "  Dry-run complete (no push)"
  echo "========================================="
  echo "Mirror cleaned at: $MIRROR_DIR"
  echo "To force-push, run: PUSH=1 $0"
  echo ""
fi

cd "$ROOT_DIR"

# 7) Verify cleaned mirror
echo "========================================="
echo "  Verification Scan"
echo "========================================="
echo "Cloning cleaned mirror for verification..."
rm -rf "$VERIFY_DIR"
git clone "$MIRROR_DIR" "$VERIFY_DIR"
cd "$VERIFY_DIR"

PATTERN='(pk_live|pk_test)_[A-Za-z0-9]{10,}|(sk_live|sk_test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|AIza[-_A-Za-z0-9]{20,}|CLERK_SECRET_KEY|DEV_TOKEN_REDACTED|DEV_TOKEN_REDACTED|postgresql\+?[^:/[:space:]]*://[^:@[:space:]]+:[^@[:space:]]+@|34\.13\.154\.146'
echo "Scanning HEAD for sensitive patterns..."
echo ""
if grep -R -nI -E "$PATTERN" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=venv 2>/dev/null | head -20; then
  echo ""
  echo "⚠ WARNING: Potential sensitive patterns remain in HEAD (showing first 20 matches)"
  echo "Review the output above and the mirror at: $MIRROR_DIR"
  echo ""
  if [ "$PUSH" = "1" ]; then
    echo "ERROR: Refusing to push with sensitive patterns detected" >&2
    exit 1
  fi
else
  echo "✓ No sensitive patterns found in HEAD"
  echo ""
fi

echo "========================================="
echo "  BFG Cleanup Complete"
echo "========================================="
echo "Mirror location: $MIRROR_DIR"
echo "Verification clone: $VERIFY_DIR"
echo ""
if [ "$PUSH" = "1" ]; then
  echo "✓ Cleaned history has been force-pushed"
else
  echo "Next steps:"
  echo "  1. Review the cleaned mirror at: $MIRROR_DIR"
  echo "  2. Check the verification clone at: $VERIFY_DIR"
  echo "  3. If satisfied, run: PUSH=1 $0"
fi
echo ""
echo "Done."

