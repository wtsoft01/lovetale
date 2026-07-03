import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RewardId =
  | "daily_attendance"
  | "welcome_bonus"
  | "profile_completed"
  | "first_story_started"
  | "first_creator_story";

export type RewardMission = {
  id: RewardId;
  title: string;
  description: string;
  credits: number;
  claimed: boolean;
  canClaim: boolean;
  actionHref?: string;
  actionLabel?: string;
};

export type RewardCenter = {
  credits: number;
  todayKey: string;
  attendance: {
    claimedToday: boolean;
    streakDays: number;
    baseCredits: number;
    nextBonusText: string;
  };
  missions: RewardMission[];
};

const DAILY_ATTENDANCE_CREDITS = 30;
const STREAK_BONUSES = [
  { days: 3, credits: 100 },
  { days: 7, credits: 300 },
] as const;

const ONCE_REWARDS: Array<Omit<RewardMission, "claimed" | "canClaim"> & { reason: string }> = [
  {
    id: "welcome_bonus",
    reason: "reward_welcome_bonus",
    title: "첫 체험 크레딧",
    description: "Lovetale의 스토리와 주인공 데이팅을 가볍게 체험해 보세요.",
    credits: 100,
  },
  {
    id: "profile_completed",
    reason: "reward_profile_completed",
    title: "프로필 완성",
    description: "닉네임이나 아바타를 설정하면 개인화 경험을 더 자연스럽게 시작할 수 있어요.",
    credits: 100,
    actionHref: "/profile",
    actionLabel: "프로필 설정",
  },
  {
    id: "first_story_started",
    reason: "reward_first_story_started",
    title: "첫 스토리 시작",
    description: "스토리 하나를 열어 첫 장면에 진입하면 보상을 받을 수 있어요.",
    credits: 150,
    actionHref: "/",
    actionLabel: "스토리 보기",
  },
  {
    id: "first_creator_story",
    reason: "reward_first_creator_story",
    title: "자작스토리 첫 생성",
    description: "나만의 스토리 초안을 만들고 제작 흐름을 테스트해 보세요.",
    credits: 300,
    actionHref: "/builder",
    actionLabel: "자작스토리 만들기",
  },
];

function getKstDateKey(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getKstDayBounds(date = new Date()) {
  const key = getKstDateKey(date);
  const start = new Date(`${key}T00:00:00.000+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { key, startIso: start.toISOString(), endIso: end.toISOString() };
}

function getPreviousKstDateKey(key: string, daysBack: number) {
  const base = new Date(`${key}T00:00:00.000+09:00`);
  base.setUTCDate(base.getUTCDate() - daysBack);
  return getKstDateKey(base);
}

function countAttendanceStreak(todayKey: string, claimedKeys: Set<string>) {
  let streak = 0;
  for (let offset = 0; offset < 30; offset += 1) {
    const key = getPreviousKstDateKey(todayKey, offset);
    if (!claimedKeys.has(key)) break;
    streak += 1;
  }
  return streak;
}

async function getRewardState(userId: string) {
  const { key: todayKey, startIso, endIso } = getKstDayBounds();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profileResult,
    ledgerResult,
    attendanceResult,
    todayAttendanceResult,
    sessionCountResult,
    storyCountResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, credits")
      .eq("id", userId)
      .single(),
    supabaseAdmin
      .from("credit_ledger")
      .select("reason, created_at")
      .eq("user_id", userId)
      .in("reason", ONCE_REWARDS.map((reward) => reward.reason)),
    supabaseAdmin
      .from("credit_ledger")
      .select("created_at")
      .eq("user_id", userId)
      .eq("reason", "reward_daily_attendance")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("credit_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", "reward_daily_attendance")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .maybeSingle(),
    supabaseAdmin
      .from("story_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabaseAdmin
      .from("user_stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (ledgerResult.error) throw new Error(ledgerResult.error.message);
  if (attendanceResult.error) throw new Error(attendanceResult.error.message);
  if (todayAttendanceResult.error && todayAttendanceResult.error.code !== "PGRST116") {
    throw new Error(todayAttendanceResult.error.message);
  }
  if (sessionCountResult.error) throw new Error(sessionCountResult.error.message);
  if (storyCountResult.error) throw new Error(storyCountResult.error.message);

  const claimedReasons = new Set((ledgerResult.data ?? []).map((row) => row.reason));
  const attendanceKeys = new Set((attendanceResult.data ?? []).map((row) => getKstDateKey(new Date(row.created_at))));
  const claimedToday = Boolean(todayAttendanceResult.data);
  const streakDays = countAttendanceStreak(todayKey, attendanceKeys);
  const profile = profileResult.data;

  const conditionById: Record<Exclude<RewardId, "daily_attendance">, boolean> = {
    welcome_bonus: true,
    profile_completed: Boolean(profile.display_name || profile.avatar_url),
    first_story_started: Number(sessionCountResult.count ?? 0) > 0,
    first_creator_story: Number(storyCountResult.count ?? 0) > 0,
  };

  const missions = ONCE_REWARDS.map((reward) => {
    const claimed = claimedReasons.has(reward.reason);
    const canClaim = !claimed && conditionById[reward.id as Exclude<RewardId, "daily_attendance">];
    return {
      id: reward.id,
      title: reward.title,
      description: reward.description,
      credits: reward.credits,
      claimed,
      canClaim,
      actionHref: reward.actionHref,
      actionLabel: reward.actionLabel,
    };
  });

  return {
    profile,
    todayKey,
    claimedToday,
    streakDays,
    missions,
  };
}

async function addRewardCredits({
  userId,
  awards,
}: {
  userId: string;
  awards: Array<{ reason: string; refId: string; credits: number }>;
}) {
  if (awards.length === 0) return { creditsAwarded: 0, balanceAfter: 0 };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single();
  if (profileError) throw new Error(profileError.message);

  const currentCredits = Math.max(0, Number(profile?.credits ?? 0));
  const creditsAwarded = awards.reduce((sum, award) => sum + award.credits, 0);
  const balanceAfter = currentCredits + creditsAwarded;
  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ credits: balanceAfter, updated_at: now })
    .eq("id", userId);
  if (updateError) throw new Error(updateError.message);

  let runningBalance = currentCredits;
  const ledgerRows = awards.map((award) => {
    runningBalance += award.credits;
    return {
      user_id: userId,
      delta: award.credits,
      reason: award.reason,
      ref_type: "reward",
      ref_id: award.refId,
      balance_after: runningBalance,
      created_at: now,
    };
  });

  const { error: ledgerError } = await supabaseAdmin.from("credit_ledger").insert(ledgerRows);
  if (ledgerError) throw new Error(ledgerError.message);

  return { creditsAwarded, balanceAfter };
}

export const getRewardCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RewardCenter> => {
    const userId = (context as any).userId as string;
    const state = await getRewardState(userId);
    const nextBonus = STREAK_BONUSES.find((bonus) => state.streakDays < bonus.days);

    return {
      credits: Math.max(0, Number(state.profile.credits ?? 0)),
      todayKey: state.todayKey,
      attendance: {
        claimedToday: state.claimedToday,
        streakDays: state.streakDays,
        baseCredits: DAILY_ATTENDANCE_CREDITS,
        nextBonusText: nextBonus
          ? `${nextBonus.days}일 연속 출석 시 +${nextBonus.credits}cr`
          : "7일 연속 보상까지 완료했어요",
      },
      missions: state.missions,
    };
  });

export const claimReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { rewardId: RewardId })
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    const rewardId = data?.rewardId;
    if (!rewardId) throw new Error("Missing reward id");

    const state = await getRewardState(userId);

    if (rewardId === "daily_attendance") {
      if (state.claimedToday) throw new Error("오늘 출석 보상은 이미 받았습니다.");

      const attendanceKeys = new Set<string>();
      for (let offset = 1; offset < 30; offset += 1) {
        const key = getPreviousKstDateKey(state.todayKey, offset);
        const { startIso, endIso } = getKstDayBounds(new Date(`${key}T12:00:00.000+09:00`));
        const { data: existing, error } = await supabaseAdmin
          .from("credit_ledger")
          .select("id")
          .eq("user_id", userId)
          .eq("reason", "reward_daily_attendance")
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .maybeSingle();
        if (error && error.code !== "PGRST116") throw new Error(error.message);
        if (!existing) break;
        attendanceKeys.add(key);
      }
      attendanceKeys.add(state.todayKey);
      const streakDays = countAttendanceStreak(state.todayKey, attendanceKeys);
      const awards = [
        {
          reason: "reward_daily_attendance",
          refId: state.todayKey,
          credits: DAILY_ATTENDANCE_CREDITS,
        },
      ];

      for (const bonus of STREAK_BONUSES) {
        if (streakDays !== bonus.days) continue;
        awards.push({
          reason: `reward_attendance_streak_${bonus.days}`,
          refId: state.todayKey,
          credits: bonus.credits,
        });
      }

      const result = await addRewardCredits({ userId, awards });
      return { ok: true, ...result };
    }

    const reward = ONCE_REWARDS.find((item) => item.id === rewardId);
    if (!reward) throw new Error("Unknown reward");
    const mission = state.missions.find((item) => item.id === rewardId);
    if (!mission) throw new Error("Unknown mission");
    if (mission.claimed) throw new Error("이미 받은 보상입니다.");
    if (!mission.canClaim) throw new Error("아직 보상 조건을 충족하지 않았습니다.");

    const result = await addRewardCredits({
      userId,
      awards: [{ reason: reward.reason, refId: reward.id, credits: reward.credits }],
    });
    return { ok: true, ...result };
  });
