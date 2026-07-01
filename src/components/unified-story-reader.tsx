import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Heart,
  Lock,
  MessageCircle,
  Send,
  X,
  Loader2,
  ChevronDown,
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
  previewMode?: boolean;
  previewAffection?: number;
  showSlotMarkers?: boolean;
  showAffectionRows?: boolean;
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
function TextBlock({ value }: { value: string }) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);
  return (
    <div data-scene-block className="space-y-4">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="whitespace-pre-wrap text-base sm:text-lg leading-[1.85] text-foreground/95"
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

export function UnifiedStoryReader({
  storyId,
  title,
  cover,
  bodyText,
  assetSlots,
  characterName = "그/그녀",
  previewMode = false,
  previewAffection = 30,
  showSlotMarkers = false,
  showAffectionRows = false,
}: Props) {
  const qc = useQueryClient();
  const fetchAff = useServerFn(getMyStoryAffection);
  const bumpAff = useServerFn(bumpMyStoryAffection);

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
  const affectionRows = useMemo(() => [0, 30, 55, 75, 100], []);
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
  const [chatOpen, setChatOpen] = useState(false);
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
      {/* 상단 호감도 바 */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="mx-auto max-w-3xl px-4 py-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={affection} className="h-1 flex-1" />
              <span className="inline-flex items-center gap-1 text-xs text-rose-300">
                <Heart className="size-3 fill-rose-400" /> {affection}
              </span>
            </div>
          </div>
        </div>
      </div>

      <main ref={containerRef} className={cn("mx-auto max-w-3xl px-4 pt-4", previewMode ? "pb-8" : "pb-40")}>
        {cover && (
          <img
            src={cover}
            alt={title}
            className="mb-6 w-full max-h-[40vh] object-cover rounded-xl border border-border/40"
          />
        )}

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

        <article className="max-w-none space-y-5">
          {segments.map((seg, i) =>
            seg.kind === "text" ? (
              <TextBlock key={`t${i}`} value={seg.value} />
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
        <CharacterChatDock
          storyId={storyId}
          characterName={characterName}
          affection={affection}
          readingExcerpt={readingExcerpt || bodyText.slice(0, 600)}
          open={chatOpen}
          onOpenChange={setChatOpen}
          previewMode={previewMode}
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
}: {
  storyId: string;
  characterName: string;
  affection: number;
  readingExcerpt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewMode: boolean;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({
    id: `story-${storyId}`,
    transport,
  });
  const isStreaming = status === "submitted" || status === "streaming";

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
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 transition-transform",
        open ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]",
      )}
    >
      <div className="mx-auto max-w-3xl">
        {/* Toggle handle */}
        <button
          onClick={() => onOpenChange(!open)}
          className="w-full flex items-center gap-2 px-4 h-14 bg-card/95 backdrop-blur-xl border-t border-x border-border/60 rounded-t-2xl shadow-lg"
        >
          <MessageCircle className="size-4 text-primary" />
          <span className="text-sm font-medium flex-1 text-left">
            {characterName}와 대화
            <span className="ml-2 text-xs text-muted-foreground">
              · 읽는 중인 장면과 호감도가 반영돼요
            </span>
          </span>
          {open ? <X className="size-4" /> : <ChevronDown className="size-4 rotate-180" />}
        </button>

        {/* Panel */}
        <div className="bg-card/95 backdrop-blur-xl border-x border-border/60 max-h-[60vh] flex flex-col">
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
