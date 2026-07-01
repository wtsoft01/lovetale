import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Emotion } from "@/lib/mock/story";

type Props = {
  storyId: string;
  beatId: string;
  clipKey?: string;
  emotion: Emotion;
  fallbackImage: string;
  alt?: string;
  tintClass: string;
};

type Resolved = { videoUrl?: string; imageUrl?: string };

// Path conventions inside the `story-media` bucket:
//   videos/{storyId}/{beatId}.mp4         ← most specific
//   videos/clips/{clipKey}.mp4            ← shared clip key across stories
//   videos/emotion/{emotion}.mp4          ← emotion fallback (6~8s loop)
// Same structure under `images/...` (jpg) for the still frame fallback.
function buildCandidates(
  storyId: string,
  beatId: string,
  clipKey: string | undefined,
  emotion: Emotion,
) {
  const v: string[] = [
    `videos/${storyId}/${beatId}.mp4`,
    ...(clipKey ? [`videos/clips/${clipKey}.mp4`] : []),
    `videos/emotion/${emotion}.mp4`,
  ];
  const i: string[] = [
    `images/${storyId}/${beatId}.jpg`,
    ...(clipKey ? [`images/clips/${clipKey}.jpg`] : []),
    `images/emotion/${emotion}.jpg`,
  ];
  return { v, i };
}

// In-memory cache so we don't re-sign on every beat re-render.
const cache = new Map<string, Resolved>();

async function resolve(
  storyId: string,
  beatId: string,
  clipKey: string | undefined,
  emotion: Emotion,
): Promise<Resolved> {
  const key = `${storyId}|${beatId}|${clipKey ?? ""}|${emotion}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { v, i } = buildCandidates(storyId, beatId, clipKey, emotion);
  const all = [...v, ...i];
  const { data, error } = await supabase.storage
    .from("story-media")
    .createSignedUrls(all, 60 * 60);

  const result: Resolved = {};
  if (!error && data) {
    // createSignedUrls returns one entry per path; entries for missing files
    // carry an `error` string. Pick the first hit in priority order.
    const byPath = new Map(data.map((d) => [d.path ?? "", d]));
    for (const p of v) {
      const d = byPath.get(p);
      if (d && !d.error && d.signedUrl) {
        result.videoUrl = d.signedUrl;
        break;
      }
    }
    for (const p of i) {
      const d = byPath.get(p);
      if (d && !d.error && d.signedUrl) {
        result.imageUrl = d.signedUrl;
        break;
      }
    }
  }
  cache.set(key, result);
  return result;
}

export function BeatBackdrop({
  storyId,
  beatId,
  clipKey,
  emotion,
  fallbackImage,
  alt,
  tintClass,
}: Props) {
  const [media, setMedia] = useState<Resolved>({});

  useEffect(() => {
    let cancelled = false;
    resolve(storyId, beatId, clipKey, emotion)
      .then((r) => {
        if (!cancelled) setMedia(r);
      })
      .catch(() => {
        if (!cancelled) setMedia({});
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, beatId, clipKey, emotion]);

  return (
    <div className="absolute inset-0 animate-fade-in">
      {media.videoUrl ? (
        <video
          key={media.videoUrl}
          src={media.videoUrl}
          poster={media.imageUrl ?? fallbackImage}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover opacity-95"
        />
      ) : (
        <img
          src={media.imageUrl ?? fallbackImage}
          alt={alt ?? ""}
          className="h-full w-full object-cover object-top opacity-95 animate-ken-burns"
        />
      )}
      <div
        className={`absolute inset-0 bg-gradient-to-t ${tintClass} transition-colors duration-700`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-background/50" />
    </div>
  );
}
