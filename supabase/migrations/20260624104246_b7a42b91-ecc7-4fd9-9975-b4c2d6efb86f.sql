-- Revoke EXECUTE from anon/authenticated on SECURITY DEFINER functions that are not meant to be called directly via the API.
-- Trigger-only functions:
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_user_credit_order_field_change() FROM anon, authenticated, PUBLIC;

-- Admin-only / server-only RPCs (callers already use service role or have internal admin checks; remove API exposure):
REVOKE EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_llm_provider_quota(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_llm_usage(uuid, bigint, text, boolean, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pick_next_llm_provider() FROM anon, authenticated, PUBLIC;

-- has_role is used inside RLS policies (runs as definer via policy evaluation); revoke direct API call:
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;

-- Public/authenticated RPCs intentionally callable from the client - keep grants explicit:
GRANT EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_purchased_stories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_user_story(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_playable_user_story(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_story_affection(uuid, integer) TO authenticated;