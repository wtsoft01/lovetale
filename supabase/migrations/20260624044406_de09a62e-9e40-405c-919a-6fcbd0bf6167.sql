-- LLM API providers managed by admin for token-quota rotation
CREATE TABLE public.llm_api_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'custom', -- openai | anthropic | google | openrouter | lovable | custom
  base_url TEXT,
  model TEXT,
  api_key TEXT NOT NULL,
  monthly_token_quota BIGINT NOT NULL DEFAULT 0, -- 0 = unlimited
  used_tokens BIGINT NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100, -- lower = picked first
  is_active BOOLEAN NOT NULL DEFAULT true,
  reset_day_of_month INTEGER NOT NULL DEFAULT 1 CHECK (reset_day_of_month BETWEEN 1 AND 28),
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.llm_api_providers TO authenticated;
GRANT ALL ON public.llm_api_providers TO service_role;

ALTER TABLE public.llm_api_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage llm api providers"
  ON public.llm_api_providers
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_llm_api_providers_updated_at
  BEFORE UPDATE ON public.llm_api_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Usage log for auditing rotation/consumption
CREATE TABLE public.llm_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.llm_api_providers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  purpose TEXT,
  succeeded BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.llm_usage_log TO authenticated;
GRANT ALL ON public.llm_usage_log TO service_role;

ALTER TABLE public.llm_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read llm usage log"
  ON public.llm_usage_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Pick next active provider with remaining quota (admin or service)
CREATE OR REPLACE FUNCTION public.pick_next_llm_provider()
RETURNS public.llm_api_providers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.llm_api_providers
  WHERE is_active = true
    AND (monthly_token_quota = 0 OR used_tokens < monthly_token_quota)
  ORDER BY priority ASC, used_tokens ASC, created_at ASC
  LIMIT 1;
$$;

-- Record consumption; auto-deactivate when quota exhausted
CREATE OR REPLACE FUNCTION public.record_llm_usage(
  _provider_id UUID,
  _tokens BIGINT,
  _purpose TEXT DEFAULT NULL,
  _succeeded BOOLEAN DEFAULT true,
  _error TEXT DEFAULT NULL
)
RETURNS public.llm_api_providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.llm_api_providers;
BEGIN
  UPDATE public.llm_api_providers
     SET used_tokens = used_tokens + GREATEST(0, COALESCE(_tokens, 0)),
         updated_at = now()
   WHERE id = _provider_id
   RETURNING * INTO _row;

  IF _row.monthly_token_quota > 0 AND _row.used_tokens >= _row.monthly_token_quota THEN
    UPDATE public.llm_api_providers
       SET is_active = false,
           updated_at = now()
     WHERE id = _provider_id
     RETURNING * INTO _row;
  END IF;

  INSERT INTO public.llm_usage_log (provider_id, user_id, tokens_used, purpose, succeeded, error)
  VALUES (_provider_id, auth.uid(), COALESCE(_tokens,0), _purpose, _succeeded, _error);

  RETURN _row;
END;
$$;

-- Admin: reset a provider's used tokens (monthly cycle)
CREATE OR REPLACE FUNCTION public.reset_llm_provider_quota(_provider_id UUID)
RETURNS public.llm_api_providers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.llm_api_providers;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.llm_api_providers
     SET used_tokens = 0,
         is_active = true,
         last_reset_at = now(),
         updated_at = now()
   WHERE id = _provider_id
   RETURNING * INTO _row;
  RETURN _row;
END;
$$;