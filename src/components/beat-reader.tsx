import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, RotateCcw, Lock, ChevronDown, Sparkles } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  emotionTint,
  emotionLabel,
  type Emotion,
  type StoryBeat,
} from "@/lib/mock/story";
import {
  getMyStoryAffection,
  bumpMyStoryAffection,
  setMyStoryAffection,
} from "@/lib/affection.functions";

export type AssetTier = 1 | 2 | 3;
export type TierMedia = { image?: string; video?: string };

export type ReaderContentBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image" | "video"; assetPath: string; caption?: string };

export type ReaderBeat = StoryBeat & {
  imagePrompt?: string;
  heatTier?: string;
  media?: { image?: string; video?: string; animation?: string; voice?: string; bgm?: string };
  mediaTiers?: Partial<Record<AssetTier, TierMedia>>;
  contentBlocks?: ReaderContentBlock[];
};

// ──────────────────────────────────────────────
// 친밀도(0-100) → 에셋 등급
//   1단계: 0-33   잔잔
//   2단계: 34-66  따뜻
//   3단계: 67-100 설렘
// ──────────────────────────────────────────────
export const TIER_THRESHOLD: Record<AssetTier, number> = { 1: 0, 2: 34, 3: 67 };
export const TIER_LABEL: Record<AssetTier, string> = { 1: "잔잔", 2: "따뜻", 3: "설렘" };

export function tierFromAffection(a: number): AssetTier {
  if (a >= TIER_THRESHOLD[3]) return 3;
  if (a >= TIER_THRESHOLD[2]) return 2;
  return 1;
}

export const PAGE_CHAR_LIMIT = 2800;

function pickTierMedia(beat: ReaderBeat, tier: AssetTier): { media?: TierMedia; usedTier?: AssetTier } {
  const tiers = beat.mediaTiers ?? {};
  for (let t = tier; t >= 1; t--) {
    const m = tiers[t as AssetTier];
    if (m && (m.image || m.video)) return { media: m, usedTier: t as AssetTier };
  }
  if (beat.media) {
    return {
      media: { image: beat.media.image, video: beat.media.video ?? beat.media.animation },
      usedTier: 1,
    };
  }
  return {};
}

function highestRegisteredTier(beat: ReaderBeat): AssetTier | undefined {
  const tiers = beat.mediaTiers ?? {};
  for (const t of [3, 2, 1] as AssetTier[]) {
    const m = tiers[t];
    if (m && (m.image || m.video)) return t;
  }
  return undefined;
}

function useResolvedMedia(beat: ReaderBeat, tier: AssetTier) {
  const [resolved, setResolved] = useState<TierMedia>({});
  useEffect(() => {
    let cancelled = false;
    const { media } = pickTierMedia(beat, tier);
    if (!media) {
      setResolved({});
      return;
    }
    async function resolveOne(v?: string) {
      if (!v) return undefined;
      if (/^(https?:|data:|blob:)/.test(v)) return v;
      const { data } = await supabase.storage.from("story-media").createSignedUrl(v, 60 * 30);
      return data?.signedUrl;
    }
    Promise.all([resolveOne(media.image), resolveOne(media.video)])
      .then(([img, vid]) => !cancelled && setResolved({ image: img, video: vid }))
      .catch(() => !cancelled && setResolved({}));
    return () => {
      cancelled = true;
    };
  }, [beat, tier]);
  return resolved;
}

function BeatMedia({
  beat,
  tier,
  affection,
  title,
}: {
  beat: ReaderBeat;
  tier: AssetTier;
  affection: number;
  title?: string;
}) {
  const resolved = useResolvedMedia(beat, tier);
  const highest = highestRegisteredTier(beat);
  const lockedTier: AssetTier | undefined = highest && highest > tier ? highest : undefined;
  const lockedNeed = lockedTier ? TIER_THRESHOLD[lockedTier] : 0;
  const lockedGap = Math.max(0, lockedNeed - affection);

  return (
    <div className="relative">
      {resolved.video ? (
        <video
          src={resolved.video}
          poster={resolved.image}
          controls
          playsInline
          className="w-full max-h-[48vh] object-cover rounded-xl border border-border/40"
        />
      ) : resolved.image ? (
        <img
          src={resolved.image}
          alt={title ?? beat.speaker ?? "장면"}
          className="w-full max-h-[48vh] object-cover rounded-xl border border-border/40"
          loading="lazy"
        />
      ) : null}

      {lockedTier && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <Badge
            variant="outline"
            className="text-[10px] gap-1 bg-background/80 backdrop-blur border-fuchsia-400/40"
          >
            <Lock className="size-2.5" /> {lockedTier}단계 {TIER_LABEL[lockedTier]} 잠김
          </Badge>
          <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur">
            친밀도 {lockedNeed}+ 필요 · 앞으로 {lockedGap}
          </Badge>
        </div>
      )}
    </div>
  );
}

type Props = {
  beats: Record<string, ReaderBeat>;
  initialAffection?: number;
  title?: string;
  cover?: string;
  paginate?: boolean;
  /** 백엔드 친밀도와 연동할 user story id (있으면 fetch + bump 사용) */
  storyId?: string;
  /** 관리자 미리보기 모드 — 친밀도 슬라이더를 항상 노출 (백엔드 동기화 없음) */
  previewMode?: boolean;
};

export function BeatReader({
  beats,
  initialAffection = 0,
  title,
  cover,
  paginate = true,
  storyId,
  previewMode = false,
}: Props) {
  const ordered = useMemo(() => Object.values(beats), [beats]);
  const total = ordered.length;

  const pages = useMemo(() => {
    if (!paginate) return [ordered];
    const out: ReaderBeat[][] = [];
    let cur: ReaderBeat[] = [];
    let chars = 0;
    for (const b of ordered) {
      cur.push(b);
      chars += (b.text?.length ?? 0) + (b.narration?.length ?? 0);
      if (chars >= PAGE_CHAR_LIMIT) {
        out.push(cur);
        cur = [];
        chars = 0;
      }
    }
    if (cur.length) out.push(cur);
    return out;
  }, [ordered, paginate]);

  // ── 백엔드 친밀도 연동 ──
  const qc = useQueryClient();
  const fetchAff = useServerFn(getMyStoryAffection);
  const bumpAff = useServerFn(bumpMyStoryAffection);
  const setAff = useServerFn(setMyStoryAffection);
  const enableBackend = !!storyId && !previewMode;

  const affQ = useQuery({
    queryKey: ["story_affection", storyId],
    queryFn: () => fetchAff({ data: { storyId: storyId! } }),
    enabled: enableBackend,
    staleTime: 0,
    gcTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const bumpMut = useMutation({
    mutationFn: (reward: { delta: number; reason: string }) =>
      bumpAff({ data: { storyId: storyId!, delta: reward.delta, reason: reward.reason } }),
    onSuccess: (res) =>
      qc.setQueryData(["story_affection", storyId], {
        affection: res.affection,
        updatedAt: new Date().toISOString(),
      }),
  });
  const setMut = useMutation({
    mutationFn: (value: number) => setAff({ data: { storyId: storyId!, affection: value } }),
    onSuccess: (res) =>
      qc.setQueryData(["story_affection", storyId], {
        affection: res.affection,
        updatedAt: new Date().toISOString(),
      }),
  });

  // 로컬 미리보기 친밀도 (관리자/비로그인용)
  const [localAffection, setLocalAffection] = useState(initialAffection);
  const affection = enableBackend ? affQ.data?.affection ?? initialAffection : localAffection;

  function setAffection(value: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    if (enableBackend) setMut.mutate(clamped);
    else setLocalAffection(clamped);
  }

  const [pageIdx, setPageIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastBumpedPage = useRef<number>(-1);

  useEffect(() => {
    setPageIdx(0);
    lastBumpedPage.current = -1;
  }, [total, storyId]);

  // 페이지를 새로 열 때마다 친밀도 +2 (행동 보상)
  useEffect(() => {
    if (!enableBackend) return;
    if (pageIdx === 0) return; // 첫 로딩은 보상 제외
    if (lastBumpedPage.current >= pageIdx) return;
    lastBumpedPage.current = pageIdx;
    bumpMut.mutate({ delta: 2, reason: "reading_page" });
  }, [pageIdx, enableBackend]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleBeats = useMemo(() => pages.slice(0, pageIdx + 1).flat(), [pages, pageIdx]);
  const tier = tierFromAffection(affection);
  const progress = total ? Math.round((visibleBeats.length / total) * 100) : 0;
  const hasMore = pageIdx < pages.length - 1;

  useEffect(() => {
    window.requestAnimationFrame(() =>
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60),
    );
  }, [pageIdx]);

  function reset() {
    setPageIdx(0);
    lastBumpedPage.current = -1;
    if (previewMode) setLocalAffection(initialAffection);
  }

  // 다음 단계 해금까지 남은 호감
  const next2 = TIER_THRESHOLD[2] - affection;
  const next3 = TIER_THRESHOLD[3] - affection;

  return (
    <div className="flex flex-col gap-4 min-h-[60vh]">
      {/* 헤더: 진행도 + 친밀도 + 등급 */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {title && <div className="truncate text-sm font-semibold">{title}</div>}
            <Progress value={progress} className="mt-1 h-1" />
          </div>
          <Badge variant="outline" className="text-[10px]">
            {pageIdx + 1} / {pages.length}
          </Badge>
          <div
            className="inline-flex items-center gap-1 text-xs text-rose-300"
            title="친밀도 (0-100)"
          >
            <Heart className="size-3.5 fill-rose-400" /> {affection}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              tier === 3 && "border-fuchsia-400/60 text-fuchsia-200",
              tier === 2 && "border-rose-400/60 text-rose-200",
            )}
          >
            {tier}단계 · {TIER_LABEL[tier]}
          </Badge>
          <Button size="sm" variant="ghost" onClick={reset} title="처음부터">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        {/* 다음 등급 해금 안내 */}
        {tier < 3 && (
          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3 text-fuchsia-300" />
            {tier === 1 ? (
              <>다음 단계 <strong className="text-rose-300">2단계 따뜻</strong> 까지 친밀도 {Math.max(0, next2)} 남음</>
            ) : (
              <>다음 단계 <strong className="text-fuchsia-300">3단계 설렘</strong> 까지 친밀도 {Math.max(0, next3)} 남음</>
            )}
            <span className="ml-1 opacity-70">· 채팅·끝까지 읽기로 친밀도가 올라요</span>
          </div>
        )}
      </div>

      {cover && pageIdx === 0 && (
        <img
          src={cover}
          alt={title ?? ""}
          className="w-full max-h-[40vh] object-cover rounded-xl border border-border/40"
        />
      )}

      {/* 본문 */}
      <div className="space-y-6">
        {visibleBeats.map((b, idx) => (
          <article
            key={`${b.id}-${idx}`}
            className={cn(
              "relative rounded-2xl border border-border/50 overflow-hidden",
              "bg-gradient-to-br backdrop-blur-sm",
              emotionTint[b.emotion as Emotion] ?? emotionTint.calm,
            )}
          >
            <BeatMedia beat={b} tier={tier} affection={affection} title={title} />
            <div className="p-4 sm:p-6 space-y-3">
              {b.speaker && (
                <div className="text-xs uppercase tracking-widest text-primary/80">
                  {b.speaker}
                </div>
              )}
              {Array.isArray(b.contentBlocks) && b.contentBlocks.length > 0 ? (
                b.contentBlocks.map((block) => (
                  <InlineBlock key={block.id} block={block} />
                ))
              ) : (
                <>
                  {b.text && (
                    <p className="text-base sm:text-lg leading-relaxed whitespace-pre-line">
                      {b.text}
                    </p>
                  )}
                  {b.narration && (
                    <p className="text-sm text-muted-foreground italic leading-relaxed whitespace-pre-line">
                      {b.narration}
                    </p>
                  )}
                </>
              )}
              <div className="flex items-center gap-2 pt-1">
                {b.emotion && (
                  <Badge variant="secondary" className="text-[10px]">
                    {emotionLabel[b.emotion as Emotion] ?? b.emotion}
                  </Badge>
                )}
                {b.end && (
                  <Badge className="text-[10px] bg-amber-600/30 border-amber-500/40 text-amber-100">
                    엔딩
                  </Badge>
                )}
              </div>
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </div>

      {/* 끊어 읽기 게이트 */}
      {hasMore ? (
        <div className="sticky bottom-4 z-10 flex flex-col items-center gap-1 pt-2">
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            onClick={() => setPageIdx((p) => p + 1)}
          >
            <ChevronDown className="size-4 mr-1" /> 다음 장면 보기
          </Button>
          {enableBackend && (
            <span className="text-[10px] text-muted-foreground">
              다음 장면을 열면 친밀도 +2
            </span>
          )}
        </div>
      ) : (
        visibleBeats.length > 0 && (
          <div className="text-center text-xs text-muted-foreground pt-4 pb-12 space-y-2">
            <div>— 마지막 장면입니다 —</div>
            <div className="flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={reset}>
                <RotateCcw className="size-3.5 mr-1" /> 처음부터
              </Button>
              {enableBackend && (
                <Button
                  size="sm"
                  onClick={() => {
                    bumpMut.mutate({ delta: 5, reason: "quest" }, {
                      onSuccess: (res) => toast.success(`끝까지 읽었어요 · 친밀도 +${res.appliedDelta ?? 0}`),
                    });
                  }}
                  disabled={bumpMut.isPending}
                >
                  <Heart className="size-3.5 mr-1 fill-current" /> 완독 보상 받기 (+5)
                </Button>
              )}
            </div>
          </div>
        )
      )}

      {/* 친밀도 테스트 컨트롤 — 관리자 previewMode 또는 비로그인에서만 노출 */}
      {(previewMode || !enableBackend) && (
        <details open={previewMode} className="mt-2 rounded-lg border border-dashed border-border/50 p-2 text-[11px]">
          <summary className="cursor-pointer select-none text-muted-foreground">
            친밀도 테스트 · 슬라이더를 움직여 단계별 해금/잠금 동작을 확인
          </summary>
          <div className="mt-2 space-y-1">
            <input
              type="range"
              min={0}
              max={100}
              value={affection}
              onChange={(e) => setAffection(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0 · 1단계 잔잔</span>
              <span>34 · 2단계 따뜻</span>
              <span>67 · 3단계 설렘</span>
              <span>100</span>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function InlineBlock({ block }: { block: ReaderContentBlock }) {
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    if (block.type === "text") return;
    if (/^https?:\/\//.test(block.assetPath)) {
      setSigned(block.assetPath);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("story-media")
      .createSignedUrl(block.assetPath, 60 * 60)
      .then(({ data }) => !cancelled && setSigned(data?.signedUrl ?? null))
      .catch(() => !cancelled && setSigned(null));
    return () => {
      cancelled = true;
    };
  }, [block]);

  if (block.type === "text") {
    return (
      <p className="text-base sm:text-lg leading-relaxed whitespace-pre-line">
        {block.text}
      </p>
    );
  }

  return (
    <figure className="my-2 overflow-hidden rounded-xl border border-border/40 bg-muted/30">
      {signed ? (
        block.type === "video" ? (
          <video src={signed} className="w-full" controls playsInline />
        ) : (
          <img src={signed} alt={block.caption ?? ""} className="w-full object-cover" />
        )
      ) : (
        <div className="aspect-video w-full grid place-items-center text-muted-foreground text-xs">
          미디어 불러오는 중…
        </div>
      )}
      {block.caption && (
        <figcaption className="px-3 py-2 text-xs text-muted-foreground border-t border-border/40">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function beatsArrayToMap(beats: ReaderBeat[]): Record<string, ReaderBeat> {
  const m: Record<string, ReaderBeat> = {};
  for (const b of beats) m[b.id] = b;
  return m;
}
