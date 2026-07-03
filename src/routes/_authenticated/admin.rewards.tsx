import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Coins, Gift, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@/lib/_mock/runtime";
import { getAdminRewardsOverview } from "@/lib/admin-rewards.functions";

export const Route = createFileRoute("/_authenticated/admin/rewards")({
  head: () => ({
    meta: [{ title: "보상 관리 | Lovetale Studio" }],
  }),
  component: AdminRewardsPage,
});

function AdminRewardsPage() {
  const fetchOverview = useServerFn(getAdminRewardsOverview);
  const overviewQ = useQuery({
    queryKey: ["admin_rewards_overview"],
    queryFn: () => fetchOverview(),
  });

  if (overviewQ.isLoading) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-3xl border border-border/60 bg-card/35">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          보상 정책을 불러오는 중
        </div>
      </div>
    );
  }

  if (overviewQ.error) {
    return (
      <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        보상 관리 정보를 불러오지 못했습니다. 관리자 권한을 확인해 주세요.
      </div>
    );
  }

  const data = overviewQ.data;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <Gift className="size-3" />
            REWARD OPS
          </Badge>
          <h1 className="text-base font-semibold">무료 크레딧 보상 관리</h1>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="오늘 지급" value={`${data.stats.todayCredits.toLocaleString()} cr`} />
        <StatCard label="오늘 지급 건수" value={`${data.stats.todayClaims.toLocaleString()}건`} />
        <StatCard label="이번 달 지급" value={`${data.stats.monthCredits.toLocaleString()} cr`} />
        <StatCard label="이번 달 지급 건수" value={`${data.stats.monthClaims.toLocaleString()}건`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-pink-500" />
            <h2 className="text-sm font-semibold">현재 보상 정책</h2>
          </div>
          <div className="space-y-2">
            {data.policies.map((policy) => (
              <div key={policy.id} className="rounded-2xl border border-border/50 bg-background/35 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{policy.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{policy.limit}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      +{policy.credits}cr
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        policy.status === "active"
                          ? "rounded-full border-emerald-500/35 bg-emerald-500/10 text-[10px] text-emerald-600"
                          : "rounded-full border-muted-foreground/30 text-[10px] text-muted-foreground"
                      }
                    >
                      {policy.status === "active" ? "운영중" : "예정"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="size-4 text-blue-500" />
            <h2 className="text-sm font-semibold">최근 지급 로그</h2>
          </div>
          {data.recentRewards.length === 0 ? (
            <div className="rounded-2xl border border-border/50 bg-background/35 p-6 text-center text-sm text-muted-foreground">
              아직 무료 크레딧 지급 로그가 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {data.recentRewards.map((row) => (
                <div key={row.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{row.displayName || row.userId}</span>
                      <Badge variant="outline" className="rounded-full text-[10px]">
                        {formatReason(row.reason)}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()} · 잔액 {row.balanceAfter.toLocaleString()} cr
                      {row.refId ? ` · ${row.refId}` : ""}
                    </div>
                  </div>
                  <div className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    <Coins className="size-3" />
                    +{row.delta.toLocaleString()} cr
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card/45 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function formatReason(reason: string) {
  const map: Record<string, string> = {
    reward_daily_attendance: "출석",
    reward_attendance_streak_3: "3일 연속",
    reward_attendance_streak_7: "7일 연속",
    reward_welcome_bonus: "첫 체험",
    reward_profile_completed: "프로필",
    reward_first_story_started: "첫 스토리",
    reward_first_creator_story: "자작스토리",
  };
  return map[reason] ?? reason.replace(/^reward_/, "");
}
