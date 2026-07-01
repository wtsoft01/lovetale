-- Lock down EXECUTE on SECURITY DEFINER functions: revoke from PUBLIC,
-- then grant only to the roles that actually need to call each one.

-- Trigger-only functions: no direct EXECUTE needed.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_user_credit_order_field_change() FROM PUBLIC, anon, authenticated;

-- Server-only helpers (called via service_role from server functions / triggers).
REVOKE ALL ON FUNCTION public.record_llm_usage(uuid, bigint, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pick_next_llm_provider() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_llm_usage(uuid, bigint, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_next_llm_provider() TO service_role;

-- RLS helper: used inside policies; needs to be callable by signed-in users only.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Admin-only RPCs: only signed-in admins should call; enforce role inside function already.
REVOKE ALL ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_llm_provider_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_llm_provider_quota(uuid) TO authenticated, service_role;

-- Authenticated-user RPCs: must be signed in.
REVOKE ALL ON FUNCTION public.purchase_user_story(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bump_story_affection(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_credits(integer, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_purchased_stories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_user_story(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bump_story_affection(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_purchased_stories() TO authenticated, service_role;

-- Playable story read: needs signed-in user for purchase checks.
REVOKE ALL ON FUNCTION public.get_playable_user_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_playable_user_story(uuid) TO authenticated, service_role;

-- Public marketplace reads: keep open to anon + authenticated, but tighten PUBLIC.
REVOKE ALL ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_story_meta(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_home_placements(public.home_slot) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_home_placements(public.home_slot) TO anon, authenticated, service_role;
