
-- 1) Add discovery columns
ALTER TABLE public.user_stories
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS max_heat TEXT NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_audience_chk;
ALTER TABLE public.user_stories
  ADD CONSTRAINT user_stories_audience_chk
  CHECK (audience IN ('all','female','male'));

ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_max_heat_chk;
ALTER TABLE public.user_stories
  ADD CONSTRAINT user_stories_max_heat_chk
  CHECK (max_heat IN ('soft','warm','spicy','steamy'));

CREATE INDEX IF NOT EXISTS user_stories_market_idx
  ON public.user_stories (is_public, is_listed, audience, max_heat);

-- 2) Updated marketplace listing with filters
DROP FUNCTION IF EXISTS public.list_marketplace_stories(INTEGER);

CREATE OR REPLACE FUNCTION public.list_marketplace_stories(
  _limit INTEGER DEFAULT 60,
  _q TEXT DEFAULT NULL,
  _audience TEXT DEFAULT NULL,
  _max_heat TEXT DEFAULT NULL,
  _tags TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  logline TEXT,
  cover_url TEXT,
  price_credits INTEGER,
  author_id UUID,
  author_name TEXT,
  beats_count INTEGER,
  audience TEXT,
  max_heat TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.title, s.logline, s.cover_url, s.price_credits,
         s.user_id AS author_id,
         COALESCE(p.display_name, 'Anonymous') AS author_name,
         COALESCE(jsonb_array_length(s.beats), 0) AS beats_count,
         s.audience, s.max_heat, s.tags, s.created_at
    FROM public.user_stories s
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE s.is_public = true AND s.is_listed = true
     AND (_q IS NULL OR _q = '' OR
          s.title ILIKE '%' || _q || '%' OR
          COALESCE(s.logline,'') ILIKE '%' || _q || '%')
     AND (_audience IS NULL OR _audience = 'all' OR s.audience = _audience OR s.audience = 'all')
     AND (_max_heat IS NULL OR _max_heat = 'any' OR
          CASE s.max_heat WHEN 'soft' THEN 0 WHEN 'warm' THEN 1 WHEN 'spicy' THEN 2 WHEN 'steamy' THEN 3 END
          <=
          CASE _max_heat WHEN 'soft' THEN 0 WHEN 'warm' THEN 1 WHEN 'spicy' THEN 2 WHEN 'steamy' THEN 3 ELSE 3 END)
     AND (_tags IS NULL OR cardinality(_tags) = 0 OR s.tags && _tags)
   ORDER BY s.created_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.list_marketplace_stories(INTEGER, TEXT, TEXT, TEXT, TEXT[]) TO authenticated, anon;

-- 3) Update meta fn to include new columns
DROP FUNCTION IF EXISTS public.get_marketplace_story_meta(UUID);

CREATE OR REPLACE FUNCTION public.get_marketplace_story_meta(_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  logline TEXT,
  cover_url TEXT,
  price_credits INTEGER,
  author_id UUID,
  author_name TEXT,
  character_card JSONB,
  beats_count INTEGER,
  preview JSONB,
  audience TEXT,
  max_heat TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.title, s.logline, s.cover_url, s.price_credits,
         s.user_id AS author_id,
         COALESCE(p.display_name, 'Anonymous') AS author_name,
         s.character_card,
         COALESCE(jsonb_array_length(s.beats), 0) AS beats_count,
         CASE WHEN jsonb_array_length(s.beats) > 0
              THEN jsonb_build_object(
                'text', s.beats -> 0 ->> 'text',
                'narration', s.beats -> 0 ->> 'narration',
                'speaker', s.beats -> 0 ->> 'speaker'
              )
              ELSE NULL
         END AS preview,
         s.audience, s.max_heat, s.tags, s.created_at
    FROM public.user_stories s
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE s.id = _id AND s.is_public = true AND s.is_listed = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_marketplace_story_meta(UUID) TO authenticated, anon;

-- 4) Purchased stories list
CREATE OR REPLACE FUNCTION public.list_my_purchased_stories()
RETURNS TABLE (
  id UUID,
  title TEXT,
  logline TEXT,
  cover_url TEXT,
  author_name TEXT,
  price_credits_paid INTEGER,
  purchased_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.title, s.logline, s.cover_url,
         COALESCE(p.display_name, 'Anonymous') AS author_name,
         pur.price_credits_paid,
         pur.created_at AS purchased_at
    FROM public.story_purchases pur
    JOIN public.user_stories s ON s.id = pur.story_id
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE pur.buyer_id = auth.uid()
   ORDER BY pur.created_at DESC
   LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_purchased_stories() TO authenticated;
