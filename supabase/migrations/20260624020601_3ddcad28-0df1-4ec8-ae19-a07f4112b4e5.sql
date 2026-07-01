
-- 1. user_stories: restrict sensitive column exposure to anon
DROP POLICY IF EXISTS "Anyone can read public listed stories" ON public.user_stories;
CREATE POLICY "Anon can read public listed stories"
  ON public.user_stories
  FOR SELECT
  TO anon
  USING (is_public = true AND is_listed = true);

REVOKE SELECT ON public.user_stories FROM anon;
GRANT SELECT
  (id, user_id, title, logline, cover_url, status,
   is_public, is_listed, price_credits, audience, max_heat,
   tags, character_card, created_at, updated_at)
  ON public.user_stories TO anon;

-- 2. credit_orders: tighten user update policy + enforce via trigger
DROP POLICY IF EXISTS "users update own pending orders" ON public.credit_orders;
CREATE POLICY "users update own pending orders"
  ON public.credit_orders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('pending'::credit_order_status, 'submitted'::credit_order_status)
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('pending'::credit_order_status, 'submitted'::credit_order_status)
  );

DROP TRIGGER IF EXISTS trg_prevent_user_credit_order_field_change ON public.credit_orders;
CREATE TRIGGER trg_prevent_user_credit_order_field_change
  BEFORE UPDATE ON public.credit_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_credit_order_field_change();

-- 3. SECURITY DEFINER: revoke execute from PUBLIC and from client roles for
-- helpers that must never be invoked directly via PostgREST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_credit_order_field_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purchase_user_story(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_playable_user_story(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_my_purchased_stories() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) FROM PUBLIC;
