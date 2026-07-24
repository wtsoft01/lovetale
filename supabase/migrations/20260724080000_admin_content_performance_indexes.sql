-- Speed up Cloudzy self-hosted admin content workspace queries after a fresh DB install.

CREATE INDEX IF NOT EXISTS user_stories_updated_idx
  ON public.user_stories(updated_at DESC);

CREATE INDEX IF NOT EXISTS user_stories_status_updated_idx
  ON public.user_stories(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_stories_public_listed_updated_idx
  ON public.user_stories(is_public, is_listed, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_story_created_idx
  ON public.media_assets(story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS media_assets_status_created_idx
  ON public.media_assets(status, created_at DESC);
