import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  Lock,
  MessagesSquare,
  Play,
  ShieldAlert,
  Star,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import {
  getUnifiedReaderStory,
  type AssetSlot,
  type ChapterConfig,
} from "@/lib/admin-stories-compose.functions";
import { UnifiedStoryReader, type CharacterChatProfile } from "@/components/unified-story-reader";
import { BeatReader, type ReaderBeat } from "@/components/beat-reader";

export const Route = createFileRoute("/_authenticated/play/user/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    character: typeof search.character === "string" ? search.character : null,
    chat: search.chat === true || search.chat === "true",
  }),
  head: () => ({ meta: [{ title: "스토리 플레이 - Lovetale" }] }),
  component: UserStoryPlay,
});

type ReaderStage = "title" | "chapters" | "reader";

type ReaderChapter = {
  id: string;
  title: string;
  episodeNumber: number;
  summary: string;
  body: string;
  assetSlots: AssetSlot[];
  isFree: boolean;
  priceCredits: number;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeChapters(data: any): ReaderChapter[] {
  const card = data?.character_card ?? {};
  const raw = Array.isArray(card.chapters) ? (card.chapters as ChapterConfig[]) : [];
  const chapters = raw
    .map((chapter, index) => {
      const episodeNumber = Number(chapter.episodeNumber ?? index + 1);
      return {
        id: asString(chapter.id, `chapter-${episodeNumber || index + 1}`),
        title: asString(chapter.title, `${episodeNumber || index + 1}화`),
        episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : index + 1,
        summary: asString(chapter.summary),
        body: asString(chapter.body),
        assetSlots: Array.isArray(chapter.assetSlots) ? chapter.assetSlots : [],
        isFree: Boolean(chapter.isFree ?? index === 0),
        priceCredits: Math.max(0, Number(chapter.priceCredits ?? 0)),
      };
    })
    .filter((chapter) => chapter.title || chapter.summary || chapter.body);

  if (chapters.length) return chapters;

  return [
    {
      id: "full-story",
      title: "전체 보기",
      episodeNumber: 1,
      summary: asString(data?.logline, "등록된 본문을 바로 감상합니다."),
      body: asString(data?.body_text),
      assetSlots: Array.isArray(data?.asset_slots) ? data.asset_slots : [],
      isFree: true,
      priceCredits: 0,
    },
  ];
}

function getCharacterName(card: any) {
  if (Array.isArray(card?.characters) && card.characters[0]?.name) {
    return card.characters[0].name as string;
  }
  return asString(card?.name, "캐릭터 미등록");
}

function getCharacterProfiles(card: any): CharacterChatProfile[] {
  const raw = Array.isArray(card?.characters) ? card.characters : [];
  const characters = raw
    .map((character: any, index: number) => ({
      id: asString(character?.id, `character-${index + 1}`),
      name: asString(character?.name || character?.title),
      role: asString(character?.role),
      persona: asString(character?.persona),
      personality: asString(character?.personality),
      speakingStyle: asString(character?.speakingStyle),
      relationship: asString(character?.relationship),
      notes: asString(character?.notes),
      avatarUrl: typeof character?.avatarUrl === "string" ? character.avatarUrl : null,
      showcaseAssets: Array.isArray(character?.showcaseAssets) ? character.showcaseAssets : [],
    }))
    .filter((character) => character.name);

  if (characters.length) return characters;
  const fallbackName = getCharacterName(card);
  if (fallbackName === "캐릭터 미등록") return [];

  return [
    {
      id: "main-character",
      name: fallbackName,
      role: asString(card?.role),
      persona: asString(card?.persona),
      personality: asString(card?.personality),
      speakingStyle: asString(card?.speakingStyle),
      relationship: asString(card?.relationship),
      notes: asString(card?.notes),
      avatarUrl: typeof card?.avatarUrl === "string" ? card.avatarUrl : null,
      showcaseAssets: Array.isArray(card?.showcaseAssets) ? card.showcaseAssets : [],
    },
  ];
}

function getStoryOverview(data: any, card: any) {
  return (
    asString(card?.storyOverview) ||
    asString(card?.scenario) ||
    asString(card?.intro) ||
    asString(data?.logline, "기억의 빛을 따라가며 원하는 지점부터 이야기를 시작해보세요.")
  );
}

function getChapterBody(data: any, chapter: ReaderChapter | undefined) {
  return asString(chapter?.body) || asString(data?.body_text);
}

function getChapterAssets(data: any, chapter: ReaderChapter | undefined) {
  if (chapter?.assetSlots?.length) return chapter.assetSlots;
  return Array.isArray(data?.asset_slots) ? data.asset_slots : [];
}

function compactText(value: string | null | undefined, fallback: string, maxLength = 92) {
  const text = (value || "").replace(/\s+/g, " ").trim() || fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function getPrologueLine(title: string, logline: string | null, overview: string) {
  const base = compactText(logline || overview, `${title}의 첫 장면이 조용히 열립니다.`, 74);
  return `“${base}”`;
}

function getStoryTags(title: string, overview: string) {
  const text = `${title} ${overview}`;
  const tags = ["몰입", "관계", "선택"];
  if (/비밀|계약|숨|거짓|진실/.test(text)) tags.splice(1, 0, "비밀");
  if (/위험|금지|밤|어둠|긴장/.test(text)) tags.splice(1, 0, "긴장감");
  if (/사랑|연애|감정|끌림|로맨/.test(text)) tags.splice(1, 0, "로맨스");
  return Array.from(new Set(tags)).slice(0, 4);
}

function getChapterTeaser(chapter: ReaderChapter, index: number) {
  if (chapter.summary) return compactText(chapter.summary, "", 42);
  const presets = [
    "운명이 움직이기 시작하는 첫 장면",
    "감정의 균열이 드러나는 순간",
    "관계가 깊어지는 결정적 선택",
    "숨겨진 진심에 가까워지는 밤",
  ];
  return presets[index % presets.length];
}

function UserStoryPlay() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const fetchStory = useServerFn(getUnifiedReaderStory);
  const requestedCharacterId = search.character;
  const shouldOpenChat = Boolean(search.chat || requestedCharacterId);
  const [stage, setStage] = useState<ReaderStage>(() => (shouldOpenChat ? "reader" : "title"));
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [openChatOnReader, setOpenChatOnReader] = useState(shouldOpenChat);

  const { data, isLoading, error } = useQuery({
    queryKey: ["user_story_unified", id],
    queryFn: () => fetchStory({ data: { id } }),
  });

  const legacyBeatMap = useMemo<Record<string, ReaderBeat>>(() => {
    const arr = Array.isArray((data as any)?.beats)
      ? ((data as any).beats as ReaderBeat[])
      : [];
    const m: Record<string, ReaderBeat> = {};
    for (const b of arr) m[b.id] = b;
    return m;
  }, [data]);

  const chapters = useMemo(() => normalizeChapters(data), [data]);
  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0];
  const selectedChapterIndex = selectedChapter
    ? chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const nextChapter =
    selectedChapterIndex >= 0 ? chapters[selectedChapterIndex + 1] : undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-20 text-center">
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? "스토리를 찾을 수 없어요."}
        </p>
        <Button asChild variant="outline">
          <Link to="/explore">탐색으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const card = (data.character_card as any) ?? {};
  const characterName = getCharacterName(card);
  const characterProfiles = getCharacterProfiles(card);
  const overview = getStoryOverview(data, card);
  const bodyText = getChapterBody(data, selectedChapter);
  const assetSlots = getChapterAssets(data, selectedChapter);
  const useUnified = bodyText.length > 20 || assetSlots.length > 0;

  function openChapter(chapter: ReaderChapter, options?: { chat?: boolean }) {
    setSelectedChapterId(chapter.id);
    setOpenChatOnReader(options?.chat ?? false);
    setStage("reader");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  if (stage === "title") {
    return (
      <StoryStartScreen
        title={data.title ?? ""}
        cover={data.cover_url}
        logline={data.logline}
        overview={overview}
        characterName={characterName}
        chapterCount={chapters.length}
        maxHeat={data.max_heat}
        onStart={() => setStage("chapters")}
      />
    );
  }

  if (stage === "chapters") {
    return (
      <ChapterSelectScreen
        title={data.title ?? ""}
        cover={data.cover_url}
        logline={data.logline}
        overview={overview}
        characterName={characterName}
        chapters={chapters}
        onBack={() => setStage("title")}
        onOpenChapter={openChapter}
        onStartFromBeginning={() => openChapter(chapters[0])}
        onFreeChat={() => openChapter(chapters[0], { chat: true })}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-[#0f0f0f]">
      <header className="hidden">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-3 px-4">
          <button
            type="button"
            onClick={() => {
              setOpenChatOnReader(false);
              setStage("chapters");
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            회차 선택
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-sm font-semibold">{selectedChapter?.title}</div>
            <div className="truncate text-[11px] text-muted-foreground">{data.title}</div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {selectedChapter?.episodeNumber}화
          </Badge>
        </div>
      </header>

      {useUnified ? (
        <UnifiedStoryReader
          storyId={id}
          title={selectedChapter?.title ? `${data.title} - ${selectedChapter.title}` : data.title}
          cover={data.cover_url}
          bodyText={bodyText}
          assetSlots={assetSlots}
          characterName={characterName}
          characterProfiles={characterProfiles}
          selectedCharacterId={requestedCharacterId}
          initialChatOpen={openChatOnReader}
          nextChapterTitle={nextChapter?.title ?? null}
          onNextChapter={nextChapter ? () => openChapter(nextChapter, { chat: false }) : undefined}
          onBackToChapters={() => {
            setOpenChatOnReader(false);
            setStage("chapters");
          }}
        />
      ) : (
        <main className="mx-auto max-w-5xl px-4 py-4">
          <BeatReader
            beats={legacyBeatMap}
            title={data.title ?? ""}
            cover={data.cover_url ?? undefined}
            storyId={id}
          />
        </main>
      )}
    </div>
  );
}

function StoryStartScreen({
  title,
  cover,
  logline,
  overview,
  characterName,
  chapterCount,
  maxHeat,
  onStart,
}: {
  title: string;
  cover: string | null;
  logline: string | null;
  overview: string;
  characterName: string;
  chapterCount: number;
  maxHeat: string;
  onStart: () => void;
}) {
  const isMature = maxHeat === "spicy" || maxHeat === "steamy";
  const contentMode = isMature ? "Cinematic 19+" : "Text Novel";

  return (
    <main className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0">
        {cover ? (
          <CoverImage
            src={cover}
            alt={title}
            className="h-full w-full object-cover animate-ken-burns"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_25%_20%,rgba(244,63,94,.35),transparent_30%),linear-gradient(135deg,#09090b,#18181b_55%,#33101c)] animate-ken-burns" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/40" />
      </div>

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col justify-end px-6 pb-16 md:px-10">
        <Link
          to="/explore"
          className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs backdrop-blur-md transition hover:border-primary/40"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 스토리 목록
        </Link>

        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
          <Flame className="h-3.5 w-3.5" />
          오늘 밤의 스토리
        </div>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-6xl">
          {title}
        </h1>
        {logline && (
          <p className="mt-2 text-base text-muted-foreground md:text-lg">
            {logline}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {isMature && (
            <Badge className="border-0 bg-rose-600/90 text-[10px] font-bold text-white">
              19+
            </Badge>
          )}
          <span className="inline-flex items-center gap-1">
            {Array.from({ length: isMature ? 3 : 2 }).map((_, i) => (
              <Flame key={i} className="h-3 w-3 text-rose-500" />
            ))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 text-amber-400" />
            추천
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {chapterCount}개 회차
          </span>
          <span>· 출연 {characterName}</span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
            {contentMode}
          </span>
        </div>

        <p className="mt-6 max-w-4xl text-sm leading-relaxed text-foreground/90 md:text-base">
          {overview}
        </p>

        <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
          <ShieldAlert className="h-3 w-3" />
          로그인 시 진행 상황과 호감도가 저장됩니다.
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={onStart} className="shadow-glow">
            <Play className="mr-2 h-4 w-4" />
            스토리 시작하기
          </Button>
        </div>
      </div>
    </main>
  );
}

function ChapterSelectScreen({
  title,
  cover,
  logline,
  overview,
  characterName,
  chapters,
  onBack,
  onOpenChapter,
  onStartFromBeginning,
  onFreeChat,
}: {
  title: string;
  cover: string | null;
  logline: string | null;
  overview: string;
  characterName: string;
  chapters: ReaderChapter[];
  onBack: () => void;
  onOpenChapter: (chapter: ReaderChapter) => void;
  onStartFromBeginning: () => void;
  onFreeChat: () => void;
}) {
  const prologueLine = getPrologueLine(title, logline, overview);
  const introSummary = compactText(
    overview,
    `${characterName}와의 관계가 시작되는 지점부터 천천히 몰입해보세요.`,
    108,
  );
  const tags = getStoryTags(title, overview);

  return (
    <main className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0">
        {cover ? (
          <CoverImage
            src={cover}
            alt={title}
            className="h-full w-full scale-[1.02] object-cover opacity-42 blur-[1px]"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_18%_18%,rgba(244,114,182,.22),transparent_28%),linear-gradient(135deg,#111016,#24151f_48%,#0c0a10)]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,6,11,.96)_0%,rgba(14,10,17,.82)_40%,rgba(8,6,10,.62)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_46%,rgba(244,114,182,.10),transparent_32%)]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl items-center gap-10 px-5 py-8 sm:px-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(560px,1.25fr)] lg:px-14">
        <section className="max-w-none">
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-white/48 transition hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            시작 화면
          </button>

          <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-primary">
            PROLOGUE · 등장인물 인사
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {characterName}
          </h1>
          <p className="mt-3 text-sm tracking-[0.28em] text-white/45">
            {title}
          </p>

          <div className="mt-7 rounded-3xl border border-white/8 bg-zinc-950/46 p-5 shadow-[0_22px_70px_-46px_rgba(0,0,0,.9)] backdrop-blur-xl">
            <p className="text-lg font-semibold leading-8 text-white/90">
              {prologueLine}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/8 px-3 py-1 text-[10px] font-semibold text-white/75"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full max-w-none justify-self-stretch">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
            챕터 선택
          </div>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            어디서부터 시작할까요?
          </h2>
          <p className="mt-3 max-w-none text-sm leading-6 text-white/56">
            {introSummary}
          </p>

          <div className="chapter-choice-scroll mt-6 max-h-[min(44vh,360px)] space-y-3 overflow-y-auto pr-2">
            {chapters.map((chapter, index) => {
              const locked = !chapter.isFree && chapter.priceCredits > 0;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => onOpenChapter(chapter)}
                  className="group flex w-full items-center gap-4 rounded-[1.35rem] border border-white/7 bg-zinc-950/48 px-4 py-4 text-left shadow-[0_18px_45px_-30px_rgba(0,0,0,.9)] backdrop-blur-xl transition hover:border-primary/45 hover:bg-zinc-950/66"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/35 bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    {locked ? (
                      <Lock className="size-4" />
                    ) : index === 0 ? (
                      <Play className="size-4 fill-current" />
                    ) : (
                      <Lock className="size-4 opacity-85" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/88">
                      Ch.{chapter.episodeNumber} - {chapter.title}
                    </span>
                    <span className="mt-1 line-clamp-1 block text-xs text-white/42">
                      {getChapterTeaser(chapter, index)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-white/36 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={onStartFromBeginning}
              className="h-11 rounded-xl bg-primary px-5 text-primary-foreground shadow-glow hover:bg-primary/90"
            >
              <Play className="mr-1 size-4 fill-current" />
              처음부터 몰입 시작
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={onFreeChat}
              className="h-11 rounded-xl border-white/12 bg-black/20 px-5 text-white hover:bg-white/10 hover:text-white"
            >
              <MessagesSquare className="mr-1 size-4" />
              자유 채팅으로
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
