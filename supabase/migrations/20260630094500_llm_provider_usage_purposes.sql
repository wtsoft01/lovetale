-- Purpose-based LLM routing. Examples:
-- translation -> DeepSeek, image_generation/video_generation -> Gemini/OpenAI,
-- general_chat -> ChatGPT/OpenRouter fallback.
ALTER TABLE public.llm_api_providers
  ADD COLUMN IF NOT EXISTS usage_purposes TEXT[] NOT NULL DEFAULT ARRAY['general_chat']::TEXT[];

UPDATE public.llm_api_providers
   SET usage_purposes = ARRAY['general_chat']::TEXT[]
 WHERE usage_purposes IS NULL OR array_length(usage_purposes, 1) IS NULL;
