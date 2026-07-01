
-- Fix 1 & 2: Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated/PUBLIC.
-- App is in mockup mode; no client code calls these RPCs. service_role retains access.
REVOKE EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_story_affection(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_playable_user_story(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_home_placements(home_slot) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_purchased_stories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_next_llm_provider() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_user_story(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_llm_usage(uuid, bigint, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_llm_provider_quota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlock_beat_media(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_credit_order_field_change() FROM PUBLIC, anon, authenticated;

-- has_role is referenced by RLS policies; policies execute as the policy owner so revoking EXECUTE from
-- authenticated does not break RLS evaluation, but keep service_role explicit.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- Fix 3: Drop the over-permissive user self-update policy on credit_orders.
-- Users should not be able to edit submitted orders directly; admin flow handles state changes.
DROP POLICY IF EXISTS "users update own pending orders" ON public.credit_orders;

-- Fix 4: Remove plaintext api_key column from client-accessible table.
-- API keys belong in a secrets manager (env vars / Vault), referenced by server-only code.
ALTER TABLE public.llm_api_providers DROP COLUMN IF EXISTS api_key;
