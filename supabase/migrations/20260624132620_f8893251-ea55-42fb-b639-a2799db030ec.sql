
-- Home placement slots: hero | trending | new | all
CREATE TYPE public.home_slot AS ENUM ('hero', 'trending', 'new', 'all');

CREATE TABLE public.home_placements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot public.home_slot NOT NULL,
  story_id UUID NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (slot, story_id)
);

GRANT SELECT ON public.home_placements TO anon, authenticated;
GRANT ALL ON public.home_placements TO service_role;

ALTER TABLE public.home_placements ENABLE ROW LEVEL SECURITY;

-- Anyone can read active placements (joined with public stories)
CREATE POLICY "anyone reads active placements"
  ON public.home_placements FOR SELECT
  USING (is_active = true);

-- Only admins/editors manage placements
CREATE POLICY "staff manages placements"
  ON public.home_placements FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

CREATE INDEX idx_home_placements_slot ON public.home_placements(slot, sort_order) WHERE is_active = true;

CREATE TRIGGER trg_home_placements_updated_at
  BEFORE UPDATE ON public.home_placements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public RPC: list placements joined with public stories
CREATE OR REPLACE FUNCTION public.list_home_placements(_slot public.home_slot)
RETURNS TABLE (
  id UUID, slot public.home_slot, sort_order INTEGER,
  story_id UUID, title TEXT, logline TEXT, cover_url TEXT,
  price_credits INTEGER, author_id UUID, author_name TEXT,
  audience TEXT, max_heat TEXT, tags TEXT[], created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT hp.id, hp.slot, hp.sort_order,
         s.id AS story_id, s.title, s.logline, s.cover_url,
         s.price_credits,
         s.user_id AS author_id,
         COALESCE(p.display_name, 'Anonymous') AS author_name,
         s.audience, s.max_heat, s.tags, s.created_at
    FROM public.home_placements hp
    JOIN public.user_stories s ON s.id = hp.story_id
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE hp.is_active = true
     AND hp.slot = _slot
     AND s.is_public = true AND s.is_listed = true
  ORDER BY hp.sort_order ASC, hp.created_at DESC
  LIMIT 50;
$$;

REVOKE EXECUTE ON FUNCTION public.list_home_placements(public.home_slot) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_home_placements(public.home_slot) TO anon, authenticated;
