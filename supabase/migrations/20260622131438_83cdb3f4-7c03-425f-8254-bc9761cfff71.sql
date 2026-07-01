CREATE POLICY "Anyone can read story-media objects"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'story-media');

CREATE POLICY "Admins can write story-media objects"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'story-media' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'story-media' AND public.has_role(auth.uid(), 'admin'));