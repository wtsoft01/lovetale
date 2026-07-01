
-- 1) Lock down SECURITY DEFINER functions: revoke from PUBLIC then grant narrowly

-- Public marketplace (anon + authenticated)
REVOKE ALL ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_marketplace_story_meta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) TO anon, authenticated;

-- Signed-in user actions
REVOKE ALL ON FUNCTION public.consume_credits(integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.purchase_user_story(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_user_story(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_playable_user_story(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_playable_user_story(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.bump_story_affection(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_story_affection(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_purchased_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_purchased_stories() TO authenticated;

-- has_role used inside RLS policies (executed as policy owner) - keep usable by authenticated for policy eval, but revoke from anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Admin / internal only (service_role)
REVOKE ALL ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.reset_llm_provider_quota(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_llm_provider_quota(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.record_llm_usage(uuid, bigint, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_llm_usage(uuid, bigint, text, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.pick_next_llm_provider() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_next_llm_provider() TO service_role;

-- Trigger functions: not callable via API, restrict anyway
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_user_credit_order_field_change() FROM PUBLIC;

-- 2) media_assets: allow owner to read their own rows
DROP POLICY IF EXISTS "Owners can view their media assets" ON public.media_assets;
CREATE POLICY "Owners can view their media assets"
  ON public.media_assets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) media_unlocks: make it explicit that only service_role inserts (RPC is SECURITY DEFINER)
REVOKE INSERT, UPDATE, DELETE ON public.media_unlocks FROM anon, authenticated;
GRANT ALL ON public.media_unlocks TO service_role;
