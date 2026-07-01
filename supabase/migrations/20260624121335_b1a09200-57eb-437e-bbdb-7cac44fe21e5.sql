CREATE POLICY "Public read of seed prefix in story-media"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'story-media' AND name LIKE 'seed/%');