CREATE TABLE IF NOT EXISTS public.creator_revenue_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_percent INTEGER NOT NULL DEFAULT 70 CHECK (share_percent >= 0 AND share_percent <= 100),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_revenue_rules TO authenticated;
GRANT ALL ON public.creator_revenue_rules TO service_role;

ALTER TABLE public.creator_revenue_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators can read own revenue rule" ON public.creator_revenue_rules;
CREATE POLICY "Creators can read own revenue rule"
  ON public.creator_revenue_rules
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage creator revenue rules" ON public.creator_revenue_rules;
CREATE POLICY "Admins can manage creator revenue rules"
  ON public.creator_revenue_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS creator_revenue_rules_set_updated_at ON public.creator_revenue_rules;
CREATE TRIGGER creator_revenue_rules_set_updated_at
  BEFORE UPDATE ON public.creator_revenue_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  _share_percent INTEGER;
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
  SELECT COALESCE(MAX(share_percent), 70)
    INTO _share_percent
    FROM public.creator_revenue_rules
   WHERE user_id = _story.user_id;
  _share := (_price * COALESCE(_share_percent, 70)) / 100;

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

REVOKE ALL ON FUNCTION public.purchase_user_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_user_story(uuid) TO authenticated;