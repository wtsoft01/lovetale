-- Store LLM API keys in a server-only table. The public provider table keeps
-- routing metadata only; client code must never read raw API keys.
CREATE TABLE IF NOT EXISTS public.llm_api_provider_secrets (
  provider_id UUID PRIMARY KEY REFERENCES public.llm_api_providers(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_api_provider_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.llm_api_provider_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.llm_api_provider_secrets TO service_role;

DROP TRIGGER IF EXISTS trg_llm_api_provider_secrets_updated_at ON public.llm_api_provider_secrets;
CREATE TRIGGER trg_llm_api_provider_secrets_updated_at
  BEFORE UPDATE ON public.llm_api_provider_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
