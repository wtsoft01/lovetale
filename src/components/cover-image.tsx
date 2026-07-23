import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveStoryMediaSource } from "@/lib/story-media-url";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL_MS = 55 * 60 * 1000;

/**
 * Renders a story cover image. Accepts:
 * - full http(s) / data / blob URLs → used as-is
 * - storage paths (e.g. "seed/foo.jpg") → resolved via signed URL on story-media bucket
 * - or a Supabase public URL pointing at story-media → path extracted and signed
 */
export function CoverImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [resolved, setResolved] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setResolved(undefined);
      return;
    }
    const source = resolveStoryMediaSource(src);
    if (!source) {
      setResolved(undefined);
      return;
    }
    if (source.kind === "direct") {
      setResolved(source.url);
      return;
    }
    const path = source.path;

    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url);
      return;
    }

    supabase.storage
      .from("story-media")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        const signedUrl = data?.signedUrl;
        if (signedUrl) {
          signedUrlCache.set(path, { url: signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
        }
        if (!cancelled) setResolved(signedUrl);
      })
      .catch(() => !cancelled && setResolved(undefined));
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!resolved) {
    return <div className={className} aria-label={alt} />;
  }
  return <img src={resolved} alt={alt} className={className} loading="lazy" />;
}
