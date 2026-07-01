import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmUsagePurpose =
  | "general_chat"
  | "translation"
  | "summary"
  | "asset_recommendation"
  | "image_generation"
  | "video_generation";

export type ProviderRow = {
  id: string;
  label: string;
  provider: string;
  base_url: string | null;
  model: string | null;
  usage_purposes?: string[] | null;
  api_key?: string;
  monthly_token_quota: number;
  used_tokens: number;
  is_active: boolean;
};

export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  lovable: "https://ai.gateway.lovable.dev/v1",
};

export const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.5-flash",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
  lovable: "google/gemini-2.5-flash",
  custom: "gpt-4o-mini",
};

function isNativeGeminiBase(base: string): boolean {
  const b = base.replace(/\/$/, "");
  return b.endsWith("/v1beta") || b.endsWith("/v1");
}

export function normalizeLlmPurpose(purpose?: string | null): LlmUsagePurpose {
  if (!purpose) return "general_chat";
  if (/translation|translate|vietnam/i.test(purpose)) return "translation";
  if (/summary|summar|episode_summary/i.test(purpose)) return "summary";
  if (/asset.*recommend|asset_slot|slot_recommend|placement/i.test(purpose)) return "asset_recommendation";
  if (/image|portrait|illustration/i.test(purpose)) return "image_generation";
  if (/video|motion/i.test(purpose)) return "video_generation";
  return "general_chat";
}

function providerSupportsPurpose(row: ProviderRow, purpose: LlmUsagePurpose) {
  const purposes = Array.isArray(row.usage_purposes) ? row.usage_purposes : [];
  if (!purposes.length) return purpose === "general_chat";
  return purposes.includes(purpose) || purposes.includes("general_chat");
}

async function listCandidates(purpose?: string | null): Promise<ProviderRow[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_api_providers")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("used_tokens", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter(
    (r: any) => r.monthly_token_quota === 0 || r.used_tokens < r.monthly_token_quota,
  ) as ProviderRow[];
  if (!rows.length) return [];

  const { data: secrets, error: secretError } = await supabaseAdmin
    .from("llm_api_provider_secrets" as any)
    .select("provider_id, api_key")
    .in("provider_id", rows.map((row) => row.id));
  if (secretError) throw new Error(secretError.message);

  const secretByProvider = new Map((secrets ?? []).map((row: any) => [row.provider_id, row.api_key as string]));
  const withSecrets = rows
    .map((row) => ({ ...row, api_key: secretByProvider.get(row.id) ?? "" }))
    .filter((row) => row.api_key);

  const normalizedPurpose = normalizeLlmPurpose(purpose);
  const purposeMatched = withSecrets.filter((row) => providerSupportsPurpose(row, normalizedPurpose));
  if (purposeMatched.length) return purposeMatched;
  return withSecrets.filter((row) => providerSupportsPurpose(row, "general_chat"));
}

async function recordUsage(
  providerId: string,
  tokens: number,
  succeeded: boolean,
  purpose: string | null,
  err?: string,
) {
  await supabaseAdmin.rpc("record_llm_usage", {
    _provider_id: providerId,
    _tokens: tokens,
    _purpose: purpose ?? undefined,
    _succeeded: succeeded,
    _error: err ?? undefined,
  });
}

function authHeaders(p: ProviderRow): Record<string, string> {
  const key = p.api_key ?? "";
  if (p.provider === "lovable") return { "Lovable-API-Key": key };
  if (p.provider === "anthropic") return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  return { Authorization: `Bearer ${key}` };
}

export type ChatOptions = {
  messages: ChatMessage[];
  purpose?: string;
  temperature?: number;
  maxTokens?: number;
  modelOverride?: string;
};

export type ChatResult = {
  text: string;
  providerId: string;
  providerLabel: string;
  model: string;
  tokensUsed: number;
};

export type CallOutcome = {
  ok: boolean;
  text: string;
  tokens: number;
  status?: number;
  error?: string;
};

function openAiCompatibleBases(rawBase: string): string[] {
  const base = rawBase.replace(/\/$/, "");
  const bases = [base];
  if (!/\/v\d+(?:\/)?$/i.test(base)) bases.push(`${base}/v1`);
  return [...new Set(bases)];
}

async function readTextResponse(res: Response, max = 500) {
  const body = await res.text().catch(() => "");
  return body.slice(0, max);
}

export async function callProvider(p: ProviderRow, opts: ChatOptions): Promise<CallOutcome> {
  const base = (p.base_url?.trim() || DEFAULT_BASE_URLS[p.provider] || "").replace(/\/$/, "");
  const model = opts.modelOverride || p.model || DEFAULT_MODELS[p.provider] || "gpt-4o-mini";

  try {
    if (p.provider === "anthropic") {
      const systemMsg = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const turns = opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(p) },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 1024,
          ...(systemMsg ? { system: systemMsg } : {}),
          messages: turns,
          ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, text: "", tokens: 0, status: res.status, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
      }
      const json: any = await res.json();
      const text: string = (json?.content ?? []).map((c: any) => c?.text ?? "").join("");
      const tokens = Number((json?.usage?.input_tokens ?? 0) + (json?.usage?.output_tokens ?? 0));
      return { ok: true, text, tokens };
    }

    if (p.provider === "google" && isNativeGeminiBase(base)) {
      const systemMsg = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const contents = opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(p.api_key ?? "")}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
          contents,
          generationConfig: {
            ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
            ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, text: "", tokens: 0, status: res.status, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
      }
      const json: any = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const text: string = parts.map((pt: any) => pt?.text ?? "").join("");
      const tokens = Number(json?.usageMetadata?.totalTokenCount ?? 0);
      return { ok: true, text, tokens };
    }

    let lastFailure: CallOutcome | null = null;
    for (const candidateBase of openAiCompatibleBases(base)) {
      const res = await fetch(`${candidateBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(p) },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.includes("application/json")) {
        const json: any = await res.json();
        const text: string = json?.choices?.[0]?.message?.content ?? "";
        const tokens: number = Number(json?.usage?.total_tokens ?? 0);
        return { ok: true, text, tokens };
      }

      const body = await readTextResponse(res);
      lastFailure = {
        ok: false,
        text: "",
        tokens: 0,
        status: res.status,
        error: contentType.includes("text/html")
          ? `HTTP ${res.status}: API endpoint returned HTML. Use an OpenAI-compatible base URL ending with /v1. Tried ${candidateBase}`
          : `HTTP ${res.status}: ${body}`,
      };
    }
    return lastFailure ?? { ok: false, text: "", tokens: 0, error: "No OpenAI-compatible endpoint tried" };
  } catch (e: any) {
    return { ok: false, text: "", tokens: 0, error: String(e?.message ?? e) };
  }
}

export async function chatWithRotation(opts: ChatOptions): Promise<ChatResult> {
  const candidates = await listCandidates(opts.purpose);
  if (candidates.length === 0) {
    throw new Error("사용 가능한 LLM API가 없습니다. 관리자에서 본문 번역 용도의 활성 API를 등록해 주세요.");
  }

  let lastError: string | null = null;
  for (const p of candidates) {
    const out = await callProvider(p, opts);
    if (!out.ok) {
      await recordUsage(p.id, 0, false, opts.purpose ?? null, out.error);
      lastError = `[${p.label}] ${out.error}`;
      continue;
    }
    await recordUsage(p.id, out.tokens, true, opts.purpose ?? null);
    return {
      text: out.text,
      providerId: p.id,
      providerLabel: p.label,
      model: opts.modelOverride || p.model || DEFAULT_MODELS[p.provider] || "",
      tokensUsed: out.tokens,
    };
  }

  throw new Error(`모든 LLM API 호출 실패: ${lastError ?? "unknown"}`);
}

export async function probeProviderById(id: string): Promise<CallOutcome & { label: string; provider: string; model: string }> {
  const { data, error } = await supabaseAdmin
    .from("llm_api_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Provider not found");
  const { data: secret, error: secretError } = await supabaseAdmin
    .from("llm_api_provider_secrets" as any)
    .select("api_key")
    .eq("provider_id", id)
    .maybeSingle();
  if (secretError) throw new Error(secretError.message);
  const p = { ...(data as ProviderRow), api_key: (secret as any)?.api_key ?? "" };
  if (!p.api_key) throw new Error("API key 미등록");
  const out = await callProvider(p, {
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    maxTokens: 16,
    temperature: 0,
  });
  return {
    ...out,
    label: p.label,
    provider: p.provider,
    model: p.model || DEFAULT_MODELS[p.provider] || "",
  };
}

