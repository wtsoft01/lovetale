-- Story play sessions: 사용자가 시작한 스토리 진행 단위
CREATE TABLE public.story_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL,
  character_id TEXT,
  current_node TEXT NOT NULL DEFAULT 'start',
  affection INTEGER NOT NULL DEFAULT 0,
  arousal INTEGER NOT NULL DEFAULT 0,
  trust INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'vn' CHECK (mode IN ('vn','chat')),
  ending_id TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  is_bookmarked BOOLEAN NOT NULL DEFAULT false,
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_sessions TO authenticated;
GRANT ALL ON public.story_sessions TO service_role;

ALTER TABLE public.story_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own sessions"
  ON public.story_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_story_sessions_user ON public.story_sessions(user_id, last_played_at DESC);

CREATE TRIGGER trg_story_sessions_updated
  BEFORE UPDATE ON public.story_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Story messages: VN 텍스트/대사 + chat 메시지 통합 저장
CREATE TABLE public.story_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.story_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('narration','character','user','system')),
  content TEXT NOT NULL,
  node_id TEXT,
  emotion TEXT,
  background_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_messages TO authenticated;
GRANT ALL ON public.story_messages TO service_role;

ALTER TABLE public.story_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own messages"
  ON public.story_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_story_messages_session ON public.story_messages(session_id, created_at);

-- Story choices: 사용자가 분기에서 고른 선택 로그
CREATE TABLE public.story_choices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.story_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  choice_label TEXT NOT NULL,
  affection_delta INTEGER NOT NULL DEFAULT 0,
  arousal_delta INTEGER NOT NULL DEFAULT 0,
  trust_delta INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_choices TO authenticated;
GRANT ALL ON public.story_choices TO service_role;

ALTER TABLE public.story_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own choices"
  ON public.story_choices FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_story_choices_session ON public.story_choices(session_id, created_at);

-- Saved endings: 사용자가 도달/저장한 결말 컬렉션
CREATE TABLE public.saved_endings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.story_sessions(id) ON DELETE SET NULL,
  story_id TEXT NOT NULL,
  ending_id TEXT NOT NULL,
  ending_title TEXT NOT NULL,
  ending_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, story_id, ending_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_endings TO authenticated;
GRANT ALL ON public.saved_endings TO service_role;

ALTER TABLE public.saved_endings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own endings"
  ON public.saved_endings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
