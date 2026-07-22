#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

: "${PLATFORM_DB_URL:?Set PLATFORM_DB_URL to the source Supabase platform database URL.}"

OUT_DIR="${1:-cloudzy-db-dumps/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

npx --yes supabase@latest db dump --db-url "$PLATFORM_DB_URL" --role-only -f "$OUT_DIR/roles.sql"
npx --yes supabase@latest db dump --db-url "$PLATFORM_DB_URL" -f "$OUT_DIR/schema.sql"
npx --yes supabase@latest db dump --db-url "$PLATFORM_DB_URL" --use-copy --data-only -f "$OUT_DIR/data.sql"

printf '%s\n' "Created database dumps in $OUT_DIR"
