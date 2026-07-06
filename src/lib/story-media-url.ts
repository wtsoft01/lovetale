export type StoryMediaSource =
  | { kind: "direct"; url: string }
  | { kind: "storage"; path: string }
  | null;

export function resolveStoryMediaSource(value?: string | null): StoryMediaSource {
  const src = String(value ?? "").trim();
  if (!src) return null;

  if (/^(data:|blob:)/i.test(src) || src.startsWith("/")) {
    return { kind: "direct", url: src };
  }

  const storageMatch = src.match(/\/storage\/v1\/object\/(?:public|sign)\/story-media\/([^?]+)/i);
  if (storageMatch?.[1]) {
    return { kind: "storage", path: decodeURIComponent(storageMatch[1]).replace(/^\/+/, "") };
  }

  if (/^https?:\/\//i.test(src)) {
    return { kind: "direct", url: src };
  }

  return { kind: "storage", path: src.replace(/^story-media\//, "").replace(/^\/+/, "") };
}
