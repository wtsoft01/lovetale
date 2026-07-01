DROP POLICY IF EXISTS "Admins can write story-media objects" ON storage.objects;

CREATE POLICY "Staff can write story-media objects"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'story-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
)
WITH CHECK (
  bucket_id = 'story-media'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
);