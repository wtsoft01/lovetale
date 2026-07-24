export function stableChapterIdForStory(storyId: unknown, episodeNumber: unknown) {
  const safeStoryId = String(storyId || "story")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
  const safeEpisode = Math.max(1, Math.floor(Number(episodeNumber) || 1));
  return `ch_${safeStoryId}_ep_${safeEpisode}`;
}

export function normalizeChapterLocator(value: unknown) {
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Route params and URLSearchParams are usually decoded already.
  }
  return raw.trim();
}

export function episodeNumberFromChapterLocator(value: unknown) {
  const compact = normalizeChapterLocator(value).replace(/\s+/g, "").toLowerCase();
  if (!compact) return null;

  const match =
    compact.match(/^(\d+)$/) ??
    compact.match(/^(\d+)화$/) ??
    compact.match(/^ep(?:isode)?[-_]?(\d+)$/) ??
    compact.match(/^episode[-_]?(\d+)$/) ??
    compact.match(/^chapter[-_]?(\d+)$/) ??
    compact.match(/^ch[-_]?(\d+)$/) ??
    compact.match(/(?:^|[-_])ep[-_]?(\d+)$/);

  if (!match) return null;
  const episodeNumber = Number(match[1]);
  return Number.isFinite(episodeNumber) && episodeNumber > 0 ? Math.floor(episodeNumber) : null;
}

export function findChapterByLocator<
  T extends {
    id: string;
    title?: string;
    episodeNumber?: number;
  },
>(chapters: T[], locator: unknown) {
  const normalized = normalizeChapterLocator(locator);
  if (!normalized) return null;

  const direct = chapters.find((item) => item.id === normalized);
  if (direct) return direct;

  const byTitle = chapters.find((item) => normalizeChapterLocator(item.title) === normalized);
  if (byTitle) return byTitle;

  const episodeNumber = episodeNumberFromChapterLocator(normalized);
  if (!episodeNumber) return null;
  return chapters.find((item) => Math.floor(Number(item.episodeNumber) || 0) === episodeNumber) ?? null;
}

export function findChapterIndexByLocator<
  T extends {
    id: string;
    title?: string;
    episodeNumber?: number;
  },
>(chapters: T[], locator: unknown) {
  const chapter = findChapterByLocator(chapters, locator);
  return chapter ? chapters.findIndex((item) => item.id === chapter.id) : -1;
}
