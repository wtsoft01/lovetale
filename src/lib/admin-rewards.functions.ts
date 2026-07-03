import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type StaffRole = "admin" | "editor" | "moderator";

export type AdminRewardPolicy = {
  id: string;
  title: string;
  credits: number;
  limit: string;
  status: "active" | "planned";
};

export type AdminRewardLedgerRow = {
  id: string;
  userId: string;
  displayName: string | null;
  delta: number;
  reason: string;
  refId: string | null;
  balanceAfter: number;
  createdAt: string;
};

export type AdminRewardsOverview = {
  policies: AdminRewardPolicy[];
  recentRewards: AdminRewardLedgerRow[];
  stats: {
    todayCredits: number;
    todayClaims: number;
    monthCredits: number;
    monthClaims: number;
  };
};

const REWARD_POLICIES: AdminRewardPolicy[] = [
  {
    id: "daily_attendance",
    title: "일일 출석체크",
    credits: 30,
    limit: "계정당 1일 1회",
    status: "active",
  },
  {
    id: "attendance_streak_3",
    title: "3일 연속 출석 보너스",
    credits: 100,
    limit: "3일 연속 출석 달성일",
    status: "active",
  },
  {
    id: "attendance_streak_7",
    title: "7일 연속 출석 보너스",
    credits: 300,
    limit: "7일 연속 출석 달성일",
    status: "active",
  },
  {
    id: "welcome_bonus",
    title: "첫 체험 크레딧",
    credits: 100,
    limit: "계정당 1회",
    status: "active",
  },
  {
    id: "profile_completed",
    title: "프로필 완성",
    credits: 100,
    limit: "계정당 1회",
    status: "active",
  },
  {
    id: "first_story_started",
    title: "첫 스토리 시작",
    credits: 150,
    limit: "계정당 1회",
    status: "active",
  },
  {
    id: "first_creator_story",
    title: "자작스토리 첫 생성",
    credits: 300,
    limit: "계정당 1회",
    status: "active",
  },
  {
    id: "invite_friend",
    title: "친구 초대 보상",
    credits: 500,
    limit: "초대 회원의 첫 활동 완료 후",
    status: "planned",
  },
];

async function getCurrentRoles(userId: string): Promise<StaffRole[]> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.role as StaffRole);
}

function getKstDayStartIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const key = kst.toISOString().slice(0, 10);
  return new Date(`${key}T00:00:00.000+09:00`).toISOString();
}

function getKstMonthStartIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const key = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return new Date(`${key}T00:00:00.000+09:00`).toISOString();
}

export const getAdminRewardsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminRewardsOverview> => {
    const userId = (context as any).userId as string;
    const roles = await getCurrentRoles(userId);
    if (!roles.includes("admin")) throw new Error("Forbidden");

    const todayStart = getKstDayStartIso();
    const monthStart = getKstMonthStartIso();

    const [recentResult, todayResult, monthResult] = await Promise.all([
      supabaseAdmin
        .from("credit_ledger")
        .select("id,user_id,delta,reason,ref_id,balance_after,created_at")
        .like("reason", "reward_%")
        .order("created_at", { ascending: false })
        .limit(80),
      supabaseAdmin
        .from("credit_ledger")
        .select("id,delta")
        .like("reason", "reward_%")
        .gte("created_at", todayStart),
      supabaseAdmin
        .from("credit_ledger")
        .select("id,delta")
        .like("reason", "reward_%")
        .gte("created_at", monthStart),
    ]);

    if (recentResult.error) throw new Error(recentResult.error.message);
    if (todayResult.error) throw new Error(todayResult.error.message);
    if (monthResult.error) throw new Error(monthResult.error.message);

    const userIds = Array.from(new Set((recentResult.data ?? []).map((row) => row.user_id)));
    const profilesResult =
      userIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", userIds)
        : { data: [], error: null };
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const displayNameById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));

    return {
      policies: REWARD_POLICIES,
      recentRewards: (recentResult.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: displayNameById.get(row.user_id) ?? null,
        delta: Number(row.delta ?? 0),
        reason: row.reason,
        refId: row.ref_id,
        balanceAfter: Number(row.balance_after ?? 0),
        createdAt: row.created_at,
      })),
      stats: {
        todayCredits: (todayResult.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.delta ?? 0)), 0),
        todayClaims: todayResult.data?.length ?? 0,
        monthCredits: (monthResult.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.delta ?? 0)), 0),
        monthClaims: monthResult.data?.length ?? 0,
      },
    };
  });
