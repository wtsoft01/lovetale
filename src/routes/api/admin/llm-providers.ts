import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProviderRow } from "@/lib/llm-router.server";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";

const LLM_USAGE_PURPOSE_KEYS = [
  "general_chat",
  "translation",
  "summary",
  "asset_recommendation",
  "image_generation",
  "video_generation",
] as const;

type LlmUsagePurpose = (typeof LLM_USAGE_PURPOSE_KEYS)[number];

type ProviderInput = {
  id?: string;
  label?: string;
  provider?: string;
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

class ApiError extends Error {
  constructor(
    public reason: string,
    public status = 400,
    message = reason,
  ) {
    super(message);
  }
}

function jsonError(reason: string, status = 400, message?: string) {
  return Response.json({ ok: false, reason, message: message ?? reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function ensureSuperAdminRole(userId: string) {
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (error) throw new ApiError("role_sync_failed", 500, error.message);
}

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) throw new ApiError("missing_token", 401);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new ApiError("invalid_token", 401);

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email === SUPER_ADMIN_EMAIL) await ensureSuperAdminRole(data.user.id);

  const { data: role, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw new ApiError("role_lookup_failed", 500, roleError.message);
  if (!role) throw new ApiError("forbidden", 403);

  return data.user.id;
}

function maskKey(apiKey?: string | null) {
  if (!apiKey) return "API key not set";
  const clean = apiKey.trim();
  if (clean.length <= 8) return "saved";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function normalizeUsagePurposes(value: unknown): LlmUsagePurpose[] {
  const allowed = new Set<string>(LLM_USAGE_PURPOSE_KEYS);
  const raw = Array.isArray(value) ? value : [];
  const purposes = raw.map(String).filter((item): item is LlmUsagePurpose => allowed.has(item));
  return purposes.length ? purposes : ["general_chat"];
}

function providerPayload(row: any, secret?: string | null) {
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
    throw new ApiError("secret_query_failed", 500, error.message);
  }
  return new Map((data ?? []).map((row: any) => [row.provider_id, row.api_key as string]));
}

async function listProviders(request: Request) {
  await requireAdmin(request);
  const { data, error } = await supabaseAdmin
    .from("llm_api_providers")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new ApiError("providers_query_failed", 500, error.message);

  const rows = data ?? [];
  const secrets = await readSecrets(rows.map((row) => row.id));
  return Response.json({ ok: true, rows: rows.map((row) => providerPayload(row, secrets.get(row.id))) });
}

async function usageSummary(request: Request) {
  await requireAdmin(request);
  const { data, error } = await supabaseAdmin
    .from("llm_usage_log")
    .select("provider_id, tokens_used, purpose, succeeded, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new ApiError("usage_query_failed", 500, error.message);
  return Response.json({ ok: true, rows: data ?? [] });
}

async function upsertProvider(input: ProviderInput) {
  const label = input.label?.trim();
  if (!label) throw new ApiError("missing_label", 400, "API 이름을 입력하세요.");

  const provider = input.provider || "custom";
  const payload = {
    label,
    provider,
    base_url: input.baseUrl?.trim() || null,
    model: input.model?.trim() || DEFAULT_MODELS[provider] || null,
    usage_purposes: normalizeUsagePurposes(input.usagePurposes),
    monthly_token_quota: Math.max(0, Number(input.monthlyTokenQuota ?? 0)),
    priority: Math.max(0, Number(input.priority ?? 100)),
    is_active: input.isActive ?? true,
    reset_day_of_month: Math.min(28, Math.max(1, Number(input.resetDayOfMonth ?? 1))),
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? supabaseAdmin.from("llm_api_providers").update(payload as any).eq("id", input.id).select("id").single()
    : supabaseAdmin.from("llm_api_providers").insert(payload as any).select("id").single();
  const { data, error } = await query;
  if (error) throw new ApiError("provider_save_failed", 500, error.message);

  const id = data.id as string;
  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    const { error: secretError } = await supabaseAdmin
      .from("llm_api_provider_secrets" as any)
      .upsert({ provider_id: id, api_key: apiKey, updated_at: new Date().toISOString() }, { onConflict: "provider_id" });
    if (secretError) throw new ApiError("secret_save_failed", 500, secretError.message);
  }

  return Response.json({ ok: true, id });
}

async function deleteProvider(id: string) {
  if (!id) throw new ApiError("missing_id");
  const { error } = await supabaseAdmin.from("llm_api_providers").delete().eq("id", id);
  if (error) throw new ApiError("provider_delete_failed", 500, error.message);
  return Response.json({ ok: true });
}

async function resetQuota(id: string) {
  if (!id) throw new ApiError("missing_id");
  const { error } = await supabaseAdmin
    .from("llm_api_providers")
    .update({
      used_tokens: 0,
      is_active: true,
      last_reset_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new ApiError("provider_reset_failed", 500, error.message);
  return Response.json({ ok: true });
}

async function testProvider(id: string) {
  if (!id) throw new ApiError("missing_id");
  const { data: row, error } = await supabaseAdmin.from("llm_api_providers").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError("provider_lookup_failed", 500, error.message);
  if (!row) throw new ApiError("provider_not_found", 404);

  const secrets = await readSecrets([row.id]);
  const apiKey = secrets.get(row.id);
  if (!apiKey) {
    return Response.json({
      ok: true,
      result: {
        ok: false,
        text: "",
        tokens: 0,
        status: null as number | null,
        error: "API key not set",
        label: row.label,
        provider: row.provider,
        model: row.model || DEFAULT_MODELS[row.provider] || "",
      },
    });
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

  return Response.json({
    ok: true,
    result: {
      ...result,
      label: row.label,
      provider: row.provider,
      model: row.model || DEFAULT_MODELS[row.provider] || "",
    },
  });
}

async function postAction(request: Request) {
  await requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as ProviderInput & { action?: string };
  const action = String(body.action ?? "");
  if (action === "upsert") return upsertProvider(body);
  if (action === "delete") return deleteProvider(String(body.id ?? ""));
  if (action === "reset") return resetQuota(String(body.id ?? ""));
  if (action === "test") return testProvider(String(body.id ?? ""));
  throw new ApiError("unknown_action", 400);
}

export const Route = createFileRoute("/api/admin/llm-providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const mode = new URL(request.url).searchParams.get("mode") ?? "list";
          if (mode === "list") return await listProviders(request);
          if (mode === "usage-summary") return await usageSummary(request);
          return jsonError("unknown_mode", 400);
        } catch (error) {
          if (error instanceof ApiError) return jsonError(error.reason, error.status, error.message);
          console.error("[api/admin/llm-providers] GET failed", error);
          return jsonServerError(error, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          return await postAction(request);
        } catch (error) {
          if (error instanceof ApiError) return jsonError(error.reason, error.status, error.message);
          console.error("[api/admin/llm-providers] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
