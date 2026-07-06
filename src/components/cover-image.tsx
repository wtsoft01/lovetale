import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
    // Direct usable URLs
    if (/^(data:|blob:)/.test(src)) {
      setResolved(src);
      return;
    }
    // Extract path if it's a Supabase storage URL for story-media
    let path: string | null = null;
    const m = src.match(/\/storage\/v1\/object\/(?:public|sign)\/story-media\/(.+?)(?:\?|$)/);
    if (m) {
      path = decodeURIComponent(m[1]);
    } else if (/^https?:\/\//.test(src)) {
      // External URL — use as-is
      setResolved(src);
      return;
    } else {
      path = src;
    }

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
