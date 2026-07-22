#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

: "${SELF_HOSTED_DB_URL:?Set SELF_HOSTED_DB_URL to the target self-hosted Supabase postgres URL.}"

DUMP_DIR="${1:?Usage: SELF_HOSTED_DB_URL=... sh scripts/cloudzy/restore-supabase-self-hosted.sh cloudzy-db-dumps/<timestamp>}"

psql \
  --single-transaction \
  --set ON_ERROR_STOP=1 \
  --file "$DUMP_DIR/roles.sql" \
  --file "$DUMP_DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$DUMP_DIR/data.sql" \
  --dbname "$SELF_HOSTED_DB_URL"

printf '%s\n' "Restored database dump from $DUMP_DIR"
