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
import type { StoryRpgChoice, StoryRpgScene } from "@/lib/story-rpg-data";

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

  const selectChoice = (choice: StoryRpgChoice) => {
    setSelectedChoice(choice);
  };

  const continueToNextScene = () => {
    if (!selectedChoice || !nextScene) return;
    const previousSceneId = currentScene?.id ?? currentSceneId ?? "start";
    const nextStats = {
      affection: clampStat(stats.affection),
      tension: clampStat(stats.tension),
      trust: clampStat(stats.trust),
    };
    setChoiceHistory((items) => [...items, selectedChoice]);
    setSelectedChoice(null);
    setCurrentSceneId(nextScene.id);
    setChatLog((items) => [
      ...items,
      {
        role: "partner",
        text: nextScene.partnerLine,
      },
    ]);
    if (serverSessionId) {
      void fnRecordChoice({
        data: {
          sessionId: serverSessionId,
          nodeId: previousSceneId,
          choiceId: nextScene.id,
          choiceLabel: selectedChoice.label,
          affectionDelta: selectedChoice.affectionDelta,
          arousalDelta: selectedChoice.tensionDelta,
          trustDelta: selectedChoice.trustDelta,
        },
      }).catch(() => {});
      void fnUpdateSession({
        data: {
          sessionId: serverSessionId,
          currentNode: nextScene.id,
          affection: nextStats.affection,
          arousal: nextStats.tension,
          trust: nextStats.trust,
        },
      }).catch(() => {});
      void fnAppendMessage({
        data: {
          sessionId: serverSessionId,
          role: "assistant",
          content: nextScene.partnerLine,
          nodeId: nextScene.id,
        },
      }).catch(() => {});
    }
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

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#06040a] text-white">
      <div className="fixed inset-0 -z-10">
        <img src={game.background} alt="" className="h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,4,10,.94),rgba(6,4,10,.62),rgba(6,4,10,.96))]" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#06040a] to-transparent" />
      </div>

      <main className="mx-auto grid min-h-dvh max-w-7xl gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-[calc(100dvh-40px)] flex-col rounded-[26px] border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
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
              <StatusChip label={`호감 ${stats.affection}`} />
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

          <div className="grid min-h-0 flex-1 gap-4 py-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <article className="flex min-h-[500px] flex-col justify-end rounded-[24px] border border-white/10 bg-black/35 p-6">
              <div className="max-w-4xl">
                <div className="mb-3 text-xs uppercase tracking-[0.28em] text-pink-200">{currentScene?.title}</div>
                <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">{game.title}</h1>
                <p className="mt-5 max-w-4xl whitespace-pre-wrap text-lg leading-9 text-white/84">{currentScene?.text}</p>
                <div className="mt-6 rounded-2xl border border-pink-400/25 bg-pink-500/10 p-4 shadow-[0_0_45px_rgba(236,72,153,.08)]">
                  <div className="text-xs text-pink-200">{game.leadName}</div>
                  <p className="mt-1 text-xl font-semibold leading-8">"{currentScene?.partnerLine}"</p>
                </div>
              </div>
            </article>

            <aside className="space-y-3">
              <Stat label="호감도" value={stats.affection} />
              <Stat label="긴장도" value={stats.tension} />
              <Stat label="신뢰도" value={stats.trust} />
              <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
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
            </aside>
          </div>

          <section className="rounded-[22px] border border-white/10 bg-white/7 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white/80">다음 행동</h2>
              {selectedChoice ? (
                <Button variant="ghost" size="sm" className="h-8 rounded-full text-white/70" onClick={() => setSelectedChoice(null)}>
                  다시 선택
                </Button>
              ) : null}
            </div>
            {currentScene?.choices.length ? (
              <div className="grid gap-2 lg:grid-cols-3">
                {currentScene.choices.map((choice, index) => (
                  <button
                    key={`${currentScene.id}-${choice.label}`}
                    type="button"
                    onClick={() => selectChoice(choice)}
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
                <Button
                  type="button"
                  disabled={!nextScene}
                  className="rounded-full"
                  onClick={continueToNextScene}
                >
                  계속
                </Button>
              </div>
            ) : null}
          </section>
        </section>

        <aside className="flex min-h-[calc(100dvh-40px)] flex-col rounded-[26px] border border-white/10 bg-black/34 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <img src={game.cover} alt={game.leadName} className="size-14 rounded-2xl object-cover" />
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

          <div
            className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100/80"
            data-save-target={saveTarget}
          >
            자동저장됨
            {lastSavedAt ? (
              <span className="ml-1 text-emerald-100/50">{formatSavedTime(lastSavedAt)}</span>
            ) : null}
          </div>

          <div className="mt-4 flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-white/7 p-3">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <MessageCircle className="size-4 text-primary" />
              {game.leadName}
            </div>
            <div className="max-h-[calc(100dvh-310px)] space-y-3 overflow-y-auto pr-1 text-sm">
              {messages.map((message, index) => (
                <div
                  key={`${message.text}-${index}`}
                  className={`rounded-2xl p-3 ${
                    message.role === "partner" ? "bg-white/8 text-white/72" : "ml-6 bg-primary/18 text-white"
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

