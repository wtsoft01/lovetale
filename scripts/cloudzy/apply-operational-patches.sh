#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

SUPABASE_DOCKER_DIR="${SUPABASE_DOCKER_DIR:-/opt/supabase-self-hosted/docker}"
DB_SERVICE="${SUPABASE_DB_SERVICE:-db}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"

if [ ! -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" ]; then
  echo "Skipping DB patches: missing Supabase docker-compose.yml at $SUPABASE_DOCKER_DIR"
  exit 0
fi

apply_sql_file() {
  file="$1"
  if [ ! -f "$file" ]; then
    echo "Missing SQL patch: $file"
    exit 1
  fi

  echo "Applying SQL patch: $file"
  docker compose -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$file"
}

# Keep this list to idempotent operational patches only. Historical migrations
# include non-idempotent CREATE TABLE statements and should not be replayed here.
apply_sql_file "supabase/migrations/20260724080000_admin_content_performance_indexes.sql"

echo "Operational DB patches applied."
