import { createServerFn } from "@/lib/_mock/runtime";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";

export const LLM_USAGE_PURPOSES = [
  { key: "general_chat", label: "일반 사용", hint: "운영 보조, 기본 대화 범용 LLM" },
  { key: "translation", label: "본문 번역", hint: "베트남어 등 다국어 번역" },
  { key: "summary", label: "요약", hint: "회차 요약, 긴 본문 정리" },
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

export type LlmProviderTestResult = {
  ok: boolean;
  text?: string;
  tokens?: number;
  status?: number | null;
  error?: string;
  label?: string;
  provider?: string;
  model?: string;
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

async function readLlmError(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text().catch(() => "");
  let payload: any = null;
  if (contentType.includes("application/json") && raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }
  return payload?.message || payload?.reason || raw.slice(0, 180).replace(/\s+/g, " ").trim() || res.statusText;
}

async function llmApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithSupabaseAuth(`/api/admin/llm-providers${path}`, init);
  if (!res.ok) throw new Error(`LLM providers API failed (${res.status}): ${await readLlmError(res)}`);
  return (await res.json()) as T;
}

export const listLlmProviders = createServerFn({ method: "GET" }).handler(async (): Promise<LlmProvider[]> => {
  const payload = await llmApi<{ ok: true; rows: LlmProvider[] }>("?mode=list");
  return payload.rows;
});

export const upsertLlmProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as ProviderInput)
  .handler(async ({ data }) => {
    const payload = await llmApi<{ ok: true; id: string }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", ...data }),
    });
    return { ok: true, id: payload.id };
  });

export const deleteLlmProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    await llmApi<{ ok: true }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: data.id }),
    });
    return { ok: true };
  });

export const resetLlmProviderQuota = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }) => {
    await llmApi<{ ok: true }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", id: data.id }),
    });
    return { ok: true };
  });

export const getLlmUsageSummary = createServerFn({ method: "GET" }).handler(async () => {
  const payload = await llmApi<{ ok: true; rows: unknown[] }>("?mode=usage-summary");
  return payload.rows;
});

export const testLlmProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => i as { id: string })
  .handler(async ({ data }): Promise<LlmProviderTestResult> => {
    const payload = await llmApi<{ ok: true; result: LlmProviderTestResult }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", id: data.id }),
    });
    return payload.result;
  });
