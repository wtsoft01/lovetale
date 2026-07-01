
-- story_versions: snapshot history for rollback
CREATE TABLE IF NOT EXISTS public.story_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  character_card JSONB NOT NULL,
  beats JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_versions_story_id_created_idx
  ON public.story_versions(story_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.story_versions TO authenticated;
GRANT ALL ON public.story_versions TO service_role;

ALTER TABLE public.story_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read story versions"
  ON public.story_versions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'editor')
  );

CREATE POLICY "Staff can insert story versions"
  ON public.story_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'editor')
  );

CREATE POLICY "Admins can delete story versions"
  ON public.story_versions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow staff (admin/editor) to view and edit ALL user_stories
CREATE POLICY "Staff can read all stories"
  ON public.user_stories FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'editor')
  );

CREATE POLICY "Staff can update all stories"
  ON public.user_stories FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'editor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'editor')
  );

CREATE POLICY "Admins can delete any story"
  ON public.user_stories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
