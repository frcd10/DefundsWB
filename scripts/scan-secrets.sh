#!/usr/bin/env bash
set -euo pipefail

# Simple local secret scan (no third-party). Greps for common patterns.
# Exits non-zero if any matches are found.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

IGNORE_DIRS=(
  ".git"
  "node_modules"
  "target"
  ".next"
  ".turbo"
  "dist"
  "build"
  "release"
)

# Build grep exclude args
EXCLUDES=()
for d in "${IGNORE_DIRS[@]}"; do
  EXCLUDES+=(--exclude-dir="$d")
done

PATTERNS=(
  "mongodb\\+srv://"
  "api-key=[A-Za-z0-9-]{8,}"
  "HELIUS_API_KEY"
  "PRIVATE_KEY"
  "SECRET[_A-Z]*="
  "keypair.json"
  "BEGIN RSA PRIVATE KEY"
  "base58.*[1-9A-HJ-NP-Za-km-z]{40,}"
)

FOUND=0
for p in "${PATTERNS[@]}"; do
  if grep -RIn ${EXCLUDES[@]} -E "$p" . >/tmp/secret_scan_hits.txt 2>/dev/null; then
    echo "Potential secret pattern: $p"
    sed -E 's/([A-Za-z0-9_\-]{6})[A-Za-z0-9_\-]{10,}/\1********/g' /tmp/secret_scan_hits.txt
    echo
    FOUND=1
  fi
  rm -f /tmp/secret_scan_hits.txt || true
done

if [[ $FOUND -ne 0 ]]; then
  echo "Secret scan found potential issues. Review above and fix before commit."
  exit 1
fi

echo "Secret scan OK."
