
-- 1) profiles_public_sensitive_fields: restrict SELECT to own row only.
-- Marketplace/author display reads go through SECURITY DEFINER RPCs which bypass RLS.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 2) credit_orders_user_update_no_field_restriction: prevent users from
--    mutating sensitive payment fields on their own pending orders. Admins
--    keep full update access via the existing "admins update all orders" policy.
CREATE OR REPLACE FUNCTION public.prevent_user_credit_order_field_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin updates bypass field-level restrictions
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id      IS DISTINCT FROM OLD.user_id      THEN RAISE EXCEPTION 'user_id is immutable'; END IF;
  IF NEW.credits      IS DISTINCT FROM OLD.credits      THEN RAISE EXCEPTION 'credits is immutable'; END IF;
  IF NEW.amount_usd   IS DISTINCT FROM OLD.amount_usd   THEN RAISE EXCEPTION 'amount_usd is immutable'; END IF;
  IF NEW.package_id   IS DISTINCT FROM OLD.package_id   THEN RAISE EXCEPTION 'package_id is immutable'; END IF;
  IF NEW.currency     IS DISTINCT FROM OLD.currency     THEN RAISE EXCEPTION 'currency is immutable'; END IF;
  IF NEW.network      IS DISTINCT FROM OLD.network      THEN RAISE EXCEPTION 'network is immutable'; END IF;
  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN RAISE EXCEPTION 'wallet_address is immutable'; END IF;
  IF NEW.status       IS DISTINCT FROM OLD.status       THEN RAISE EXCEPTION 'status can only be changed by admins'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_orders_user_field_lock ON public.credit_orders;
CREATE TRIGGER trg_credit_orders_user_field_lock
BEFORE UPDATE ON public.credit_orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_credit_order_field_change();

-- 3) credit_orders_realtime_no_channel_policy: remove credit_orders from the
--    realtime publication so subscribers cannot receive other users' payment data.
ALTER PUBLICATION supabase_realtime DROP TABLE public.credit_orders;

-- 4 & 5) SECURITY DEFINER function exposure: lock down EXECUTE to least-privilege roles.
-- Trigger-only helpers should not be callable from the API at all.
REVOKE ALL ON FUNCTION public.handle_new_user()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_user_credit_order_field_change() FROM PUBLIC, anon, authenticated;

-- User-only RPCs: revoke anon, keep authenticated.
REVOKE ALL ON FUNCTION public.consume_credits(integer, text, text, text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_user_story(uuid)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_playable_user_story(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_purchased_stories()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_confirm_credit_order(uuid, text, text)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_user_story(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_playable_user_story(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_purchased_stories()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text)   TO authenticated;

-- has_role is only used inside RLS / SECURITY DEFINER bodies; revoke direct API access.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;

-- Marketplace browsing RPCs are intentionally public read-only; keep anon+authenticated.
REVOKE ALL ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_story_meta(uuid)                            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid)                            TO anon, authenticated;
