#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

if [ ! -f .env.cloudzy ]; then
  echo "Missing .env.cloudzy. Copy deploy/cloudzy.env.example and fill real values first."
  exit 1
fi

SUPABASE_DOCKER_DIR="${SUPABASE_DOCKER_DIR:-/opt/supabase-self-hosted/docker}"
STOP_SUPABASE_DURING_BUILD="${STOP_SUPABASE_DURING_BUILD:-1}"
restart_supabase() {
  if [ "$STOP_SUPABASE_DURING_BUILD" = "1" ] && [ -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" ]; then
    (cd "$SUPABASE_DOCKER_DIR" && docker compose up -d)
  fi
}

git pull --ff-only
if [ "$STOP_SUPABASE_DURING_BUILD" = "1" ] && [ -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" ]; then
  trap restart_supabase EXIT INT TERM
  (cd "$SUPABASE_DOCKER_DIR" && docker compose stop)
fi
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml up -d --build
restart_supabase
trap - EXIT INT TERM
sh scripts/cloudzy/apply-operational-patches.sh
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml ps
