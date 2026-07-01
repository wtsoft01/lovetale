
CREATE TABLE public.user_stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  logline TEXT,
  source_prompt TEXT NOT NULL,
  character_card JSONB NOT NULL DEFAULT '{}'::jsonb,
  beats JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_listed BOOLEAN NOT NULL DEFAULT false,
  price_credits INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stories TO authenticated;
GRANT ALL ON public.user_stories TO service_role;

ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own stories"
  ON public.user_stories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can insert own stories"
  ON public.user_stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update own stories"
  ON public.user_stories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete own stories"
  ON public.user_stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_stories_set_updated_at
  BEFORE UPDATE ON public.user_stories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX user_stories_user_idx ON public.user_stories(user_id, updated_at DESC);
