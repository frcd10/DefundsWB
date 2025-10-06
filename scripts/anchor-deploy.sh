#!/usr/bin/env bash
set -euo pipefail

# Load .env if present and export variables
if [ -f ./.env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

# Helper to strip surrounding single/double quotes
strip_quotes() {
  local s="$1"
  s="${s%\' }"; s="${s#\' }"   # stray quotes with spaces
  s="${s%\' }"; s="${s#\' }"
  s="${s%\' }"; s="${s#\' }"
  s="${s%\' }"; s="${s#\' }"
  s="${s%\"}"; s="${s#\"}"
  s="${s%\' }"; s="${s#\' }"
  echo "$s"
}

# Normalize and map SOLANA_RPC_URL -> ANCHOR_PROVIDER_URL if provided
if [ "${SOLANA_RPC_URL-}" != "" ]; then
  SOLANA_RPC_URL_CLEAN=$(strip_quotes "$SOLANA_RPC_URL")
  export ANCHOR_PROVIDER_URL="$SOLANA_RPC_URL_CLEAN"
fi

# If ANCHOR_PROVIDER_URL came from .env, clean it too
if [ "${ANCHOR_PROVIDER_URL-}" != "" ]; then
  ANCHOR_PROVIDER_URL=$(strip_quotes "$ANCHOR_PROVIDER_URL")
  export ANCHOR_PROVIDER_URL
fi

# Show which RPC will be used
echo "Using ANCHOR_PROVIDER_URL=$ANCHOR_PROVIDER_URL"

# Deploy program
anchor deploy

# Sync IDL after deploy
node scripts/sync-idl.js
