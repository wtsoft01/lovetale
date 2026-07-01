import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@/lib/_mock/runtime";
import { toast } from "sonner";
import {
  ArrowLeft,
  Mic,
  Send,
  Volume2,
  MessagesSquare,
  BookOpen,
  Heart,
  Sparkles,
  RotateCcw,
  Film,
  Loader2,
  Play as PlayIcon,
  Flame,
  Clock,
  Star,
  ShieldAlert,
  ShieldCheck,
  Bookmark,
  Maximize2,
  Minimize2,
  ChevronRight,
  Lock,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { getCharacter } from "@/lib/mock/characters";
import { getStory } from "@/lib/mock/stories";
import { getStoryBeats, getStoryChapters } from "@/lib/mock/story-beats";
import {
  emotionTint,
  emotionLabel,
  type Emotion,
  type StoryChoice,
} from "@/lib/mock/story";
import {
  getOrCreateSession,
  updateSessionState,
  recordChoice,
  appendStoryMessage,
  saveEnding,
  toggleBookmark,
} from "@/lib/sessions.functions";
import { getMyProfile, verifyAge } from "@/lib/profile.functions";
import { BeatBackdrop } from "@/components/beat-backdrop";
import { InlineBeatMedia } from "@/components/inline-beat-media";
import { AffectionMeter } from "@/components/affection-meter";
import { ThresholdEditor } from "@/components/threshold-editor";
import { useChoiceThresholds } from "@/hooks/use-choice-thresholds";
import { tierFor, nextTier, type HeatTier } from "@/lib/heat-tier";
import { TIER_COST } from "@/lib/tier-pricing";
import { listMyUnlocks, unlockBeatMedia } from "@/lib/unlocks.functions";


export const Route = createFileRoute("/play/$sessionId")({
  loader: ({ params }) => {
    const story = getStory(params.sessionId);
    if (!story) throw notFound();
    const character = getCharacter(story.characterId);
    if (!character) throw notFound();
    return { story, character, beats: getStoryBeats(story.id) };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.story.title ?? "플레이"} — Lovetale` },
      {
        name: "description",
        content: loaderData?.story.synopsis ?? "비주얼 노벨 세션.",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-display text-3xl">스토리를 찾을 수 없어요</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        홈으로
      </Link>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-display text-2xl">문제가 발생했어요</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset} className="mt-4">다시 시도</Button>
    </div>
  ),
  component: Play,
});

function detectEmotion(text: string): Emotion {
  const t = text.toLowerCase();
  if (/(사랑|love|키스|안아|숨|뜨거)/.test(t)) return "passion";
  if (/(미안|sorry|싫|울|아파)/.test(t)) return "sad";
  if (/(ㅋ|ㅎ|하하|웃|좋아)/.test(t)) return "happy";
  if (/(긴장|두근|떨|위험)/.test(t)) return "tense";
  if (/(부끄|얼굴|붉)/.test(t)) return "shy";
  return "calm";
}

// How the AI character's response shifts the player's affection.
// Drives "chat → story branching" by unlocking hidden choices at thresholds.
function emotionToAffection(e: Emotion): number {
  switch (e) {
    case "passion": return 5;
    case "happy":   return 3;
    case "shy":     return 2;
    case "calm":    return 0;
    case "tense":   return -1;
    case "sad":     return -3;
    default:        return 0;
  }
}

const chatTransport = new DefaultChatTransport({ api: "/api/chat" });

// Lightweight typewriter for narration / dialogue
function useTypewriter(text: string, speed = 22) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  const done = out.length >= text.length;
  return { out, done, finish: () => setOut(text) };
}

function AgeGateDialog({
  open,
  onOpenChange,
  consent,
  setConsent,
  onConfirm,
  isAuthed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  onConfirm: () => void;
  isAuthed: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ShieldAlert className="h-5 w-5 text-amber-400" /> 성인 인증이 필요해요
          </DialogTitle>
          <DialogDescription>
            이 스토리는 19세 이상 이용가 콘텐츠를 포함합니다. 본인의 책임 하에
            아래 항목에 동의해 주세요.
          </DialogDescription>
        </DialogHeader>
        {!isAuthed ? (
          <p className="text-sm text-muted-foreground">
            성인 인증을 진행하려면 먼저{" "}
            <Link to="/auth" className="text-primary underline">
              로그인
            </Link>
            해 주세요.
          </p>
        ) : (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span>
              저는 만 19세 이상이며, 본 콘텐츠가 성적/폭력적 묘사를 포함할 수
              있음을 이해합니다. 허위 신고 시 모든 책임은 본인에게 있습니다.
            </span>
          </label>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={!isAuthed || !consent}
            onClick={onConfirm}
            className="bg-gradient-aurora text-primary-foreground shadow-glow"
          >
            <ShieldCheck className="mr-1.5 h-4 w-4" /> 인증하고 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Play() {
  const { story, character, beats } = Route.useLoaderData();
  const { user, loading: authLoading } = useAuth();
  const isAuthed = !!user;

  // Server fns
  const fnGetProfile = useServerFn(getMyProfile);
  const fnVerifyAge = useServerFn(verifyAge);
  const fnGetOrCreate = useServerFn(getOrCreateSession);
  const fnUpdate = useServerFn(updateSessionState);
  const fnRecordChoice = useServerFn(recordChoice);
  const fnAppendMsg = useServerFn(appendStoryMessage);
  const fnSaveEnding = useServerFn(saveEnding);
  const fnBookmark = useServerFn(toggleBookmark);

  type Stage = "title" | "prologue" | "play";
  const [stage, setStage] = useState<Stage>("title");
  const [chatMode, setChatMode] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [ageConsent, setAgeConsent] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [hideUi, setHideUi] = useState(false);

  // Content-type derived UX mode: 19+ hard → cinematic video; else → novel/text
  const contentMode: "cinematic" | "novel" = story.heat >= 3 ? "cinematic" : "novel";

  // --- Visual Novel state ---
  const [beatId, setBeatId] = useState<string>("start");
  const [visited, setVisited] = useState<Set<string>>(new Set(["start"]));
  // Ordered timeline of beats the reader has walked through (scroll feed).
  const [timeline, setTimeline] = useState<string[]>(["start"]);
  const [affection, setAffection] = useState(40);
  const beat = beats[beatId] ?? beats.start;
  const emotion: Emotion = beat.emotion;

  const fullLine = beat.text + (beat.narration ? `\n${beat.narration}` : "");
  const { out: typed, done: typedDone, finish } = useTypewriter(fullLine);
  // Ref for auto-scrolling to the latest beat in the scroll-feed reader.
  const feedEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    id: `play-${story.id}`,
    transport: chatTransport,
  });
  const [draft, setDraft] = useState("");
  const [chatEmotion, setChatEmotion] = useState<Emotion>("shy");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === "submitted" || status === "streaming";
  const lastPersistedMsgIdRef = useRef<string | null>(null);
  const endingSavedRef = useRef<Set<string>>(new Set());
  const lastTierRef = useRef<string | null>(null);

  // Per-beat editable requireAffection overrides (creator tool).
  const thresholds = useChoiceThresholds(story.id);

  // Ref to scroll the inline chat panel into view when user clicks
  // "대화로 친밀도 올리기" on the AffectionMeter.
  const chatPanelRef = useRef<HTMLDetailsElement>(null);
  const openInlineChat = () => {
    const el = chatPanelRef.current;
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setChatMode(true);
    }
  };

  // --- Profile + unlock state (for premium-tier media gating) ---
  const fnListUnlocks = useServerFn(listMyUnlocks);
  const fnUnlock = useServerFn(unlockBeatMedia);
  const [credits, setCredits] = useState<number>(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [unlockedBeats, setUnlockedBeats] = useState<Set<string>>(new Set());
  const [unlockingBeat, setUnlockingBeat] = useState<string | null>(null);

  async function refreshProfile() {
    try {
      const p: any = await fnGetProfile();
      if (!p) return;
      setAgeVerified(!!p.age_verified);
      setCredits(p.credits ?? 0);
      const subActive =
        !!p.is_subscribed &&
        (!p.subscription_expires_at ||
          new Date(p.subscription_expires_at).getTime() > Date.now());
      setIsSubscribed(subActive);
    } catch {
      /* ignore */
    }
  }

  // --- Load profile (age verification + credits + subscription) ---
  useEffect(() => {
    if (!isAuthed) {
      setAgeVerified(false);
      return;
    }
    void refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  // --- Load existing media unlocks for this story ---
  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    fnListUnlocks({ data: { storyId: story.id } })
      .then((rows: any[]) => {
        if (cancelled) return;
        setUnlockedBeats(new Set((rows ?? []).map((r) => r.beat_id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthed, story.id, fnListUnlocks]);

  async function handleUnlock(beatId: string, tier: HeatTier) {
    if (!isAuthed) {
      toast.info("로그인 후 잠금 해제할 수 있어요.");
      return;
    }
    setUnlockingBeat(beatId);
    try {
      const res: any = await fnUnlock({
        data: { storyId: story.id, beatId, heatTier: tier.key },
      });
      setUnlockedBeats((s) => new Set(s).add(beatId));
      if (res?.creditsSpent) {
        setCredits((c) => Math.max(0, c - res.creditsSpent));
        toast.success(`${tier.label} 해금 완료 · -${res.creditsSpent} 크레딧`);
      } else if (res?.unlockedVia === "subscription") {
        toast.success(`${tier.label} 해금 (구독자 무료)`);
      } else {
        toast.success(`${tier.label} 해금 완료`);
      }
    } catch (e: any) {
      if (e?.message === "INSUFFICIENT_CREDITS") {
        toast.error("크레딧이 부족해요. 충전 후 다시 시도해주세요.");
      } else {
        toast.error(e?.message ?? "잠금 해제 실패");
      }
    } finally {
      setUnlockingBeat(null);
    }
  }

  // --- Bootstrap / restore session when signed in ---
  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    fnGetOrCreate({
      data: {
        storyId: story.id,
        characterId: character.id,
        mode: "vn",
      },
    })
      .then((row: any) => {
        if (cancelled || !row) return;
        setSessionId(row.id);
        setBookmarked(!!row.is_bookmarked);
        if (row.current_node && beats[row.current_node]) {
          setBeatId(row.current_node);
          setVisited((s) => new Set(s).add(row.current_node));
          setTimeline((tl) => (tl[tl.length - 1] === row.current_node ? tl : [...tl, row.current_node]));
        }
        if (typeof row.affection === "number") setAffection(row.affection);
        if (row.mode === "chat") setChatMode(true);
      })
      .catch((e) => {
        console.warn("session bootstrap failed", e);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthed, story.id, character.id, beats, fnGetOrCreate]);

  // --- Persist chat messages as they finish streaming ---
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === "assistant") {
      const text = last.parts
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("");
      if (text) {
        const emo = detectEmotion(text);
        setChatEmotion(emo);
        if (
          !isStreaming &&
          last.id !== lastPersistedMsgIdRef.current
        ) {
          lastPersistedMsgIdRef.current = last.id;
          // Chat affects the story: shift affection based on detected emotion.
          const delta = emotionToAffection(emo);
          if (delta !== 0) {
            setAffection((prev) => {
              const next = Math.max(0, Math.min(100, prev + delta));
              if (sessionId) {
                void fnUpdate({ data: { sessionId, affection: next } }).catch(() => {});
              }
              return next;
            });
            toast(
              `${character.name}와의 대화로 호감도 ${delta > 0 ? "+" : ""}${delta}`,
              { duration: 2200 },
            );
          }
          if (sessionId) {
            fnAppendMsg({
              data: { sessionId, role: "assistant", content: text, emotion: emo },
            }).catch(() => {});
          }
        }
      }
    }
  }, [messages, isStreaming, sessionId, fnAppendMsg, fnUpdate, character.name]);

  // --- Heat tier change → celebratory toast (preview unlocked content) ---
  useEffect(() => {
    const t = tierFor(affection);
    if (lastTierRef.current === null) {
      lastTierRef.current = t.key;
      return;
    }
    if (lastTierRef.current !== t.key) {
      lastTierRef.current = t.key;
      toast(`${t.badge}  ${t.label} 단계 도달!`, {
        description: `🔓 ${t.preview}`,
        duration: 3600,
      });
    }
  }, [affection]);

  const activeEmotion: Emotion = chatMode ? chatEmotion : emotion;
  const tintClass = useMemo(() => emotionTint[activeEmotion], [activeEmotion]);
  const totalBeats = Object.keys(beats).length;
  const progress = Math.min(100, Math.round((visited.size / totalBeats) * 100));

  // Persist mode toggle
  useEffect(() => {
    if (!sessionId) return;
    fnUpdate({ data: { sessionId, mode: chatMode ? "chat" : "vn" } }).catch(
      () => {},
    );
  }, [chatMode, sessionId, fnUpdate]);

  // Auto-save ending when reaching an end beat
  useEffect(() => {
    if (!beat.end || !sessionId) return;
    if (endingSavedRef.current.has(beat.id)) return;
    endingSavedRef.current.add(beat.id);
    void fnUpdate({
      data: { sessionId, isCompleted: true, endingId: beat.id },
    }).catch(() => {});
    void fnSaveEnding({
      data: {
        sessionId,
        storyId: story.id,
        endingId: beat.id,
        endingTitle: beat.text.slice(0, 60),
        endingKind: beat.emotion,
      },
    }).catch(() => {});
  }, [beat, sessionId, story.id, fnUpdate, fnSaveEnding]);

  function choose(c: StoryChoice) {
    let nextAffection = affection;
    if (typeof c.affection === "number") {
      nextAffection = Math.max(0, Math.min(100, affection + c.affection * 5));
      setAffection(nextAffection);
    }
    setBeatId(c.next);
    setVisited((s) => new Set(s).add(c.next));
    setTimeline((tl) => [...tl, c.next]);
    // After the React commit, scroll the new beat into view.
    window.requestAnimationFrame(() =>
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50),
    );
    if (sessionId) {
      void fnRecordChoice({
        data: {
          sessionId,
          nodeId: beatId,
          choiceId: c.next,
          choiceLabel: c.label,
          affectionDelta: c.affection ?? 0,
        },
      }).catch(() => {});
      void fnUpdate({
        data: {
          sessionId,
          currentNode: c.next,
          affection: nextAffection,
        },
      }).catch(() => {});
    }
  }

  function reset() {
    setBeatId("start");
    setVisited(new Set(["start"]));
    setTimeline(["start"]);
    setAffection(40);
    endingSavedRef.current.clear();
    if (sessionId) {
      void fnUpdate({
        data: {
          sessionId,
          currentNode: "start",
          affection: 40,
          isCompleted: false,
          endingId: null,
        },
      }).catch(() => {});
    }
  }

  function send() {
    const t = draft.trim();
    if (!t || isStreaming) return;
    void sendMessage(
      { text: t },
      {
        body: {
          character: {
            name: character.name,
            age: character.age,
            intro: character.intro,
            scenario: character.scenario,
            tags: character.tags,
          },
          story: {
            title: story.title,
            synopsis: story.synopsis,
            heat: story.heat,
          },
          stats: { affection, arousal: 0, trust: 0 },
        },
      },
    );
    if (sessionId) {
      void fnAppendMsg({
        data: { sessionId, role: "user", content: t },
      }).catch(() => {});
    }
    setDraft("");
  }

  function handleStart() {
    if (story.mature && isAuthed && ageVerified === false) {
      setAgeGateOpen(true);
      return;
    }
    if (story.mature && !isAuthed) {
      toast.info("19+ 스토리는 로그인 후 성인 인증이 필요합니다.");
    }
    setStage("prologue");
  }

  function enterPlay(asChat = false) {
    setStage("play");
    if (asChat) setChatMode(true);
  }

  async function handleAgeConfirm() {
    if (!ageConsent) return;
    try {
      await fnVerifyAge({ data: { confirm: true } });
      setAgeVerified(true);
      setAgeGateOpen(false);
      toast.success("성인 인증이 완료되었어요.");
      setStage("prologue");
    } catch (e: any) {
      toast.error(e?.message ?? "인증에 실패했어요.");
    }
  }

  async function handleBookmark() {
    if (!sessionId) {
      toast.info("북마크하려면 로그인해주세요.");
      return;
    }
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await fnBookmark({ data: { sessionId, bookmarked: next } });
    } catch {
      setBookmarked(!next);
    }
  }



  // --- Title Card ---
  if (stage === "title") {
    return (
      <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={story.cover}
            alt={story.title}
            className="h-full w-full object-cover animate-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/40" />
        </div>

        <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col justify-end px-6 pb-16 md:px-10">
          <Link
            to="/"
            className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs backdrop-blur-md transition hover:border-primary/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 스토리 목록
          </Link>

          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <Flame className="h-3.5 w-3.5" />
            오늘 밤의 스토리
          </div>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-6xl">
            {story.title}
          </h1>
          <p className="mt-2 text-base text-muted-foreground md:text-lg">
            {story.tagline}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {story.mature && (
              <Badge className="border-0 bg-rose-600/90 text-[10px] font-bold text-white">
                19+
              </Badge>
            )}
            <span className="inline-flex items-center gap-1">
              {Array.from({ length: story.heat }).map((_, i) => (
                <Flame key={i} className="h-3 w-3 text-rose-500" />
              ))}
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-400" />
              {story.rating}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {story.length}
            </span>
            <span>· 출연 {character.name}</span>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
              {contentMode === "cinematic" ? "Cinematic 19+" : "Text Novel"}
            </span>
          </div>

          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-foreground/90 md:text-base">
            {story.synopsis}
          </p>

          {!isAuthed && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
              <ShieldAlert className="h-3 w-3" />
              로그인 시 진행 상황과 엔딩이 저장됩니다.
              <Link to="/auth" className="underline">
                로그인
              </Link>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={handleStart}
              disabled={authLoading}
              className="shadow-glow"
            >
              <PlayIcon className="mr-2 h-4 w-4" />
              스토리 시작하기
            </Button>
          </div>
        </div>

        <AgeGateDialog
          open={ageGateOpen}
          onOpenChange={setAgeGateOpen}
          consent={ageConsent}
          setConsent={setAgeConsent}
          onConfirm={handleAgeConfirm}
          isAuthed={isAuthed}
        />
      </div>
    );
  }

  // --- Prologue: chapter select + character greeting ---
  if (stage === "prologue") {
    const chapters = getStoryChapters(story.id);
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-background">
        {/* Backdrop */}
        <div className="absolute inset-0">
          <img
            src={character.portrait}
            alt=""
            className="h-full w-full object-cover animate-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/60" />
        </div>

        {/* Close */}
        <button
          onClick={() => setStage("title")}
          className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/60 backdrop-blur-md transition hover:border-primary/40"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative z-10 mx-auto grid h-full max-w-5xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[1fr_1fr] md:items-center md:py-16">
          {/* Greeting */}
          <div className="flex flex-col justify-center">
            <div className="text-[11px] uppercase tracking-[0.3em] text-primary">
              Prologue · 등장인물 인사
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold md:text-5xl">
              {character.name}
            </h2>
            <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {character.scenario}
            </div>
            <div className="glass-panel mt-5 max-w-md rounded-2xl p-5 shadow-elevated">
              <p className="whitespace-pre-line text-base leading-relaxed md:text-lg">
                “{character.intro}”
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {character.tags?.slice(0, 4).map((t: string) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="border-0 bg-background/60 text-[10px]"
                  >
                    #{t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Chapter picker */}
          <div className="flex flex-col justify-center">
            <div className="text-[11px] uppercase tracking-[0.3em] text-primary">
              챕터 선택
            </div>
            <h3 className="mt-2 font-display text-2xl md:text-3xl">
              어디서부터 시작할까요?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {story.synopsis}
            </p>
            <div className="mt-5 space-y-2">
              {chapters.map((c) => (
                <button
                  key={c.id}
                  disabled={c.locked}
                  onClick={() => {
                    setBeatId(c.beat);
                    setVisited(new Set([c.beat]));
                    setTimeline([c.beat]);
                    enterPlay(false);
                  }}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-background/50 p-4 text-left backdrop-blur-md transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-background/70 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:bg-background/50 disabled:hover:shadow-none"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                    {c.locked ? <Lock className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.subtitle ?? (c.locked ? "이전 챕터 완료 시 해금" : "예상 15~25분 · 분기 ×3")}
                    </div>
                  </div>
                  {!c.locked && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => enterPlay(false)}
                className="shadow-glow"
              >
                <PlayIcon className="mr-2 h-4 w-4" /> 처음부터 몰입 시작
              </Button>
              <Button
                variant="outline"
                onClick={() => enterPlay(true)}
                className="border-border bg-background/40 backdrop-blur"
              >
                <MessagesSquare className="mr-2 h-4 w-4" /> 자유 채팅으로
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }



  const shellClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background"
    : "relative h-[calc(100vh-3.5rem)] w-full";

  // Build the ordered list of beats to render in the scroll feed.
  const feedBeats = timeline
    .map((id) => beats[id])
    .filter((b): b is NonNullable<typeof b> => !!b);
  const currentBeat = feedBeats[feedBeats.length - 1] ?? beat;
  const isAtEnding = !!currentBeat?.end;

  return (
    <div
      className={shellClass}
      onMouseMove={() => hideUi && setHideUi(false)}
    >
      {/* Ambient backdrop — soft, blurred; the reader is text-first */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <BeatBackdrop
          key={`${currentBeat.id}-${activeEmotion}`}
          storyId={story.id}
          beatId={currentBeat.id}
          clipKey={currentBeat.clip}
          emotion={activeEmotion}
          fallbackImage={character.portrait}
          alt={character.name}
          tintClass={tintClass}
        />
        <div className="absolute inset-0 bg-background/85 backdrop-blur-xl" />
      </div>

      {/* Top bar (fixed, fades with hideUi) */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-opacity duration-300 ${hideUi ? "opacity-0" : "opacity-100"}`}
      >
        <div className="pointer-events-auto mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-4 py-3 md:px-8 xl:px-10">
          <button
            onClick={() => setStage("prologue")}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs backdrop-blur-md transition hover:border-primary/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 챕터
          </button>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex">
            <div className="inline-flex min-w-0 max-w-[40vw] items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs backdrop-blur-md">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">{story.title}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>{emotionLabel[activeEmotion]}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] backdrop-blur-md md:flex" title={`${tierFor(affection).label} · ${nextTier(affection) ? `다음: ${nextTier(affection)!.label} (+${nextTier(affection)!.min - affection}♥)` : "최고 단계"}`}>
              <span className="text-sm">{tierFor(affection).badge.split(" ")[0]}</span>
              <span className="text-muted-foreground">{tierFor(affection).label}</span>
              <Progress value={affection} className="h-1 w-16" />
              <span className="tabular-nums text-muted-foreground">{affection}</span>
            </div>
            {isAuthed && (
              <div
                className="hidden items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] backdrop-blur-md md:flex"
                title={isSubscribed ? "구독자: 모든 Premium 미디어 무료" : "Premium(Spicy/Steamy) 미디어 해금에 사용됩니다"}
              >
                {isSubscribed ? (
                  <span className="inline-flex items-center gap-1 text-rose-300">
                    <Sparkles className="h-3 w-3" /> 구독
                  </span>
                ) : (
                  <>
                    <span className="text-amber-300">◆</span>
                    <span className="tabular-nums">{credits}</span>
                    <span className="text-muted-foreground">크레딧</span>
                  </>
                )}
              </div>
            )}
            <ThresholdEditor
              storyId={story.id}
              beats={beats}
              getThreshold={thresholds.get}
              setThreshold={thresholds.set}
              resetAll={thresholds.reset}
            />
            {isAuthed && (
              <button
                onClick={handleBookmark}
                title="북마크"
                className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background/70 backdrop-blur-md transition hover:border-primary/40"
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${bookmarked ? "fill-primary text-primary" : "text-muted-foreground"}`}
                />
              </button>
            )}
            <button
              onClick={() => setIsFullscreen((v) => !v)}
              title={isFullscreen ? "축소" : "전체화면"}
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background/70 backdrop-blur-md transition hover:border-primary/40"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs backdrop-blur-md">
              {chatMode ? (
                <MessagesSquare className="h-3.5 w-3.5 text-primary" />
              ) : (
                <BookOpen className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="hidden sm:inline">{chatMode ? "채팅" : "리더"}</span>
              <Switch checked={chatMode} onCheckedChange={setChatMode} />
            </div>
          </div>
        </div>
        {/* Chapter progress hairline */}
        {!chatMode && (
          <div className="pointer-events-auto mx-auto max-w-screen-2xl px-4 pb-2 md:px-8 xl:px-10">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              <span className="text-primary">Chapter 1</span>
              <Progress value={progress} className="h-1 flex-1" />
              <span className="tabular-nums">{progress}%</span>
            </div>
          </div>
        )}
      </div>

      {chatMode ? (
        // ── Chat mode: free-form conversation with the character ───────────
        <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col px-4 pt-20 pb-4 md:px-8 xl:px-10">
          <div className="glass-panel flex min-h-0 flex-1 flex-col rounded-2xl p-3 shadow-elevated">
            <div ref={scrollRef} className="mb-3 flex-1 space-y-3 overflow-y-auto px-2 py-2">
              {messages.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-background/30 p-4 text-center text-xs text-muted-foreground">
                  «{story.title}» 의 세계관 안에서 {character.name}와(과) 직접 대화해 보세요. 메시지에 따라 표정이 바뀝니다.
                </div>
              )}
              {messages.map((m, i) => {
                const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                if (m.role === "assistant") {
                  const isLast = i === messages.length - 1;
                  const emo = isLast ? chatEmotion : detectEmotion(text);
                  return (
                    <div key={m.id} className="flex items-start gap-2 animate-fade-in">
                      <img src={character.portrait} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{character.name}</span>
                          <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-primary">
                            {emotionLabel[emo]}
                          </span>
                        </div>
                        <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&_p]:my-1">
                          <ReactMarkdown>{text || "…"}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end animate-fade-in">
                      <div className="max-w-[75%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {text}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {character.name}이(가) 응답 중…
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 border-t border-border pt-2">
              <button className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:text-primary">
                <Mic className="h-4 w-4" />
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={`${character.name}에게 메시지…`}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button
                size="icon"
                onClick={send}
                disabled={isStreaming || !draft.trim()}
                className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // ── Reader mode: full-screen vertical scroll feed of beats ────────
        <div className="relative z-10 h-full overflow-y-auto">
          <article className="mx-auto w-full max-w-screen-xl px-5 pt-24 pb-32 md:px-8 xl:px-10">
            {/* Header */}
            <header className="mb-10 border-b border-border/60 pb-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                {story.mature ? "19+ · " : ""}Chapter 1
              </div>
              <h1 className="mt-2 font-display text-3xl font-semibold leading-tight md:text-4xl">
                {story.title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {story.tagline}
              </p>
            </header>

            {/* Beat feed */}
            <div className="space-y-12 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-10 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_440px]">
              {feedBeats.map((b, idx) => {
                const isCurrent = idx === feedBeats.length - 1;
                const paragraphs = (b.text + (b.narration ? `\n${b.narration}` : ""))
                  .split("\n")
                  .filter(Boolean);
                return (
                  <section key={`${b.id}-${idx}`} className="animate-fade-in lg:col-start-1 lg:mb-12">
                    {/* Speaker chip */}
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-primary">
                      <img
                        src={character.portrait}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover ring-1 ring-primary/30"
                      />
                      <span>{b.speaker ?? character.name}</span>
                      <span className="rounded-full border border-border bg-background/60 px-1.5 py-px text-[9px] tracking-wider text-muted-foreground">
                        {emotionLabel[b.emotion as Emotion]}
                      </span>
                    </div>

                    {/* Dialogue (first paragraph = spoken line, gets quote treatment) */}
                    {paragraphs[0] && (
                      <p className="font-display text-xl leading-relaxed text-foreground md:text-2xl">
                        <span className="text-primary/70">“</span>
                        {paragraphs[0]}
                        <span className="text-primary/70">”</span>
                      </p>
                    )}

                    {/* Inline media — image + (placeholder) clip slot */}
                    <div className="lg:hidden">
                      <InlineBeatMedia
                        storyId={story.id}
                        beatId={b.id}
                        clipKey={b.clip}
                        emotion={b.emotion}
                        alt={b.speaker ?? character.name}
                        affection={affection}
                        locked={!unlockedBeats.has(b.id)}
                        unlocking={unlockingBeat === b.id}
                        hasSubscription={isSubscribed}
                        userCredits={credits}
                        onUnlock={() => handleUnlock(b.id, tierFor(affection))}
                        onPreviewUpgrade={() => {
                          toast.info(
                            "크레딧 충전 또는 구독 가입 페이지로 이동합니다 (준비 중)",
                            { duration: 2400 },
                          );
                        }}
                      />
                    </div>
                    {isCurrent && (
                      <aside className="mt-6 hidden lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:row-end-[span_6] lg:block lg:self-start">
                        <InlineBeatMedia
                          storyId={story.id}
                          beatId={b.id}
                          clipKey={b.clip}
                          emotion={b.emotion}
                          alt={b.speaker ?? character.name}
                          affection={affection}
                          locked={!unlockedBeats.has(b.id)}
                          unlocking={unlockingBeat === b.id}
                          hasSubscription={isSubscribed}
                          userCredits={credits}
                          onUnlock={() => handleUnlock(b.id, tierFor(affection))}
                          onPreviewUpgrade={() => {
                            toast.info(
                              "크레딧 충전 또는 구독 가입 페이지로 이동합니다 (준비 중)",
                              { duration: 2400 },
                            );
                          }}
                        />
                      </aside>
                    )}

                    {/* Narration paragraphs */}
                    {paragraphs.slice(1).map((p, i) => (
                      <p
                        key={i}
                        className="mt-4 text-[15px] leading-[1.9] text-foreground/85 md:text-base"
                      >
                        {p}
                      </p>
                    ))}

                    {/* Inline choices — only on the latest non-ending beat */}
                    {isCurrent && !b.end && (b.choices ?? []).length > 0 && (
                      <div className="mt-8 space-y-3 border-l-2 border-primary/40 pl-4">
                        {/* Heat meter — visible incentive to keep climbing */}
                        <AffectionMeter affection={affection} onOpenChat={openInlineChat} />

                        <div className="text-[10px] uppercase tracking-[0.3em] text-primary/80">
                          ▸ 당신의 선택
                        </div>
                        {(b.choices ?? []).map((c: StoryChoice, i: number) => {
                          const need = thresholds.get(b.id, i, c.requireAffection ?? 0);
                          const locked = affection < need;
                          const recommended =
                            !locked &&
                            !!c.emotion &&
                            messages.length > 0 &&
                            c.emotion === chatEmotion;
                          // Project the affection that would result from picking
                          // this choice, then derive the next beat's heat tier
                          // so the user can predict media intensity in advance.
                          const projected = Math.max(
                            0,
                            Math.min(100, affection + (c.affection ?? 0) * 5),
                          );
                          const nextTierForChoice = tierFor(projected);
                          const nextCost = TIER_COST[nextTierForChoice.key] ?? 0;
                          const nextBeatId = c.next;
                          const nextAlreadyUnlocked = unlockedBeats.has(nextBeatId);
                          return (
                            <button
                              key={`${b.id}-${i}`}
                              onClick={() => !locked && choose(c)}
                              disabled={locked}
                              className={`group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left backdrop-blur-md transition ${locked ? "cursor-not-allowed border-dashed border-primary/20 bg-card/30 opacity-70" : recommended ? "border-primary/60 bg-primary/10 shadow-glow hover:-translate-y-0.5" : "border-border bg-card/60 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card/90 hover:shadow-glow"}`}
                            >
                              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${locked ? "border-primary/20 bg-primary/5 text-primary/40" : "border-primary/30 bg-primary/10 text-primary"}`}>
                                {locked ? <Lock className="h-3 w-3" /> : i + 1}
                              </span>
                              <span className="flex-1 text-[15px] leading-relaxed">
                                <span className={locked ? "text-muted-foreground/70 blur-[2px] select-none" : "text-foreground"}>
                                  {c.label}
                                </span>
                                {recommended && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/20 px-1.5 py-0.5 align-middle text-[10px] font-medium text-primary">
                                    <Sparkles className="h-2.5 w-2.5" /> 지금 분위기에 맞아요
                                  </span>
                                )}
                                {locked && (
                                  <span className="mt-1 block text-[11px] text-primary/70">
                                    🔒 호감도 {need}+ 필요 · {c.lockedHint ?? "주인공과 더 대화해 보세요"}
                                  </span>
                                )}
                                {!locked && (
                                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${nextTierForChoice.gradient} px-1.5 py-0.5 ring-1 ${nextTierForChoice.ring}`}
                                      title={nextTierForChoice.preview}
                                    >
                                      <Flame className="h-2.5 w-2.5" />
                                      다음 장면: {nextTierForChoice.label}
                                    </span>
                                    {nextCost > 0 && !nextAlreadyUnlocked && (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
                                        <Lock className="h-2.5 w-2.5" />
                                        {isSubscribed ? "구독자 무료" : `${nextCost} 크레딧`}
                                      </span>
                                    )}
                                    {nextCost > 0 && nextAlreadyUnlocked && (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                                        ✓ 해금됨
                                      </span>
                                    )}
                                  </span>
                                )}
                              </span>
                              {!locked && typeof c.affection === "number" && c.affection !== 0 && (
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${c.affection > 0 ? "bg-rose-500/15 text-rose-300" : "bg-muted text-muted-foreground"}`}
                                >
                                  {c.affection > 0 ? `+${c.affection}` : c.affection}♥
                                </span>
                              )}
                            </button>
                          );
                        })}

                        {/* Inline chat — talk with the character inside the story */}
                        <details ref={chatPanelRef} className="mt-4 rounded-xl border border-border bg-card/40 backdrop-blur-md open:bg-card/60">

                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm">
                            <span className="inline-flex items-center gap-2">
                              <MessagesSquare className="h-4 w-4 text-primary" />
                              <span className="font-medium">{character.name}와 대화하기</span>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                대화가 호감도에 반영돼요
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition group-open:rotate-90" />
                          </summary>
                          <div className="border-t border-border/60 p-3">
                            <div className="mb-3 max-h-64 space-y-3 overflow-y-auto px-1">
                              {messages.length === 0 && (
                                <div className="rounded-lg border border-dashed border-border bg-background/30 p-3 text-center text-xs text-muted-foreground">
                                  지금 장면에 대해 {character.name}에게 물어보거나, 마음을 전해보세요.
                                </div>
                              )}
                              {messages.map((m, mi) => {
                                const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                                if (m.role === "assistant") {
                                  const isLast = mi === messages.length - 1;
                                  const emo = isLast ? chatEmotion : detectEmotion(text);
                                  return (
                                    <div key={m.id} className="flex items-start gap-2 animate-fade-in">
                                      <img src={character.portrait} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                          <span>{character.name}</span>
                                          <span className="rounded-full border border-border px-1.5 py-px text-[9px] text-primary">
                                            {emotionLabel[emo]}
                                          </span>
                                        </div>
                                        <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&_p]:my-1">
                                          <ReactMarkdown>{text || "…"}</ReactMarkdown>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                if (m.role === "user") {
                                  return (
                                    <div key={m.id} className="flex justify-end animate-fade-in">
                                      <div className="max-w-[80%] rounded-2xl bg-primary px-3 py-1.5 text-[13px] text-primary-foreground">
                                        {text}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {character.name}이(가) 응답 중…
                                </div>
                              )}
                            </div>
                            <div className="flex items-end gap-2 border-t border-border pt-2">
                              <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    send();
                                  }
                                }}
                                rows={1}
                                placeholder={`${character.name}에게…`}
                                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground"
                              />
                              <Button
                                size="icon"
                                onClick={send}
                                disabled={isStreaming || !draft.trim()}
                                className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40"
                              >
                                {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        </details>
                      </div>
                    )}

                    {/* Ending card */}
                    {isCurrent && b.end && (
                      <div className="mt-8 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-card/40 p-6 text-center shadow-elevated">
                        <div className="text-[10px] uppercase tracking-[0.4em] text-primary">
                          Ending Reached
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          호감도 <span className="font-semibold text-foreground">{affection}</span> / 100
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <Button onClick={reset} variant="outline" className="rounded-full">
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 다시 시작
                          </Button>
                          <Button
                            onClick={() => setChatMode(true)}
                            className="rounded-full bg-gradient-aurora text-primary-foreground shadow-glow"
                          >
                            <MessagesSquare className="mr-1.5 h-3.5 w-3.5" /> {character.name}와 채팅
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {/* Scroll anchor — used after choosing a branch */}
            <div ref={feedEndRef} className="h-1" />

            {/* Subtle bottom hint */}
            {!isAtEnding && (
              <div className="mt-16 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
                ⌄ 계속 읽으려면 선택지를 골라주세요
              </div>
            )}
          </article>
        </div>
      )}

      {/* Reading-mode helpers */}
      {hideUi && (
        <button
          onClick={() => setHideUi(false)}
          className="fixed right-3 top-3 z-40 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/70 backdrop-blur-md"
          title="UI 표시"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}
      {/* Suppress unused-var warnings for legacy helpers retained for compat */}
      <span className="hidden">{typed.length > 0 ? "" : ""}{typedDone ? "" : ""}{finish.name}</span>
    </div>
  );
}

