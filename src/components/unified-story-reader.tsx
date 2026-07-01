import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Heart,
  Lock,
  MessageCircle,
  Sparkles,
  Send,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  bumpMyStoryAffection,
  getMyStoryAffection,
} from "@/lib/affection.functions";
import type { AssetSlot, HeatPreset } from "@/lib/admin-stories-compose.functions";

// 분위기 강도 → 필요 호감도 (사용자 화면용 한글 라벨)
const HEAT_INFO: Record<HeatPreset, { label: string; min: number; color: string }> = {
  soft: { label: "잔잔", min: 0, color: "border-slate-400/40 text-slate-300" },
  warm: { label: "따뜻", min: 30, color: "border-amber-400/40 text-amber-300" },
  spicy: { label: "설렘", min: 55, color: "border-rose-400/50 text-rose-300" },
  steamy: {
    label: "뜨거움",
    min: 75,
    color: "border-fuchsia-400/60 text-fuchsia-300",
  },
};

type Props = {
  storyId: string;
  title: string;
  cover?: string | null;
  bodyText: string;
  assetSlots: AssetSlot[];
  characterName?: string;
  characterProfiles?: CharacterChatProfile[];
  previewMode?: boolean;
  previewAffection?: number;
  showSlotMarkers?: boolean;
  showAffectionRows?: boolean;
  initialChatOpen?: boolean;
  nextChapterTitle?: string | null;
  onNextChapter?: () => void;
};

export type CharacterChatProfile = {
  id: string;
  name: string;
  role?: string;
  persona?: string;
  personality?: string;
  speakingStyle?: string;
  relationship?: string;
  notes?: string;
};

function tierMinForSlot(slot: AssetSlot) {
  switch (slot.heat_tier) {
    case "soft":
      return 0;
    case "warm":
      return 30;
    case "spicy":
      return 55;
    case "steamy":
    case "premium":
      return 75;
    default:
      return 0;
  }
}

function displayTierForSlot(slot: AssetSlot): HeatPreset {
  return slot.heat_tier === "premium" ? "steamy" : slot.heat_tier;
}

function chooseSlotForAffection(slots: AssetSlot[], affection: number) {
  if (!slots.length) return null;
  const sorted = [...slots].sort((a, b) => {
    const tierDelta = tierMinForSlot(a) - tierMinForSlot(b);
    if (tierDelta !== 0) return tierDelta;
    return (a.id || "").localeCompare(b.id || "");
  });
  const eligible = sorted.filter((slot) => affection >= tierMinForSlot(slot));
  const pool = eligible.length ? eligible : sorted;
  return pool.reduce<AssetSlot | null>((best, slot) => {
    if (!best) return slot;
    const bestMin = tierMinForSlot(best);
    const slotMin = tierMinForSlot(slot);
    if (slotMin > bestMin) return slot;
    if (slotMin < bestMin) return best;
    if (Boolean(slot.media_url) && !Boolean(best.media_url)) return slot;
    return best;
  }, null);
}

const AFFECTION_STAGES = [
  { min: 0, label: "낯섦", detail: "조용히 관계를 살피는 단계" },
  { min: 30, label: "관심", detail: "가볍게 반응을 주고받는 단계" },
  { min: 55, label: "긴장", detail: "서로의 말에 더 집중하는 단계" },
  { min: 75, label: "몰입", detail: "감정이 본격적으로 깊어지는 단계" },
  { min: 100, label: "최고", detail: "가장 뜨겁게 연결되는 단계" },
] as const;

function getAffectionStage(affection: number) {
  return [...AFFECTION_STAGES]
    .sort((a, b) => a.min - b.min)
    .reduce((best, stage) => (affection >= stage.min ? stage : best), AFFECTION_STAGES[0]);
}

// 본문을 슬롯 offset 기준으로 잘라 [{text}, {slot}, {text}...] 배열로
function splitByOffsets(body: string, slots: AssetSlot[]) {
  const sorted = [...slots].sort((a, b) => a.offset - b.offset);
  const out: Array<{ kind: "text"; value: string } | { kind: "slot"; value: AssetSlot }> = [];
  let cursor = 0;
  for (const s of sorted) {
    const off = Math.max(cursor, Math.min(body.length, s.offset));
    if (off > cursor) out.push({ kind: "text", value: body.slice(cursor, off) });
    out.push({ kind: "slot", value: s });
    cursor = off;
  }
  if (cursor < body.length) out.push({ kind: "text", value: body.slice(cursor) });
  return out;
}

/**
 * 입력된 원문 그대로 표시 — 빈 줄(연속 개행)은 문단 구분, 단일 개행은 줄바꿈으로 보존.
 * whitespace-pre-wrap 으로 공백·들여쓰기·줄바꿈을 모두 그대로 렌더링.
 */
function TextBlock({
  value,
  className,
  paragraphClassName,
}: {
  value: string;
  className?: string;
  paragraphClassName?: string;
}) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);
  return (
    <div data-scene-block className={cn("space-y-4", className)}>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className={cn(
            "whitespace-pre-wrap text-base leading-[1.85] text-foreground/95 sm:text-lg",
            paragraphClassName,
          )}
        >
          {p}
        </p>
      ))}
    </div>
  );
}

function useSignedMedia(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (/^(https?:|data:|blob:)/.test(path)) {
      setUrl(path);
      return;
    }
    let cancelled = false;
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

function SlotRenderer({
  slot,
  affection,
}: {
  slot: AssetSlot;
  affection: number;
}) {
  const tierKey = displayTierForSlot(slot);
  const info = HEAT_INFO[tierKey];
  const locked = affection < info.min;
  const path = slot.media_url ?? slot.media_asset_id; // media_asset_id may be storage path or uuid (not handled here)
  // For now we treat media_url as the only fillable source; media_asset_id resolution is in admin (we pass storage_path to media_url at save).
  const url = useSignedMedia(slot.media_url);

  return (
    <figure
      className={cn(
        "my-4 overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm",
        locked ? "border-dashed border-border/50" : "border-border/50",
      )}
    >
      <div className="relative">
        {locked ? (
          <div className="grid aspect-[16/9] place-items-center bg-gradient-to-br from-muted/40 to-muted/10 text-center p-6">
            <div className="space-y-2">
              <Lock className="mx-auto size-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", info.color)}>
                  {info.label}
                </span>{" "}
                · 호감도 <strong>{info.min}+</strong> 필요
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                지금 {affection} · {Math.max(0, info.min - affection)} 더 올리면 열려요
              </p>
            </div>
          </div>
        ) : url ? (
          slot.media_type === "video" ? (
            <video
              src={url}
              autoPlay
              muted
              loop
              playsInline
              controls
              className="w-full"
            />
          ) : (
            <img src={url} alt={slot.scene_description} className="w-full object-cover" />
          )

        ) : (
          <div className="grid aspect-[16/9] place-items-center bg-muted/20 text-center p-6">
            <div className="space-y-2 max-w-md">
              <ImageIcon className="mx-auto size-4 text-primary" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {slot.scene_description}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                (아직 등록된 미디어가 없어요)
              </p>
            </div>
          </div>
        )}
        <Badge
          variant="outline"
          className={cn("absolute top-2 right-2 bg-background/80 text-[10px]", info.color)}
        >
          {info.label}
        </Badge>
      </div>
      {(slot.caption || (!locked && url)) && (
        <figcaption className="px-3 py-2 text-xs text-muted-foreground">
          {slot.caption || slot.scene_description}
        </figcaption>
      )}
    </figure>
  );
}

function ReaderAmbientBackground({ slot }: { slot: AssetSlot | null }) {
  const url = useSignedMedia(slot?.media_url ?? slot?.media_asset_id ?? null);
  if (!url) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className="h-full w-full scale-110 object-cover opacity-20 blur-md saturate-125 animate-ken-burns"
      />
      <div className="absolute inset-0 bg-background/80" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/88 to-background" />
    </div>
  );
}

export function UnifiedStoryReader({
  storyId,
  title,
  cover,
  bodyText,
  assetSlots,
  characterName = "상대 주인공",
  characterProfiles,
  previewMode = false,
  previewAffection = 30,
  showSlotMarkers = false,
  showAffectionRows = false,
  initialChatOpen = false,
  nextChapterTitle,
  onNextChapter,
}: Props) {
  const qc = useQueryClient();
  const fetchAff = useServerFn(getMyStoryAffection);
  const bumpAff = useServerFn(bumpMyStoryAffection);
  const [readerMode, setReaderMode] = useState<"reader" | "focus">("reader");

  const affQ = useQuery({
    queryKey: ["story_affection", storyId],
    queryFn: () => fetchAff({ data: { storyId } }),
    enabled: !previewMode,
    staleTime: 30_000,
  });
  const bumpMut = useMutation({
    mutationFn: (delta: number) => bumpAff({ data: { storyId, delta } }),
    onSuccess: (res) =>
      qc.setQueryData(["story_affection", storyId], {
        affection: res.affection,
        updatedAt: new Date().toISOString(),
      }),
  });

  const affection = previewMode
    ? previewAffection
    : affQ.data?.affection ?? 30;
  const affectionStage = useMemo(() => getAffectionStage(affection), [affection]);
  const affectionRows = useMemo(() => [0, 30, 55, 75, 100], []);
  const containerWidth = readerMode === "focus" ? "max-w-3xl" : "max-w-5xl";
  const bodyTextClass =
    readerMode === "focus"
      ? "text-lg sm:text-xl leading-[2.05]"
      : "text-base sm:text-lg leading-[1.9]";
  const visibleSlots = useMemo(() => {
    const groups = new Map<number, AssetSlot[]>();
    for (const slot of assetSlots ?? []) {
      const offset = Math.max(0, Math.min(bodyText.length, Math.round(slot.offset)));
      const current = groups.get(offset) ?? [];
      current.push(slot);
      groups.set(offset, current);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, group]) => {
        const chosen = chooseSlotForAffection(group, affection);
        return chosen ? [chosen] : [];
      });
  }, [assetSlots, bodyText.length, affection]);

  const segments = useMemo(
    () => splitByOffsets(bodyText, visibleSlots),
    [bodyText, visibleSlots],
  );

  const ambientSlot = useMemo(
    () =>
      visibleSlots.find(
        (slot) =>
          slot.media_type !== "video" &&
          Boolean(slot.media_url ?? slot.media_asset_id),
      ) ?? null,
    [visibleSlots],
  );

  const packedSlots = useMemo(() => {
    const map = new Map<number, AssetSlot[]>();
    for (const slot of visibleSlots) {
      const offset = Math.max(0, Math.min(bodyText.length, Math.round(slot.offset)));
      const arr = map.get(offset) ?? [];
      arr.push(slot);
      map.set(offset, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([offset, slots]) => ({ offset, slots }));
  }, [visibleSlots, bodyText.length]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(initialChatOpen);
  const [readingExcerpt, setReadingExcerpt] = useState<string>("");

  // Track which paragraph is currently in viewport for chat scene context.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const t = (visible[0].target as HTMLElement).innerText ?? "";
          if (t.trim().length > 20) setReadingExcerpt(t.slice(0, 600));
        }
      },
      { threshold: [0.3, 0.6] },
    );
    el.querySelectorAll("[data-scene-block]").forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [segments]);

  // Reward affection +1 per minute of reading (lightweight)
  useEffect(() => {
    if (previewMode) return;
    const t = window.setInterval(() => bumpMut.mutate(1), 60_000);
    return () => window.clearInterval(t);
  }, [previewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn("relative", previewMode ? "min-h-0" : "min-h-dvh")}>
      {!previewMode && <ReaderAmbientBackground slot={ambientSlot} />}
      {/* 상단 가독성 / 모드 바 */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className={cn("mx-auto px-4 py-3", containerWidth)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  챕터
                </Badge>
                <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-[10px] text-primary">
                  {readerMode === "focus" ? "집중모드" : "리더모드"}
                </Badge>
                <Badge variant="outline" className="rounded-full border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-300">
                  {affectionStage.label}
                </Badge>
              </div>
              <div className="mt-3 truncate text-2xl font-semibold leading-tight md:text-4xl">{title}</div>
              <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {affectionStage.detail}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={readerMode === "reader" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReaderMode("reader")}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  리더모드
                </Button>
                <Button
                  type="button"
                  variant={readerMode === "focus" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReaderMode("focus")}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  집중모드
                </Button>
              </div>
              {!previewMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setChatOpen(true)}
                  className="h-8 rounded-full border-border/60 px-3 text-xs"
                >
                  <MessageCircle className="mr-1 size-3.5" />
                  채팅 열기
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={affection} className="h-1.5 flex-1" />
            <div className="inline-flex items-center gap-1 text-xs text-rose-300">
              <Heart className="size-3 fill-rose-400" /> {affection}
            </div>
          </div>
        </div>
      </div>

      <main ref={containerRef} className={cn("relative z-10 mx-auto px-4 pt-4", containerWidth, previewMode ? "pb-8" : "pb-40")}>
        {cover && (
          <img
            src={cover}
            alt={title}
            className="mb-6 w-full max-h-[40vh] rounded-xl border border-border/40 object-cover"
          />
        )}

        <section className="mb-5 rounded-3xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 text-[10px] text-primary">
              주요요약
            </Badge>
            <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 text-[10px] text-muted-foreground">
              {readerMode === "focus" ? "밀도 높은 읽기" : "가독성 강화"}
            </Badge>
            <Badge variant="outline" className="rounded-full border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-300">
              호감도 {affectionStage.label}
            </Badge>
          </div>
          <div className="mt-3 flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold leading-tight">{title}</h2>
              <p className={cn("mt-2 text-muted-foreground", readerMode === "focus" ? "text-base leading-8" : "text-sm leading-7")}>
                {affectionStage.detail} {bodyText.slice(0, readerMode === "focus" ? 180 : 120).trim()}
              </p>
            </div>
          </div>
        </section>

        {showAffectionRows && (
          <section className="mb-4 rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">호감도별 미리보기</div>
                <div className="text-[11px] text-muted-foreground">등록된 에셋이 각 호감도에서 열리는지 빠르게 확인합니다.</div>
              </div>
              <div className="text-[11px] text-muted-foreground">현재 {affection}</div>
            </div>
            <div className="space-y-3">
              {affectionRows.map((rowAffection) => (
                <div key={rowAffection} className="rounded-md border border-border/70 bg-background p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>호감도 {rowAffection}</span>
                    <span>{rowAffection <= affection ? "노출" : "잠금"}</span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(assetSlots ?? []).length ? (
                      (assetSlots ?? []).map((slot) => (
                        <div key={`row-${rowAffection}-s-${slot.id}`} className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-2">
                          <SlotRenderer slot={slot} affection={rowAffection} />
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">등록된 에셋이 없습니다.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <article className={cn("space-y-5", readerMode === "focus" ? "max-w-none" : "max-w-none")}>
          {segments.map((seg, i) =>
            seg.kind === "text" ? (
              <TextBlock
                key={`t${i}`}
                value={seg.value}
                className={readerMode === "focus" ? "space-y-5" : "space-y-4"}
                paragraphClassName={bodyTextClass}
              />
            ) : (
              <div key={seg.value.id} className="space-y-2">
                {showSlotMarkers && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-0.5">본문 위치 {Math.max(0, seg.value.offset).toLocaleString()}</span>
                    <span>호감도 {seg.value.heat_tier}</span>
                  </div>
                )}
                <SlotRenderer slot={seg.value} affection={affection} />
              </div>
            ),
          )}
          {segments.length === 0 && (
            <p className="text-muted-foreground text-sm">아직 본문이 등록되지 않았어요.</p>
          )}
        </article>

        {!previewMode && onNextChapter && (
          <section className="mt-12 overflow-hidden rounded-3xl border border-primary/20 bg-card/85 p-5 shadow-glow backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-[10px] text-primary">
                  다 읽었어요
                </Badge>
                <h3 className="mt-3 text-xl font-semibold leading-tight">다음화로 이어볼까요?</h3>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                  {nextChapterTitle ? `다음 이야기: ${nextChapterTitle}` : "이어지는 회차를 바로 열어볼 수 있어요."}
                </p>
              </div>
              <Button type="button" onClick={onNextChapter} className="shrink-0 rounded-full px-5">
                다음화 보기
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </section>
        )}

        {showSlotMarkers && packedSlots.length > 0 && (
          <section className="mt-6 rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">에셋 위치 인덱스</div>
            <div className="space-y-2">
              {packedSlots.map((pack, index) => (
                <div key={pack.offset} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                  <span className="w-10 shrink-0 rounded-full bg-muted px-2 py-0.5 text-center">#{index + 1}</span>
                  <span className="w-24 shrink-0 text-muted-foreground">본문 {pack.offset.toLocaleString()}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {pack.slots.map((slot) => (
                      <span key={slot.id} className="rounded-full border border-border px-2 py-0.5">
                        {slot.heat_tier}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {!previewMode && (
        <ReaderEngagementChatDock
          storyId={storyId}
          characterName={characterName}
          characterProfiles={characterProfiles}
          affection={affection}
          readingExcerpt={readingExcerpt || bodyText.slice(0, 600)}
          open={chatOpen}
          onOpenChange={setChatOpen}
          previewMode={previewMode}
          onChatReward={() => bumpMut.mutate(2)}
        />
      )}
    </div>
  );
}

const transport = new DefaultChatTransport({
  api: "/api/character-chat",
  headers: (): Record<string, string> => {
    const key = `sb-${
      (import.meta.env.VITE_SUPABASE_URL as string)
        ?.match(/https?:\/\/([^.]+)/)?.[1] ?? ""
    }-auth-token`;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      const token = parsed?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  },
});

function CharacterChatDock({
  storyId,
  characterName,
  affection,
  readingExcerpt,
  open,
  onOpenChange,
  previewMode,
  onChatReward,
}: {
  storyId: string;
  characterName: string;
  affection: number;
  readingExcerpt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewMode: boolean;
  onChatReward: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastReward, setLastReward] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({
    id: `story-${storyId}`,
    transport,
  });
  const isStreaming = status === "submitted" || status === "streaming";
  const quickPrompts = useMemo(
    () => [
      "지금 장면에서 네 마음은 어때?",
      "내가 어떤 선택을 하면 좋을까?",
      "나에게만 살짝 힌트를 줘.",
      "호감도를 더 쌓으려면 뭘 하면 돼?",
    ],
    [],
  );
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  async function send() {
    if (!draft.trim() || isStreaming) return;
    if (previewMode) {
      toast.info("미리보기 모드에서는 채팅이 전송되지 않아요.");
      setDraft("");
      return;
    }
    const text = draft.trim();
    setDraft("");
    await sendMessage(
      { text },
      {
        body: {
          storyId,
          sceneExcerpt: readingExcerpt,
          affection,
        },
      },
    );
    onChatReward();
    setLastReward(true);
    window.setTimeout(() => setLastReward(false), 1800);
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 transition-transform",
        open ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]",
      )}
    >
      <div className="mx-auto max-w-5xl">
        {/* Toggle handle */}
        <button
          onClick={() => onOpenChange(!open)}
          className="w-full flex items-center gap-2 px-4 h-14 bg-card/95 backdrop-blur-xl border-t border-x border-border/60 rounded-t-2xl shadow-lg"
        >
          <MessageCircle className="size-4 text-primary" />
          <span className="hidden">
            {characterName}와 대화
            <span className="ml-2 text-xs text-muted-foreground">
              · 읽는 중인 장면과 호감도가 반영돼요
            </span>
          </span>
          <span className="min-w-0 flex-1 text-left text-sm font-medium">
            {characterName}와 대화
            <span className="ml-2 text-xs text-muted-foreground">
              읽는 장면과 호감도를 반영해요
            </span>
          </span>
          <span className="hidden rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 sm:inline-flex">
            호감도 {affection}
          </span>
          {open ? <X className="size-4" /> : <ChevronDown className="size-4 rotate-180" />}
        </button>

        {/* Panel */}
        <div className="flex max-h-[64vh] flex-col border-x border-border/60 bg-card/95 backdrop-blur-xl">
          <div className="border-b border-border/40 px-4 py-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  지금 장면에 바로 말을 걸어보세요
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  캐릭터는 현재 읽는 문맥을 참고해서 반응합니다. 대화를 이어갈수록 호감도가 쌓이고, 더 높은 단계의 에셋과 반응을 열 수 있어요.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDraft(prompt)}
                      className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-300">
                    <Heart className="size-3 fill-rose-400" />
                    호감도 {affection}
                  </span>
                  <span className="text-muted-foreground">대화 +2</span>
                </div>
                <Progress value={affection} className="mt-2 h-1.5" />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {affectionGap > 0
                    ? `다음 반응 단계까지 ${affectionGap}만큼 남았어요. 장면 질문이나 선택 상담을 해보세요.`
                    : "최고 단계에 가까워졌어요. 깊은 대화를 이어가면 특별 반응을 유지할 수 있어요."}
                </p>
                {lastReward && (
                  <div className="mt-2 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300">
                    대화 보상 +2 적용
                  </div>
                )}
              </div>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[220px]">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {characterName}에게 말을 걸어보세요. 지금 읽고 있는 장면의 분위기로 답해줘요.
              </p>
            )}
            {messages.map((m) => {
              const text = m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60",
                    )}
                  >
                    {!isUser && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        {characterName}
                      </div>
                    )}
                    {text || (isStreaming && !isUser ? "…" : "")}
                  </div>
                </div>
              );
            })}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-muted/60 rounded-2xl px-3 py-2 text-sm">
                  <Loader2 className="inline size-3 animate-spin" />
                </div>
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-border/40 p-3 flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={`${characterName}에게 보낼 말…`}
              className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary max-h-32"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim() || isStreaming}
              className="h-9"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReaderEngagementChatDock({
  storyId,
  characterName,
  characterProfiles,
  affection,
  readingExcerpt,
  open,
  onOpenChange,
  previewMode,
  onChatReward,
}: {
  storyId: string;
  characterName: string;
  characterProfiles?: CharacterChatProfile[];
  affection: number;
  readingExcerpt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewMode: boolean;
  onChatReward: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastReward, setLastReward] = useState(false);
  const normalizedCharacters = useMemo<CharacterChatProfile[]>(() => {
    const fromProfiles = (characterProfiles ?? [])
      .map((character, index) => ({
        ...character,
        id: String(character.id || character.name || `character-${index + 1}`),
        name: String(character.name || characterName || "상대 주인공"),
      }))
      .filter((character) => character.name.trim());
    return fromProfiles.length
      ? fromProfiles
      : [{ id: "main-character", name: characterName || "상대 주인공" }];
  }, [characterProfiles, characterName]);
  const [selectedCharacterId, setSelectedCharacterId] = useState(() => normalizedCharacters[0]?.id ?? "main-character");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({ id: `story-${storyId}`, transport });
  const isStreaming = status === "submitted" || status === "streaming";
  const activeCharacter =
    normalizedCharacters.find((character) => character.id === selectedCharacterId) ?? normalizedCharacters[0];
  const activeCharacterName = activeCharacter?.name || characterName;
  const quickPrompts = useMemo(
    () => [
      "지금 장면에서 네 마음은 어때?",
      "내가 어떤 선택을 하면 좋을까?",
      "나에게만 살짝 힌트를 줘.",
      "호감도를 더 쌓으려면 뭘 하면 돼?",
    ],
    [],
  );
  const nextAffectionGoal = affection < 30 ? 30 : affection < 55 ? 55 : affection < 75 ? 75 : 100;
  const affectionGap = Math.max(0, nextAffectionGoal - affection);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!normalizedCharacters.some((character) => character.id === selectedCharacterId)) {
      setSelectedCharacterId(normalizedCharacters[0]?.id ?? "main-character");
    }
  }, [normalizedCharacters, selectedCharacterId]);

  async function send() {
    if (!draft.trim() || isStreaming) return;
    if (previewMode) {
      toast.info("미리보기 모드에서는 채팅이 전송되지 않아요.");
      setDraft("");
      return;
    }
    const text = draft.trim();
    setDraft("");
    await sendMessage({
      text,
    }, {
      body: {
        storyId,
        sceneExcerpt: readingExcerpt,
        affection,
        characterId: activeCharacter?.id,
        characterName: activeCharacterName,
        characterProfile: activeCharacter,
      },
    });
    onChatReward();
    setLastReward(true);
    window.setTimeout(() => setLastReward(false), 1800);
  }

  if (!open) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 pb-4 md:left-[var(--sidebar-width)]">
        <div className="mx-auto flex max-w-5xl justify-center px-4">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="group flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-xl transition hover:border-primary/40 hover:bg-card"
          >
            <div className="animate-pulse-glow relative flex h-11 flex-1 items-center gap-3 overflow-hidden rounded-xl border border-primary/25 bg-background/85 px-3 text-left shadow-glow">
              <span className="pointer-events-none absolute inset-y-0 left-0 w-16 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 group-hover:translate-x-[680%]" />
              <MessageCircle className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {activeCharacterName}에게 메시지 입력
              </span>
              <span className="shrink-0 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                호감도 {affection}
              </span>
            </div>
            <span className="shrink-0 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition group-hover:border-primary/40 group-hover:text-foreground">
              입력
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 translate-y-0 transition-transform md:left-[var(--sidebar-width)]">
      <div className="mx-auto max-w-3xl px-4">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-t-2xl border-x border-t border-border/60 bg-card/95 px-3 shadow-lg backdrop-blur-xl"
        >
          <MessageCircle className="size-4 text-primary" />
          <span className="min-w-0 text-center text-sm font-medium">
            {activeCharacterName}와 대화
          </span>
          <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
            호감도 {affection}
          </span>
          <X className="size-4" />
        </button>

        <div className="flex max-h-[42vh] flex-col border-x border-border/60 bg-card/95 backdrop-blur-xl">
          <div className="border-b border-border/40 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {normalizedCharacters.length > 1 ? (
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {normalizedCharacters.map((character) => {
                    const active = character.id === activeCharacter?.id;
                    return (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => setSelectedCharacterId(character.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition",
                          active
                            ? "border-primary/60 bg-primary text-primary-foreground"
                            : "border-border bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        )}
                      >
                        {character.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                  {activeCharacterName}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                  <Heart className="size-3 fill-rose-400" />
                  {affection}
                </span>
                {lastReward && <span className="text-[11px] font-semibold text-rose-300">+2</span>}
              </div>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  className="shrink-0 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="min-h-[96px] flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {messages.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {activeCharacterName}에게 말을 걸어보세요.
              </p>
            )}
            {messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line", isUser ? "bg-primary text-primary-foreground" : "bg-muted/60")}>
                    {!isUser && <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{activeCharacterName}</div>}
                    {text || (isStreaming && !isUser ? "..." : "")}
                  </div>
                </div>
              );
            })}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted/60 px-3 py-2 text-sm">
                  <Loader2 className="inline size-3 animate-spin" />
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end justify-center gap-2 border-t border-border/40 p-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={`${activeCharacterName}에게 보낼 말을 입력하세요`}
              className="min-h-10 w-full max-w-[30rem] resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || isStreaming} className="h-9">
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
