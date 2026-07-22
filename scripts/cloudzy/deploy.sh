#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

if [ ! -f .env.cloudzy ]; then
  echo "Missing .env.cloudzy. Copy deploy/cloudzy.env.example and fill real values first."
  exit 1
fi

git pull --ff-only
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml up -d --build
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml ps
