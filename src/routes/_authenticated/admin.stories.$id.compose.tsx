import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Eye,
  Image as ImageIcon,
  Italic,
  Loader2,
  Plus,
  Quote,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Upload,
  UserCircle2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  analyzeStoryProduct,
  getStoryChapterEditor,
  getStoryCompose,
  saveStoryChapterEditor,
  saveStoryProduct,
  suggestAssetSlots,
  type AssetSlot,
  type AssetTier,
  type ChapterEditorData,
  type ChapterConfig,
  type CharacterConfig,
  type ContentType,
  type HeatPreset,
  type StoryEnvironment,
} from "@/lib/admin-stories-compose.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LazyUnifiedStoryReader = lazy(() =>
  import("@/components/unified-story-reader").then((mod) => ({
    default: mod.UnifiedStoryReader,
  })),
);

export const Route = createFileRoute("/_authenticated/admin/stories/$id/compose")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "append_episode" ? "append_episode" : undefined,
    chapterId: typeof search.chapterId === "string" ? search.chapterId : undefined,
    newChapter: search.newChapter === "1" ? "1" : undefined,
  }),
  head: () => ({ meta: [{ title: "콘텐�?만들�???Studio" }] }),
  component: StoryComposeRoute,
});

function StoryComposeRoute() {
  const { id } = Route.useParams();
  const search = Route.useSearch();

  useEffect(() => {
    if (!search.chapterId) return;
    window.location.replace(`/admin/stories/${encodeURIComponent(id)}/chapter/${encodeURIComponent(search.chapterId)}`);
  }, [id, search.chapterId]);

  if (search.chapterId) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        ?�차 ?�집 ?�면?�로 ?�동 중입?�다.
      </main>
    );
  }

  return <StoryProductConsole />;
}

const CONTENT_TYPES: Array<{ key: ContentType; label: string }> = [
  { key: "web_novel", label: "Web Novel" },
  { key: "webtoon", label: "Webtoon" },
  { key: "short_story", label: "Short Story" },
  { key: "romance_sim", label: "Romance Sim" },
  { key: "other", label: "Other" },
];

const HEAT: Array<{ key: AssetTier; label: string; min: number; color: string }> = [
  { key: "soft", label: "Tier 1", min: 0, color: "bg-sky-500" },
  { key: "warm", label: "Tier 2", min: 30, color: "bg-amber-500" },
  { key: "spicy", label: "Tier 3", min: 55, color: "bg-rose-500" },
  { key: "steamy", label: "Tier 4", min: 75, color: "bg-fuchsia-600" },
  { key: "premium", label: "Tier 5", min: 90, color: "bg-violet-600" },
];

const TIERS: AssetTier[] = ["soft", "warm", "spicy", "steamy", "premium"];

const HEAT_LABEL: Record<AssetTier, string> = {
  soft: "Tier 1",
  warm: "Tier 2",
  spicy: "Tier 3",
  steamy: "Tier 4",
  premium: "Tier 5",
};

const HEAT_HINT: Record<AssetTier, string> = {
  soft: "Low intensity",
  warm: "Balanced",
  spicy: "Warm",
  steamy: "Intense",
  premium: "Premium",
};

const newId = (prefix: string) => prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

function defaultChapter(index = 0): ChapterConfig {
  return {
    id: newId("ch"),
    title: "Episode " + (index + 1),
    episodeNumber: index + 1,
    isFree: index === 0,
    priceCredits: 0,
    summary: "",
    body: "",
    assetSlots: [],
  };
}

function defaultCharacter(): CharacterConfig {
  return {
    id: newId("char"),
    name: "Main Character",
    role: "Main Character",
    persona: "",
    visualPrompt: "",
    speakingStyle: "",
    avatarUrl: null,
  };
}

type PendingSourceDraft = {
  title?: string;
  contentType?: ContentType;
  sourceText?: string;
};

function chapterTitleFor(index: number, contentType: ContentType, text: string) {
  if (contentType === "short_story") return "Short Story";
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  const normalized = firstLine?.trim() ?? "";
  if (/^(?:\d+\s*[.:)]\s*)?(?:chapter|episode)\s+\d+/i.test(normalized)) {
    return normalized.slice(0, 40);
  }
  return "Episode " + (index + 1);
}

function splitSourceIntoChapters(sourceText: string, contentType: ContentType): ChapterConfig[] {
  const normalized = sourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [defaultChapter(0)];
  if (contentType === "short_story") {
    return [{ ...defaultChapter(0), title: "Short Story", body: normalized }];
  }

  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of normalized.split("\n")) {
    const isHeading = /^(?:\d+\s*[.:)]\s*)?(?:chapter|episode)\s+\d+/i.test(line.trim());
    if (isHeading && current.some((item) => item.trim())) {
      chunks.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((item) => item.trim())) chunks.push(current.join("\n").trim());

  const sourceChunks = chunks.length > 1 ? chunks : [normalized];
  return sourceChunks.map((chunk, index) => ({
    ...defaultChapter(index),
    title: chapterTitleFor(index, contentType, chunk),
    body: chunk,
    assetSlots: [],
  }));
}

function splitChapterBodyIntoChapters(body: string, contentType: ContentType, baseTitle = "Chapter") {
  const normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [defaultChapter(0)];

  const separatorPatterns = [
    /\n\s*---+\s*start chapter\s*---+\s*\n/gi,
    /\n\s*(?:\d+\s*[.:)]\s*)?(?:chapter|episode)\s+\d+\s*\n/gi,
    /\n\s*(?:chapter|episode)\s+\d+\s*\n/gi,
  ];

  let chunks = [normalized];
  for (const pattern of separatorPatterns) {
    const parts = normalized.split(pattern).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      chunks = parts;
      break;
    }
  }

  if (chunks.length === 1) {
    const paras = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (paras.length > 1 && paras.join("").length >= 1200) {
      const mid = Math.ceil(paras.length / 2);
      chunks = [paras.slice(0, mid).join("\n\n"), paras.slice(mid).join("\n\n")].filter(Boolean);
    }
  }

  return chunks.map((chunk, index) => ({
    ...defaultChapter(index),
    title: contentType === "short_story" && index === 0 ? "Short Story" : chapterTitleFor(index, contentType, chunk || baseTitle),
    summary: "",
    body: chunk,
    assetSlots: [],
  }));
}

function readPendingSourceDraft(id: string): PendingSourceDraft | null {
  if (typeof window === "undefined") return null;
  const key = "lovetale:pending-source:" + id;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingSourceDraft;
    window.sessionStorage.removeItem(key);
    return parsed;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function normalizeCharacters(card: any): CharacterConfig[] {
  const rows = Array.isArray(card?.characters) ? card.characters : [];
  if (rows.length) {
    return rows.map((c: any, i: number) => ({
      id: String(c.id || newId("char")),
      name: String(c.name || (i === 0 ? "Main Character" : "Character " + (i + 1))),
      role: String(c.role || ""),
      persona: String(c.persona || c.notes || c.personality || ""),
      visualPrompt: String(c.visualPrompt || c.appearance || ""),
      speakingStyle: String(c.speakingStyle || ""),
      avatarUrl: c.avatarUrl ?? null,
    }));
  }
  if (card?.name) {
    return [{
      id: "main",
      name: String(card.name),
      role: String(card.role || "Main Character"),
      persona: String(card.persona || card.notes || card.personality || ""),
      visualPrompt: String(card.visualPrompt || card.appearance || ""),
      speakingStyle: String(card.speakingStyle || ""),
      avatarUrl: card.avatarUrl ?? null,
    }];
  }
  return [defaultCharacter()];
}

function parseTags(raw: string) {
  return raw.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
}

async function uploadToStoryMedia(storyId: string, folder: string, file: File) {
  const ext = file.name.split(".").pop() || "bin";
  const key = folder + "/" + storyId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const { error } = await supabase.storage
    .from("story-media")
    .upload(key, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return key;
}

function useSignedMedia(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    if (/^(https?:|data:|blob:)/.test(path)) {
      setUrl(path);
      return;
    }
    supabase.storage
      .from("story-media")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => !cancelled && setUrl(data?.signedUrl ?? null))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

// ----------------------------------------------------------------------------
// Main: single-page console
// ----------------------------------------------------------------------------

function ChapterOnlyConsole({ chapterId }: { chapterId: string }) {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchChapter = useServerFn(getStoryChapterEditor);
  const saveChapter = useServerFn(saveStoryChapterEditor);

  const chapterQ = useQuery({
    queryKey: ["story_chapter_editor", id, chapterId],
    queryFn: () => fetchChapter({ data: { id, chapterId } }),
  });

  const [chapter, setChapter] = useState<ChapterConfig | null>(null);
  const [status, setStatus] = useState<"idle" | "dirty" | "saved">("idle");
  const loadedChapterRef = useRef<string | null>(null);

  useEffect(() => {
    const data = chapterQ.data;
    if (!data || loadedChapterRef.current === data.chapter.id) return;
    loadedChapterRef.current = data.chapter.id;
    setChapter(data.chapter);
    setStatus("idle");
  }, [chapterQ.data]);

  function patchChapterDraft(patch: Partial<ChapterConfig> | ((chapter: ChapterConfig) => Partial<ChapterConfig>)) {
    setChapter((current) => {
      if (!current) return current;
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      return { ...current, ...nextPatch };
    });
    setStatus("dirty");
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!chapter) return null;
      return saveChapter({ data: { id, chapter } });
    },
    onSuccess: () => {
      setStatus("saved");
      toast.success("?�차가 ?�?�되?�습?�다.");
      qc.invalidateQueries({ queryKey: ["story_chapter_editor", id, chapterId] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
      qc.invalidateQueries({ queryKey: ["story_compose", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function suggestLocalSlots() {
    if (!chapter || chapter.body.trim().length < 80) return;
    const desiredCount = Math.min(6, Math.max(1, Math.floor(chapter.body.length / 1200) || 1));
    const step = Math.max(280, Math.floor(chapter.body.length / (desiredCount + 1)));
    const incoming: AssetSlot[] = Array.from({ length: desiredCount }, (_, index) => {
      const offset = Math.min(chapter.body.length - 1, step * (index + 1));
      const scene = chapter.body
        .slice(Math.max(0, offset - 70), Math.min(chapter.body.length, offset + 140))
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: newId("slot"),
        offset,
        scene_description: scene || "Key scene",
        heat_tier: "warm",
        media_asset_id: null,
        media_url: null,
        media_type: "image",
        caption: null,
        source: "ai",
      };
    });
    patchChapterDraft((current) => ({
      assetSlots: [...current.assetSlots, ...incoming].sort((a, b) => a.offset - b.offset),
    }));
    toast.success(`${incoming.length}개의 ?�셋 ?�치�?추�??�습?�다.`);
  }

  if (chapterQ.isLoading) {
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (chapterQ.error || !chapterQ.data || !chapter) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {(chapterQ.error as Error | undefined)?.message ?? "?�차 ?�보�?불러?��? 못했?�니??"}
      </div>
    );
  }

  const data = chapterQ.data as ChapterEditorData;
  const currentIndex = data.chapterSummaries.findIndex((item) => item.id === chapter.id);

  return (
    <div className="space-y-4 pb-16">
      <header className="sticky top-0 z-40 -mx-1 border-b border-border bg-background/90 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/stories" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 목록
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-semibold">
              {chapter.episodeNumber}??· {chapter.title || "?�목 ?�음"}
            </h1>
            <div className="mt-1 text-xs text-muted-foreground">
              {data.title} · {chapter.body.length.toLocaleString()}??· ?�셋 {chapter.assetSlots.length}
              {status === "dirty" && <span className="ml-2 text-amber-500">?�???�요</span>}
              {status === "saved" && <span className="ml-2 text-emerald-500">?�?�됨</span>}
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link to={`/admin/stories/${id}/compose`}>?�체 ?�품 ?�집</Link>
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || status === "idle"}>
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} ?�??
          </Button>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="max-h-[75vh] space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">?�차 목록</div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Chapter list</div>
          {data.chapterSummaries.map((item) => (
            <Link
              key={item.id}
              to="/admin/stories/$id/chapter/$chapterId"
              params={{ id, chapterId: item.id }}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "block rounded-md border p-2 text-sm transition",
                item.id === chapter.id ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-primary">{item.episodeNumber}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.title || "Untitled"}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary || "No summary"}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {item.bodyChars.toLocaleString()} chars · assets {item.assetSlotsCount}
              </div>
            </Link>
          ))}
        </aside>

        <div className="min-w-0">
          <ChapterCard
            chapter={chapter}
            index={Math.max(0, currentIndex)}
            canRemove={false}
            onPatch={patchChapterDraft}
            onRemove={() => undefined}
          />
        </div>
      </section>

    </div>
  );
}

function StoryProductConsole() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const fetchCompose = useServerFn(getStoryCompose);
  const saveProduct = useServerFn(saveStoryProduct);
  const analyze = useServerFn(analyzeStoryProduct);
  const suggest = useServerFn(suggestAssetSlots);

  const storyQ = useQuery({
    queryKey: ["story_compose", id],
    queryFn: () => fetchCompose({ data: { id } }),
  });

  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("web_novel");
  const [logline, setLogline] = useState("");
  const [storyOverview, setStoryOverview] = useState("");
  const [chapters, setChapters] = useState<ChapterConfig[]>([defaultChapter(0)]);
  const [characters, setCharacters] = useState<CharacterConfig[]>([defaultCharacter()]);
  const [environment, setEnvironment] = useState<StoryEnvironment>({ initialAffection: 30, chatTone: "" });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [priceCredits, setPriceCredits] = useState(0);
  const [maxHeat, setMaxHeat] = useState<HeatPreset>("warm");
  const [audience, setAudience] = useState<"all" | "female" | "male">("all");
  const [tagsRaw, setTagsRaw] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const autosaveRunningRef = useRef(false);
  const queuedAutosaveRef = useRef<ReturnType<typeof buildPayload> | null>(null);
  const saveInFlightRef = useRef(false);
  const chapterSectionRef = useRef<HTMLElement | null>(null);
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const appendModeHandledRef = useRef(false);

  const loadedId = useRef<string | null>(null);
  const skipNextAutosaveRef = useRef(true);
  useEffect(() => {
    const data = storyQ.data;
    if (!data || loadedId.current === data.id) return;
    loadedId.current = data.id;
    const card = (data.character_card ?? {}) as any;
    const pendingSource = readPendingSourceDraft(data.id);
    const pendingContentType = pendingSource?.contentType ?? card.contentType ?? "web_novel";
    setTitle(pendingSource?.title || data.title || "");
    setContentType(pendingContentType);
    setLogline(data.logline ?? "");
    setStoryOverview(card.storyOverview ?? data.logline ?? "");
    const loaded = (data.chapters && data.chapters.length ? data.chapters : [defaultChapter(0)]) as ChapterConfig[];
    const loadedHasBody = loaded.some((chapter) => chapter.body.trim().length > 0);
    const pendingText = pendingSource?.sourceText?.trim() ?? "";
    const importedChapters = !loadedHasBody && pendingText
      ? splitSourceIntoChapters(pendingText, pendingContentType)
      : loaded;
    setChapters(importedChapters);
    setActiveChapterId(search.chapterId ?? importedChapters[importedChapters.length - 1]?.id ?? importedChapters[0]?.id ?? null);
    if (!loadedHasBody && pendingText && !card.storyOverview) {
      setStoryOverview(pendingText.slice(0, 280));
    }
    setCharacters(normalizeCharacters(card));
    setEnvironment({
      initialAffection: Number(card.environment?.initialAffection ?? 30),
      chatTone: String(card.environment?.chatTone ?? ""),
    });
    setCoverUrl(data.cover_url ?? null);
    setPriceCredits(data.price_credits ?? 0);
    setMaxHeat(data.max_heat ?? "warm");
    setAudience((data.audience as any) ?? "all");
    setTagsRaw((data.tags ?? []).join(", "));
    setIsPublished(Boolean(data.is_public && data.is_listed));
    skipNextAutosaveRef.current = true;
  }, [storyQ.data]);

  useEffect(() => {
    if (search.mode !== "append_episode" || !storyQ.data || appendModeHandledRef.current) return;
    appendModeHandledRef.current = true;
    if (search.newChapter === "1") {
      setChapters((cur) => {
        const hasEmptyTail = cur.some((chapter) => !chapter.body.trim() && !chapter.summary?.trim());
        if (hasEmptyTail) {
          const emptyTail = cur.find((chapter) => !chapter.body.trim() && !chapter.summary?.trim());
          if (emptyTail) setActiveChapterId(emptyTail.id);
          return cur;
        }
        const next = defaultChapter(cur.length);
        setActiveChapterId(next.id);
        return [...cur, next];
      });
    }
    window.setTimeout(() => {
      chapterSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [search.mode, search.newChapter, storyQ.data]);

  useEffect(() => {
    if (!search.chapterId || !storyQ.data) return;
    setActiveChapterId(search.chapterId);
    window.setTimeout(() => {
      chapterRefs.current[search.chapterId!]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
  }, [search.chapterId, storyQ.data, chapters.length]);

  function patchChapter(chapterId: string, patch: Partial<ChapterConfig> | ((c: ChapterConfig) => Partial<ChapterConfig>)) {
    setChapters((cur) =>
      cur.map((c) => {
        if (c.id !== chapterId) return c;
        const p = typeof patch === "function" ? patch(c) : patch;
        return { ...c, ...p };
      }),
    );
  }

  const totalChars = useMemo(() => chapters.reduce((s, c) => s + c.body.length, 0), [chapters]);
  const totalSlots = useMemo(() => chapters.reduce((s, c) => s + c.assetSlots.length, 0), [chapters]);

  // Reusable asset library: harvest every slot with media across all chapters.
  const assetLibrary = useMemo(() => {
    const lib: Array<{ key: string; url: string; type: "image" | "video"; tier: HeatPreset; caption: string | null; scene: string }> = [];
    const seen = new Set<string>();
    for (const c of chapters) {
      for (const s of c.assetSlots) {
        if (!s.media_url || !s.media_type) continue;
        if (seen.has(s.media_url)) continue;
        seen.add(s.media_url);
        lib.push({
          key: s.id,
          url: s.media_url,
          type: s.media_type,
          tier: s.heat_tier,
          caption: s.caption,
          scene: s.scene_description ?? "",
        });
      }
    }
    return lib;
  }, [chapters]);

  const buildPayload = (published = isPublished) => ({
    id,
    title: title.trim(),
    contentType,
    logline: logline.trim() || null,
    storyOverview,
    chapters: chapters.length ? chapters : [defaultChapter(0)],
    characters: characters.length ? characters : [defaultCharacter()],
    environment,
    coverUrl,
    priceCredits,
    maxHeat,
    audience,
    tags: parseTags(tagsRaw),
    isPublic: published,
    isListed: published,
  });

  const persistQueuedAutosave = async (payload: ReturnType<typeof buildPayload>) => {
    const serializedNext = JSON.stringify(payload);
    if (serializedNext === lastSerialized.current) return;
    queuedAutosaveRef.current = payload;
    if (autosaveRunningRef.current) return;
    autosaveRunningRef.current = true;
    try {
      while (queuedAutosaveRef.current) {
        const next = queuedAutosaveRef.current;
        queuedAutosaveRef.current = null;
        const serialized = JSON.stringify(next);
        if (serialized === lastSerialized.current) continue;
        lastSerialized.current = serialized;
        await saveProduct({ data: next });
        setAutoStatus("saved");
        qc.invalidateQueries({ queryKey: ["user_story_unified", id] });
      }
    } finally {
      autosaveRunningRef.current = false;
    }
  };

  const saveMut = useMutation({
    mutationFn: async (published?: boolean) => {
      const payload = buildPayload(published ?? isPublished);
      const serialized = JSON.stringify(payload);
      if (saveInFlightRef.current || serialized === lastSerialized.current) return null;
      saveInFlightRef.current = true;
      try {
        const result = await saveProduct({ data: payload });
        lastSerialized.current = serialized;
        return result;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    onSuccess: (_res, published) => {
      toast.success(published ?? isPublished ? "?�??�??�시 ?�료" : "?�?�됨");
      setIsPublished(Boolean(published ?? isPublished));
      qc.invalidateQueries({ queryKey: ["story_compose", id] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
      qc.invalidateQueries({ queryKey: ["marketplace_stories"] });
      qc.invalidateQueries({ queryKey: ["marketplace_story", id] });
      qc.invalidateQueries({ queryKey: ["user_story_unified", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Autosave: persist every edit (debounced) so positions/tiers come back on reload ---
  const [autoStatus, setAutoStatus] = useState<"idle" | "saving" | "saved">("idle");
  const lastSerialized = useRef<string>("");
  useEffect(() => {
    if (!loadedId.current) return;
    const payload = buildPayload(isPublished);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerialized.current) return;
    if (skipNextAutosaveRef.current) {
      lastSerialized.current = serialized;
      skipNextAutosaveRef.current = false;
      return;
    }
    setAutoStatus("saving");
    const t = setTimeout(() => {
      persistQueuedAutosave(payload)
        .then(() => {
          setAutoStatus("saved");
        })
        .catch(() => setAutoStatus("idle"));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, contentType, logline, storyOverview, chapters, characters, environment, coverUrl, priceCredits, maxHeat, audience, tagsRaw]);

  const analyzeMut = useMutation({
    mutationFn: async () => {
      await saveProduct({ data: buildPayload(false) });
      return analyze({ data: { id } });
    },
    onSuccess: (res) => {
      if (res.storyOverview) setStoryOverview(res.storyOverview);
      if (res.chapters?.length) {
        setChapters((cur) =>
          res.chapters.map((c, i) => ({
            ...c,
            body: cur[i]?.body ?? c.body,
            assetSlots: cur[i]?.assetSlots ?? c.assetSlots,
            id: cur[i]?.id ?? c.id,
          })),
        );
      }
      if (res.characters?.length) setCharacters(res.characters);
      toast.success("AI가 개요·주인�?초안??채웠?�요");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestMut = useMutation({
    mutationFn: async (chapterId: string) => {
      await saveProduct({ data: buildPayload(false) });
      const res = await suggest({ data: { id, desiredCount: 6 } });
      return { res, chapterId };
    },
    onSuccess: ({ res, chapterId }) => {
      const incoming = res.slots ?? [];
      patchChapter(chapterId, (c) => ({ assetSlots: [...c.assetSlots, ...incoming].sort((a, b) => a.offset - b.offset) }));
      toast.success(`${incoming.length} assets inserted.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const splitMut = useMutation({
    mutationFn: async () => {
      const next = splitChapterBodyIntoChapters(
        chapters.map((chapter) => chapter.body).join("\n\n--- chapter break ---\n\n"),
        contentType,
        title || "Chapter",
      );
      setChapters(next);
      return next.length;
    },
    onSuccess: (count) => {
      toast.success(`Split into ${count} chapters from the body.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function uploadCover(file: File) {
    try {
      const key = await uploadToStoryMedia(id, "covers", file);
      setCoverUrl(key);
      toast.success("Cover image uploaded.");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  }

  async function uploadCharacterAvatar(file: File, charId: string) {
    try {
      const key = await uploadToStoryMedia(id, "characters", file);
      setCharacters((cur) => cur.map((c) => (c.id === charId ? { ...c, avatarUrl: key } : c)));
      toast.success("Character avatar uploaded.");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  }

  if (storyQ.isLoading) {
    return (
      <div className="p-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
    );
  }
  if (storyQ.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {(storyQ.error as Error).message}
      </div>
    );
  }

  const activeCharacter = characters[0] ?? defaultCharacter();
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? chapters[chapters.length - 1] ?? null;
  const flowStats = [
    { label: "Story", value: `${totalChars.toLocaleString()} chars` },
    { label: "Chapters", value: `${chapters.length} items` },
    { label: "Assets", value: `${totalSlots} total` },
    { label: "State", value: isPublished ? "Published" : "Draft" },
  ];

  return (
    <div className="space-y-4 pb-16">
      <header className="sticky top-0 z-40 -mx-1 border-b border-border bg-background/90 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/stories" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 목록
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-semibold">{title || "Untitled story"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{CONTENT_TYPES.find((t) => t.key === contentType)?.label}</span>
              <span>Chapters {chapters.length} | {totalChars.toLocaleString()} chars</span>
              <span>Assets {totalSlots}</span>
              <Badge variant="outline" className="text-[10px]">{isPublished ? "Published" : "Draft"}</Badge>
              <span className={cn("inline-flex items-center gap-1", autoStatus === "saving" && "text-amber-500", autoStatus === "saved" && "text-emerald-500")}>
                {autoStatus === "saving" ? (<><Loader2 className="size-3 animate-spin" /> Auto-saving...</>) : autoStatus === "saved" ? (<><Check className="size-3" /> Auto-saved</>) : "Idle"}
              </span>
            </div>
          </div>
          <Button variant="outline" onClick={() => window.open(`/play/user/${id}`, "_blank")}>
            <Eye className="size-4" /> ??�?미리보기
          </Button>
            <Eye className="size-4" /> Preview
            <Button variant="outline" disabled={saveMut.isPending} onClick={() => saveMut.mutate(false)}>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} ?�시 ?�제
            </Button>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Unpublish
            <Button disabled={saveMut.isPending || !title.trim() || totalChars < 20} onClick={() => saveMut.mutate(true)}>
              <Check className="size-4" /> ?�시?�기
            </Button>
              <Check className="size-4" /> Publish
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <h2 className="font-display text-lg font-semibold">?�작 ?�름</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            �??�문???�차�??�누�? �??�차??미리보기 ?�면?�서 ?�감???�계�??��?지·?�상??
            본문 ?�치??배치?�니?? ?�셋?� ?�잔, ?�뜻, ?�렘, ?�거?� 4?�계�??�?�됩?�다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => splitMut.mutate()}
              disabled={splitMut.isPending || totalChars < 80}
            >
              {splitMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />} ?�차 ?�동 분리
            </Button>
            <Link
              to="/admin/stories"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-primary/40"
            >
              콘텐�?목록?�로
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {flowStats.map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </div>
              <div className="mt-1 text-sm font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 1. ?�품 기본 ?�보 */}
      <BasicsCard
        title={title}
        setTitle={setTitle}
        contentType={contentType}
        setContentType={setContentType}
        logline={logline}
        setLogline={setLogline}
        storyOverview={storyOverview}
        setStoryOverview={setStoryOverview}
        onAnalyze={() => analyzeMut.mutate()}
        analyzing={analyzeMut.isPending}
        anyBody={totalChars > 80}
      />

      {/* 2. 주인�?*/}
      <CharactersCard
        storyId={id}
        characters={characters}
        setCharacters={setCharacters}
        onUploadAvatar={uploadCharacterAvatar}
      />

      {/* 3. ?�차??(본문 + ?�셋 모달 ?�리�? */}
      <section ref={chapterSectionRef} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">?�차 본문</h2>
            <p className="text-xs text-muted-foreground">
              �??�차???�문???�력?�고, ?�?�한 ??"?�셋 ?�정"?�로 ?��?지·?�상???�워 ?�으?�요.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setChapters((cur) => {
              const next = defaultChapter(cur.length);
              setActiveChapterId(next.id);
              return [...cur, next];
            })}
          >
            <Plus className="size-3" /> ?�차 추�?
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chapters.map((chapter) => (
              <ChapterSummaryButton
                key={chapter.id}
                chapter={chapter}
                active={chapter.id === activeChapter?.id}
                onClick={() => setActiveChapterId(chapter.id)}
              />
            ))}
          </div>
          <div className="min-w-0">
            {activeChapter ? (
              <div
                key={activeChapter.id}
                ref={(node) => {
                  chapterRefs.current[activeChapter.id] = node;
                }}
                className="scroll-mt-28"
              >
                <ChapterCard
                  chapter={activeChapter}
                  index={chapters.findIndex((chapter) => chapter.id === activeChapter.id)}
                  canRemove={chapters.length > 1}
                  onPatch={(p) => patchChapter(activeChapter.id, p)}
                  onRemove={() => setChapters((cur) => {
                    const currentIndex = cur.findIndex((chapter) => chapter.id === activeChapter.id);
                    const next = cur.filter((chapter) => chapter.id !== activeChapter.id);
                    setActiveChapterId(next[Math.max(0, currentIndex - 1)]?.id ?? next[0]?.id ?? null);
                    return next;
                  })}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                ?�차�?추�??�거???�쪽 목록?�서 ?�집???�차�??�택?�세??
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. ?�시·채팅 ?�정 (?�힘) */}
      <DisplaySettingsCard
        storyId={id}
        coverUrl={coverUrl}
        setCoverUrl={setCoverUrl}
        onUploadCover={uploadCover}
        priceCredits={priceCredits}
        setPriceCredits={setPriceCredits}
        maxHeat={maxHeat}
        setMaxHeat={setMaxHeat}
        audience={audience}
        setAudience={setAudience}
        tagsRaw={tagsRaw}
        setTagsRaw={setTagsRaw}
        environment={environment}
        setEnvironment={setEnvironment}
      />

    </div>
  );
}

// ----------------------------------------------------------------------------
// Basics / Characters / Settings cards
// ----------------------------------------------------------------------------

function BasicsCard({
  title, setTitle, contentType, setContentType, logline, setLogline,
  storyOverview, setStoryOverview, onAnalyze, analyzing, anyBody,
}: {
  title: string; setTitle: (v: string) => void;
  contentType: ContentType; setContentType: (v: ContentType) => void;
  logline: string; setLogline: (v: string) => void;
  storyOverview: string; setStoryOverview: (v: string) => void;
  onAnalyze: () => void; analyzing: boolean; anyBody: boolean;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">?�품 기본 ?�보</h2>
          <p className="text-xs text-muted-foreground">?�목�???�??�개, 줄거�?개요�?채워???�작?????�어??</p>
        </div>
        <Button size="sm" variant="outline" onClick={onAnalyze} disabled={analyzing || !anyBody}>
          {analyzing ? <Loader2 className="size-3 animate-spin" /> : <Bot className="size-3" />} AI 개요 채우�?
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <div>
          <label className="text-xs text-muted-foreground">?�품 ?�목</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="?�토�??�목" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">?�형</label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CONTENT_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">??�??�개</label>
        <Input value={logline} onChange={(e) => setLogline(e.target.value)} className="mt-1" placeholder="목록�??�세 ?�면??보일 짧�? ?�명" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">줄거�?개요</label>
        <Textarea
          value={storyOverview}
          onChange={(e) => setStoryOverview(e.target.value)}
          className="mt-1 min-h-24"
          placeholder="3~5문장?�로 ?�체 줄거리�? ?�약"
        />
      </div>
    </section>
  );
}

function CharactersCard({
  storyId, characters, setCharacters, onUploadAvatar,
}: {
  storyId: string;
  characters: CharacterConfig[];
  setCharacters: (v: CharacterConfig[] | ((cur: CharacterConfig[]) => CharacterConfig[])) => void;
  onUploadAvatar: (file: File, charId: string) => void;
}) {
  function patchCharacter(id: string, patch: Partial<CharacterConfig>) {
    setCharacters((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Characters</h2>
          <p className="text-xs text-muted-foreground">Core characters for chat and story tone.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCharacters((cur) => [...cur, defaultCharacter()])}>
          <Plus className="size-3" /> Add character
        </Button>
      </div>
      <div className="space-y-3">
        {characters.map((character) => (
          <CharacterEditor
            key={character.id}
            storyId={storyId}
            character={character}
            canRemove={characters.length > 1}
            onPatch={(patch) => patchCharacter(character.id, patch)}
            onRemove={() => setCharacters((cur) => cur.filter((c) => c.id !== character.id))}
            onUpload={(file) => onUploadAvatar(file, character.id)}
          />
        ))}
      </div>
    </section>
  );
}

function CharacterEditor({
  character, canRemove, onPatch, onRemove, onUpload,
}: {
  storyId: string;
  character: CharacterConfig;
  canRemove: boolean;
  onPatch: (patch: Partial<CharacterConfig>) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
}) {
  const avatar = useSignedMedia(character.avatarUrl);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="flex gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
          {avatar ? <img src={avatar} alt={character.name} className="size-full object-cover" /> : <UserCircle2 className="size-7 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={character.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="?�름" className="h-8" />
            <Input value={character.role} onChange={(e) => onPatch({ role: e.target.value })} placeholder="??��" className="h-8" />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary/50">
              <Upload className="size-3" /> ?��?지
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }} />
            </label>
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="text-xs">
              <ChevronDown className={cn("size-3 transition", expanded && "rotate-180")} /> ?�세??
            </Button>
            {canRemove && <Button size="sm" variant="ghost" onClick={onRemove} className="ml-auto"><Trash2 className="size-3 text-destructive" /></Button>}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 pt-1">
          <Textarea value={character.persona} onChange={(e) => onPatch({ persona: e.target.value })} className="min-h-20 text-xs" placeholder="?�격, 배경, ?�???�향" />
          <Textarea value={character.visualPrompt} onChange={(e) => onPatch({ visualPrompt: e.target.value })} className="min-h-16 text-xs" placeholder="?�형, ?�상, ?�정" />
          <Textarea value={character.speakingStyle ?? ""} onChange={(e) => onPatch({ speakingStyle: e.target.value })} className="min-h-14 text-xs" placeholder="말투" />
        </div>
      )}
    </div>
  );
}

function DisplaySettingsCard(props: {
  storyId: string;
  coverUrl: string | null; setCoverUrl: (v: string | null) => void; onUploadCover: (file: File) => void;
  priceCredits: number; setPriceCredits: (v: number) => void;
  maxHeat: HeatPreset; setMaxHeat: (v: HeatPreset) => void;
  audience: "all" | "female" | "male"; setAudience: (v: "all" | "female" | "male") => void;
  tagsRaw: string; setTagsRaw: (v: string) => void;
  environment: StoryEnvironment; setEnvironment: (v: StoryEnvironment) => void;
}) {
  const {
    coverUrl, setCoverUrl, onUploadCover, priceCredits, setPriceCredits,
    maxHeat, setMaxHeat, audience, setAudience, tagsRaw, setTagsRaw,
    environment, setEnvironment,
  } = props;
  const cover = useSignedMedia(coverUrl);
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Settings2 className="size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">Display settings</h2>
          <p className="text-xs text-muted-foreground">Cover image, audience, heat level, tags, and chat tone.</p>
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">표지 이미지</label>
            <div className="aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">
              {cover ? (
                <img src={cover} alt="" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center">
                  <ImageIcon className="size-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50">
              <Upload className="size-4" />
              업로드
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadCover(file);
                }}
              />
            </label>
            <Input value={coverUrl ?? ""} onChange={(e) => setCoverUrl(e.target.value || null)} placeholder="표지 이미지 URL" className="h-8 text-xs" />
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">상품 가격(크레딧)</label>
                <Input type="number" min={0} value={priceCredits} onChange={(e) => setPriceCredits(Math.max(0, Number(e.target.value) || 0))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">대상</label>
                <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">전체</option>
                  <option value="female">여성</option>
                  <option value="male">남성</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">최대 분위기 강도</label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {HEAT.map((heat) => (
                  <button
                    key={heat.key}
                    type="button"
                    onClick={() => setMaxHeat(heat.key)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs",
                      maxHeat === heat.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    <div className="font-medium">{heat.label}</div>
                    <div className="text-[10px] opacity-80">호감 {heat.min}+</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">태그</label>
              <Input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} className="mt-1" placeholder="로맨스, 캠퍼스, 성장" />
            </div>
            <div className="grid gap-3 md:grid-cols-[180px_1fr]">
              <div>
                <label className="text-xs text-muted-foreground">초기 호감도</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={environment.initialAffection}
                  onChange={(e) =>
                    setEnvironment({
                      ...environment,
                      initialAffection: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">채팅 톤 메모</label>
                <Input
                  value={environment.chatTone}
                  onChange={(e) => setEnvironment({ ...environment, chatTone: e.target.value })}
                  className="mt-1"
                  placeholder="짧게 적는 감정/말투 메모"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Chapter card (inline body editor + asset trigger)
// ----------------------------------------------------------------------------

function ChapterSummaryButton({
  chapter,
  active,
  onClick,
}: {
  chapter: ChapterConfig;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-3 text-left text-sm transition",
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-primary">{chapter.episodeNumber}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{chapter.title || "Untitled chapter"}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {chapter.summary || chapter.body.slice(0, 90) || "본문을 입력하세요"}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
        <span>{chapter.body.length.toLocaleString()}자</span>
        <span>·</span>
        <span>에셋 {chapter.assetSlots.length}</span>
        <span>·</span>
        <span>{chapter.isFree ? "무료" : `${chapter.priceCredits} cr`}</span>
      </div>
    </button>
  );
}

type LibraryItem = { key: string; url: string; type: "image" | "video"; tier: AssetTier; caption: string | null; scene: string };

function ChapterCard({
  storyId,
  chapter,
  index,
  canRemove,
  onPatch,
  onRemove,
  assetLibrary,
  onSuggestAssets,
  suggesting,
}: {
  storyId: string;
  chapter: ChapterConfig;
  index: number;
  canRemove: boolean;
  onPatch: (patch: Partial<ChapterConfig>) => void;
  onRemove: () => void;
  assetLibrary: Array<{ key: string; url: string; type: "image" | "video"; tier: AssetTier; caption: string | null; scene: string }>;
  onSuggestAssets: () => void;
  suggesting: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(0);
  const [showSummary, setShowSummary] = useState(false);
  const [editingOffset, setEditingOffset] = useState<number | null>(null);

  const packs = useMemo(() => {
    const map = new Map<number, AssetSlot[]>();
    for (const slot of chapter.assetSlots) {
      const arr = map.get(slot.offset) ?? [];
      arr.push(slot);
      map.set(slot.offset, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([offset, slots]) => ({
        offset,
        slots: slots.sort((a, b) => TIERS.indexOf(a.heat_tier) - TIERS.indexOf(b.heat_tier)),
      }));
  }, [chapter.assetSlots]);

  function syncCaret() {
    const el = textareaRef.current;
    if (!el) return;
    caretRef.current = el.selectionStart ?? el.value.length;
  }

  function insertAtCaret(text: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? chapter.body.length;
    const end = el.selectionEnd ?? start;
    onPatch({ body: `${chapter.body.slice(0, start)}${text}${chapter.body.slice(end)}` });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
      syncCaret();
    });
  }

  function upsertPack(offset: number, fill?: { url: string; type: "image" | "video"; tier: AssetTier }) {
    const targetOffset = Math.max(0, Math.min(chapter.body.length, Math.round(offset)));
    const existing = chapter.assetSlots.filter((slot) => slot.offset === targetOffset);
    const nextSlots = TIERS.map<AssetSlot>((tier) => {
      const current = existing.find((slot) => slot.heat_tier === tier);
      return {
        id: current?.id ?? newId("slot"),
        offset: targetOffset,
        heat_tier: tier,
        scene_description: current?.scene_description ?? "",
        media_url: current?.media_url ?? null,
        media_type: current?.media_type ?? null,
        media_asset_id: current?.media_asset_id ?? null,
        caption: current?.caption ?? null,
        source: current?.source ?? "manual",
      };
    });
    if (fill) {
      const tierIndex = TIERS.indexOf(fill.tier);
      if (tierIndex >= 0) {
        nextSlots[tierIndex] = { ...nextSlots[tierIndex], media_url: fill.url, media_type: fill.type };
      }
    }
    const others = chapter.assetSlots.filter((slot) => slot.offset !== targetOffset);
    onPatch({ assetSlots: [...others, ...nextSlots].sort((a, b) => a.offset - b.offset) });
    setEditingOffset(targetOffset);
  }

  function patchSlot(offset: number, tier: AssetTier, patch: Partial<AssetSlot>) {
    onPatch({
      assetSlots: chapter.assetSlots
        .map((slot) => (slot.offset === offset && slot.heat_tier === tier ? { ...slot, ...patch } : slot))
        .sort((a, b) => a.offset - b.offset),
    });
  }

  function removePack(offset: number) {
    onPatch({ assetSlots: chapter.assetSlots.filter((slot) => slot.offset !== offset) });
    setEditingOffset((current) => (current === offset ? null : current));
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const raw = e.dataTransfer.getData("application/x-lovetale-asset");
    if (!raw) return;
    e.preventDefault();
    try {
      const item = JSON.parse(raw) as { url: string; type: "image" | "video"; tier: AssetTier };
      const offset = caretRef.current || textareaRef.current?.selectionStart || chapter.body.length;
      upsertPack(offset, item);
    } catch {
      // ignore malformed payload
    }
  }

  const selectedPack = editingOffset == null ? null : packs.find((pack) => pack.offset === editingOffset) ?? null;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">회차 본문 편집</h2>
          <p className="text-xs text-muted-foreground">한 화면에서 회차 정보, 본문, 에셋을 함께 편집합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onSuggestAssets} disabled={suggesting || chapter.body.trim().length < 80}>
            {suggesting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            AI 추천
          </Button>
          {canRemove && (
            <Button size="sm" variant="ghost" onClick={onRemove} className="text-destructive">
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
        <Input
          type="number"
          min={1}
          value={chapter.episodeNumber}
          onChange={(e) => onPatch({ episodeNumber: Math.max(1, Number(e.target.value) || index + 1) })}
          className="h-8 w-full"
        />
        <Input value={chapter.title} onChange={(e) => onPatch({ title: e.target.value })} className="h-8 w-full" placeholder="회차 제목" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-2">
          <input type="checkbox" checked={chapter.isFree} onChange={(e) => onPatch({ isFree: e.target.checked })} /> 무료
        </label>
        {!chapter.isFree && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={chapter.priceCredits}
              onChange={(e) => onPatch({ priceCredits: Math.max(0, Number(e.target.value) || 0) })}
              className="h-8 w-24"
            />
            <span className="text-muted-foreground">크레딧</span>
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowSummary((v) => !v)}>
          <ChevronDown className={cn("size-3 transition", showSummary && "rotate-180")} />
          요약
        </Button>
        <Button size="sm" variant="ghost" onClick={() => upsertPack(caretRef.current || textareaRef.current?.selectionStart || chapter.body.length)}>
          <Plus className="size-3" />
          에셋 추가
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {chapter.body.length.toLocaleString()}자 · 에셋 {chapter.assetSlots.length}개
        </span>
      </div>

      {showSummary && (
        <Textarea
          value={chapter.summary ?? ""}
          onChange={(e) => onPatch({ summary: e.target.value })}
          className="min-h-14 text-xs"
          placeholder="회차 요약"
        />
      )}

      <Textarea
        ref={textareaRef}
        value={chapter.body}
        onChange={(e) => onPatch({ body: e.target.value })}
        onClick={syncCaret}
        onKeyUp={syncCaret}
        onMouseUp={syncCaret}
        onDrop={handleDrop}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-lovetale-asset")) e.preventDefault();
        }}
        placeholder="본문을 입력하세요."
        className="min-h-[320px] resize-y whitespace-pre-wrap font-mono text-[13px] leading-[1.75]"
        spellCheck={false}
        wrap="soft"
      />

      <AssetLibraryStrip items={assetLibrary} />

      <div className="space-y-2">
        <div className="text-sm font-medium">에셋 위치</div>
        {packs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">등록된 에셋이 없습니다.</div>
        ) : (
          packs.map((pack, i) => (
            <button
              key={pack.offset}
              type="button"
              onClick={() => setEditingOffset(pack.offset)}
              className={cn(
                "w-full rounded-md border p-3 text-left text-xs transition",
                editingOffset === pack.offset ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded bg-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{chapter.body.slice(Math.max(0, pack.offset - 16), pack.offset + 32).replace(/\s+/g, " ") || "위치"}</span>
                <span className="text-[11px] text-muted-foreground">{pack.offset.toLocaleString()}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {TIERS.map((tier) => {
                  const active = pack.slots.find((slot) => slot.heat_tier === tier)?.media_url;
                  const meta = HEAT.find((h) => h.key === tier)!;
                  return (
                    <span key={tier} className={cn("rounded-full px-2 py-0.5 text-[10px]", active ? `${meta.color} text-white` : "bg-muted text-muted-foreground")}>
                      {HEAT_LABEL[tier]}
                    </span>
                  );
                })}
              </div>
            </button>
          ))
        )}
      </div>

      <AssetPackDialog
        open={editingOffset != null}
        storyId={storyId}
        offset={editingOffset}
        bodyText={chapter.body}
        existing={selectedPack?.slots ?? []}
        onClose={() => setEditingOffset(null)}
        onSave={(drafts) => {
          if (editingOffset == null) return;
          const offset = editingOffset;
          const others = chapter.assetSlots.filter((slot) => slot.offset !== offset);
          const created = TIERS.map<AssetSlot>((tier) => {
            const existing = chapter.assetSlots.find((slot) => slot.offset === offset && slot.heat_tier === tier);
            const draft = drafts[tier] ?? {};
            return {
              id: existing?.id ?? newId("slot"),
              offset,
              heat_tier: tier,
              scene_description: String(draft.scene_description ?? existing?.scene_description ?? ""),
              media_url: (draft.media_url ?? existing?.media_url ?? null) as string | null,
              media_type: (draft.media_type ?? existing?.media_type ?? null) as any,
              media_asset_id: existing?.media_asset_id ?? null,
              caption: (draft.caption ?? existing?.caption ?? null) as string | null,
              source: existing?.source ?? "manual",
            };
          });
          onPatch({ assetSlots: [...others, ...created].sort((a, b) => a.offset - b.offset) });
          setEditingOffset(null);
        }}
        onRemove={() => {
          if (editingOffset == null) return;
          removePack(editingOffset);
          setEditingOffset(null);
        }}
      />
    </section>
  );
}

function AssetLibraryStrip({ items }: { items: LibraryItem[] }) {
  if (!items.length) {
    return <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">에셋 라이브러리가 비어 있습니다.</div>;
  }
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">에셋 라이브러리</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <LibraryThumb key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function LibraryThumb({ item }: { item: LibraryItem }) {
  const url = useSignedMedia(item.url);
  const meta = HEAT.find((h) => h.key === item.tier)!;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-lovetale-asset", JSON.stringify(item));
      }}
      className="shrink-0 overflow-hidden rounded-md border border-border bg-background"
      title={item.scene || HEAT_LABEL[item.tier]}
    >
      <div className="size-16 bg-muted">
        {url ? (
          item.type === "video" ? <video src={url} className="size-full object-cover" muted playsInline /> : <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-[10px] text-muted-foreground">미리보기</div>
        )}
      </div>
      <span className={cn("block px-1 py-0.5 text-[9px] text-white", meta.color)}>{HEAT_LABEL[item.tier]}</span>
    </div>
  );
}

function AssetPackDialog({
  open,
  storyId,
  offset,
  bodyText,
  existing,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean;
  storyId: string;
  offset: number | null;
  bodyText: string;
  existing: AssetSlot[];
  onClose: () => void;
  onSave: (drafts: Record<AssetTier, Partial<AssetSlot>>) => void;
  onRemove: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<AssetTier, Partial<AssetSlot>>>({} as any);

  useEffect(() => {
    const next: Record<AssetTier, Partial<AssetSlot>> = {} as any;
    for (const tier of TIERS) {
      const slot = existing.find((item) => item.heat_tier === tier);
      next[tier] = {
        media_url: slot?.media_url ?? null,
        media_type: slot?.media_type ?? null,
        scene_description: slot?.scene_description ?? "",
        caption: slot?.caption ?? null,
      };
    }
    setDrafts(next);
  }, [existing, offset, open]);

  async function uploadFor(tier: AssetTier, file: File) {
    const key = await uploadToStoryMedia(storyId, file.type.startsWith("video/") ? "videos" : "images", file);
    setDrafts((cur) => ({
      ...cur,
      [tier]: { ...cur[tier], media_url: key, media_type: file.type.startsWith("video/") ? "video" : "image" },
    }));
  }

  if (!open || offset == null) return null;
  const excerpt = bodyText.slice(Math.max(0, offset - 40), offset + 40).replace(/\s+/g, " ");

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-[96vw] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>에셋 편집 - 위치 {offset.toLocaleString()}</DialogTitle>
          <DialogDescription>{excerpt}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {TIERS.map((tier) => (
            <div key={tier} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-[10px]">{HEAT_LABEL[tier]}</Badge>
                <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs hover:border-primary">
                  파일
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFor(tier, f); }} />
                </label>
              </div>
              <Input
                value={drafts[tier]?.media_url ?? ""}
                onChange={(e) => setDrafts((cur) => ({ ...cur, [tier]: { ...cur[tier], media_url: e.target.value || null } }))}
                placeholder="미디어 URL"
              />
              <Textarea
                value={drafts[tier]?.scene_description ?? ""}
                onChange={(e) => setDrafts((cur) => ({ ...cur, [tier]: { ...cur[tier], scene_description: e.target.value } }))}
                className="min-h-20"
                placeholder="장면 설명"
              />
              <Input
                value={drafts[tier]?.caption ?? ""}
                onChange={(e) => setDrafts((cur) => ({ ...cur, [tier]: { ...cur[tier], caption: e.target.value || null } }))}
                placeholder="캡션"
              />
            </div>
          ))}
        </div>
        <DialogFooter className="flex-wrap gap-2 border-t border-border px-5 py-3">
          {existing.length > 0 && (
            <Button variant="ghost" onClick={onRemove}>
              <Trash2 className="size-4 text-destructive" /> 삭제
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={() => onSave(drafts)}>
              <Save className="size-4" />
              저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


