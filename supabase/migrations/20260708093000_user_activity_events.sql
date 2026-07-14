CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'heartbeat' CHECK (event_type IN ('pageview', 'heartbeat')),
  path TEXT NOT NULL DEFAULT '/',
  title TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_seen
  ON public.user_activity_events(user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_seen
  ON public.user_activity_events(last_seen_at DESC);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own activity events"
  ON public.user_activity_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own activity events"
  ON public.user_activity_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.user_activity_events TO authenticated;
GRANT ALL ON public.user_activity_events TO service_role;
