import { useEffect, useState } from "react";
import { Film, ImageIcon, Lock, Flame, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Emotion } from "@/lib/mock/story";
import { tierFor, type HeatTier } from "@/lib/heat-tier";
import { TIER_COST } from "@/lib/tier-pricing";
import { Button } from "@/components/ui/button";

type Props = {
  storyId: string;
  beatId: string;
  clipKey?: string;
  emotion: Emotion;
  alt?: string;
  // Player's current affection — used to pick the hottest available variant.
  affection?: number;
  // Explicit media paths assigned by the admin (beat.media.*). These take
  // priority over the path-convention fallbacks below.
  mediaImagePath?: string;
  mediaVideoPath?: string;
  mediaAnimationPath?: string;
  // Paywall state — owned by the parent (play screen).
  locked?: boolean;
  unlocking?: boolean;
  hasSubscription?: boolean;
  userCredits?: number;
  onUnlock?: () => void;
  onPreviewUpgrade?: () => void;
};

// Storage path conventions inside `story-media`:
//   images/{storyId}/{beatId}.{tier}.jpg → tier-specific (steamy/spicy/warm/soft)
//   images/{storyId}/{beatId}.jpg        → default
//   images/clips/{clipKey}.jpg
//   images/emotion/{emotion}.jpg
const cache = new Map<string, { imageUrl?: string; videoUrl?: string; hasVideo?: boolean; resolvedTier?: HeatTier["key"] }>();

async function resolve(
  storyId: string,
  beatId: string,
  clipKey: string | undefined,
  emotion: Emotion,
  tier: HeatTier,
  explicit: { image?: string; video?: string; animation?: string },
) {
  const key = `inline|${storyId}|${beatId}|${clipKey ?? ""}|${emotion}|${tier.key}|${explicit.image ?? ""}|${explicit.video ?? ""}|${explicit.animation ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // Try most intimate available variant first, then fall back to lower tiers.
  const order: HeatTier["key"][] = ["steamy", "spicy", "warm", "soft"];
  const startIdx = order.indexOf(tier.key);
  const tierChain = order.slice(startIdx);

  // 1) Explicit admin-assigned paths win (beat.media.*).
  // 2) Path conventions are the legacy fallback.
  const imgPaths = [
    ...(explicit.image ? [explicit.image] : []),
    ...tierChain.map((t) => `images/${storyId}/${beatId}.${t}.jpg`),
    `images/${storyId}/${beatId}.jpg`,
    ...(clipKey ? [`images/clips/${clipKey}.jpg`] : []),
    `images/emotion/${emotion}.jpg`,
  ];
  const vidPaths = [
    ...(explicit.video ? [explicit.video] : []),
    ...(explicit.animation ? [explicit.animation] : []),
    ...tierChain.map((t) => `videos/${storyId}/${beatId}.${t}.mp4`),
    `videos/${storyId}/${beatId}.mp4`,
    ...(clipKey ? [`videos/clips/${clipKey}.mp4`] : []),
  ];
  const all = [...imgPaths, ...vidPaths];
  const result: { imageUrl?: string; videoUrl?: string; hasVideo?: boolean; resolvedTier?: HeatTier["key"] } = {};
  try {
    const { data } = await supabase.storage
      .from("story-media")
      .createSignedUrls(all, 60 * 60);
    if (data) {
      const byPath = new Map(data.map((d) => [d.path ?? "", d]));
      for (const p of imgPaths) {
        const d = byPath.get(p);
        if (d && !d.error && d.signedUrl) {
          result.imageUrl = d.signedUrl;
          const m = p.match(/\.(steamy|spicy|warm|soft)\.jpg$/);
          if (m) result.resolvedTier = m[1] as HeatTier["key"];
          break;
        }
      }
      for (const p of vidPaths) {
        const d = byPath.get(p);
        if (d && !d.error && d.signedUrl) {
          result.videoUrl = d.signedUrl;
          result.hasVideo = true;
          break;
        }
      }
    }
  } catch {
    /* ignore */
  }
  cache.set(key, result);
  return result;
}

export function InlineBeatMedia({
  storyId,
  beatId,
  clipKey,
  emotion,
  alt,
  affection = 0,
  mediaImagePath,
  mediaVideoPath,
  mediaAnimationPath,
  locked = false,
  unlocking = false,
  hasSubscription = false,
  userCredits,
  onUnlock,
  onPreviewUpgrade,
}: Props) {
  const tier = tierFor(affection);
  const cost = TIER_COST[tier.key] ?? 0;
  const isPremium = cost > 0; // spicy/steamy
  const [media, setMedia] = useState<{
    imageUrl?: string;
    hasVideo?: boolean;
    videoUrl?: string;
    resolvedTier?: HeatTier["key"];
  }>({});

  useEffect(() => {
    let cancelled = false;
    resolve(storyId, beatId, clipKey, emotion, tier, {
      image: mediaImagePath,
      video: mediaVideoPath,
      animation: mediaAnimationPath,
    })
      .then((r) => !cancelled && setMedia(r))
      .catch(() => !cancelled && setMedia({}));
    return () => {
      cancelled = true;
    };
  }, [storyId, beatId, clipKey, emotion, tier, mediaImagePath, mediaVideoPath, mediaAnimationPath]);


  // No clip + no image → render an empty premium teaser only for premium tiers.
  if (!clipKey && !media.imageUrl && !isPremium) return null;

  const showMedia = !isPremium || !locked;
  const canAfford = hasSubscription || (userCredits ?? 0) >= cost;

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-border bg-card/50 shadow-elevated">
      {/* Tier badge ribbon */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em]">
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${tier.gradient} px-2 py-0.5 ring-1 ${tier.ring}`}>
          <Flame className="h-3 w-3" />
          <span className="text-foreground/90">{tier.label}</span>
        </span>
        {media.resolvedTier && media.resolvedTier !== tier.key && (
          <span className="text-[9px] text-muted-foreground">
            (fallback: {media.resolvedTier})
          </span>
        )}
        {isPremium && (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-300">
            <Sparkles className="h-2.5 w-2.5" /> Premium 19+
          </span>
        )}
      </div>

      <div className="relative aspect-[16/10] w-full bg-background/40">
        {showMedia && media.videoUrl ? (
          <video
            src={media.videoUrl}
            poster={media.imageUrl}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : showMedia && media.imageUrl ? (
          <img
            src={media.imageUrl}
            alt={alt ?? ""}
            className="h-full w-full object-cover animate-ken-burns"
          />
        ) : !showMedia && media.imageUrl ? (
          // Locked: show a heavily blurred teaser so the user knows something exists.
          <img
            src={media.imageUrl}
            alt=""
            aria-hidden
            className="h-full w-full object-cover blur-2xl scale-110 brightness-50 select-none"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
              {clipKey ? (
                <Film className="h-8 w-8 text-primary/60" />
              ) : (
                <ImageIcon className="h-8 w-8 text-primary/60" />
              )}
              <div className="text-xs uppercase tracking-[0.3em] text-primary/70">
                {clipKey ? "8초 루프 클립" : "장면 이미지"}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground/80">
                {clipKey ?? `${storyId}/${beatId}`}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground/60">
                미디어가 업로드되면 자동 삽입돼요
              </div>
            </div>
          </div>
        )}

        {/* Paywall overlay */}
        {isPremium && locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/40 via-black/60 to-black/80 p-6 text-center backdrop-blur-sm">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-rose-200">
              <Lock className="h-3 w-3" /> {tier.label} · 잠금
            </div>
            <p className="max-w-xs text-sm text-white/90">
              호감도 {affection}에 어울리는 더 진한 장면이 준비돼 있어요.
              <br />
              <span className="text-white/60">{tier.preview}</span>
            </p>
            {hasSubscription ? (
              <Button
                size="sm"
                onClick={onUnlock}
                disabled={unlocking}
                className="rounded-full bg-gradient-aurora text-primary-foreground shadow-glow"
              >
                {unlocking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                구독자 무료 해금
              </Button>
            ) : canAfford ? (
              <Button
                size="sm"
                onClick={onUnlock}
                disabled={unlocking}
                className="rounded-full bg-gradient-aurora text-primary-foreground shadow-glow"
              >
                {unlocking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Lock className="mr-1.5 h-3.5 w-3.5" />}
                {cost} 크레딧으로 해금
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={onPreviewUpgrade}
                  className="rounded-full bg-rose-600 text-white shadow-glow hover:bg-rose-500"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  크레딧 충전 / 구독하기
                </Button>
                <span className="text-[10px] text-white/60">
                  필요: {cost} 크레딧 · 보유: {userCredits ?? 0}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-card/80 to-transparent" />
      </div>
    </figure>
  );
}
