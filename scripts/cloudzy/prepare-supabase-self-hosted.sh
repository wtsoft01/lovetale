#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

SUPABASE_DIR="${SUPABASE_DIR:-../supabase-self-hosted}"

if [ ! -d "$SUPABASE_DIR/.git" ]; then
  git clone --depth 1 https://github.com/supabase/supabase "$SUPABASE_DIR"
fi

cd "$SUPABASE_DIR/docker"

if [ ! -f .env ]; then
  cp .env.example .env
fi

cat <<'EOF'
Self-hosted Supabase docker files are ready.

Next steps:
1. Edit ../supabase-self-hosted/docker/.env.
2. Set SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL to the Cloudzy domain.
3. Generate new JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, POSTGRES_PASSWORD, DASHBOARD_PASSWORD, and secret keys.
4. Start Supabase with: docker compose up -d
5. Copy ANON_KEY and SERVICE_ROLE_KEY into Lovetale .env.cloudzy.

Do not commit the generated .env file.
EOF
