# Cloudzy Full Migration

This guide treats Cloudzy as the production home for both the Lovetale web app
and the Supabase-backed database/auth/storage layer.

## Target architecture

- `love.arirang.club` -> Lovetale Node server on `127.0.0.1:3000`
- `supabase.love.arirang.club` -> self-hosted Supabase gateway on `127.0.0.1:8000`
- A single host-level reverse proxy handles public `80/443`.
- Lovetale runs from this repo with `docker-compose.cloudzy.yml`.
- Supabase runs from the official self-hosted Supabase Docker stack.

The app depends on Supabase Auth, Storage, PostgREST, RLS policies, and
`auth.users`, so moving only to a raw PostgreSQL server would require a large
backend rewrite. The first full Cloudzy migration should therefore self-host
Supabase on Cloudzy.

## Domains

Create DNS records before final cutover:

```text
love.arirang.club      A  <cloudzy-vps-ip>
supabase.love.arirang.club  A  <cloudzy-vps-ip>
```

Keep TTL low, for example 300 seconds, during migration.

## VPS packages

Install these on the Cloudzy VPS:

```sh
sudo apt update
sudo apt install -y git curl ca-certificates postgresql-client rclone
```

Install Docker Engine and the Docker Compose plugin using Docker's official
instructions for the VPS operating system. Use either Caddy or Nginx as the
host-level reverse proxy. Caddy is the simplest TLS path.

## Prepare self-hosted Supabase

From the Lovetale checkout:

```sh
SUPABASE_DIR=../supabase-self-hosted sh scripts/cloudzy/prepare-supabase-self-hosted.sh
```

Then edit `../supabase-self-hosted/docker/.env`.

Set at minimum:

```text
SITE_URL=https://love.arirang.club
API_EXTERNAL_URL=https://supabase.love.arirang.club
SUPABASE_PUBLIC_URL=https://supabase.love.arirang.club
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<strong-random-secret>
ANON_KEY=<generated-anon-key>
SERVICE_ROLE_KEY=<generated-service-role-key>
DASHBOARD_USERNAME=<admin-user>
DASHBOARD_PASSWORD=<strong-password>
```

Also configure SMTP before production email login, password reset, or email
confirmation flows are used.

If Google login is enabled in the UI, enable the Google OAuth provider in
self-hosted Supabase and set its redirect URL to the Cloudzy app domain.

Start self-hosted Supabase:

```sh
cd ../supabase-self-hosted/docker
docker compose up -d
docker compose ps
```

## Configure Lovetale app

In the Lovetale checkout:

```sh
cp deploy/cloudzy.env.example .env.cloudzy
vi .env.cloudzy
```

Use the self-hosted Supabase values:

```text
VITE_SUPABASE_URL=https://supabase.love.arirang.club
SUPABASE_URL=http://kong:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted-anon-key>
SUPABASE_PUBLISHABLE_KEY=<self-hosted-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<self-hosted-service-role-key>
```

`VITE_SUPABASE_URL` is the browser-facing URL. `SUPABASE_URL` is used by the
server-side Supabase admin client and should use the Docker network on Cloudzy
so server routes do not depend on public DNS while validating user tokens.

Run the app:

```sh
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml up -d --build
docker compose --env-file .env.cloudzy -f docker-compose.cloudzy.yml logs -f lovetale
```

The app compose file binds to `127.0.0.1:3000` so it does not compete with the
host reverse proxy for ports `80/443`.

## Reverse proxy

Caddy example:

```sh
sudo cp deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Set these environment variables for Caddy or replace the placeholders directly:

```text
ACME_EMAIL=admin@lovetale.org
APP_DOMAIN=love.arirang.club
SUPABASE_DOMAIN=supabase.love.arirang.club
```

Nginx users can adapt `deploy/nginx/cloudzy.full-http.conf.example` and then add
TLS with Certbot.

## Database migration

During the final migration window, freeze writes on the old service first. Then
dump the current Supabase Platform database:

```sh
PLATFORM_DB_URL='<source-supabase-platform-db-url>' \
  sh scripts/cloudzy/dump-supabase-platform.sh
```

Restore into self-hosted Supabase:

```sh
SELF_HOSTED_DB_URL='postgresql://postgres:<password>@127.0.0.1:5432/postgres' \
  sh scripts/cloudzy/restore-supabase-self-hosted.sh cloudzy-db-dumps/<timestamp>
```

If the official Supabase restore procedure changes, follow the official restore
guide first and use these scripts only as helpers.

## Storage migration

The database dump does not move the actual media files. Lovetale uses the
`story-media` bucket, so storage objects must be copied too.

If both source and target are exposed through S3-compatible storage endpoints,
configure two `rclone` remotes and run:

```sh
PLATFORM_STORAGE_REMOTE=lovetale-platform-storage \
SELF_HOSTED_STORAGE_REMOTE=lovetale-cloudzy-storage \
  sh scripts/cloudzy/copy-supabase-storage-s3.sh
```

After copying, verify representative images from `/explore`, `/chats`, and
admin media pages.

## Cloudzy backups

For the new Cloudzy-owned database, run a local backup after first launch and
then schedule it daily:

```sh
sh scripts/cloudzy/backup-self-hosted.sh
```

By default this writes root-owned backups under `/opt/lovetale-backups` and
keeps 14 days. Each backup contains:

- `roles.sql`
- `postgres.dump`
- `storage.tgz` when storage files exist
- `manifest.txt`

The backup does not include `.env.cloudzy` or the Supabase `docker/.env`
secrets. Keep those files protected separately and rotate any key that was ever
shared outside the server.

Example cron entry:

```cron
23 18 * * * cd /opt/lovetale && sh scripts/cloudzy/backup-self-hosted.sh >> /var/log/lovetale-backup.log 2>&1
```

This runs at 03:23 KST.

## Cutover checklist

1. Self-hosted Supabase starts and `https://supabase.love.arirang.club/auth/v1/health` responds.
2. Lovetale starts and `https://love.arirang.club/auth` responds.
3. `.env.cloudzy` uses only self-hosted Supabase keys.
4. Supabase Auth redirect URLs include `https://love.arirang.club`.
5. Email/password and Google login work against the self-hosted Auth service.
6. `/explore`, `/chats`, `/admin`, `/admin/stories`, and image unlock flows work.
7. Storage images load from Cloudzy-backed storage.
8. Old Vercel/Supabase service is kept read-only until Cloudzy is verified.

## Rollback

Before changing DNS, keep the Vercel/Supabase Platform deployment intact. If
Cloudzy fails after DNS cutover, point DNS back while TTL is low and keep the
old database as the source of truth.

## Secret safety

Do not commit `.env.cloudzy` or the self-hosted Supabase `docker/.env`. Rotate
the Supabase service role key if it was ever pasted into logs, screenshots, or
chat output.

## References

- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/platform-migration
