#!/usr/bin/env sh
set -eu

SUPABASE_DOCKER_DIR="${SUPABASE_DOCKER_DIR:-/opt/supabase-self-hosted/docker}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/lovetale-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" ]; then
  echo "Missing Supabase docker-compose.yml at $SUPABASE_DOCKER_DIR"
  exit 1
fi

case "$BACKUP_ROOT" in
  /opt/lovetale-backups|/opt/lovetale-backups/*) ;;
  *)
    echo "Refusing unsafe BACKUP_ROOT: $BACKUP_ROOT"
    echo "Use /opt/lovetale-backups or a child directory."
    exit 1
    ;;
esac

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/$stamp"
mkdir -p "$backup_dir"
chmod 700 "$BACKUP_ROOT" "$backup_dir"

cd "$SUPABASE_DOCKER_DIR"

docker compose exec -T db pg_dumpall -U postgres --globals-only > "$backup_dir/roles.sql"
docker compose exec -T db pg_dump -U postgres --format=custom --no-owner --no-acl --dbname postgres > "$backup_dir/postgres.dump"

if [ -d "$SUPABASE_DOCKER_DIR/volumes/storage" ]; then
  tar -C "$SUPABASE_DOCKER_DIR/volumes" -czf "$backup_dir/storage.tgz" storage
fi

{
  echo "created_at=$stamp"
  echo "hostname=$(hostname)"
  echo "supabase_docker_dir=$SUPABASE_DOCKER_DIR"
  if command -v git >/dev/null 2>&1 && [ -d /opt/lovetale/.git ]; then
    echo "lovetale_commit=$(git -C /opt/lovetale rev-parse --short HEAD 2>/dev/null || true)"
  fi
  docker compose ps --format 'table {{.Service}}\t{{.Health}}' || true
} > "$backup_dir/manifest.txt"

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

echo "Created backup at $backup_dir"
