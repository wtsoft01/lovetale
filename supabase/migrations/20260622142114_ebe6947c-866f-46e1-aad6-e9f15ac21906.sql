
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_subscribed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.media_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id text NOT NULL,
  beat_id text NOT NULL,
  heat_tier text NOT NULL,
  credits_spent integer NOT NULL DEFAULT 0,
  unlocked_via text NOT NULL DEFAULT 'credits',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, story_id, beat_id)
);

GRANT SELECT, INSERT ON public.media_unlocks TO authenticated;
GRANT ALL ON public.media_unlocks TO service_role;

ALTER TABLE public.media_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own media unlocks"
  ON public.media_unlocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own media unlocks"
  ON public.media_unlocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS media_unlocks_user_story_idx
  ON public.media_unlocks (user_id, story_id);
