import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProviderRow } from "@/lib/llm-router.server";

export const LLM_USAGE_PURPOSES = [
  { key: "general_chat", label: "일반 사용", hint: "운영 보조, 기본 대화, 범용 LLM" },
  { key: "translation", label: "본문 번역", hint: "베트남어 등 작업자용 번역" },
  { key: "summary", label: "요약", hint: "회차 요약, 긴 본문 정돈" },
  { key: "asset_recommendation", label: "에셋 위치추천", hint: "본문에서 이미지/영상 삽입 위치 추천" },
  { key: "image_generation", label: "이미지 생성", hint: "스토리 삽화, 캐릭터 이미지 생성" },
  { key: "video_generation", label: "영상 생성", hint: "짧은 영상 또는 모션 에셋 생성" },
] as const;

export type LlmUsagePurpose = (typeof LLM_USAGE_PURPOSES)[number]["key"];

export type LlmProvider = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  usagePurposes: LlmUsagePurpose[];
  apiKeyMasked: string;
  monthlyTokenQuota: number;
  usedTokens: number;
  priority: number;
  isActive: boolean;
  resetDayOfMonth: number;
  lastResetAt: string | null;
  notes: string | null;
  updatedAt: string | null;
};

type ProviderInput = {
  id?: string;
  label: string;
  provider: string;
  baseUrl?: string | null;
  model?: string | null;
  usagePurposes?: string[];
  apiKey?: string;
  monthlyTokenQuota?: number;
  priority?: number;
  isActive?: boolean;
  resetDayOfMonth?: number;
  notes?: string | null;
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-2.5-flash",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
  lovable: "google/gemini-2.5-flash",
  custom: "gpt-4o-mini",
};

async function requireAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자 권한이 없습니다.");
}

function maskKey(apiKey?: string | null) {
  if (!apiKey) return "API key 미등록";
  const clean = apiKey.trim();
  if (clean.length <= 8) return "저장됨";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function normalizeUsagePurposes(value: unknown): LlmUsagePurpose[] {
  const allowed = new Set(LLM_USAGE_PURPOSES.map((item) => item.key));
  const raw = Array.isArray(value) ? value : [];
  const purposes = raw.map(String).filter((item): item is LlmUsagePurpose => allowed.has(item as LlmUsagePurpose));
  return purposes.length ? purposes : ["general_chat"];
}

function providerPayload(row: any, secret?: string | null): LlmProvider {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    baseUrl: row.base_url ?? null,
    model: row.model ?? null,
    usagePurposes: normalizeUsagePurposes(row.usage_purposes),
    apiKeyMasked: maskKey(secret),
    monthlyTokenQuota: Number(row.monthly_token_quota ?? 0),
    usedTokens: Number(row.used_tokens ?? 0),
    priority: Number(row.priority ?? 100),
    isActive: Boolean(row.is_active),
    resetDayOfMonth: Number(row.reset_day_of_month ?? 1),
    lastResetAt: row.last_reset_at ?? null,
    notes: row.notes ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function readSecrets(providerIds: string[]) {
  if (!providerIds.length) return new Map<string, string>();
  const { data, error } = await supabaseAdmin
    .from("llm_api_provider_secrets" as any)
    .select("provider_id, api_key")
    .in("provider_id", providerIds);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return new Map<string, string>();
    throw new Error(error.message);
  }
  return new Map((data ?? []).map((row: any) => [row.provider_id, row.api_key as string]));
}

export const listLlmProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin((context as any).userId as string);
    const { data, error } = await supabaseAdmin
      .from("llm_api_providers")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const secrets = await readSecrets(rows.map((row) => row.id));
    return rows.map((row) => providerPayload(row, secrets.get(row.id)));
  });

export const upsertLlmProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as ProviderInput)
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId as string);
    const label = data.label?.trim();
    if (!label) throw new Error("API 이름을 입력하세요.");

    const payload = {
      label,
      provider: data.provider || "custom",
      base_url: data.baseUrl?.trim() || null,
      model: data.model?.trim() || DEFAULT_MODELS[data.provider] || null,
      usage_purposes: normalizeUsagePurposes(data.usagePurposes),
      monthly_token_quota: Math.max(0, Number(data.monthlyTokenQuota ?? 0)),
      priority: Math.max(0, Number(data.priority ?? 100)),
      is_active: data.isActive ?? true,
      reset_day_of_month: Math.min(28, Math.max(1, Number(data.resetDayOfMonth ?? 1))),
      notes: data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const query = data.id
      ? supabaseAdmin.from("llm_api_providers").update(payload as any).eq("id", data.id).select("id").single()
      : supabaseAdmin.from("llm_api_providers").insert(payload as any).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    const id = saved.id as string;

    const apiKey = data.apiKey?.trim();
    if (apiKey) {
      const { error: secretError } = await supabaseAdmin
        .from("llm_api_provider_secrets" as any)
        .upsert(
          {
            provider_id: id,
            api_key: apiKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_id" },
        );
      if (secretError) throw new Error(secretError.message);
    }

    return { ok: true, id };
  });

export const deleteLlmProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId as string);
    const { error } = await supabaseAdmin.from("llm_api_providers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetLlmProviderQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId as string);
    const { error } = await supabaseAdmin
      .from("llm_api_providers")
      .update({
        used_tokens: 0,
        is_active: true,
        last_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getLlmUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin((context as any).userId as string);
    const { data, error } = await supabaseAdmin
      .from("llm_usage_log")
      .select("provider_id, tokens_used, purpose, succeeded, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const testLlmProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId as string);
    const { data: row, error } = await supabaseAdmin
      .from("llm_api_providers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Provider not found");

    const secrets = await readSecrets([row.id]);
    const apiKey = secrets.get(row.id);
    if (!apiKey) {
      return {
        ok: false,
        text: "",
        tokens: 0,
        status: null as number | null,
        error: "API key 미등록",
        label: row.label,
        provider: row.provider,
        model: row.model || DEFAULT_MODELS[row.provider] || "",
      };
    }

    const provider: ProviderRow = {
      ...(row as any),
      usage_purposes: normalizeUsagePurposes((row as any).usage_purposes),
      api_key: apiKey,
    };
    const { callProvider } = await import("@/lib/llm-router.server");
    const result = await callProvider(provider, {
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      maxTokens: 16,
      temperature: 0,
      modelOverride: row.model || DEFAULT_MODELS[row.provider],
    });

    return {
      ...result,
      label: row.label,
      provider: row.provider,
      model: row.model || DEFAULT_MODELS[row.provider] || "",
    };
  });
