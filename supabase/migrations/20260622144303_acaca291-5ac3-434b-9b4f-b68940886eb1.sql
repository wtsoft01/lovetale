
-- Marketplace: purchases + RPCs for safe public access

CREATE TABLE public.story_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  price_credits_paid INTEGER NOT NULL DEFAULT 0,
  author_share INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, story_id)
);

GRANT SELECT, INSERT ON public.story_purchases TO authenticated;
GRANT ALL ON public.story_purchases TO service_role;

ALTER TABLE public.story_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see own purchases"
  ON public.story_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_id);

CREATE INDEX story_purchases_buyer_idx ON public.story_purchases(buyer_id, created_at DESC);
CREATE INDEX story_purchases_story_idx ON public.story_purchases(story_id);

-- Marketplace listing: safe columns only, no beats body
CREATE OR REPLACE FUNCTION public.list_marketplace_stories(_limit INTEGER DEFAULT 60)
RETURNS TABLE (
  id UUID,
  title TEXT,
  logline TEXT,
  cover_url TEXT,
  price_credits INTEGER,
  author_id UUID,
  author_name TEXT,
  beats_count INTEGER,
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
         s.created_at
    FROM public.user_stories s
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE s.is_public = true AND s.is_listed = true
   ORDER BY s.created_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.list_marketplace_stories(INTEGER) TO authenticated, anon;

-- Single story meta + first beat preview (no full beats)
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
         s.created_at
    FROM public.user_stories s
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE s.id = _id AND s.is_public = true AND s.is_listed = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_marketplace_story_meta(UUID) TO authenticated, anon;

-- Full playable story — owner OR free OR purchaser
CREATE OR REPLACE FUNCTION public.get_playable_user_story(_id UUID)
RETURNS public.user_stories
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.user_stories;
  _purchased BOOLEAN;
BEGIN
  SELECT * INTO _row FROM public.user_stories WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story not found';
  END IF;

  IF _row.user_id = _uid THEN
    RETURN _row;
  END IF;

  IF NOT (_row.is_public AND _row.is_listed) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(_row.price_credits, 0) = 0 THEN
    RETURN _row;
  END IF;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.story_purchases
     WHERE buyer_id = _uid AND story_id = _id
  ) INTO _purchased;

  IF NOT _purchased THEN
    RAISE EXCEPTION 'purchase required' USING ERRCODE = 'P0002';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_playable_user_story(UUID) TO authenticated;

-- Purchase: deducts buyer credits, credits author 70%, records purchase
CREATE OR REPLACE FUNCTION public.purchase_user_story(_story_id UUID)
RETURNS story_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _story public.user_stories;
  _price INTEGER;
  _share INTEGER;
  _existing public.story_purchases;
  _new_buyer_balance INTEGER;
  _new_author_balance INTEGER;
  _purchase public.story_purchases;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _story FROM public.user_stories WHERE id = _story_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story not found';
  END IF;
  IF NOT (_story.is_public AND _story.is_listed) THEN
    RAISE EXCEPTION 'not for sale';
  END IF;
  IF _story.user_id = _uid THEN
    RAISE EXCEPTION 'cannot purchase your own story';
  END IF;

  SELECT * INTO _existing FROM public.story_purchases
    WHERE buyer_id = _uid AND story_id = _story_id;
  IF FOUND THEN
    RETURN _existing;
  END IF;

  _price := COALESCE(_story.price_credits, 0);
  _share := (_price * 70) / 100;

  IF _price > 0 THEN
    UPDATE public.profiles
       SET credits = credits - _price,
           updated_at = now()
     WHERE id = _uid AND credits >= _price
     RETURNING credits INTO _new_buyer_balance;

    IF _new_buyer_balance IS NULL THEN
      RAISE EXCEPTION 'insufficient credits' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.credit_ledger (user_id, delta, reason, ref_type, ref_id, balance_after)
    VALUES (_uid, -_price, 'story_purchase', 'user_story', _story_id::text, _new_buyer_balance);

    IF _share > 0 THEN
      UPDATE public.profiles
         SET credits = credits + _share,
             updated_at = now()
       WHERE id = _story.user_id
       RETURNING credits INTO _new_author_balance;

      INSERT INTO public.credit_ledger (user_id, delta, reason, ref_type, ref_id, balance_after)
      VALUES (_story.user_id, _share, 'story_sale', 'user_story', _story_id::text,
              COALESCE(_new_author_balance, 0));
    END IF;
  END IF;

  INSERT INTO public.story_purchases (buyer_id, story_id, price_credits_paid, author_share)
  VALUES (_uid, _story_id, _price, _share)
  RETURNING * INTO _purchase;

  RETURN _purchase;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_user_story(UUID) TO authenticated;
