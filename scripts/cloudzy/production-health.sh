#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

SUPABASE_DOCKER_DIR="${SUPABASE_DOCKER_DIR:-/opt/supabase-self-hosted/docker}"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://love.arirang.club}"
PUBLIC_SUPABASE_URL="${PUBLIC_SUPABASE_URL:-https://supabase.love.arirang.club}"
DB_SERVICE="${SUPABASE_DB_SERVICE:-db}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"

time_url() {
  label="$1"
  url="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -L -s -o /dev/null \
      -w "$label http=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n" \
      "$url" || true
  else
    echo "curl not found; cannot time $label"
  fi
}

echo "== Lovetale git =="
git remote -v || true
git rev-parse --short HEAD || true
git log --oneline -n 5 || true

echo
echo "== Docker containers =="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true

echo
echo "== Docker stats =="
docker stats --no-stream || true

echo
echo "== HTTP timings =="
time_url "local-auth" "$APP_URL/auth"
time_url "public-auth" "$PUBLIC_APP_URL/auth"
time_url "public-explore" "$PUBLIC_APP_URL/explore"
time_url "supabase-health" "$PUBLIC_SUPABASE_URL/auth/v1/health"
time_url "supabase-rest" "$PUBLIC_SUPABASE_URL/rest/v1/"

if [ -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" ]; then
  echo
  echo "== DB content and index check =="
  docker compose -f "$SUPABASE_DOCKER_DIR/docker-compose.yml" exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'user_stories' AS table_name, count(*) AS rows FROM public.user_stories
UNION ALL
SELECT 'media_assets' AS table_name, count(*) AS rows FROM public.media_assets;

SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'user_stories_updated_idx',
    'user_stories_status_updated_idx',
    'user_stories_public_listed_updated_idx',
    'media_assets_story_created_idx',
    'media_assets_status_created_idx'
  )
ORDER BY tablename, indexname;
SQL
else
  echo
  echo "Skipping DB checks: missing Supabase docker-compose.yml at $SUPABASE_DOCKER_DIR"
fi

echo
echo "== Recent Lovetale logs =="
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml logs --tail=80 lovetale || true
