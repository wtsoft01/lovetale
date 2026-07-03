import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Gift,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@/lib/_mock/runtime";
import { claimReward, getRewardCenter, type RewardMission } from "@/lib/rewards.functions";

export const Route = createFileRoute("/_authenticated/rewards")({
  head: () => ({
    meta: [
      { title: "臾대즺 ?щ젅??諛쏄린 | Lovetale" },
      {
        name: "description",
        content: "출석체크? 泥??댁슜 誘몄뀡?쇰줈 Lovetale 泥댄뿕 ?щ젅?㏃쓣 諛쏆쓣 ???덉뒿?덈떎.",
      },
    ],
  }),
  component: RewardsPage,
});

function RewardsPage() {
  const fetchRewards = useServerFn(getRewardCenter);
  const claim = useServerFn(claimReward);
  const qc = useQueryClient();

  const rewardsQ = useQuery({
    queryKey: ["reward_center"],
    queryFn: () => fetchRewards(),
  });

  const claimMut = useMutation({
    mutationFn: (rewardId: RewardMission["id"] | "daily_attendance") => claim({ data: { rewardId } }),
    onSuccess: (result) => {
      toast.success(`${result.creditsAwarded.toLocaleString()} ?щ젅?㏃쓣 諛쏆븯?듬땲??`);
      qc.invalidateQueries({ queryKey: ["reward_center"] });
      qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "蹂댁긽 吏湲됱뿉 ?ㅽ뙣?덉뒿?덈떎.");
    },
  });

  const data = rewardsQ.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <Gift className="size-3" />
            FREE CREDIT
          </Badge>
          <h1 className="text-base font-semibold">臾대즺 ?щ젅??諛쏄린</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit gap-1.5 rounded-full">
          <Link to="/premium">
            <Coins className="size-4" />
            異⑹쟾쨌援щ룆 蹂닿린
          </Link>
        </Button>
      </section>

      {rewardsQ.isLoading ? (
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-border/60 bg-card/35">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            蹂댁긽 ?뺣낫瑜?遺덈윭?ㅻ뒗 以?          </div>
        </div>
      ) : !data ? (
        <div className="rounded-3xl border border-border/60 bg-card/35 p-8 text-center text-sm text-muted-foreground">
          蹂댁긽 ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??
        </div>
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-pink-500/45 bg-card/50 p-5 shadow-[0_0_0_1px_rgba(236,72,153,.10)]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2.5 py-1 text-[11px] font-medium text-pink-600 dark:text-pink-200">
                    <CalendarCheck className="size-3" />
                    출석체크
                  </div>
                  <h2 className="text-2xl font-semibold">오늘도 Lovetale에 오신 걸 환영해요</h2>
                </div>
                <div className="rounded-2xl bg-background/50 px-3 py-2 text-right">
                  <div className="text-[10px] text-muted-foreground">보유 크레딧</div>
                  <div className="text-lg font-semibold">{data.credits.toLocaleString()} cr</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="오늘 보상" value={`+${data.attendance.baseCredits}cr`} />
                <Stat label="연속 출석" value={`${data.attendance.streakDays}일`} />
                <Stat label="다음 보너스" value={data.attendance.nextBonusText} />
              </div>

              <Button
                disabled={data.attendance.claimedToday || claimMut.isPending}
                onClick={() => claimMut.mutate("daily_attendance")}
                className="mt-5 w-full rounded-full bg-pink-500 text-white hover:bg-pink-500/90"
              >
                {claimMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Gift className="mr-2 size-4" />}
                {data.attendance.claimedToday ? "?ㅻ뒛 異쒖꽍 蹂댁긽 ?꾨즺" : "?ㅻ뒛 異쒖꽍 蹂댁긽 諛쏄린"}
              </Button>
            </div>

            <div className="rounded-3xl border border-blue-500/40 bg-card/50 p-5">
              <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-200">
                <Sparkles className="size-3" />
                泥댄뿕 ?ㅺ퀎
              </div>
              <h2 className="text-xl font-semibold">크레딧이 없어도 핵심 기능을 먼저 경험하세요</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                출석과 첫 이용 미션으로 받은 크레딧은 스토리 열람, 캐릭터채팅, 자작스토리 테스트에 사용할 수 있어요.
              </p>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.missions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                isPending={claimMut.isPending}
                onClaim={() => claimMut.mutate(mission.id)}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/35 p-3">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function MissionCard({
  mission,
  isPending,
  onClaim,
}: {
  mission: RewardMission;
  isPending: boolean;
  onClaim: () => void;
}) {
  return (
    <article className="flex min-h-[220px] flex-col rounded-3xl border border-border/60 bg-card/45 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="grid size-9 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-yellow-200">
          {mission.claimed ? <CheckCircle2 className="size-4" /> : mission.canClaim ? <Gift className="size-4" /> : <Lock className="size-4" />}
        </div>
        <Badge variant="outline" className="rounded-full text-[10px]">
          +{mission.credits}cr
        </Badge>
      </div>

      <h3 className="text-sm font-semibold">{mission.title}</h3>
      <p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">{mission.description}</p>

      {mission.claimed ? (
        <Button disabled variant="outline" className="mt-4 rounded-full">
          <CheckCircle2 className="mr-1.5 size-4" />
          ?꾨즺
        </Button>
      ) : mission.canClaim ? (
        <Button onClick={onClaim} disabled={isPending} className="mt-4 rounded-full">
          {isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Gift className="mr-1.5 size-4" />}
          蹂댁긽 諛쏄린
        </Button>
      ) : mission.actionHref ? (
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to={mission.actionHref}>
            {mission.actionLabel ?? "吏꾪뻾?섍린"}
            <ArrowRight className="ml-1.5 size-4" />
          </Link>
        </Button>
      ) : (
        <Button disabled variant="outline" className="mt-4 rounded-full">
          議곌굔 ?湲?        </Button>
      )}
    </article>
  );
}
