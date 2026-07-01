-- 1) media_unlocks: remove client INSERT policy; require server-side SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "Users can insert their own media unlocks" ON public.media_unlocks;

CREATE OR REPLACE FUNCTION public.unlock_beat_media(
  _story_id uuid,
  _beat_id text,
  _heat_tier text,
  _cost integer
) RETURNS public.media_unlocks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.media_unlocks;
  _profile public.profiles;
  _sub_active boolean;
  _unlocked_via text;
  _new_balance integer;
  _row public.media_unlocks;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _cost IS NULL OR _cost < 0 THEN
    RAISE EXCEPTION 'invalid cost';
  END IF;

  SELECT * INTO _existing FROM public.media_unlocks
    WHERE user_id = _uid AND story_id = _story_id AND beat_id = _beat_id
    LIMIT 1;
  IF FOUND THEN
    RETURN _existing;
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  _sub_active := COALESCE(_profile.is_subscribed, false)
                 AND (_profile.subscription_expires_at IS NULL
                      OR _profile.subscription_expires_at > now());

  IF _cost = 0 THEN
    _unlocked_via := 'free';
  ELSIF _sub_active THEN
    _unlocked_via := 'subscription';
  ELSE
    _unlocked_via := 'credits';
    UPDATE public.profiles
       SET credits = credits - _cost,
           updated_at = now()
     WHERE id = _uid AND credits >= _cost
     RETURNING credits INTO _new_balance;
    IF _new_balance IS NULL THEN
      RAISE EXCEPTION 'insufficient credits' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.credit_ledger (user_id, delta, reason, ref_type, ref_id, balance_after)
    VALUES (_uid, -_cost, 'media_unlock', 'beat', _story_id::text || ':' || _beat_id, _new_balance);
  END IF;

  INSERT INTO public.media_unlocks (user_id, story_id, beat_id, heat_tier, credits_spent, unlocked_via)
  VALUES (_uid, _story_id, _beat_id, _heat_tier,
          CASE WHEN _unlocked_via = 'credits' THEN _cost ELSE 0 END,
          _unlocked_via)
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) TO authenticated;

-- 2) story_purchases: explicit deny of client writes; only SECURITY DEFINER RPC / service_role may write.
CREATE POLICY "no client inserts" ON public.story_purchases
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no client updates" ON public.story_purchases
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client deletes" ON public.story_purchases
  FOR DELETE TO authenticated USING (false);

-- 3) user_roles: explicit deny of non-admin writes (admins still covered by existing ALL policy).
CREATE POLICY "non-admins cannot insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "non-admins cannot update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "non-admins cannot delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
