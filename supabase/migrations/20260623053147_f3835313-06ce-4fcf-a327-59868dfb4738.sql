
-- 1. story-media bucket: replace public-read with ownership/unlock/staff check
DROP POLICY IF EXISTS "Anyone can read story-media objects" ON storage.objects;

CREATE POLICY "Read story-media by owner unlock or staff"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'story-media'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.media_assets ma
      WHERE ma.storage_path = storage.objects.name
        AND ma.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.media_assets ma
      JOIN public.media_unlocks mu
        ON mu.story_id = ma.story_id::text
       AND mu.beat_id = ma.beat_id
      WHERE ma.storage_path = storage.objects.name
        AND mu.user_id = auth.uid()
    )
  )
);

-- 2. credit_orders: restrict user updates to safe fields via trigger
DROP TRIGGER IF EXISTS prevent_user_credit_order_field_change_trg ON public.credit_orders;
CREATE TRIGGER prevent_user_credit_order_field_change_trg
BEFORE UPDATE ON public.credit_orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_credit_order_field_change();

-- 3. user_stories: allow public read of listed public stories
CREATE POLICY "Anyone can read public listed stories"
ON public.user_stories FOR SELECT
TO anon, authenticated
USING (is_public = true AND is_listed = true);

-- 4. Lock down EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_credit_order_field_change() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.consume_credits(integer, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_confirm_credit_order(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.purchase_user_story(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_user_story(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_playable_user_story(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_playable_user_story(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_my_purchased_stories() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_my_purchased_stories() TO authenticated;

-- has_role is used inside RLS expressions; keep callable by both roles
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;

-- Marketplace browse functions: intentionally public
REVOKE EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_marketplace_stories(integer, text, text, text, text[]) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_marketplace_story_meta(uuid) TO anon, authenticated;
