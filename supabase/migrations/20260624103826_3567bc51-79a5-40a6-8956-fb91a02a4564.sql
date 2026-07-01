
CREATE TABLE public.story_affection (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  affection INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_affection TO authenticated;
GRANT ALL ON public.story_affection TO service_role;

ALTER TABLE public.story_affection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_affection_select" ON public.story_affection
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_affection_insert" ON public.story_affection
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_affection_update" ON public.story_affection
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bump_story_affection(_story_id UUID, _delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _new INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.story_affection (user_id, story_id, affection)
  VALUES (_uid, _story_id, GREATEST(0, LEAST(100, 30 + COALESCE(_delta, 0))))
  ON CONFLICT (user_id, story_id) DO UPDATE
    SET affection = GREATEST(0, LEAST(100, public.story_affection.affection + COALESCE(_delta, 0))),
        updated_at = now()
  RETURNING affection INTO _new;

  RETURN _new;
END;
$$;
