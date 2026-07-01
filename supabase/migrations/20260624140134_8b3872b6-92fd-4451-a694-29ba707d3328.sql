-- Unified story body + AI-recommended asset slots
ALTER TABLE public.user_stories
  ADD COLUMN IF NOT EXISTS body_text TEXT,
  ADD COLUMN IF NOT EXISTS asset_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compose_step TEXT NOT NULL DEFAULT 'body';

-- compose_step: 'body' | 'assets' | 'published'
-- asset_slots: array of { id, offset (int char position in body_text),
--   scene_description (text), heat_tier ('soft'|'warm'|'spicy'|'steamy'),
--   media_asset_id (uuid|null), caption (text|null), source ('ai'|'manual') }

-- Character chat transcripts (per user, per story) for reader-side dialog
CREATE TABLE IF NOT EXISTS public.story_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  scene_offset INTEGER,
  affection_at INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.story_chat_messages TO authenticated;
GRANT ALL ON public.story_chat_messages TO service_role;

ALTER TABLE public.story_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own chat select" ON public.story_chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own chat insert" ON public.story_chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own chat delete" ON public.story_chat_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS story_chat_messages_user_story_idx
  ON public.story_chat_messages (user_id, story_id, created_at);
