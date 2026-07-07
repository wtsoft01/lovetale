import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@/lib/_mock/runtime";
import { claimReward, getRewardCenter, type RewardCenter, type RewardMission } from "@/lib/rewards.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "무료크레딧 | Lovetale" },
      {
        name: "description",
        content: "출석체크와 첫 이용 미션으로 Lovetale 체험 크레딧을 받을 수 있습니다.",
      },
    ],
  }),
  component: RewardsPage,
});

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getPreviewTodayKey(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getPreviewWeekday(key: string) {
  const date = new Date(`${key}T00:00:00.000+09:00`);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
}

function buildPreviewCalendar(todayKey: string): RewardCenter["attendance"]["calendar"] {
  const monthKey = todayKey.slice(0, 7);
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    monthLabel: `${year}년 ${month}월`,
    startWeekday: getPreviewWeekday(`${monthKey}-01`),
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
      return {
        dateKey,
        day,
        claimed: false,
        isToday: dateKey === todayKey,
        isFuture: dateKey > todayKey,
      };
    }),
  };
}

const PREVIEW_TODAY_KEY = getPreviewTodayKey();

const REWARD_PREVIEW: RewardCenter = {
  credits: 0,
  todayKey: PREVIEW_TODAY_KEY,
  attendance: {
    claimedToday: false,
    streakDays: 0,
    baseCredits: 20,
    nextBonusText: "7일 연속 출석 시 +100cr",
    calendar: buildPreviewCalendar(PREVIEW_TODAY_KEY),
  },
  missions: [
    {
      id: "welcome_bonus",
      title: "첫 체험 크레딧",
      description: "Lovetale의 스토리와 캐릭터 데이팅을 가볍게 체험해 보세요.",
      credits: 100,
      claimed: false,
      canClaim: true,
    },
    {
      id: "profile_completed",
      title: "프로필 완성",
      description: "닉네임과 아바타를 설정하면 캐릭터와의 경험이 자연스럽게 시작돼요.",
      credits: 100,
      claimed: false,
      canClaim: false,
      actionHref: "/profile",
      actionLabel: "프로필 설정",
    },
    {
      id: "first_story_started",
      title: "첫 스토리 시작",
      description: "마음에 드는 스토리를 열고 첫 장면에 진입하면 보상을 받을 수 있어요.",
      credits: 150,
      claimed: false,
      canClaim: false,
      actionHref: "/",
      actionLabel: "스토리 보기",
    },
    {
      id: "first_creator_story",
      title: "자작스토리 첫 생성",
      description: "나만의 스토리 초안을 만들고 창작 흐름을 테스트해 보세요.",
      credits: 300,
      claimed: false,
      canClaim: false,
      actionHref: "/builder",
      actionLabel: "자작스토리 만들기",
    },
  ],
};

function RewardsPage() {
  const fetchRewards = useServerFn(getRewardCenter);
  const claim = useServerFn(claimReward);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSignedIn = Boolean(user);

  const rewardsQ = useQuery({
    queryKey: ["reward_center"],
    queryFn: () => fetchRewards(),
    enabled: isSignedIn && !authLoading,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: REWARD_PREVIEW,
  });

  const claimMut = useMutation({
    mutationFn: (rewardId: RewardMission["id"]) => claim({ data: { rewardId } }),
    onSuccess: (result) => {
      toast.success(`${result.creditsAwarded.toLocaleString()} 크레딧을 받았습니다.`);
      qc.invalidateQueries({ queryKey: ["reward_center"] });
      qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "보상 지급에 실패했습니다.");
    },
  });

  const data = rewardsQ.data ?? REWARD_PREVIEW;
  const syncing = authLoading || (isSignedIn && rewardsQ.isFetching);

  function promptLogin() {
    toast.info("무료크레딧은 로그인 후 받을 수 있어요.");
    navigate({ to: "/auth" });
  }

  function claimRewardById(rewardId: RewardMission["id"]) {
    if (!isSignedIn) {
      promptLogin();
      return;
    }
    claimMut.mutate(rewardId);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <Gift className="size-3" />
            FREE CREDIT
          </Badge>
          <h1 className="text-base font-semibold">무료크레딧</h1>
          {syncing && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              동기화 중
            </Badge>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit gap-1.5 rounded-full">
          <Link to="/premium">
            <Coins className="size-4" />
            충전,구독 보기
          </Link>
        </Button>
      </section>

      {rewardsQ.isError && isSignedIn && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          보상 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}

      <AttendanceCalendarCard
        data={data}
        isSignedIn={isSignedIn}
        isPending={claimMut.isPending}
        onClaim={() => claimRewardById("daily_attendance")}
      />

      <section className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-border/60 bg-card/45 p-5">
          <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
            <Coins className="size-3" />
            보유 크레딧
          </div>
          <div className="text-2xl font-semibold">
            {isSignedIn ? `${data.credits.toLocaleString()} cr` : "로그인 필요"}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            출석과 미션으로 받은 크레딧은 스토리 열람, 캐릭터채팅, 자작스토리 테스트에 사용할 수 있어요.
          </p>
        </div>

        <div className="rounded-3xl border border-blue-500/40 bg-card/50 p-5">
          <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-200">
            <Sparkles className="size-3" />
            체험 설계
          </div>
          <h2 className="text-xl font-semibold">크레딧이 없어도 핵심 기능을 먼저 경험하세요</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            매일 20cr을 받고, 일주일 연속 출석하면 100cr을 추가로 받을 수 있어요.
          </p>
          {!isSignedIn && (
            <Button asChild variant="outline" className="mt-4 rounded-full">
              <Link to="/auth">
                로그인하고 보상 받기
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            isSignedIn={isSignedIn}
            isPending={claimMut.isPending}
            onClaim={() => claimRewardById(mission.id)}
          />
        ))}
      </section>
    </div>
  );
}

function AttendanceCalendarCard({
  data,
  isSignedIn,
  isPending,
  onClaim,
}: {
  data: RewardCenter;
  isSignedIn: boolean;
  isPending: boolean;
  onClaim: () => void;
}) {
  const { attendance } = data;
  const { calendar } = attendance;

  return (
    <section className="rounded-3xl border border-pink-500/45 bg-card/50 p-5 shadow-[0_0_0_1px_rgba(236,72,153,.10)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2.5 py-1 text-[11px] font-medium text-pink-600 dark:text-pink-200">
            <CalendarCheck className="size-3" />
            출석보상
          </div>
          <h2 className="text-2xl font-semibold">오늘의 무료크레딧을 받아보세요</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            하루 {attendance.baseCredits}cr, 7일 연속 출석마다 100cr을 추가로 지급합니다.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
          <Stat label="오늘 보상" value={`+${attendance.baseCredits}cr`} />
          <Stat label="연속 출석" value={`${attendance.streakDays}일`} />
          <Stat label="다음 보너스" value={attendance.nextBonusText} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{calendar.monthLabel}</h3>
            <Badge variant="outline" className="rounded-full text-[10px]">
              7일 연속 +100cr
            </Badge>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAY_LABELS.map((weekday) => (
              <div key={weekday} className="py-1">
                {weekday}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {calendar.days.map((day) => (
              <div
                key={day.dateKey}
                style={{ gridColumnStart: day.day === 1 ? calendar.startWeekday + 1 : undefined }}
                className={cn(
                  "relative grid aspect-square min-h-9 place-items-center rounded-2xl border text-xs font-semibold transition sm:min-h-11",
                  day.isFuture
                    ? "border-border/30 bg-muted/20 text-muted-foreground/40"
                    : "border-border/60 bg-background/45 text-foreground",
                  day.claimed && "border-pink-500/60 bg-pink-500/15 text-pink-700 dark:text-pink-100",
                  day.isToday && "ring-2 ring-pink-500/50 ring-offset-2 ring-offset-background",
                )}
              >
                <span>{day.day}</span>
                {day.claimed && <CheckCircle2 className="absolute bottom-1 right-1 size-3 text-pink-600 dark:text-pink-100" />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border/60 bg-background/35 p-4">
          <div>
            <div className="text-[10px] text-muted-foreground">오늘 받을 수 있는 보상</div>
            <div className="mt-1 text-2xl font-semibold">+{attendance.baseCredits}cr</div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {attendance.claimedToday ? "오늘 출석은 완료되었습니다." : attendance.nextBonusText}
            </p>
          </div>

          <Button
            disabled={isSignedIn && (attendance.claimedToday || isPending)}
            onClick={onClaim}
            className="mt-4 w-full rounded-full bg-pink-500 text-white hover:bg-pink-500/90"
          >
            {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Gift className="mr-2 size-4" />}
            {!isSignedIn ? "로그인하고 오늘 보상 받기" : attendance.claimedToday ? "오늘 출석 보상 완료" : "오늘 출석 보상 받기"}
          </Button>
        </div>
      </div>
    </section>
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
  isSignedIn,
  isPending,
  onClaim,
}: {
  mission: RewardMission;
  isSignedIn: boolean;
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

      {!isSignedIn ? (
        <Button onClick={onClaim} className="mt-4 rounded-full">
          <Gift className="mr-1.5 size-4" />
          로그인하고 확인
        </Button>
      ) : mission.claimed ? (
        <Button disabled variant="outline" className="mt-4 rounded-full">
          <CheckCircle2 className="mr-1.5 size-4" />
          완료
        </Button>
      ) : mission.canClaim ? (
        <Button onClick={onClaim} disabled={isPending} className="mt-4 rounded-full">
          {isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Gift className="mr-1.5 size-4" />}
          보상 받기
        </Button>
      ) : mission.actionHref ? (
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to={mission.actionHref}>
            {mission.actionLabel ?? "진행하기"}
            <ArrowRight className="ml-1.5 size-4" />
          </Link>
        </Button>
      ) : (
        <Button disabled variant="outline" className="mt-4 rounded-full">
          조건 대기
        </Button>
      )}
    </article>
  );
}
