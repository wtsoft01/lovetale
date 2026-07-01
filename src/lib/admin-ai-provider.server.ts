import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_BASE_URLS, DEFAULT_MODELS, normalizeLlmPurpose } from "@/lib/llm-router.server";

export type AdminProviderRow = {
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

export type AdminAiBinding = {
  row: AdminProviderRow;
  provider: (modelId: string) => any;
  defaultModel: string;
};

function providerSupportsPurpose(row: AdminProviderRow, purpose: string) {
  const purposes = Array.isArray(row.usage_purposes) ? row.usage_purposes : [];
  if (!purposes.length) return purpose === "general_chat";
  return purposes.includes(purpose) || purposes.includes("general_chat");
}

export async function listActiveAdminProviders(purpose?: string | null): Promise<AdminProviderRow[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_api_providers")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("used_tokens", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter(
    (r: any) => r.monthly_token_quota === 0 || r.used_tokens < r.monthly_token_quota,
  ) as AdminProviderRow[];
  if (!rows.length) return [];

  const { data: secrets, error: secretError } = await supabaseAdmin
    .from("llm_api_provider_secrets" as any)
    .select("provider_id, api_key")
    .in("provider_id", rows.map((row) => row.id));
  if (secretError) throw new Error(secretError.message);

  const secretByProvider = new Map((secrets ?? []).map((row: any) => [row.provider_id, row.api_key as string]));
  const withSecrets = rows
    .map((row) => ({ ...row, api_key: secretByProvider.get(row.id) ?? "" }))
    .filter((row) => row.api_key) as AdminProviderRow[];

  const normalizedPurpose = normalizeLlmPurpose(purpose);
  const matched = withSecrets.filter((row) => providerSupportsPurpose(row, normalizedPurpose));
  if (matched.length) return matched;
  return withSecrets.filter((row) => providerSupportsPurpose(row, "general_chat"));
}

export function buildAdminAiBinding(row: AdminProviderRow): AdminAiBinding {
  const baseURL = (row.base_url?.trim() || DEFAULT_BASE_URLS[row.provider] || DEFAULT_BASE_URLS.openai).replace(/\/$/, "");

  let provider: (modelId: string) => any;
  if (row.provider === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: row.api_key ?? "",
      baseURL,
    });
    provider = (modelId: string) => google(modelId);
  } else {
    const apiKey = row.api_key ?? "";
    const headers: Record<string, string> =
      row.provider === "anthropic"
        ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${apiKey}` };
    const compat = createOpenAICompatible({
      name: `admin-${row.provider}`,
      baseURL,
      headers,
    });
    provider = (modelId: string) => compat(modelId);
  }

  return {
    row,
    provider,
    defaultModel: row.model || DEFAULT_MODELS[row.provider] || "gpt-4o-mini",
  };
}

export async function recordAdminUsage(
  providerId: string,
  tokens: number,
  succeeded: boolean,
  purpose: string | null,
  err?: string,
) {
  try {
    await supabaseAdmin.rpc("record_llm_usage", {
      _provider_id: providerId,
      _tokens: tokens,
      _purpose: purpose ?? undefined,
      _succeeded: succeeded,
      _error: err ?? undefined,
    });
  } catch {
    // Usage logging must not break user-facing AI features.
  }
}

export async function runWithAdminRotation<T>(
  purpose: string,
  fn: (binding: AdminAiBinding) => Promise<{ value: T; tokens?: number }>,
): Promise<T> {
  const list = await listActiveAdminProviders(purpose);
  if (list.length === 0) {
    throw new Error("사용 가능한 LLM API가 없습니다. /admin/llm에서 사용처와 잔여 할당량을 확인하세요.");
  }

  let lastError: unknown;
  for (const row of list) {
    const binding = buildAdminAiBinding(row);
    try {
      const { value, tokens } = await fn(binding);
      await recordAdminUsage(row.id, Math.max(0, Math.floor(tokens ?? 0)), true, purpose);
      return value;
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message ?? e);
      await recordAdminUsage(row.id, 0, false, purpose, msg.slice(0, 500));
      if (/\b400\b|invalid_request|invalid input|schema/i.test(msg)) throw e;
    }
  }

  throw new Error(`모든 LLM API 호출 실패: ${lastError instanceof Error ? lastError.message : String(lastError ?? "unknown")}`);
}

export async function getPrimaryAdminBinding(): Promise<AdminAiBinding> {
  const list = await listActiveAdminProviders("general_chat");
  if (list.length === 0) {
    throw new Error("사용 가능한 LLM API가 없습니다. /admin/llm에서 API를 추가하세요.");
  }
  return buildAdminAiBinding(list[0]);
}
