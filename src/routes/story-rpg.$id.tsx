import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Map,
  MessageCircle,
  RotateCcw,
  Send,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import {
  appendStoryMessage,
  clearStorySessionActivity,
  getOrCreateSession,
  getStorySessionActivity,
  recordChoice,
  updateSessionState,
} from "@/lib/sessions.functions";
import { getStoryRpgDetail } from "@/lib/story-rpg.functions";
import type { StoryRpgAsset, StoryRpgChoice, StoryRpgScene } from "@/lib/story-rpg-data";

type StoryRpgChatMessage = { role: "partner" | "user"; text: string };

type StoredStoryRpgProgress = {
  version: 1;
  storyId: string;
  currentSceneId: string | null;
  selectedChoice: StoryRpgChoice | null;
  choiceHistory: StoryRpgChoice[];
  chatLog: StoryRpgChatMessage[];
  updatedAt: string;
};

export const Route = createFileRoute("/story-rpg/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    preview: search.preview === true || search.preview === "true" || search.preview === "1",
    character: typeof search.character === "string" ? search.character : null,
    chat: search.chat === true || search.chat === "true",
  }),
  head: () => ({
    meta: [
      { title: "스토리게임 플레이 | Lovetale" },
      {
        name: "description",
        content: "선택과 대화로 진행되는 스토리게임 플레이 화면입니다.",
      },
    ],
  }),
  component: StoryRpgPlay,
});

function StoryRpgPlay() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const isPreview = search.preview === true;
  const { session, loading: authLoading } = useAuth();
  const fetchGame = useServerFn(getStoryRpgDetail);
  const fnGetOrCreateSession = useServerFn(getOrCreateSession);
  const fnGetSessionActivity = useServerFn(getStorySessionActivity);
  const fnUpdateSession = useServerFn(updateSessionState);
  const fnRecordChoice = useServerFn(recordChoice);
  const fnAppendMessage = useServerFn(appendStoryMessage);
  const fnClearSessionActivity = useServerFn(clearStorySessionActivity);
  const [previewAuthTimedOut, setPreviewAuthTimedOut] = useState(false);
  const { data: game, isLoading } = useQuery({
    queryKey: ["story_rpg_play", id, isPreview],
    queryFn: () => fetchGame({ data: { id, preview: isPreview, accessToken: session?.access_token } }),
    enabled: !isPreview || Boolean(session?.access_token),
  });
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<StoryRpgChoice | null>(null);
  const [choiceHistory, setChoiceHistory] = useState<StoryRpgChoice[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLog, setChatLog] = useState<StoryRpgChatMessage[]>([]);
  const [saveReady, setSaveReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [serverSessionId, setServerSessionId] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<"local" | "cloud">("local");

  useEffect(() => {
    if (!isPreview || session?.access_token) {
      setPreviewAuthTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setPreviewAuthTimedOut(true), 2500);
    return () => window.clearTimeout(timer);
  }, [isPreview, session?.access_token]);

  const scenes = useMemo<StoryRpgScene[]>(() => {
    if (!game) return [];
    return game.scenes?.length
      ? game.scenes
      : [
          {
            id: "opening",
            title: game.sceneTitle,
            text: game.sceneText,
            partnerLine: game.partnerLine,
            choices: game.choices,
          },
        ];
  }, [game]);

  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setSaveReady(false);
    const fallbackSceneId = game.scenes?.[0]?.id ?? "opening";
    const validSceneIds = new Set(scenes.map((scene) => scene.id));
    const storageStoryId = `story-rpg:${game.id}`;

    async function restoreFromServer() {
      if (!game || authLoading || !session) return false;
      const created = await fnGetOrCreateSession({
        data: {
          storyId: storageStoryId,
          characterId: game.leadName,
          mode: "vn",
          currentNode: fallbackSceneId,
          initialAffection: game.affection,
          initialArousal: game.tension,
          initialTrust: game.trust,
        },
      });
      if (cancelled) return true;
      const activity = await fnGetSessionActivity({ data: { storyId: storageStoryId } });
      if (cancelled) return true;
      const activeSession = activity?.session ?? created;
      const restoredSceneId =
        typeof activeSession?.current_node === "string" && validSceneIds.has(activeSession.current_node)
          ? activeSession.current_node
          : fallbackSceneId;
      setServerSessionId(activeSession?.id ?? null);
      setCurrentSceneId(restoredSceneId);
      setSelectedChoice(null);
      setChoiceHistory((activity?.choices ?? []).map(choiceFromSessionRow));
      setChatLog((activity?.messages ?? []).map(messageFromSessionRow).filter(isChatMessage));
      setLastSavedAt(activeSession?.updated_at ?? activeSession?.last_played_at ?? null);
      setSaveTarget("cloud");
      return true;
    }

    function restoreFromLocal() {
      const stored = readStoryRpgProgress(game.id);

      if (stored && stored.storyId === game.id && (!stored.currentSceneId || validSceneIds.has(stored.currentSceneId))) {
        setCurrentSceneId(stored.currentSceneId ?? fallbackSceneId);
        setSelectedChoice(stored.selectedChoice);
        setChoiceHistory(stored.choiceHistory);
        setChatLog(stored.chatLog);
        setLastSavedAt(stored.updatedAt);
      } else {
        setCurrentSceneId(fallbackSceneId);
        setSelectedChoice(null);
        setChoiceHistory([]);
        setChatLog([]);
        setLastSavedAt(null);
      }
      setServerSessionId(null);
      setSaveTarget("local");
    }

    if (authLoading) return;
    restoreFromServer()
      .then((restored) => {
        if (cancelled) return;
        if (!restored) restoreFromLocal();
      })
      .catch(() => {
        if (cancelled) return;
        restoreFromLocal();
      })
      .finally(() => {
        if (!cancelled) setSaveReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    fnGetOrCreateSession,
    fnGetSessionActivity,
    game?.id,
    game?.leadName,
    game?.affection,
    game?.tension,
    game?.trust,
    scenes,
    session,
  ]);

  useEffect(() => {
    if (!game || !saveReady || !currentSceneId) return;
    const updatedAt = new Date().toISOString();
    writeStoryRpgProgress({
      version: 1,
      storyId: game.id,
      currentSceneId,
      selectedChoice,
      choiceHistory,
      chatLog,
      updatedAt,
    });
    setLastSavedAt(updatedAt);
  }, [chatLog, choiceHistory, currentSceneId, game?.id, saveReady, selectedChoice]);

  const currentScene = useMemo(
    () => scenes.find((scene) => scene.id === currentSceneId) ?? scenes[0],
    [currentSceneId, scenes],
  );

  const selectedChoices = useMemo(
    () => [...choiceHistory, ...(selectedChoice ? [selectedChoice] : [])],
    [choiceHistory, selectedChoice],
  );

  const readingSegments = useMemo(() => {
    const firstScene = scenes[0];
    if (!firstScene) return [];
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));
    const segments: Array<{ scene: StoryRpgScene; choice: StoryRpgChoice | null }> = [
      { scene: firstScene, choice: null },
    ];
    for (const choice of choiceHistory) {
      const next = choice.nextSceneId ? byId.get(choice.nextSceneId) : null;
      if (next) segments.push({ scene: next, choice });
    }
    return segments;
  }, [choiceHistory, scenes]);

  const stats = useMemo(
    () =>
      selectedChoices.reduce(
        (acc, choice) => ({
          affection: clampStat(acc.affection + choice.affectionDelta),
          tension: clampStat(acc.tension + choice.tensionDelta),
          trust: clampStat(acc.trust + choice.trustDelta),
        }),
        {
          affection: game?.affection ?? 0,
          tension: game?.tension ?? 0,
          trust: game?.trust ?? 0,
        },
      ),
    [game, selectedChoices],
  );

  if (isPreview && !session?.access_token && (!authLoading || previewAuthTimedOut)) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">작업본을 미리볼 수 없어요</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          관리자 또는 에디터 로그인 상태를 확인하거나, 작업본이 삭제되지 않았는지 확인해 주세요.
        </p>
        <Button asChild className="mt-5 rounded-full">
          <Link to="/admin/story-rpg">스토리게임관리로 이동</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || (isPreview && authLoading)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#06040a] text-white/70">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (isPreview && !game) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">작업본을 미리볼 수 없어요</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          관리자 또는 에디터 로그인 상태를 확인하거나, 작업본이 삭제되지 않았는지 확인해 주세요.
        </p>
        <Button asChild className="mt-5 rounded-full">
          <Link to="/admin/story-rpg">스토리게임관리로 이동</Link>
        </Button>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">플레이할 스토리를 찾을 수 없어요</h1>
        <Button asChild className="mt-5 rounded-full">
          <Link to="/interactive-rpg">목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const lastChoice = selectedChoice ?? choiceHistory[choiceHistory.length - 1];
  const activeRoute = lastChoice?.routeHint ?? game.currentRoute;
  const sceneIndex = Math.max(0, scenes.findIndex((scene) => scene.id === currentScene?.id));
  const totalScenes = Math.max(1, scenes.length);
  const progressValue = Math.round(((sceneIndex + 1) / totalScenes) * 100);
  const recentChoices = choiceHistory.slice(-4);
  const nextScene = selectedChoice?.nextSceneId
    ? scenes.find((scene) => scene.id === selectedChoice.nextSceneId)
    : undefined;
  const messages = chatLog.length
    ? chatLog
    : [{ role: "partner" as const, text: currentScene?.partnerLine ?? game.partnerLine }];

  const persistChoice = (choice: StoryRpgChoice, targetScene: StoryRpgScene | undefined) => {
    const previousSceneId = currentScene?.id ?? currentSceneId ?? "start";
    const nextStats = {
      affection: clampStat(stats.affection + choice.affectionDelta),
      tension: clampStat(stats.tension + choice.tensionDelta),
      trust: clampStat(stats.trust + choice.trustDelta),
    };
    setChoiceHistory((items) => [...items, choice]);
    setSelectedChoice(null);
    if (targetScene) {
      setCurrentSceneId(targetScene.id);
      setChatLog((items) => [
        ...items,
        {
          role: "partner",
          text: targetScene.partnerLine,
        },
      ]);
    }
    window.requestAnimationFrame(() => window.scrollBy({ top: 380, behavior: "smooth" }));
    if (serverSessionId) {
      void fnRecordChoice({
        data: {
          sessionId: serverSessionId,
          nodeId: previousSceneId,
          choiceId: targetScene?.id ?? choice.nextSceneId ?? "ending",
          choiceLabel: choice.label,
          affectionDelta: choice.affectionDelta,
          arousalDelta: choice.tensionDelta,
          trustDelta: choice.trustDelta,
        },
      }).catch(() => {});
      void fnUpdateSession({
        data: {
          sessionId: serverSessionId,
          currentNode: targetScene?.id ?? previousSceneId,
          affection: nextStats.affection,
          arousal: nextStats.tension,
          trust: nextStats.trust,
          isCompleted: !targetScene,
          endingId: targetScene ? null : choice.routeHint,
        },
      }).catch(() => {});
      if (targetScene) {
        void fnAppendMessage({
          data: {
            sessionId: serverSessionId,
            role: "assistant",
            content: targetScene.partnerLine,
            nodeId: targetScene.id,
          },
        }).catch(() => {});
      }
    }
  };

  const selectChoice = (choice: StoryRpgChoice) => {
    const targetScene = choice.nextSceneId ? scenes.find((scene) => scene.id === choice.nextSceneId) : undefined;
    if (!targetScene) {
      setSelectedChoice(choice);
      return;
    }
    persistChoice(choice, targetScene);
  };

  const continueToNextScene = () => {
    if (!selectedChoice || !nextScene) return;
    persistChoice(selectedChoice, nextScene);
  };

  const resetProgress = () => {
    if (!game) return;
    removeStoryRpgProgress(game.id);
    const firstSceneId = game.scenes?.[0]?.id ?? "opening";
    setCurrentSceneId(firstSceneId);
    setSelectedChoice(null);
    setChoiceHistory([]);
    setChatLog([]);
    setLastSavedAt(null);
    if (serverSessionId) {
      void fnClearSessionActivity({ data: { sessionId: serverSessionId } }).catch(() => {});
      void fnUpdateSession({
        data: {
          sessionId: serverSessionId,
          currentNode: firstSceneId,
          affection: game.affection,
          arousal: game.tension,
          trust: game.trust,
          isCompleted: false,
          endingId: null,
        },
      }).catch(() => {});
    }
  };

  const sendMessage = () => {
    const message = chatMessage.trim();
    if (!message) return;
    setChatLog((items) => [
      ...items,
      { role: "user", text: message },
      {
        role: "partner",
        text: lastChoice
          ? `${lastChoice.result} 지금 그 선택이 마음에 걸려. 조금 더 말해줄래?`
          : "지금 네 선택을 보고 있어. 솔직하게 말해줘.",
      },
    ]);
    if (serverSessionId) {
      void fnAppendMessage({
        data: { sessionId: serverSessionId, role: "user", content: message, nodeId: currentScene?.id },
      }).catch(() => {});
    }
    setChatMessage("");
  };

  const unlockedAssets = game.visualAssets.filter((asset) => stats.affection >= asset.minAffection);
  const lockedAssets = game.visualAssets.filter((asset) => stats.affection < asset.minAffection);

  return (
    <div className="relative min-h-dvh bg-[#06040a] text-white">
      <div className="fixed inset-0 -z-10">
        <CoverImage src={game.background} alt="" className="h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,4,10,.94),rgba(6,4,10,.62),rgba(6,4,10,.96))]" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#06040a] to-transparent" />
      </div>

      <main className="mx-auto grid max-w-[1520px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_286px] xl:grid-cols-[minmax(0,1fr)_310px]">
        <section className="min-h-[calc(100dvh-32px)] rounded-[26px] border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="rounded-full bg-white/8 text-white hover:bg-white/12">
                <Link to="/interactive-rpg">
                  <ArrowLeft className="mr-1.5 size-4" />
                  목록
                </Link>
              </Button>
              <Badge variant="outline" className="border-pink-400/35 bg-pink-500/10 text-pink-100">
                Story RPG
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
              <StatusChip label={`${sceneIndex + 1}/${totalScenes}`} />
              <StatusChip label={activeRoute} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-1 h-8 rounded-full bg-white/7 px-3 text-xs text-white/65 hover:bg-white/12 hover:text-white"
                onClick={resetProgress}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                처음부터
              </Button>
            </div>
          </header>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/7 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-white/58">
              <span className="inline-flex items-center gap-1.5">
                <Map className="size-3.5 text-primary" />
                {currentScene?.title ?? game.currentChapter}
              </span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="mt-2 h-1.5 bg-white/12" />
          </div>

          <article className="mx-auto mt-5 max-w-5xl space-y-5 pb-10">
            <div className="rounded-[28px] border border-white/10 bg-black/35 p-5 md:p-8">
              <div className="text-xs uppercase tracking-[0.28em] text-pink-200">Story RPG</div>
              <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-6xl">{game.title}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/56">{game.logline}</p>
            </div>

            {readingSegments.map((segment, index) => {
              const isLast = index === readingSegments.length - 1;
              const inlineAsset = pickSegmentAsset(game.visualAssets, stats.affection, index);
              return (
                <StorySegment
                  key={`${segment.scene.id}-${index}`}
                  scene={segment.scene}
                  choice={segment.choice}
                  leadName={game.leadName}
                  asset={inlineAsset}
                  isLast={isLast}
                  selectedChoice={selectedChoice}
                  nextScene={nextScene}
                  onClearSelected={() => setSelectedChoice(null)}
                  onContinue={continueToNextScene}
                  onSelectChoice={selectChoice}
                />
              );
            })}
          </article>
        </section>

        <aside className="sticky top-4 flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <CoverImage src={game.cover} alt={game.leadName} className="size-14 rounded-2xl object-cover" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{game.leadName}</div>
              <div className="text-xs text-white/52">{game.mood}</div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-white/10 bg-white/7 p-3">
            <div className="text-xs text-white/50">현재 루트</div>
            <div className="mt-1 truncate text-sm font-semibold text-white/82">{activeRoute}</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Mini label="엔딩" value={`${game.endings.unlocked}/${game.endings.total}`} icon={Trophy} />
            <Mini label="이미지" value={`${game.images.unlocked}/${game.images.unlocked + game.images.locked}`} icon={ImageIcon} />
          </div>

          <div className="mt-3 space-y-2">
            <Stat label="호감도" value={stats.affection} />
            <Stat label="긴장도" value={stats.tension} />
            <Stat label="신뢰도" value={stats.trust} />
          </div>

          <div
            className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100/80"
            data-save-target={saveTarget}
          >
            자동저장됨
            {lastSavedAt ? (
              <span className="ml-1 text-emerald-100/50">{formatSavedTime(lastSavedAt)}</span>
            ) : null}
          </div>

          <AssetUnlockPanel unlocked={unlockedAssets} locked={lockedAssets} affection={stats.affection} />

          <div className="mt-3 rounded-2xl border border-white/10 bg-white/7 p-3">
            <div className="mb-2 text-xs font-semibold text-white/60">진행 로그</div>
            {recentChoices.length ? (
              <div className="space-y-2">
                {recentChoices.map((choice, index) => (
                  <div key={`${choice.label}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-white/62">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="line-clamp-2">{choice.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-white/42">첫 선택을 기다리는 중</div>
            )}
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-white/7 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="size-4 text-primary" />
              {game.leadName}
            </div>
            <div className="max-h-28 space-y-2 overflow-y-auto pr-1 text-xs">
              {messages.slice(-3).map((message, index) => (
                <div
                  key={`${message.text}-${index}`}
                  className={`rounded-2xl p-2 ${
                    message.role === "partner" ? "bg-white/8 text-white/64" : "ml-4 bg-primary/18 text-white"
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={chatMessage}
              onChange={(event) => setChatMessage(event.target.value)}
              placeholder={`${game.leadName}에게 말하기`}
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm outline-none placeholder:text-white/35"
            />
            <Button type="submit" size="icon" className="rounded-full">
              <Send className="size-4" />
            </Button>
          </form>
        </aside>
      </main>
    </div>
  );
}

function clampStat(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatChoiceDelta(choice: StoryRpgChoice) {
  const parts = [
    choice.affectionDelta ? `호감 ${formatSignedNumber(choice.affectionDelta)}` : "",
    choice.tensionDelta ? `긴장 ${formatSignedNumber(choice.tensionDelta)}` : "",
    choice.trustDelta ? `신뢰 ${formatSignedNumber(choice.trustDelta)}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : choice.effect;
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/7 px-2.5 py-1 text-white/72">
      {label}
    </span>
  );
}

function StorySegment({
  scene,
  choice,
  leadName,
  asset,
  isLast,
  selectedChoice,
  nextScene,
  onClearSelected,
  onContinue,
  onSelectChoice,
}: {
  scene: StoryRpgScene;
  choice: StoryRpgChoice | null;
  leadName: string;
  asset?: StoryRpgAsset | null;
  isLast: boolean;
  selectedChoice: StoryRpgChoice | null;
  nextScene?: StoryRpgScene;
  onClearSelected: () => void;
  onContinue: () => void;
  onSelectChoice: (choice: StoryRpgChoice) => void;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-black/35 p-5 md:p-8">
      {choice ? (
        <div className="mb-5 rounded-2xl border border-primary/25 bg-primary/12 p-4">
          <div className="text-[11px] uppercase tracking-[0.26em] text-pink-200">선택</div>
          <p className="mt-1 text-base font-semibold text-white/86">{choice.label}</p>
          <p className="mt-2 text-sm leading-6 text-white/56">{choice.result}</p>
        </div>
      ) : null}

      <div className="text-xs uppercase tracking-[0.28em] text-pink-200">{scene.title}</div>
      <p className="mt-5 whitespace-pre-wrap text-lg leading-9 text-white/84 md:text-xl md:leading-10">{scene.text}</p>

      {asset ? <InlineAsset asset={asset} /> : null}

      <div className="mt-6 rounded-2xl border border-pink-400/25 bg-pink-500/10 p-4 shadow-[0_0_45px_rgba(236,72,153,.08)]">
        <div className="text-xs text-pink-200">{leadName}</div>
        <p className="mt-1 text-xl font-semibold leading-8">"{scene.partnerLine}"</p>
      </div>

      {isLast ? (
        <ChoiceBlock
          scene={scene}
          selectedChoice={selectedChoice}
          nextScene={nextScene}
          onClearSelected={onClearSelected}
          onContinue={onContinue}
          onSelectChoice={onSelectChoice}
        />
      ) : null}
    </section>
  );
}

function ChoiceBlock({
  scene,
  selectedChoice,
  nextScene,
  onClearSelected,
  onContinue,
  onSelectChoice,
}: {
  scene: StoryRpgScene;
  selectedChoice: StoryRpgChoice | null;
  nextScene?: StoryRpgScene;
  onClearSelected: () => void;
  onContinue: () => void;
  onSelectChoice: (choice: StoryRpgChoice) => void;
}) {
  return (
    <div className="mt-6 rounded-[22px] border border-white/10 bg-white/7 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white/80">선택지</h2>
        {selectedChoice ? (
          <Button variant="ghost" size="sm" className="h-8 rounded-full text-white/70" onClick={onClearSelected}>
            다시 선택
          </Button>
        ) : null}
      </div>
      {scene.choices.length ? (
        <div className="grid gap-2 lg:grid-cols-3">
          {scene.choices.map((choice, index) => (
            <button
              key={`${scene.id}-${choice.label}`}
              type="button"
              onClick={() => onSelectChoice(choice)}
              className={`group rounded-2xl border p-3 text-left transition ${
                selectedChoice?.label === choice.label
                  ? "border-primary/60 bg-primary/18 shadow-[0_0_35px_rgba(236,72,153,.12)]"
                  : "border-white/10 bg-black/24 hover:border-primary/45 hover:bg-white/7"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold">
                  <span className="mr-2 text-primary">{index + 1}</span>
                  {choice.label}
                </div>
                <ChevronRight className="size-4 shrink-0 text-white/28 transition group-hover:text-primary" />
              </div>
              <div className="mt-2 text-xs text-white/52">{choice.tone}</div>
              <div className="mt-2 text-[11px] text-white/42">{formatChoiceDelta(choice)}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/25 bg-primary/12 p-4 text-sm leading-6 text-white/78">
          현재 장면은 여기까지입니다.
        </div>
      )}
      {selectedChoice ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/12 p-3">
          <div className="min-w-0 text-sm leading-6 text-white/76">
            <div>{selectedChoice.result}</div>
            {nextScene ? <div className="mt-1 text-xs text-pink-100/70">다음: {nextScene.title}</div> : null}
          </div>
          <Button type="button" disabled={!nextScene} className="rounded-full" onClick={onContinue}>
            계속
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function InlineAsset({ asset }: { asset: StoryRpgAsset }) {
  return (
    <figure className="my-8 overflow-hidden rounded-[24px] border border-white/10 bg-white/7">
      <div className="relative aspect-[16/9] bg-black/40">
        {asset.type === "video" ? (
          <video src={asset.url} className="size-full object-cover" controls playsInline />
        ) : (
          <CoverImage src={asset.url} alt={asset.caption} className="size-full object-cover" />
        )}
        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
          {asset.tier.toUpperCase()}
        </div>
      </div>
      {asset.caption ? <figcaption className="px-4 py-3 text-xs text-white/54">{asset.caption}</figcaption> : null}
    </figure>
  );
}

function AssetUnlockPanel({
  unlocked,
  locked,
  affection,
}: {
  unlocked: StoryRpgAsset[];
  locked: StoryRpgAsset[];
  affection: number;
}) {
  const unlockedPreview = unlocked.slice(0, 4);
  const lockedPreview = locked.slice(0, 6);
  return (
    <div className="mt-3 rounded-[22px] border border-white/10 bg-white/7 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="size-4 text-primary" />
          해금 이미지
        </div>
        <span className="text-xs text-white/42">{affection}/100</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {unlockedPreview.map((asset) => (
          <AssetThumb key={asset.id} asset={asset} locked={false} />
        ))}
        {lockedPreview.map((asset) => (
          <AssetThumb key={asset.id} asset={asset} locked />
        ))}
        {!unlockedPreview.length && !lockedPreview.length
          ? Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid aspect-square place-items-center rounded-xl border border-dashed border-white/12 bg-black/24">
                <ImageIcon className="size-4 text-white/24" />
              </div>
            ))
          : null}
      </div>
    </div>
  );
}

function AssetThumb({ asset, locked }: { asset: StoryRpgAsset; locked: boolean }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-black/35">
      {asset.type === "video" ? (
        <video src={asset.url} className={`size-full object-cover ${locked ? "blur-sm saturate-50" : ""}`} muted playsInline />
      ) : (
        <CoverImage src={asset.url} alt={asset.caption} className={`size-full object-cover ${locked ? "blur-sm saturate-50" : ""}`} />
      )}
      {locked ? (
        <>
          <div className="absolute inset-0 bg-black/48" />
          <span className="absolute left-1 top-1 rounded bg-rose-500 px-1.5 py-0.5 text-[8px] font-black text-white">19+</span>
        </>
      ) : null}
    </div>
  );
}

function pickSegmentAsset(assets: StoryRpgAsset[], affection: number, segmentIndex: number) {
  const visible = assets.filter((asset) => affection >= asset.minAffection);
  if (!visible.length) return null;
  return visible[segmentIndex % visible.length];
}

function storyRpgProgressKey(storyId: string) {
  return `lovetale:story-rpg:${storyId}:progress`;
}

function choiceFromSessionRow(value: any): StoryRpgChoice {
  const label = typeof value?.choice_label === "string" ? value.choice_label : "Saved choice";
  const nextSceneId = typeof value?.choice_id === "string" ? value.choice_id : undefined;
  return {
    label,
    effect: "저장된 선택",
    tone: "진행 기록",
    result: `${label} 선택으로 이어진 장면입니다.`,
    routeHint: "Saved Route",
    nextSceneId,
    affectionDelta: Number(value?.affection_delta ?? 0),
    tensionDelta: Number(value?.arousal_delta ?? 0),
    trustDelta: Number(value?.trust_delta ?? 0),
  };
}

function messageFromSessionRow(value: any): StoryRpgChatMessage | null {
  if (!value || typeof value.content !== "string") return null;
  return {
    role: value.role === "user" ? "user" : "partner",
    text: value.content,
  };
}

function isStoryRpgChoice(value: unknown): value is StoryRpgChoice {
  return Boolean(value && typeof value === "object" && typeof (value as StoryRpgChoice).label === "string");
}

function isChatMessage(value: unknown): value is StoryRpgChatMessage {
  return (
    Boolean(value && typeof value === "object") &&
    ((value as StoryRpgChatMessage).role === "partner" || (value as StoryRpgChatMessage).role === "user") &&
    typeof (value as StoryRpgChatMessage).text === "string"
  );
}

function readStoryRpgProgress(storyId: string): StoredStoryRpgProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storyRpgProgressKey(storyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredStoryRpgProgress>;
    if (parsed.version !== 1 || parsed.storyId !== storyId) return null;
    return {
      version: 1,
      storyId,
      currentSceneId: typeof parsed.currentSceneId === "string" ? parsed.currentSceneId : null,
      selectedChoice: isStoryRpgChoice(parsed.selectedChoice) ? parsed.selectedChoice : null,
      choiceHistory: Array.isArray(parsed.choiceHistory) ? parsed.choiceHistory.filter(isStoryRpgChoice) : [],
      chatLog: Array.isArray(parsed.chatLog) ? parsed.chatLog.filter(isChatMessage) : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeStoryRpgProgress(progress: StoredStoryRpgProgress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storyRpgProgressKey(progress.storyId), JSON.stringify(progress));
  } catch {
    // Storage can be unavailable in private browsing; gameplay should continue.
  }
}

function removeStoryRpgProgress(storyId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storyRpgProgressKey(storyId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function formatSavedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
      <div className="flex items-center justify-between text-xs text-white/58">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <Progress value={value} className="mt-2 h-1.5 bg-white/12" />
    </div>
  );
}

function Mini({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
      <Icon className="size-4 text-primary" />
      <div className="mt-2 text-xs text-white/50">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

