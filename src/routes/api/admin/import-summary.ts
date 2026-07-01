import { generateText } from "ai";
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runWithAdminRotation } from "@/lib/admin-ai-provider.server";

const SUPER_ADMIN_EMAIL = "admin@lovetale.org";
const STAFF_ROLES = ["admin", "editor", "moderator"] as const;
const SUPER_ADMIN_ROLES = ["admin"] as const;
const MAX_SUMMARY_SOURCE_CHARS = 18_000;
const ensuredSuperAdminUserIds = new Set<string>();

type StaffRole = (typeof STAFF_ROLES)[number];

function jsonError(reason: string, status = 400) {
  return Response.json({ ok: false, reason }, { status });
}

function jsonServerError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, reason: "server_error", message }, { status });
}

async function ensureSuperAdminRoles(userId: string) {
  const rows = SUPER_ADMIN_ROLES.map((role) => ({ user_id: userId, role }));
  const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function requireStaff(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { error: jsonError("missing_token", 401) as Response, userId: "" };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: jsonError("invalid_token", 401) as Response, userId: "" };

  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email === SUPER_ADMIN_EMAIL) {
    if (!ensuredSuperAdminUserIds.has(data.user.id)) {
      await ensureSuperAdminRoles(data.user.id);
      ensuredSuperAdminUserIds.add(data.user.id);
    }
    return { userId: data.user.id };
  }

  const { data: rolesData, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (rolesError) return { error: jsonServerError(rolesError, 500), userId: data.user.id };

  const roles = (rolesData ?? [])
    .map((row) => row.role as StaffRole)
    .filter((role): role is StaffRole => STAFF_ROLES.includes(role));
  if (!roles.includes("admin") && !roles.includes("editor")) {
    return { error: jsonError("forbidden", 403) as Response, userId: data.user.id };
  }
  return { userId: data.user.id };
}

async function summarizeEpisode(request: Request) {
  const staff = await requireStaff(request);
  if ("error" in staff) return staff.error;

  const body = (await request.json().catch(() => ({}))) as { title?: string; text?: string };
  const text = String(body.text ?? "").trim();
  if (text.length < 80) return jsonError("text_too_short");

  const title = String(body.title ?? "").trim() || "회차";
  const source = text.slice(0, MAX_SUMMARY_SOURCE_CHARS);
  const summary = await runWithAdminRotation("episode_summary", async (binding) => {
    const result = await generateText({
      model: binding.provider(binding.defaultModel),
      system:
        "당신은 웹소설/비주얼노벨 콘텐츠 편집자입니다. 관리자가 회차 목록에서 빠르게 파악할 수 있도록 한국어로 간결하게 요약합니다.",
      prompt: [
        `회차 제목: ${title}`,
        "",
        "아래 본문을 2~4문장으로 요약하세요.",
        "스포일러를 완전히 숨기기보다 관리자용으로 핵심 사건, 감정 변화, 다음 회차로 이어지는 갈등을 담아주세요.",
        "마크다운 목록 없이 자연스러운 문단으로만 답하세요.",
        "",
        source,
      ].join("\n"),
      temperature: 0.3,
    });
    return {
      value: result.text.trim().slice(0, 700),
      tokens: result.usage?.totalTokens ?? 0,
    };
  });

  return Response.json({ ok: true, summary });
}

export const Route = createFileRoute("/api/admin/import-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await summarizeEpisode(request);
        } catch (error) {
          console.error("[api/admin/import-summary] POST failed", error);
          return jsonServerError(error, 500);
        }
      },
    },
  },
});
