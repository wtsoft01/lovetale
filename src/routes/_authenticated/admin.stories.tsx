import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ComponentPropsWithoutRef } from "react";
import {
  Loader2,
  Search,
  Eye,
  EyeOff,
  Globe,
  ExternalLink,
  CheckSquare,
  Square,
  UploadCloud,
  Image as ImageIcon,
  Layers3,
  UserCircle2,
  FileText,
  Camera,
  Star,
  Sparkles,
  Flame,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  listAdminStories,
  bulkUpdateAdminStories,
  bulkDeleteAdminStories,
  getAdminStory,
  quickPatchStory,
  updateAdminStory,
  setStoryHomePlacement,
  getStoryHomePlacement,
} from "@/lib/admin-stories.functions";
import {
  CHAPTER_SEPARATOR,
  createStoryChapterText,
  getStoryChapterText,
  getStoryCompose,
  saveStoryChapterEditor,
  saveStoryChapterText,
  type AssetSlot,
  type AssetTier,
  type ChapterConfig,
} from "@/lib/admin-stories-compose.functions";
import {
  generateStoryAsset,
  suggestStoryAssetSlots,
  translateStoryChapterToVietnamese,
} from "@/lib/admin-story-ai.functions";
import { listMediaAssets, registerMediaAsset, type MediaAssetRow } from "@/lib/admin-media.functions";
import { ensureStoryMediaBucket } from "@/lib/storage.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { UnifiedStoryReader } from "@/components/unified-story-reader";

export const Route = createFileRoute("/_authenticated/admin/stories")({
  head: () => ({ meta: [{ title: "콘텐츠 관리 | Lovetale Studio" }] }),
  component: StoriesPage,
});

const CONTENT_TYPE_LABEL: Record<string, string> = {
  web_novel: "Web Novel",
  romance_sim: "Romance Sim",
  webtoon: "Webtoon",
  short_story: "Short Story",
  other: "Other",
};

function contentTypeLabel(value: string) {
  return CONTENT_TYPE_LABEL[value] ?? "Other";
}

type PlacementSlot = "hero" | "trending" | "new" | "all";
type StoryChapterSummary = {
  id: string;
  title: string;
  episodeNumber: number;
  summary: string;
  isFree: boolean;
  priceCredits: number;
  bodyChars: number;
  assetSlotsCount: number;
};

function StoriesPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const qc = useQueryClient();
  const fetchStories = useServerFn(listAdminStories);
  const bulk = useServerFn(bulkUpdateAdminStories);
  const deleteStories = useServerFn(bulkDeleteAdminStories);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published">("all");
  const [contentType, setContentType] = useState<"all" | "web_novel" | "romance_sim" | "webtoon" | "short_story" | "other">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [placementFor, setPlacementFor] = useState<{ id: string; title: string } | null>(null);
  const [workspaceFor, setWorkspaceFor] = useState<{
    id: string;
    title: string;
    tab: "info" | "preview" | "assets" | "chapter";
    chapters: StoryChapterSummary[];
    chapterId?: string;
  } | null>(null);
  const [deleteFor, setDeleteFor] = useState<{ ids: string[]; title: string } | null>(null);

  const query = useQuery({
    queryKey: ["admin_stories", q, status, contentType],
    queryFn: () => fetchStories({ data: { q, status, contentType } }),
  });

  const bulkMut = useMutation({
    mutationFn: (action: "publish" | "unlist" | "private") =>
      bulk({ data: { ids: [...selected], action } }),
    onSuccess: (res, action) => {
      toast.success(`${res.updated} items updated`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (ids: string[]) => deleteStories({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`${res.deleted} items deleted`);
      setSelected(new Set());
      setDeleteFor(null);
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (pathname !== "/admin/stories") return <Outlet />;

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }
  function toggleChapters(id: string) {
    const next = new Set(expandedStories);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedStories(next);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Content CMS</span>
          <h1 className="mt-1 font-display text-3xl font-semibold">콘텐츠 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            표지, 제목, 가격, 노출 위치를 한 화면에서 관리하고 회차별 본문과 에셋까지 빠르게 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/import"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <UploadCloud className="h-4 w-4" /> 새 콘텐츠 등록
          </Link>
          <Link
            to="/admin/media"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:border-primary/40"
          >
            <ImageIcon className="h-4 w-4" /> 미디어 라이브러리
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목으로 검색"
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border border-border bg-background p-0.5 text-xs">
          {(['all', 'draft', 'published'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? '전체' : s === 'draft' ? '초안' : '게시'}
            </button>
          ))}
        </div>
        <select
          value={contentType}
          onChange={(e) => setContentType(e.target.value as any)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
        >
          <option value="all">전체 유형</option>
          <option value="web_novel">웹소설</option>
          <option value="romance_sim">로맨스 시뮬레이션</option>
          <option value="webtoon">웹툰</option>
          <option value="short_story">단편</option>
          <option value="other">기타</option>
        </select>
        {selected.size > 0 && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteFor({ ids: [...selected], title: `선택한 콘텐츠 ${selected.size}개` })}
          >
            선택 삭제
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="mr-auto">
            <strong>{selected.size}</strong>개 선택됨
          </span>
          <Button size="sm" variant="outline" onClick={() => bulkMut.mutate("publish")}>
            <Globe className="mr-1 h-3 w-3" /> 게시
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkMut.mutate("unlist")}>
            <EyeOff className="mr-1 h-3 w-3" /> 비노출
          </Button>
          <Button size="sm" variant="ghost" onClick={() => bulkMut.mutate("private")}>
            비공개
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteFor({ ids: [...selected], title: `선택한 콘텐츠 ${selected.size}개` })}
          >
            삭제
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {query.isLoading ? (
          <div className="p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-3">
                  <button onClick={toggleAll} className="text-foreground/70">
                    {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-3">표지 / 제목</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">회차 / 작업</th>
                <th className="px-4 py-3">첫 회차 무료</th>
                <th className="px-4 py-3">가격</th>
                <th className="px-4 py-3">노출</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((s) => (
                <StoryRow
                  key={s.id}
                  story={s}
                  checked={selected.has(s.id)}
                  expanded={expandedStories.has(s.id)}
                  onToggle={() => toggle(s.id)}
                  onToggleChapters={() => toggleChapters(s.id)}
                  onPlacement={() => setPlacementFor({ id: s.id, title: s.title })}
                  onPreview={() => setWorkspaceFor({ id: s.id, title: s.title, tab: "preview", chapters: s.chapters ?? [] })}
                  onEdit={() => setWorkspaceFor({ id: s.id, title: s.title, tab: "info", chapters: s.chapters ?? [] })}
                  onAssetEdit={() => setWorkspaceFor({ id: s.id, title: s.title, tab: "assets", chapters: s.chapters ?? [] })}
                  onChapterEdit={(chapterId) =>
                    setWorkspaceFor({ id: s.id, title: s.title, tab: "chapter", chapterId, chapters: s.chapters ?? [] })
                  }
                  onDelete={() => setDeleteFor({ ids: [s.id], title: s.title })}
                />
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    등록된 콘텐츠가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {placementFor && (
        <PlacementDialog
          storyId={placementFor.id}
          title={placementFor.title}
          onClose={() => setPlacementFor(null)}
        />
      )}
      {workspaceFor && (
        <StoryWorkspaceDialog
          storyId={workspaceFor.id}
          title={workspaceFor.title}
          initialTab={workspaceFor.tab}
          selectedChapterId={workspaceFor.chapterId}
          chapters={workspaceFor.chapters}
          onClose={() => setWorkspaceFor(null)}
        />
      )}
      {deleteFor && (
        <AlertDialog open onOpenChange={(open) => !open && setDeleteFor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>콘텐츠 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteFor.title}을 삭제합니다. 선택한 콘텐츠는 복구할 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMut.isPending}>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMut.mutate(deleteFor.ids)}
                disabled={deleteMut.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMut.isPending ? '삭제 중...' : '삭제'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function useSignedCover(path?: string | null) {
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

function StoryRow({
  story,
  checked,
  expanded,
  onToggle,
  onToggleChapters,
  onPlacement,
  onPreview,
  onEdit,
  onAssetEdit,
  onChapterEdit,
  onDelete,
}: {
  story: any;
  checked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onToggleChapters: () => void;
  onPlacement: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onAssetEdit: () => void;
  onChapterEdit: (chapterId: string) => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const patch = useServerFn(quickPatchStory);
  const patchMut = useMutation({
    mutationFn: (input: any) => patch({ data: { id: story.id, ...input } }),
    onSuccess: () => {
      toast.success('콘텐츠 정보가 저장되었습니다.');
      qc.invalidateQueries({ queryKey: ['admin_stories'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cover = useSignedCover(story.cover_url);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [price, setPrice] = useState(story.price_credits as number);
  const isPublished = story.is_public && story.is_listed;
  const firstFree = (story.free_chapters_count ?? 0) > 0;
  const chapters = (Array.isArray(story.chapters) ? story.chapters : []) as StoryChapterSummary[];

  async function uploadCover(file: File) {
    try {
      await ensureStoryMediaBucket();
      const ext = file.name.split('.').pop() || 'bin';
      const key = 'covers/' + story.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      const { error } = await supabase.storage
        .from('story-media')
        .upload(key, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      patchMut.mutate({ cover_url: key });
    } catch (e: any) {
      toast.error(e?.message ?? '표지 업로드에 실패했습니다.');
    }
  }

  return (
    <>
    <tr className="hover:bg-surface-elevated/30">
      <td className="px-3 py-3 align-top">
        <button onClick={onToggle}>
          {checked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
        </button>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-start gap-3">
          <div className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
            {cover ? (
              <img src={cover} alt={story.title} className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center">
                <ImageIcon className="size-4 text-muted-foreground/50" />
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 hidden items-center justify-center bg-black/60 text-[10px] text-white group-hover:flex"
            >
              <Camera className="mr-1 size-3" /> 표지 변경
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadCover(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onEdit}
              className="group inline-flex max-w-full items-center gap-1 text-left font-medium hover:text-primary"
              title="콘텐츠 제목 수정"
            >
              <span className="truncate">{story.title}</span>
              <Pencil className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
            <div className="line-clamp-1 text-xs text-muted-foreground">{story.logline ?? ''}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-xs">{contentTypeLabel(story.content_type)}</td>
      <td className="px-4 py-3 align-top text-xs">
        <button
          type="button"
          onClick={onToggleChapters}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-muted"
        >
          <Layers3 className="size-3 text-muted-foreground" />
          {expanded ? '접기' : '펼치기'} · 회차 {story.chapters_count || 0}개
        </button>
        <div className="text-[10px] text-muted-foreground">
          본문 {(story.body_chars ?? 0).toLocaleString()}자 · 에셋 {story.asset_slots_count ?? 0}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground inline-flex items-center gap-1">
          <UserCircle2 className="size-3" /> 캐릭터 {story.characters_count}
        </div>
      </td>
      <td className="px-4 py-3 align-top text-xs">
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={firstFree}
            onChange={(e) => patchMut.mutate({ first_chapter_is_free: e.target.checked })}
          />
          무료
        </label>
      </td>
      <td className="px-4 py-3 align-top text-xs">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
            onBlur={() => {
              if (price !== story.price_credits) patchMut.mutate({ price_credits: price });
            }}
            className="h-7 w-20 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">cr</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <Switch
            checked={isPublished}
            onCheckedChange={(checked) => {
              patchMut.mutate({ is_public: checked, is_listed: checked });
              if (checked) onPlacement();
            }}
          />
          <button
            type="button"
            onClick={onPlacement}
            disabled={!isPublished}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]',
              isPublished
                ? 'border-primary/40 text-primary hover:bg-primary/10'
                : 'border-border text-muted-foreground opacity-60 cursor-not-allowed',
            )}
          >
            <Sparkles className="size-3" /> 노출 설정
          </button>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-right">
        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3 w-3" /> 미리보기
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            편집 <ExternalLink className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onAssetEdit}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            에셋 편집 <FileText className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
    {expanded && (
      <tr className="bg-surface-elevated/20">
        <td />
        <td colSpan={7} className="px-4 pb-4 pt-1">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                등록된 회차
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" asChild>
                  <Link to={`/admin/stories/${story.id}/compose?mode=append_episode&newChapter=1`}>
                    <Plus className="mr-1 size-3" /> 회차 추가
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={onEdit}>
                  콘텐츠 수정
                </Button>
              </div>
            </div>
            {chapters.length ? (
              <div className="divide-y divide-border/60">
                {chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className="grid w-full gap-3 px-2 py-3 text-left hover:bg-muted/40 md:grid-cols-[8rem_minmax(0,1fr)_9rem]"
                  >
                    <div className="text-xs font-medium text-primary">{chapter.episodeNumber}화</div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{chapter.title || '제목 없음'}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {chapter.summary || '회차 요약이 아직 입력되지 않았습니다.'}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span>{chapter.bodyChars.toLocaleString()}자</span>
                        <span>·</span>
                        <span>에셋 {chapter.assetSlotsCount}</span>
                        <span>·</span>
                        <span>{chapter.isFree ? '무료' : String(chapter.priceCredits) + ' cr'}</span>
                      </div>
                    </div>
                    <div className="flex items-start justify-start md:justify-end">
                      <button
                        type="button"
                        onClick={() => onChapterEdit(chapter.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary hover:border-primary/50 hover:bg-primary/5"
                      >
                        <Pencil className="size-3" /> 회차 수정
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                등록된 회차가 없습니다. 상단의 회차 추가 버튼으로 새 회차를 만들어보세요.
              </div>
            )}
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

function StoryWorkspaceDialog({
  storyId,
  title,
  initialTab,
  selectedChapterId,
  chapters,
  onClose,
}: {
  storyId: string;
  title: string;
  initialTab: 'info' | 'preview' | 'assets' | 'chapter';
  selectedChapterId?: string;
  chapters: StoryChapterSummary[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchCompose = useServerFn(getStoryCompose);
  const fetchChapterText = useServerFn(getStoryChapterText);
  const createChapterText = useServerFn(createStoryChapterText);
  const saveChapterText = useServerFn(saveStoryChapterText);
  const saveChapterEditor = useServerFn(saveStoryChapterEditor);
  const suggestSlots = useServerFn(suggestStoryAssetSlots);
  const translateChapter = useServerFn(translateStoryChapterToVietnamese);
  const generateAsset = useServerFn(generateStoryAsset);
  const fetchStory = useServerFn(getAdminStory);
  const saveStory = useServerFn(updateAdminStory);
  const [tab, setTab] = useState(initialTab);
  const [activeChapterId, setActiveChapterId] = useState(selectedChapterId ?? "");
  const [saving, setSaving] = useState(false);
  const [chapterSaving, setChapterSaving] = useState(false);
  const [chapterCreating, setChapterCreating] = useState(false);
  const [assetSaving, setAssetSaving] = useState(false);
  const [assetSuggesting, setAssetSuggesting] = useState(false);
  const [assetDraft, setAssetDraft] = useState<ChapterConfig | null>(null);
  const [previewAffection, setPreviewAffection] = useState(55);
  const [localChapters, setLocalChapters] = useState<StoryChapterSummary[]>(chapters);
  const [chapterDraft, setChapterDraft] = useState({
    title: "",
    episodeNumber: 1,
    isFree: true,
    priceCredits: 0,
    summary: "",
    body: "",
  });
  const [draft, setDraft] = useState({
    title: '',
    logline: '',
    cover_url: '',
    price_credits: 0,
    is_public: false,
    is_listed: false,
    audience: 'all',
    max_heat: 'warm',
    tags: '',
  });

  const storyQ = useQuery({
    queryKey: ['admin_story_detail', storyId],
    queryFn: () => fetchStory({ data: { id: storyId } }),
  });
  const composeQ = useQuery({
    queryKey: ['admin_story_workspace', storyId],
    queryFn: () => fetchCompose({ data: { id: storyId } }),
    enabled: tab === 'preview' || tab === 'assets',
  });
  const chapterQ = useQuery({
    queryKey: ['admin_story_chapter_text', storyId, activeChapterId],
    queryFn: () => fetchChapterText({ data: { id: storyId, chapterId: activeChapterId as string } }),
    enabled: tab === 'chapter' && !!activeChapterId,
  });
  const composeChapters = composeQ.data?.chapters ?? [];
  const assetSourceChapter =
    composeChapters.find((chapter) => chapter.id === activeChapterId) ?? composeChapters[0] ?? null;

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setLocalChapters(chapters);
    setActiveChapterId((current) => selectedChapterId ?? current ?? chapters[0]?.id ?? "");
  }, [selectedChapterId, storyId, chapters]);

  useEffect(() => {
    if (!activeChapterId && tab === 'chapter' && chapters[0]?.id) {
      setActiveChapterId(chapters[0].id);
    }
  }, [activeChapterId, chapters, tab]);

  useEffect(() => {
    if (tab !== 'chapter') return;
    const data = chapterQ.data?.chapter;
    if (!data) return;
    setChapterDraft({
      title: data.title,
      episodeNumber: data.episodeNumber,
      isFree: data.isFree,
      priceCredits: data.priceCredits,
      summary: data.summary,
      body: data.body,
    });
  }, [chapterQ.data, tab]);

  useEffect(() => {
    if (tab !== 'assets' || !assetSourceChapter) return;
    setActiveChapterId(assetSourceChapter.id);
    setAssetDraft({
      ...assetSourceChapter,
      assetSlots: Array.isArray(assetSourceChapter.assetSlots) ? assetSourceChapter.assetSlots : [],
    });
  }, [
    tab,
    storyId,
    assetSourceChapter?.id,
    assetSourceChapter?.body,
    assetSourceChapter?.assetSlots.length,
  ]);

  useEffect(() => {
    const row = storyQ.data;
    if (!row) return;
    setDraft({
      title: String(row.title ?? ''),
      logline: String(row.logline ?? ''),
      cover_url: String(row.cover_url ?? ''),
      price_credits: Number(row.price_credits ?? 0),
      is_public: Boolean(row.is_public),
      is_listed: Boolean(row.is_listed),
      audience: String(row.audience ?? 'all'),
      max_heat: String(row.max_heat ?? 'warm'),
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
    });
  }, [storyQ.data]);

  async function saveInfo() {
    setSaving(true);
    try {
      await saveStory({
        data: {
          id: storyId,
          title: draft.title.trim(),
          logline: draft.logline.trim() || null,
          cover_url: draft.cover_url.trim() || null,
          price_credits: draft.price_credits,
          is_public: draft.is_public,
          is_listed: draft.is_listed,
          audience: draft.audience,
          max_heat: draft.max_heat,
          tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        },
      });
       toast.success('콘텐츠 정보가 저장되었습니다.');
      qc.invalidateQueries({ queryKey: ['admin_stories'] });
      qc.invalidateQueries({ queryKey: ['admin_story_detail', storyId] });
      qc.invalidateQueries({ queryKey: ['admin_story_workspace', storyId] });
    } catch (e: any) {
      toast.error(e?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function saveChapter() {
    const current = activeChapterId;
    if (!current) return;
    setChapterSaving(true);
    try {
      await saveChapterText({
        data: {
          id: storyId,
          chapter: {
            id: current,
            title: chapterDraft.title.trim(),
            episodeNumber: chapterDraft.episodeNumber,
            isFree: chapterDraft.isFree,
            priceCredits: chapterDraft.priceCredits,
            summary: chapterDraft.summary,
            body: chapterDraft.body,
          },
        },
      });
      toast.success('회차가 저장되었습니다.');
      setAssetDraft((prev) =>
        prev && prev.id === current
          ? {
              ...prev,
              title: chapterDraft.title.trim(),
              episodeNumber: chapterDraft.episodeNumber,
              isFree: chapterDraft.isFree,
              priceCredits: chapterDraft.priceCredits,
              summary: chapterDraft.summary,
              body: chapterDraft.body,
              assetSlots: normalizeAssetSlots(prev.assetSlots, chapterDraft.body.length),
            }
          : prev,
      );
      qc.invalidateQueries({ queryKey: ['admin_stories'] });
      qc.invalidateQueries({ queryKey: ['admin_story_workspace', storyId] });
      qc.invalidateQueries({ queryKey: ['admin_story_chapter_text', storyId, activeChapterId] });
    } catch (e: any) {
      toast.error(e?.message ?? '회차 저장에 실패했습니다.');
    } finally {
      setChapterSaving(false);
    }
  }

  async function createChapter() {
    setChapterCreating(true);
    try {
      const res = await createChapterText({ data: { id: storyId } });
      const nextChapter = res.chapter;
      setLocalChapters((prev) => [...prev.filter((item) => item.id !== nextChapter.id), nextChapter]);
      setActiveChapterId(nextChapter.id);
      setTab('chapter');
      toast.success('새 회차가 생성되었습니다.');
      qc.invalidateQueries({ queryKey: ['admin_stories'] });
      qc.invalidateQueries({ queryKey: ['admin_story_workspace', storyId] });
      qc.invalidateQueries({ queryKey: ['admin_story_chapter_text', storyId, nextChapter.id] });
    } catch (e: any) {
      toast.error(e?.message ?? '회차 생성에 실패했습니다.');
    } finally {
      setChapterCreating(false);
    }
  }

  async function saveAssets(nextDraft?: ChapterConfig) {
    const draftToSave = nextDraft ?? assetDraft;
    if (!draftToSave) return;
    const normalizedDraft = {
      ...draftToSave,
      body: String(draftToSave.body ?? ""),
      assetSlots: normalizeAssetSlots(draftToSave.assetSlots, String(draftToSave.body ?? "").length),
    };
    setAssetSaving(true);
    try {
      await saveChapterEditor({
        data: {
          id: storyId,
          chapter: normalizedDraft,
        },
      });
      setAssetDraft(normalizedDraft);
      toast.success('에셋 구성이 저장되었습니다.');
      setChapterDraft((prev) =>
        activeChapterId === normalizedDraft.id
          ? {
              ...prev,
              title: normalizedDraft.title,
              episodeNumber: normalizedDraft.episodeNumber,
              isFree: normalizedDraft.isFree,
              priceCredits: normalizedDraft.priceCredits,
              summary: normalizedDraft.summary,
              body: normalizedDraft.body,
            }
          : prev,
      );
      qc.invalidateQueries({ queryKey: ['admin_stories'] });
      qc.invalidateQueries({ queryKey: ['admin_story_workspace', storyId] });
      qc.invalidateQueries({ queryKey: ['admin_story_chapter_text', storyId, normalizedDraft.id] });
    } catch (e: any) {
      toast.error(e?.message ?? '에셋 저장에 실패했습니다.');
    } finally {
      setAssetSaving(false);
    }
  }

  async function suggestAssetsForChapter() {
    if (!assetDraft) return;
    setAssetSuggesting(true);
    try {
      const res = await suggestSlots({ data: { storyId, chapterId: assetDraft.id, desiredCount: 5 } });
      const incoming = (res.slots ?? []).slice(0, 5).map((slot) => ({
        ...slot,
        id: makeAssetSlotId(),
        offset: clampAssetOffset(slot.offset, assetDraft.body.length),
        media_url: null,
        media_asset_id: null,
        media_type: null,
        source: 'ai' as const,
      }));
      setAssetDraft((prev) =>
        prev
          ? {
              ...prev,
              assetSlots: normalizeAssetSlots([...prev.assetSlots, ...incoming], prev.body.length),
            }
          : prev,
      );
      toast.success('AI 추천 위치가 추가되었습니다.' + (res.providerLabel ? ' (' + res.providerLabel + ')' : ''));
    } catch (e: any) {
      toast.error(e?.message ?? 'AI 추천에 실패했습니다.');
    } finally {
      setAssetSuggesting(false);
    }
  }

  const chapterList = localChapters;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-[96vw] grid-rows-none flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3 pr-8">
          <div>
            <DialogTitle>콘텐츠 작업공간 - {title}</DialogTitle>
            <div className="text-xs text-muted-foreground">정보수정, 회차현황, 에셋편집, 프리뷰를 한 화면에서 빠르게 확인합니다.</div>
          </div>
            <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as any)} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-4 pt-3">
            <TabsList className="h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="info">정보수정</TabsTrigger>
              <TabsTrigger value="assets">에셋편집</TabsTrigger>
              <TabsTrigger value="preview">프리뷰</TabsTrigger>
              <TabsTrigger value="chapter">회차편집</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="info" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4">
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold">기본 정보</div>
                  <div className="text-xs text-muted-foreground">제목, 줄거리, 표지, 노출 상태를 한 번에 수정합니다.</div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">콘텐츠 제목</label>
                    <Input className="mt-1" value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="콘텐츠 제목" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">줄거리</label>
                    <Textarea className="mt-1 min-h-24" value={draft.logline} onChange={(e) => setDraft((prev) => ({ ...prev, logline: e.target.value }))} placeholder="간단한 줄거리를 입력하세요." />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">표지 이미지 URL</label>
                    <Input className="mt-1" value={draft.cover_url} onChange={(e) => setDraft((prev) => ({ ...prev, cover_url: e.target.value }))} placeholder="표지 이미지 URL" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">대상 독자</label>
                      <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={draft.audience} onChange={(e) => setDraft((prev) => ({ ...prev, audience: e.target.value }))}>
                        <option value="all">전체</option>
                        <option value="female">여성향</option>
                        <option value="male">남성향</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">최대 수위</label>
                      <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={draft.max_heat} onChange={(e) => setDraft((prev) => ({ ...prev, max_heat: e.target.value }))}>
                        <option value="soft">Soft</option>
                        <option value="warm">Warm</option>
                        <option value="spicy">Spicy</option>
                        <option value="steamy">Steamy</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">태그</label>
                    <Input className="mt-1" value={draft.tags} onChange={(e) => setDraft((prev) => ({ ...prev, tags: e.target.value }))} placeholder="태그1, 태그2, 태그3" />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold">노출 및 가격</div>
                  <div className="text-xs text-muted-foreground">판매 가격과 공개 상태를 관리합니다.</div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">콘텐츠 가격</label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="max-w-40"
                        value={draft.price_credits}
                        onChange={(e) => setDraft((prev) => ({ ...prev, price_credits: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                      <span className="text-xs text-muted-foreground">크레딧</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                      <span>공개</span>
                      <Switch checked={draft.is_public} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_public: checked }))} />
                    </label>
                    <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                      <span>목록 노출</span>
                      <Switch checked={draft.is_listed} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_listed: checked }))} />
                    </label>
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTab('assets')}>에셋편집으로 이동</Button>
              <Button onClick={saveInfo} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="chapter" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4 pb-24">
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">회차 편집</div>
                    <div className="text-xs text-muted-foreground">회차를 선택하고 제목, 요약, 본문을 수정합니다.</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={createChapter} disabled={chapterCreating}>
                    {chapterCreating ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    회차 추가
                  </Button>
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {chapterList.map((chapter) => {
                    const active = chapter.id === activeChapterId;
                    return (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => setActiveChapterId(chapter.id)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm transition",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40",
                        )}
                      >
                        <div className="font-medium">{chapter.episodeNumber}화</div>
                        <div className="max-w-40 truncate text-xs text-muted-foreground">{chapter.title || "제목 없음"}</div>
                      </button>
                    );
                  })}
                </div>
                {!activeChapterId ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    편집할 회차를 선택하세요.
                  </div>
                ) : chapterQ.isLoading ? (
                  <div className="grid min-h-40 place-items-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : chapterQ.error || !chapterQ.data ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    회차 정보를 불러오지 못했습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <label className="text-sm font-medium text-muted-foreground">회차 번호</label>
                      <Input
                        type="number"
                        min={1}
                        value={chapterDraft.episodeNumber}
                        onChange={(e) => setChapterDraft((prev) => ({ ...prev, episodeNumber: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <label className="text-sm font-medium text-muted-foreground">회차 제목</label>
                      <Input
                        value={chapterDraft.title}
                        onChange={(e) => setChapterDraft((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="회차 제목"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <label className="text-sm font-medium text-muted-foreground">회차 요약</label>
                      <Textarea
                        value={chapterDraft.summary}
                        onChange={(e) => setChapterDraft((prev) => ({ ...prev, summary: e.target.value }))}
                        className="min-h-24"
                        placeholder="회차 요약을 입력하세요."
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <div className="text-sm font-medium text-muted-foreground">가격</div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={chapterDraft.isFree}
                            onChange={(e) => setChapterDraft((prev) => ({ ...prev, isFree: e.target.checked }))}
                            className="size-4 accent-primary"
                          />
                          무료 회차
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={chapterDraft.priceCredits}
                          onChange={(e) => setChapterDraft((prev) => ({ ...prev, priceCredits: Math.max(0, Number(e.target.value) || 0) }))}
                          className="w-32"
                        />
                        <span className="text-xs text-muted-foreground">크레딧</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div className="text-sm font-medium text-muted-foreground">본문</div>
                        <span className="text-xs text-muted-foreground">{chapterDraft.body.length.toLocaleString()}자</span>
                      </div>
                      <Textarea
                        value={chapterDraft.body}
                        onChange={(e) => setChapterDraft((prev) => ({ ...prev, body: e.target.value }))}
                        className="min-h-[42vh] resize-y whitespace-pre-wrap font-mono text-sm leading-7"
                        maxLength={100000}
                        placeholder="회차 본문을 입력하세요."
                      />
                    </div>
                    <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
                      <Button onClick={saveChapter} disabled={chapterSaving}>
                        {chapterSaving ? '저장 중...' : '회차 저장'}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="preview" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
            {composeQ.isLoading ? (
              <div className="grid min-h-[50vh] place-items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : composeQ.error || !composeQ.data ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                미리보기를 불러오지 못했습니다.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">회원 화면 프리뷰</div>
                      <div className="text-xs text-muted-foreground">현재 호감도에 맞는 에셋 1개만 본문 사이에 표시됩니다.</div>
                    </div>
                    <div className="flex min-w-[260px] items-center gap-3">
                      <label className="text-xs text-muted-foreground">호감도</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={previewAffection}
                        onChange={(event) => setPreviewAffection(Number(event.target.value))}
                        className="flex-1"
                      />
                      <span className="w-12 rounded-full bg-primary/10 px-2 py-1 text-center text-xs font-semibold text-primary">
                        {previewAffection}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[0, 30, 55, 75, 100].map((value) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={previewAffection === value ? "default" : "outline"}
                        onClick={() => setPreviewAffection(value)}
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-background">
                  <UnifiedStoryReader
                    storyId={composeQ.data.id}
                    title={composeQ.data.title}
                    cover={composeQ.data.cover_url}
                    bodyText={composeQ.data.chapters.map((chapter) => chapter.body).join(CHAPTER_SEPARATOR) || ''}
                    assetSlots={composeQ.data.chapters.flatMap((chapter) => chapter.assetSlots)}
                    characterName={composeQ.data.character_card?.name ?? '캐릭터'}
                    previewMode
                    previewAffection={previewAffection}
                  />
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="assets" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
            {composeQ.isLoading ? (
              <div className="grid min-h-[50vh] place-items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : composeQ.error || !composeQ.data ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                에셋편집 정보를 불러오지 못했습니다.
              </div>
            ) : (
              <InlineAssetEditor
                storyId={storyId}
                chapters={composeChapters}
                chapter={assetDraft}
                activeChapterId={activeChapterId}
                onSelectChapter={setActiveChapterId}
                onChange={(next) => {
                  setAssetDraft(next);
                  if (next && next.id === activeChapterId) {
                    setChapterDraft((prev) => ({
                      ...prev,
                      title: next.title,
                      episodeNumber: next.episodeNumber,
                      isFree: next.isFree,
                      priceCredits: next.priceCredits,
                      summary: next.summary,
                      body: next.body,
                    }));
                  }
                }}
                onSave={saveAssets}
                saving={assetSaving}
                onSuggest={suggestAssetsForChapter}
                suggesting={assetSuggesting}
                onTranslate={(chapterId) => translateChapter({ data: { storyId, chapterId } })}
                onGenerateAsset={(input) => generateAsset({ data: { storyId, ...input } })}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const ASSET_TIERS: Array<{ key: AssetTier; label: string; hint: string }> = [
  { key: "soft", label: "1단계", hint: "가벼운 장면" },
  { key: "warm", label: "2단계", hint: "관계가 가까워진 장면" },
  { key: "spicy", label: "3단계", hint: "감정이 깊어지는 장면" },
  { key: "steamy", label: "4단계", hint: "강한 몰입 장면" },
  { key: "premium", label: "5단계", hint: "특수 프리미엄 장면" },
];

type TextSegment = {
  key: string;
  index: number;
  text: string;
  start: number;
  end: number;
};

type AssetLibraryEntry = {
  id: string;
  media_url: string | null;
  media_asset_id: string | null;
  media_type: "image" | "video" | null;
  scene_description: string;
  caption: string;
  source: string;
  chapterTitle: string;
  heat_tier?: AssetTier;
};

type AssetBodyTextStyle = {
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

const DEFAULT_ASSET_BODY_TEXT_STYLE: AssetBodyTextStyle = {
  fontSize: 15,
  color: "#f8fafc",
  bold: false,
  italic: false,
};

const ASSET_UPLOAD_LIMITS = {
  image: 20 * 1024 * 1024,
  video: 500 * 1024 * 1024,
} as const;

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function validateStoryAssetFile(file: File) {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return "이미지 또는 영상 파일만 업로드할 수 있습니다.";
  const limit = ASSET_UPLOAD_LIMITS[kind];
  if (file.size > limit) return `${kind === "video" ? "영상" : "이미지"} 파일은 최대 ${formatFileSize(limit)}까지 업로드할 수 있습니다.`;
  return null;
}

function makeAssetSlotId() {
  return 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function clampAssetOffset(offset: number, bodyLength: number) {
  return Math.max(0, Math.min(Math.floor(Number(offset) || 0), bodyLength));
}

function normalizeAssetSlots(slots: AssetSlot[], bodyLength: number) {
  return [...slots]
    .map((slot) => ({
      ...slot,
      id: slot.id || makeAssetSlotId(),
      offset: clampAssetOffset(slot.offset, bodyLength),
      segment_index:
        typeof slot.segment_index === "number" && Number.isFinite(slot.segment_index)
          ? Math.max(0, Math.floor(slot.segment_index))
          : null,
      scene_description: slot.scene_description ?? "",
      caption: slot.caption ?? "",
      source: slot.source ?? "manual",
    }))
    .sort((a, b) => a.offset - b.offset);
}

const MIN_NATURAL_SEGMENT_CHARS = 260;
const TARGET_LONG_SEGMENT_CHARS = 2200;
const MAX_LONG_SEGMENT_CHARS = 3600;

function splitBodySegments(body: string): TextSegment[] {
  const text = body || "";
  if (!text.trim()) return [{ key: "empty", index: 0, text: "", start: 0, end: 0 }];
  const naturalBlocks = mergeShortNaturalBlocks(splitNaturalBlocks(text), text);
  const pieces = naturalBlocks.flatMap((block) => splitOversizedBlock(block, text.length));
  const segments = pieces
    .map((piece, index) => ({
      key: `${index}-${piece.start}`,
      index,
      text: piece.text,
      start: piece.start,
      end: piece.end,
    }))
    .filter((segment) => segment.text.trim());

  return segments.length ? segments : [{ key: "empty", index: 0, text: "", start: 0, end: 0 }];
}

function splitNaturalBlocks(text: string) {
  const blocks: Array<{ text: string; start: number; end: number; hardBreak: boolean }> = [];
  const blockPattern = /[^\n](?:[\s\S]*?)(?=\n{2,}|\n\s*(?:[-*_]){3,}\s*\n|$)/g;

  for (const match of text.matchAll(blockPattern)) {
    const raw = match[0] ?? "";
    const rawStart = match.index ?? 0;
    const normalized = trimBlockForDisplay(raw, rawStart);
    if (!normalized) continue;
    blocks.push({
      ...normalized,
      hardBreak: isSceneDividerNear(text, normalized.end),
    });
  }

  return blocks;
}

function trimBlockForDisplay(raw: string, rawStart: number) {
  const leading = raw.match(/^\s*/)?.[0].length ?? 0;
  const trailing = raw.match(/\s*$/)?.[0].length ?? 0;
  const start = rawStart + leading;
  const end = rawStart + raw.length - trailing;
  if (end <= start) return null;
  return { text: raw.slice(leading, raw.length - trailing), start, end };
}

function isSceneDividerNear(text: string, offset: number) {
  const nextBreak = text.slice(offset, Math.min(text.length, offset + 40));
  return /\n\s*(?:[-*_]){3,}\s*\n/.test(nextBreak);
}

function mergeShortNaturalBlocks(blocks: Array<{ text: string; start: number; end: number; hardBreak: boolean }>, source: string) {
  const merged: Array<{ text: string; start: number; end: number; hardBreak: boolean }> = [];

  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    const canMergeWithPrevious =
      previous &&
      !previous.hardBreak &&
      !looksLikeSceneStart(block.text) &&
      (previous.text.length < MIN_NATURAL_SEGMENT_CHARS || block.text.length < MIN_NATURAL_SEGMENT_CHARS);

    if (canMergeWithPrevious) {
      previous.end = block.end;
      previous.text = source.slice(previous.start, previous.end);
      previous.hardBreak = block.hardBreak;
    } else {
      merged.push({ ...block });
    }
  }

  return merged;
}

function looksLikeSceneStart(text: string) {
  const firstLine = text.trimStart().split(/\n/, 1)[0]?.trim() ?? "";
  return /^(제?\s*\d+\s*(화|장|막)|chapter\s+\d+|scene\s+\d+|#)/i.test(firstLine);
}

function splitOversizedBlock(block: { text: string; start: number; end: number }, bodyLength: number) {
  if (block.text.length <= MAX_LONG_SEGMENT_CHARS) return [block];

  const pieces: Array<{ text: string; start: number; end: number }> = [];
  let cursor = block.start;
  const blockEnd = Math.min(block.end, bodyLength);

  while (cursor < blockEnd) {
    const remaining = blockEnd - cursor;
    if (remaining <= MAX_LONG_SEGMENT_CHARS) {
      const finalPiece = trimBlockForDisplayIndexRange(block.text, block.start, cursor, blockEnd);
      if (finalPiece) pieces.push(finalPiece);
      break;
    }

    const searchStart = Math.min(blockEnd, cursor + TARGET_LONG_SEGMENT_CHARS);
    const searchEnd = Math.min(blockEnd, cursor + MAX_LONG_SEGMENT_CHARS);
    const splitAt = findNaturalSplitPoint(block.text, block.start, searchStart, searchEnd) ?? searchEnd;
    const piece = trimBlockForDisplayIndexRange(block.text, block.start, cursor, splitAt);
    if (piece) pieces.push(piece);
    cursor = splitAt;
  }

  return pieces.length ? pieces : [block];
}

function trimBlockForDisplayIndexRange(source: string, sourceStart: number, absoluteStart: number, absoluteEnd: number) {
  const localStart = Math.max(0, absoluteStart - sourceStart);
  const localEnd = Math.max(localStart, absoluteEnd - sourceStart);
  return trimBlockForDisplay(source.slice(localStart, localEnd), absoluteStart);
}

function findNaturalSplitPoint(source: string, sourceStart: number, searchStart: number, searchEnd: number) {
  const localStart = Math.max(0, searchStart - sourceStart);
  const localEnd = Math.max(localStart, searchEnd - sourceStart);
  const window = source.slice(localStart, localEnd);
  const boundaryPattern = /[.!?。！？…]["'”’)\]]?(?:\s+|$)|\n(?=["'“‘'「『(<\[]?\s*[가-힣A-Za-z0-9])/g;
  let best: number | null = null;

  for (const match of window.matchAll(boundaryPattern)) {
    best = localStart + (match.index ?? 0) + match[0].length;
  }

  return best == null ? null : sourceStart + best;
}

function segmentIndexForOffset(segments: TextSegment[], offset: number) {
  return segments.find((segment) => offset >= segment.start && (offset < segment.end || segment.end === offset))?.index ?? 0;
}

function slotsForSegment(slots: AssetSlot[], segment: TextSegment, isLast: boolean) {
  return slots.filter((slot) =>
    isLast ? slot.offset >= segment.start && slot.offset <= segment.end : slot.offset >= segment.start && slot.offset < segment.end,
  );
}

function slotsAtOffset(slots: AssetSlot[], offset: number) {
  return slots.filter((slot) => slot.offset === offset);
}

function markerOffsetsForSegment(segment: TextSegment, slots: AssetSlot[], openInsertOffset: number | null, activeOffset: number | null, isLast: boolean) {
  const offsets = new Set<number>();
  const inSegment = (offset: number) => (isLast ? offset >= segment.start && offset <= segment.end : offset >= segment.start && offset < segment.end);

  for (const slot of slots) {
    if (inSegment(slot.offset)) offsets.add(slot.offset);
  }
  if (openInsertOffset != null && inSegment(openInsertOffset)) offsets.add(openInsertOffset);
  if (activeOffset != null && inSegment(activeOffset)) offsets.add(activeOffset);

  return [...offsets].sort((a, b) => a - b);
}

function splitSegmentByOffsets(segment: TextSegment, offsets: number[]) {
  const pieces: Array<{ type: "text"; key: string; text: string } | { type: "marker"; key: string; offset: number }> = [];
  let cursor = segment.start;
  const validOffsets = offsets.filter((offset) => offset >= segment.start && offset <= segment.end);

  for (const offset of validOffsets) {
    if (offset > cursor) {
      pieces.push({
        type: "text",
        key: `text-${cursor}-${offset}`,
        text: segment.text.slice(cursor - segment.start, offset - segment.start),
      });
    }
    pieces.push({ type: "marker", key: `marker-${offset}`, offset });
    cursor = offset;
  }

  if (cursor < segment.end) {
    pieces.push({
      type: "text",
      key: `text-${cursor}-${segment.end}`,
      text: segment.text.slice(cursor - segment.start),
    });
  }

  if (!pieces.length) {
    pieces.push({ type: "text", key: `text-${segment.start}-${segment.end}`, text: segment.text });
  }

  return pieces;
}

function getTextClickOffset(event: { clientX: number; clientY: number }, element: HTMLElement) {
  const doc = element.ownerDocument;
  const pointDoc = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;

  if (pointDoc.caretPositionFromPoint) {
    const position = pointDoc.caretPositionFromPoint(event.clientX, event.clientY);
    node = position?.offsetNode ?? null;
    offset = position?.offset ?? 0;
  } else if (pointDoc.caretRangeFromPoint) {
    const range = pointDoc.caretRangeFromPoint(event.clientX, event.clientY);
    node = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  }

  if (!node || !element.contains(node)) return null;
  const markerHost = node.nodeType === Node.TEXT_NODE ? node.parentElement : node instanceof HTMLElement ? node : null;
  if (markerHost?.closest("[data-asset-marker='true']")) return null;

  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(textNode) {
      const parent = textNode.parentElement;
      return parent?.closest("[data-asset-marker='true']") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    const length = current.textContent?.length ?? 0;
    if (current === node) {
      return total + Math.max(0, Math.min(offset, length));
    }
    total += length;
    current = walker.nextNode();
  }
  return Math.max(0, Math.min(total, element.textContent?.length ?? 0));
}

function getTierRange(start: AssetTier, end: AssetTier) {
  const startIndex = ASSET_TIERS.findIndex((tier) => tier.key === start);
  const endIndex = ASSET_TIERS.findIndex((tier) => tier.key === end);
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.max(startIndex, endIndex);
  return ASSET_TIERS.slice(from, to + 1).map((tier) => tier.key);
}

function getOffsetExcerpt(body: string, offset: number, radius = 520) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(body.length, offset + radius);
  return body.slice(start, end).trim();
}

function buildAssetPrompt(chapterTitle: string, excerpt: string, assetKind: "image" | "video") {
  const kind = assetKind === "video" ? "short cinematic video" : "story illustration image";
  return [
    `Create a ${kind} for this Korean romance/fantasy story scene.`,
    `Chapter: ${chapterTitle || "Untitled"}`,
    "Mood: emotional, immersive, premium mobile story content.",
    "Respect the exact scene context. Do not add unrelated characters.",
    "",
    excerpt.slice(0, 1200),
  ].join("\n");
}

async function uploadStoryAsset(storyId: string, file: File) {
  const validationError = validateStoryAssetFile(file);
  if (validationError) throw new Error(validationError);
  await ensureStoryMediaBucket();
  const ext = file.name.split(".").pop() || "bin";
  const key = `assets/${storyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("story-media")
    .upload(key, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return key;
}

async function hashAssetFile(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mediaAssetToLibraryEntry(row: MediaAssetRow): AssetLibraryEntry {
  return {
    id: row.id,
    media_url: row.storage_path,
    media_asset_id: row.id,
    media_type: row.asset_type === "video" ? "video" : "image",
    scene_description: String(row.metadata?.scene_description ?? row.file_name ?? "에셋"),
    caption: row.file_name,
    source: String(row.metadata?.source ?? "library"),
    chapterTitle: row.chapter_id ? "회차 에셋" : "라이브러리",
  };
}

function dedupeLibraryEntries(entries: AssetLibraryEntry[]) {
  const seen = new Set<string>();
  const result: AssetLibraryEntry[] = [];
  for (const entry of entries) {
    const key = entry.media_url || entry.media_asset_id || entry.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function InlineAssetEditor({
  storyId,
  chapters,
  chapter,
  activeChapterId,
  onSelectChapter,
  onChange,
  onSave,
  saving,
  onSuggest,
  suggesting,
  onTranslate,
  onGenerateAsset,
}: {
  storyId: string;
  chapters: ChapterConfig[];
  chapter: ChapterConfig | null;
  activeChapterId: string;
  onSelectChapter: (id: string) => void;
  onChange: (chapter: ChapterConfig | null) => void;
  onSave: (nextDraft?: ChapterConfig) => Promise<void> | void;
  saving: boolean;
  onSuggest: () => void;
  suggesting: boolean;
  onTranslate: (chapterId: string) => Promise<{ translatedText: string; chunks: number; providerLabels: string[]; tokensUsed: number }>;
  onGenerateAsset: (input: {
    chapterId: string;
    kind: "image" | "video";
    prompt: string;
    offset: number;
    heatTier?: string;
  }) => Promise<{ slot: AssetSlot; generated: boolean; providerLabel: string; model: string; warning?: string }>;
}) {
  const qc = useQueryClient();
  const listMedia = useServerFn(listMediaAssets);
  const registerMedia = useServerFn(registerMediaAsset);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [activeOffset, setActiveOffset] = useState<number | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bodyLanguage, setBodyLanguage] = useState<"ko" | "vi">("ko");
  const [translatedBodies, setTranslatedBodies] = useState<Record<string, string>>({});
  const [translationMeta, setTranslationMeta] = useState<Record<string, { chunks: number; providerLabels: string[]; tokensUsed: number }>>({});
  const [translating, setTranslating] = useState(false);
  const [assetPrompt, setAssetPrompt] = useState("");
  const [assetKind, setAssetKind] = useState<"image" | "video">("image");
  const [assetGenerating, setAssetGenerating] = useState(false);
  const [assetHeatTier, setAssetHeatTier] = useState<AssetTier>("soft");
  const [bodyEditMode, setBodyEditMode] = useState(false);
  const [bodyTextStyle, setBodyTextStyle] = useState<AssetBodyTextStyle>(DEFAULT_ASSET_BODY_TEXT_STYLE);
  const [assetInsertMode, setAssetInsertMode] = useState(false);
  const [openInsertOffset, setOpenInsertOffset] = useState<number | null>(null);
  const [movingSlotId, setMovingSlotId] = useState<string | null>(null);
  const [movingSlotIds, setMovingSlotIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAffection, setPreviewAffection] = useState(55);
  const [assetLibraryExpanded, setAssetLibraryExpanded] = useState(false);
  const [assetLibraryQuery, setAssetLibraryQuery] = useState("");
  const activeExcerpt = chapter && activeOffset != null ? getOffsetExcerpt(chapter.body, activeOffset) : "";

  const mediaLibraryQ = useQuery({
    queryKey: ["asset_media_library", storyId],
    queryFn: () => listMedia({ data: { storyId, status: "ready" } }),
  });

  useEffect(() => {
    if (!chapter) {
      setSelectedSlotId(null);
      return;
    }
    if (selectedSlotId && !chapter.assetSlots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId(null);
    }
  }, [chapter?.id, chapter?.assetSlots.length, selectedSlotId]);

  function selectAssetInsertPosition(offset: number) {
    if (chapter && movingSlotIds.length) {
      void commitMoveSlots(movingSlotIds, offset);
      return;
    }
    if (chapter && movingSlotId) {
      void commitMoveSlot(movingSlotId, offset);
      return;
    }
    setActiveOffset(offset);
    setSelectedSlotId(null);
    setAssetInsertMode(false);
    setOpenInsertOffset(offset);
  }

  function selectAssetForManagement(id: string) {
    const slot = chapter?.assetSlots.find((item) => item.id === id);
    setSelectedSlotId(id);
    if (slot) setActiveOffset(slot.offset);
    setOpenInsertOffset(null);
    setMovingSlotId(null);
    setMovingSlotIds([]);
  }

  function patchChapter(patch: Partial<ChapterConfig>) {
    if (!chapter) return;
    onChange({ ...chapter, ...patch });
  }

  function patchSlots(nextSlots: AssetSlot[]) {
    if (!chapter) return;
    patchChapter({ assetSlots: normalizeAssetSlots(nextSlots, chapter.body.length) });
  }

  function commitSlots(nextSlots: AssetSlot[]) {
    if (!chapter) return;
    const nextChapter = {
      ...chapter,
      assetSlots: normalizeAssetSlots(nextSlots, chapter.body.length),
    };
    onChange(nextChapter);
    return onSave(nextChapter);
  }

  async function commitMoveSlot(slotId: string, offset: number) {
    await commitMoveSlots([slotId], offset);
  }

  async function commitMoveSlots(slotIds: string[], offset: number) {
    if (!chapter) return;
    const ids = [...new Set(slotIds)].filter(Boolean);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const targetOffset = clampAssetOffset(offset, chapter.body.length);
    const segmentIndex = segmentIndexForOffset(splitBodySegments(chapter.body), targetOffset);
    const nextSlots = chapter.assetSlots.map((slot) =>
      idSet.has(slot.id) ? { ...slot, offset: targetOffset, segment_index: segmentIndex } : slot,
    );
    setActiveOffset(targetOffset);
    setSelectedSlotId(ids[0] ?? null);
    setAssetInsertMode(false);
    setOpenInsertOffset(null);
    setMovingSlotId(null);
    setMovingSlotIds([]);
    await commitSlots(nextSlots);
    toast.success(ids.length > 1 ? "에셋영역을 이동하고 저장했습니다." : "에셋 위치를 이동하고 저장했습니다.");
  }

  function patchBody(nextBody: string) {
    if (!chapter) return;
    const nextLength = nextBody.length;
    onChange({
      ...chapter,
      body: nextBody,
      assetSlots: normalizeAssetSlots(chapter.assetSlots, nextLength),
    });
    if (activeOffset != null) {
      setActiveOffset(clampAssetOffset(activeOffset, nextLength));
    }
  }

  function addSlot(offset: number, seed?: Partial<AssetSlot>) {
    if (!chapter) return;
    const targetOffset = clampAssetOffset(offset, chapter.body.length);
    const segmentIndex = segmentIndexForOffset(splitBodySegments(chapter.body), targetOffset);
    const slot: AssetSlot = {
      id: makeAssetSlotId(),
      offset: targetOffset,
      segment_index: segmentIndex,
      scene_description: seed?.scene_description ?? "",
      heat_tier: seed?.heat_tier ?? "soft",
      media_asset_id: seed?.media_asset_id ?? null,
      media_url: seed?.media_url ?? null,
      media_type: seed?.media_type ?? null,
      caption: seed?.caption ?? "",
      source: seed?.source ?? "manual",
    };
    patchSlots([...chapter.assetSlots, slot]);
    setSelectedSlotId(null);
    setActiveOffset(targetOffset);
  }

  function addSlotsAtOffset(offset: number, tiers: AssetTier[]) {
    if (!chapter) return;
    const targetOffset = clampAssetOffset(offset, chapter.body.length);
    const segmentIndex = segmentIndexForOffset(splitBodySegments(chapter.body), targetOffset);
    const targetTiers = [...new Set(tiers.length ? tiers : ASSET_TIERS.map((tier) => tier.key))];
    const existingTiers = new Set(
      chapter.assetSlots
        .filter((slot) => slot.segment_index === segmentIndex)
        .map((slot) => slot.heat_tier),
    );
    const nextSlots = targetTiers
      .filter((tier) => !existingTiers.has(tier))
      .slice(0, ASSET_TIERS.length)
      .map((tier) => {
        const meta = ASSET_TIERS.find((item) => item.key === tier);
        return {
          id: makeAssetSlotId(),
          offset: targetOffset,
          segment_index: segmentIndex,
          scene_description: `${meta?.label ?? "호감도"} 에셋`,
          heat_tier: tier,
          media_asset_id: null,
          media_url: null,
          media_type: null,
          caption: "",
          source: "manual",
        } satisfies AssetSlot;
      });

    if (!nextSlots.length) {
      toast.info("선택한 호감도 단계의 슬롯이 이미 이 위치에 있습니다.");
      setActiveOffset(targetOffset);
      return;
    }

    patchSlots([...chapter.assetSlots, ...nextSlots]);
    setSelectedSlotId(null);
    setActiveOffset(targetOffset);
    toast.success(`${nextSlots.length}개 에셋 슬롯이 이 위치에 추가되었습니다.`);
  }

  async function addFilesAtOffset(offset: number, fileList: FileList | File[], tierRange?: AssetTier[]) {
    if (!chapter) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!files.length) {
      toast.error("이미지 또는 영상 파일만 업로드할 수 있습니다.");
      return;
    }
    const invalidFile = files.find((file) => validateStoryAssetFile(file));
    if (invalidFile) {
      toast.error(validateStoryAssetFile(invalidFile));
      return;
    }
    const targetOffset = clampAssetOffset(offset, chapter.body.length);
    const segmentIndex = segmentIndexForOffset(splitBodySegments(chapter.body), targetOffset);
    const targetTiers = (tierRange?.length ? tierRange : ASSET_TIERS.map((tier) => tier.key)).slice(0, ASSET_TIERS.length);
    const picked = files.slice(0, targetTiers.length);
    setBulkUploading(true);
    try {
      const uploaded: AssetSlot[] = [];
      for (let index = 0; index < picked.length; index += 1) {
        const file = picked[index];
        const key = await uploadStoryAsset(storyId, file);
        const tier = targetTiers[index];
        uploaded.push({
          id: makeAssetSlotId(),
          offset: targetOffset,
          segment_index: segmentIndex,
          scene_description: file.name.replace(/\.[^.]+$/, ""),
          heat_tier: tier,
          media_asset_id: key,
          media_url: key,
          media_type: file.type.startsWith("video/") ? "video" : "image",
          caption: file.name,
          source: "manual",
        });
      }
      const usedTiers = new Set(uploaded.map((slot) => slot.heat_tier));
      const others = chapter.assetSlots.filter(
        (slot) => !(slot.offset === targetOffset && usedTiers.has(slot.heat_tier)),
      );
      patchSlots([...others, ...uploaded]);
      setSelectedSlotId(null);
      setActiveOffset(targetOffset);
      toast.success(`${uploaded.length}개 에셋이 선택한 위치에 등록되었습니다.`);
      if (files.length > picked.length) {
        toast.info(`호감도 단계는 최대 ${targetTiers.length}개까지 등록됩니다. 초과 파일은 제외했습니다.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "에셋 업로드에 실패했습니다.");
    } finally {
      setBulkUploading(false);
    }
  }

  async function commitAssetSlotsAtOffset(offset: number, filesByTier: Partial<Record<AssetTier, File>>) {
    if (!chapter) return;
    const targetOffset = clampAssetOffset(offset, chapter.body.length);
    const segmentIndex = segmentIndexForOffset(splitBodySegments(chapter.body), targetOffset);
    const entries = ASSET_TIERS.map((tier) => [tier.key, filesByTier[tier.key]] as [AssetTier, File | undefined]);
    const uploaded: AssetSlot[] = [];
    setBulkUploading(true);
    try {
      for (const [tier, file] of entries) {
        if (!file) continue;
        const validationError = validateStoryAssetFile(file);
        if (validationError) {
          toast.error(validationError);
          return;
        }
        const key = await uploadStoryAsset(storyId, file);
        uploaded.push({
          id: makeAssetSlotId(),
          offset: targetOffset,
          segment_index: segmentIndex,
          scene_description: file.name.replace(/\.[^.]+$/, ""),
          heat_tier: tier,
          media_asset_id: key,
          media_url: key,
          media_type: file.type.startsWith("video/") ? "video" : "image",
          caption: file.name,
          source: "manual",
        });
      }

      if (!uploaded.length) {
        toast.error("등록할 이미지 또는 영상을 선택하세요.");
        return;
      }

      const uploadedTiers = new Set(uploaded.map((slot) => slot.heat_tier));
      const nextSlots = [
        ...chapter.assetSlots.filter((slot) => !(slot.offset === targetOffset && uploadedTiers.has(slot.heat_tier))),
        ...uploaded,
      ];
      await commitSlots(nextSlots);
      setSelectedSlotId(null);
      setActiveOffset(targetOffset);
      setOpenInsertOffset(null);
      toast.success("선택 위치에 에셋을 저장했습니다.");
    } catch (e: any) {
      toast.error(e?.message ?? "에셋 저장에 실패했습니다.");
    } finally {
      setBulkUploading(false);
    }
  }

  function patchSlot(id: string, patch: Partial<AssetSlot>) {
    if (!chapter) return;
    patchSlots(chapter.assetSlots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(id: string) {
    removeSlots([id]);
  }

  function removeSlots(ids: string[]) {
    if (!chapter) return;
    const idSet = new Set(ids);
    void commitSlots(chapter.assetSlots.filter((slot) => !idSet.has(slot.id)));
    setSelectedSlotId(null);
    setMovingSlotId(null);
    setMovingSlotIds([]);
  }

  function startMovingSlot(id: string) {
    setMovingSlotId(id);
    setMovingSlotIds([]);
    setSelectedSlotId(null);
    setOpenInsertOffset(null);
    setAssetInsertMode(true);
    toast.info("에셋을 드래그해서 옮기거나 본문에서 이동할 새 위치를 클릭하세요.");
  }

  function startMovingSlots(ids: string[]) {
    const nextIds = [...new Set(ids)].filter(Boolean);
    if (!nextIds.length) return;
    setMovingSlotIds(nextIds);
    setMovingSlotId(null);
    setSelectedSlotId(null);
    setOpenInsertOffset(null);
    setAssetInsertMode(true);
    toast.info("에셋영역을 드래그해서 원하는 본문 위치에 놓으세요.");
  }

  const savedSlotLibrary = chapters.flatMap((item) =>
    item.assetSlots.filter((slot) => slot.media_url).map((slot) => ({
      id: slot.id,
      media_url: slot.media_url,
      media_asset_id: slot.media_asset_id,
      media_type: slot.media_type,
      scene_description: slot.scene_description,
      caption: slot.caption,
      source: slot.source ?? "manual",
      chapterTitle: item.title,
      heat_tier: slot.heat_tier,
    })),
  );
  const mediaAssetLibrary = (mediaLibraryQ.data ?? []).map(mediaAssetToLibraryEntry);
  const librarySlots = dedupeLibraryEntries([...mediaAssetLibrary, ...savedSlotLibrary]);
  const filteredLibrarySlots = useMemo(() => {
    const needle = assetLibraryQuery.trim().toLowerCase();
    if (!needle) return librarySlots;
    return librarySlots.filter((slot) => {
      const haystack = [
        slot.scene_description,
        slot.caption,
        slot.chapterTitle,
        slot.source,
        slot.media_type,
        ASSET_TIERS.find((tier) => tier.key === slot.heat_tier)?.label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [assetLibraryQuery, librarySlots]);

  async function uploadFilesToAssetLibrary(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    setBulkUploading(true);
    try {
      for (const file of files) {
        const key = await uploadStoryAsset(storyId, file);
        const contentHash = await hashAssetFile(file);
        await registerMedia({
          data: {
            storyId,
            chapterId: null,
            assetType: file.type.startsWith("video/") ? "video" : "image",
            storagePath: key,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            contentHash,
            tags: ["asset-library"],
            status: "ready",
            metadata: { source: "asset_editor_library" },
          },
        });
      }
      await qc.invalidateQueries({ queryKey: ["asset_media_library", storyId] });
      toast.success(`${files.length}개 파일을 에셋 라이브러리에 등록했습니다.`);
    } catch (e: any) {
      toast.error(e?.message ?? "에셋 라이브러리 등록에 실패했습니다.");
    } finally {
      setBulkUploading(false);
    }
  }

  async function runVietnameseTranslation() {
    if (!chapter) return;
    if (!chapter.body.trim()) {
      toast.error("번역할 본문이 없습니다.");
      return;
    }
    setTranslating(true);
    try {
      const result = await onTranslate(chapter.id);
      setTranslatedBodies((prev) => ({ ...prev, [chapter.id]: result.translatedText }));
      setTranslationMeta((prev) => ({
        ...prev,
        [chapter.id]: {
          chunks: result.chunks,
          providerLabels: result.providerLabels,
          tokensUsed: result.tokensUsed,
        },
      }));
      setBodyLanguage("vi");
      toast.success("베트남어 번역본이 생성되었습니다.");
    } catch (e: any) {
      toast.error(e?.message ?? "번역에 실패했습니다.");
    } finally {
      setTranslating(false);
    }
  }

  const translationChapter = useMemo(() => {
    if (!chapter || !translatedBodies[chapter.id]) return null;
    return {
      ...chapter,
      body: translatedBodies[chapter.id],
      assetSlots: chapter.assetSlots,
    };
  }, [chapter, translatedBodies]);

  function prepareAiAssetSlot() {
    if (!chapter || activeOffset == null) {
      toast.error("본문에서 에셋을 넣을 위치를 먼저 선택하세요.");
      return;
    }
    const prompt = buildAssetPrompt(chapter.title, activeExcerpt, assetKind);
    setAssetPrompt(prompt);
    addSlot(activeOffset, {
      media_type: assetKind,
      scene_description: prompt,
      source: "ai",
    });
    toast.success("AI 에셋 슬롯이 선택 위치에 추가되었습니다.");
  }

  async function generateAssetAtSelectedOffset() {
    if (!chapter || activeOffset == null) {
      toast.error("본문에서 에셋을 넣을 위치를 먼저 선택하세요.");
      return;
    }
    const prompt = (assetPrompt || buildAssetPrompt(chapter.title, activeExcerpt, assetKind)).trim();
    if (!prompt) {
      toast.error("AI 프롬프트를 입력하세요.");
      return;
    }
    setAssetGenerating(true);
    try {
      const result = await onGenerateAsset({
        chapterId: chapter.id,
        kind: assetKind,
        prompt,
        offset: activeOffset,
        heatTier: assetHeatTier,
      });
      const nextSlot = {
        ...result.slot,
        id: result.slot.id || makeAssetSlotId(),
        offset: clampAssetOffset(result.slot.offset, chapter.body.length),
        heat_tier: assetHeatTier,
      } satisfies AssetSlot;
      const sameTierAtOffset = (slot: AssetSlot) =>
        slot.offset === nextSlot.offset && slot.heat_tier === nextSlot.heat_tier;
      patchSlots([...chapter.assetSlots.filter((slot) => !sameTierAtOffset(slot)), nextSlot]);
      void qc.invalidateQueries({ queryKey: ["asset_media_library", storyId] });
      setSelectedSlotId(null);
      setActiveOffset(nextSlot.offset);
      if (result.generated) {
        toast.success(`AI 에셋이 선택 위치에 생성되었습니다. ${result.providerLabel}`);
      } else {
        toast.info(`AI 프롬프트 기반 슬롯이 추가되었습니다. ${result.providerLabel}`);
        if (result.warning) toast.warning(result.warning.slice(0, 160));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "AI 에셋 생성에 실패했습니다.");
    } finally {
      setAssetGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24">
      <section className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">회차 선택</div>
            <div className="text-xs text-muted-foreground">에셋을 삽입할 회차를 선택한 뒤 본문 위치를 클릭하세요.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onSuggest} disabled={!chapter || suggesting}>
              {suggesting ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
              AI 위치추천
            </Button>
            <Button size="sm" onClick={() => onSave()} disabled={!chapter || saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {chapters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectChapter(item.id)}
              className={cn(
                "min-w-32 rounded-md border px-3 py-2 text-left text-sm transition",
                item.id === activeChapterId ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/40",
              )}
            >
              <div className="font-medium">{item.episodeNumber}화</div>
              <div className="truncate text-xs text-muted-foreground">{item.title || "제목 없음"}</div>
            </button>
          ))}
        </div>
      </section>

      {!chapter ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          회차를 선택하세요.
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">본문 위치 지정</div>
                <div className="text-xs text-muted-foreground">한국어 또는 베트남어 본문을 읽으며 원하는 문단 위치에 에셋을 삽입합니다.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-border bg-background p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setBodyLanguage("ko")}
                    className={cn(
                      "rounded px-2 py-1 transition",
                      bodyLanguage === "ko" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    한국어
                  </button>
                  {translatedBodies[chapter.id] && (
                    <button
                      type="button"
                      onClick={() => setBodyLanguage("vi")}
                      className={cn(
                        "rounded px-2 py-1 transition",
                        bodyLanguage === "vi" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      베트남어
                    </button>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={runVietnameseTranslation} disabled={translating || !chapter.body.trim()}>
                  {translating ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />}
                  {translatedBodies[chapter.id] ? "번역 다시 실행" : "베트남어 번역"}
                </Button>
                <div className="text-xs text-muted-foreground">{chapter.body.length.toLocaleString()}자</div>
              </div>
            </div>
            <div className="mb-3 rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={bodyEditMode ? "default" : "outline"}
                    onClick={() => setBodyEditMode((value) => !value)}
                  >
                    <Pencil className="size-3" />
                    본문 편집
                  </Button>
                  <Button
                    size="sm"
                    variant={bodyTextStyle.bold ? "default" : "outline"}
                    onClick={() => setBodyTextStyle((prev) => ({ ...prev, bold: !prev.bold }))}
                    aria-label="굵게"
                  >
                    B
                  </Button>
                  <Button
                    size="sm"
                    variant={bodyTextStyle.italic ? "default" : "outline"}
                    onClick={() => setBodyTextStyle((prev) => ({ ...prev, italic: !prev.italic }))}
                    aria-label="기울임"
                  >
                    I
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    글자크기
                    <Input
                      type="number"
                      min={12}
                      max={28}
                      value={bodyTextStyle.fontSize}
                      onChange={(event) =>
                        setBodyTextStyle((prev) => ({
                          ...prev,
                          fontSize: Math.max(12, Math.min(28, Number(event.target.value) || 15)),
                        }))
                      }
                      className="h-8 w-20"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    색상
                    <input
                      type="color"
                      value={bodyTextStyle.color}
                      onChange={(event) => setBodyTextStyle((prev) => ({ ...prev, color: event.target.value }))}
                      className="h-8 w-10 rounded border border-border bg-background p-1"
                    />
                  </label>
                </div>
              </div>
              {bodyEditMode && bodyLanguage === "ko" && (
                <Textarea
                  value={chapter.body}
                  onChange={(event) => patchBody(event.target.value)}
                  className="mt-3 min-h-[30vh] resize-y whitespace-pre-wrap font-mono text-sm leading-7"
                  maxLength={100000}
                  placeholder="본문을 직접 수정하세요. 저장하면 회차편집 본문에도 같은 내용이 반영됩니다."
                />
              )}
              {bodyEditMode && bodyLanguage === "vi" && (
                <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  베트남어 탭은 작업자용 번역 화면입니다. 실제 저장되는 본문 수정은 한국어 탭에서 진행합니다.
                </div>
              )}
            </div>
            {bodyLanguage === "vi" && translationChapter ? (
              <VietnameseTranslationEditor
                storyId={storyId}
                chapter={translationChapter}
                selectedSlotId={selectedSlotId}
                saving={saving}
                activeOffset={activeOffset}
                onAddSlot={addSlot}
                onAddSlots={addSlotsAtOffset}
                onAddFiles={addFilesAtOffset}
                onSave={onSave}
                onSelectOffset={selectAssetInsertPosition}
                onSelectSlot={selectAssetForManagement}
                onPatchSlot={patchSlot}
                onRemoveSlot={removeSlot}
                onMoveSlot={startMovingSlot}
                onRemoveSlots={removeSlots}
                onMoveSlots={startMovingSlots}
                meta={translationMeta[chapter.id]}
                textStyle={bodyTextStyle}
                insertMode={assetInsertMode}
                openInsertOffset={openInsertOffset}
                onCommitSlots={commitAssetSlotsAtOffset}
                onCommitMoveSlot={commitMoveSlot}
                onCommitMoveSlots={commitMoveSlots}
              />
            ) : chapter.body.trim() ? (
              <StoryAssetCanvas
                storyId={storyId}
                chapter={chapter}
                selectedSlotId={selectedSlotId}
                saving={saving}
                onAddSlot={addSlot}
                onAddSlots={addSlotsAtOffset}
                onAddFiles={addFilesAtOffset}
                onSave={onSave}
                activeOffset={activeOffset}
                onSelectOffset={selectAssetInsertPosition}
                onSelectSlot={selectAssetForManagement}
                onPatchSlot={patchSlot}
                onRemoveSlot={removeSlot}
                onMoveSlot={startMovingSlot}
                onRemoveSlots={removeSlots}
                onMoveSlots={startMovingSlots}
                textStyle={bodyTextStyle}
                insertMode={assetInsertMode}
                openInsertOffset={openInsertOffset}
                onCommitSlots={commitAssetSlotsAtOffset}
                onCommitMoveSlot={commitMoveSlot}
                onCommitMoveSlots={commitMoveSlots}
              />
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                본문이 없습니다. 회차편집에서 본문을 입력한 뒤 에셋 위치를 지정하세요.
              </div>
            )}
          </section>

          <aside className="space-y-3 xl:sticky xl:top-4">
            <section className="rounded-lg border border-border bg-card p-3">
              <div className="grid grid-cols-2 gap-2">
              <Button
                variant={assetInsertMode ? "default" : "outline"}
                onClick={() => {
                  setAssetInsertMode((value) => !value);
                  setSelectedSlotId(null);
                  setMovingSlotId(null);
                  setMovingSlotIds([]);
                }}
                disabled={!chapter?.body.trim()}
              >
                <Plus className="size-4" />
                {assetInsertMode && !movingSlotId && !movingSlotIds.length ? "위치 선택 중" : "에셋삽입"}
              </Button>
              <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!chapter?.body.trim()}>
                <Eye className="size-4" />
                프리뷰
              </Button>
              </div>
              {(movingSlotId || movingSlotIds.length > 0) && (
                <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-200">
                  이동할 위치를 본문에서 선택하세요.
                </div>
              )}
              {activeOffset != null && (
                <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-primary">
                  선택 위치 지정됨
                </div>
              )}
            </section>

            <section
              className={cn(
                "rounded-lg border bg-card p-3 transition",
                activeOffset == null ? "border-border" : "border-primary bg-primary/5",
                assetLibraryExpanded && "xl:w-[520px] xl:-translate-x-[140px]",
              )}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void uploadFilesToAssetLibrary(event.dataTransfer.files);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <ImageIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">에셋 라이브러리</div>
                  <div className="text-[11px] text-muted-foreground">
                    {filteredLibrarySlots.length.toLocaleString()} / {librarySlots.length.toLocaleString()}개
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto h-8 px-2 text-xs"
                  onClick={() => setAssetLibraryExpanded((value) => !value)}
                >
                  {assetLibraryExpanded ? "접기" : "펼치기"}
                </Button>
              </div>
              <div className="mt-2 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={assetLibraryQuery}
                    onChange={(event) => setAssetLibraryQuery(event.target.value)}
                    placeholder="검색"
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <label className="grid h-9 w-10 shrink-0 cursor-pointer place-items-center rounded-md border border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary">
                  {bulkUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="sr-only"
                    disabled={bulkUploading}
                    onChange={(event) => {
                      if (!event.target.files) return;
                      void uploadFilesToAssetLibrary(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {mediaLibraryQ.isLoading ? (
                <div className="mt-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  라이브러리 불러오는 중
                </div>
              ) : filteredLibrarySlots.length ? (
                <div
                  className={cn(
                    "mt-2 grid gap-2 overflow-y-auto pr-1",
                    assetLibraryExpanded
                      ? "max-h-[58vh] grid-cols-3 sm:grid-cols-4 xl:grid-cols-5"
                      : "max-h-36 grid-cols-4",
                  )}
                >
                  {filteredLibrarySlots.slice(0, assetLibraryExpanded ? 240 : 8).map((slot) => (
                    <AssetLibraryItem key={`${slot.chapterTitle}-${slot.id}-${slot.media_url}`} slot={slot} compact={!assetLibraryExpanded} />
                  ))}
                  {!assetLibraryExpanded && filteredLibrarySlots.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setAssetLibraryExpanded(true)}
                      className="grid aspect-square place-items-center rounded-md border border-border bg-background px-2 text-center text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      +{filteredLibrarySlots.length - 8}
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  {assetLibraryQuery ? "검색 결과가 없습니다." : "등록된 에셋 없음"}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="text-sm font-semibold">AI 에셋 생성</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="sm" variant={assetKind === "image" ? "default" : "outline"} onClick={() => setAssetKind("image")}>
                  <ImageIcon className="size-4" />
                  이미지
                </Button>
                <Button size="sm" variant={assetKind === "video" ? "default" : "outline"} onClick={() => setAssetKind("video")}>
                  <Camera className="size-4" />
                  영상
                </Button>
              </div>
              <select
                value={assetHeatTier}
                onChange={(event) => setAssetHeatTier(event.target.value as AssetTier)}
                className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              >
                {ASSET_TIERS.map((tier) => (
                  <option key={tier.key} value={tier.key}>
                    {tier.label} - {tier.hint}
                  </option>
                ))}
              </select>
              <Textarea
                value={assetPrompt || (activeExcerpt ? buildAssetPrompt(chapter.title, activeExcerpt, assetKind) : "")}
                onChange={(event) => setAssetPrompt(event.target.value)}
                className="mt-2 min-h-20 text-xs"
                placeholder="선택 위치 기준 프롬프트"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={prepareAiAssetSlot} disabled={!activeExcerpt}>
                  <Plus className="size-4" />
                  슬롯
                </Button>
                <Button size="sm" variant="secondary" onClick={generateAssetAtSelectedOffset} disabled={!activeExcerpt || assetGenerating}>
                  {assetGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  생성
                </Button>
              </div>
            </section>
          </aside>
        </div>
      )}
      {chapter && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="flex max-h-[92vh] max-w-[96vw] flex-col overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-4 py-3">
              <DialogTitle>회원 화면 프리뷰</DialogTitle>
            </DialogHeader>
            <div className="border-b border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-muted-foreground">호감도</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={previewAffection}
                  onChange={(event) => setPreviewAffection(Number(event.target.value))}
                  className="min-w-48 flex-1"
                />
                <span className="w-12 rounded-full bg-primary/10 px-2 py-1 text-center text-xs font-semibold text-primary">
                  {previewAffection}
                </span>
                {[0, 30, 55, 75, 100].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={previewAffection === value ? "default" : "outline"}
                    onClick={() => setPreviewAffection(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              <UnifiedStoryReader
                storyId={storyId}
                title={chapter.title}
                cover={undefined}
                bodyText={chapter.body}
                assetSlots={chapter.assetSlots}
                characterName="캐릭터"
                previewMode
                previewAffection={previewAffection}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function VietnameseTranslationEditor({
  storyId,
  chapter,
  selectedSlotId,
  saving,
  activeOffset,
  onAddSlot,
  onAddSlots,
  onAddFiles,
  onSave,
  onSelectOffset,
  onSelectSlot,
  onPatchSlot,
  onRemoveSlot,
  onMoveSlot,
  onRemoveSlots,
  onMoveSlots,
  meta,
  textStyle,
  insertMode,
  openInsertOffset,
  onCommitSlots,
  onCommitMoveSlot,
  onCommitMoveSlots,
}: {
  storyId: string;
  chapter: ChapterConfig;
  selectedSlotId: string | null;
  saving: boolean;
  activeOffset: number | null;
  onAddSlot: (offset: number, seed?: Partial<AssetSlot>) => void;
  onAddSlots: (offset: number, tiers: AssetTier[]) => void;
  onAddFiles: (offset: number, files: FileList | File[], tierRange?: AssetTier[]) => void;
  onSave: () => void;
  onSelectOffset: (offset: number) => void;
  onSelectSlot: (id: string) => void;
  onPatchSlot: (id: string, patch: Partial<AssetSlot>) => void;
  onRemoveSlot: (id: string) => void;
  onMoveSlot: (id: string) => void;
  onRemoveSlots: (ids: string[]) => void;
  onMoveSlots: (ids: string[]) => void;
  meta?: { chunks: number; providerLabels: string[]; tokensUsed: number };
  textStyle?: AssetBodyTextStyle;
  insertMode: boolean;
  openInsertOffset: number | null;
  onCommitSlots: (offset: number, filesByTier: Partial<Record<AssetTier, File>>) => Promise<void> | void;
  onCommitMoveSlot: (slotId: string, offset: number) => Promise<void> | void;
  onCommitMoveSlots: (slotIds: string[], offset: number) => Promise<void> | void;
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">베트남어 번역본</div>
          <div className="text-xs text-muted-foreground">베트남어 본문에서도 동일한 위치에 에셋을 삽입하고, 한국어 본문에 같은 위치로 반영합니다.</div>
        </div>
        {meta && (
          <div className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">
            {meta.chunks}개 구간 · {meta.providerLabels.join(", ") || "LLM"} · {meta.tokensUsed.toLocaleString()} tokens
          </div>
        )}
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        <StoryAssetCanvas
          storyId={storyId}
          chapter={chapter}
          selectedSlotId={selectedSlotId}
          saving={saving}
          activeOffset={activeOffset}
          onAddSlot={onAddSlot}
          onAddSlots={onAddSlots}
          onAddFiles={onAddFiles}
          onSave={onSave}
          onSelectOffset={onSelectOffset}
          onSelectSlot={onSelectSlot}
          onPatchSlot={onPatchSlot}
          onRemoveSlot={onRemoveSlot}
          onMoveSlot={onMoveSlot}
          onRemoveSlots={onRemoveSlots}
          onMoveSlots={onMoveSlots}
          textStyle={textStyle}
          insertMode={insertMode}
          openInsertOffset={openInsertOffset}
          onCommitSlots={onCommitSlots}
          onCommitMoveSlot={onCommitMoveSlot}
          onCommitMoveSlots={onCommitMoveSlots}
        />
      </div>
    </div>
  );
}

function StoryAssetCanvas({
  storyId,
  chapter,
  selectedSlotId,
  saving,
  activeOffset,
  onAddSlot,
  onAddSlots,
  onAddFiles,
  onSave,
  onSelectOffset,
  onSelectSlot,
  onPatchSlot,
  onRemoveSlot,
  onMoveSlot,
  onRemoveSlots,
  onMoveSlots,
  textStyle = DEFAULT_ASSET_BODY_TEXT_STYLE,
  insertMode,
  openInsertOffset,
  onCommitSlots,
  onCommitMoveSlot,
  onCommitMoveSlots,
}: {
  storyId: string;
  chapter: ChapterConfig;
  selectedSlotId: string | null;
  saving: boolean;
  activeOffset: number | null;
  onAddSlot: (offset: number, seed?: Partial<AssetSlot>) => void;
  onAddSlots: (offset: number, tiers: AssetTier[]) => void;
  onAddFiles: (offset: number, files: FileList | File[], tierRange?: AssetTier[]) => void;
  onSave: () => void;
  onSelectOffset: (offset: number) => void;
  onSelectSlot: (id: string) => void;
  onPatchSlot: (id: string, patch: Partial<AssetSlot>) => void;
  onRemoveSlot: (id: string) => void;
  onMoveSlot: (id: string) => void;
  onRemoveSlots: (ids: string[]) => void;
  onMoveSlots: (ids: string[]) => void;
  textStyle?: AssetBodyTextStyle;
  insertMode: boolean;
  openInsertOffset: number | null;
  onCommitSlots: (offset: number, filesByTier: Partial<Record<AssetTier, File>>) => Promise<void> | void;
  onCommitMoveSlot: (slotId: string, offset: number) => Promise<void> | void;
  onCommitMoveSlots: (slotIds: string[], offset: number) => Promise<void> | void;
}) {
  const segments = splitBodySegments(chapter.body);
  const [rangeStart, setRangeStart] = useState<AssetTier>("soft");
  const [rangeEnd, setRangeEnd] = useState<AssetTier>("premium");
  const menuTiers = getTierRange(rangeStart, rangeEnd);

  function openRegistration(offset: number, force = false) {
    if (!force && !insertMode) return;
    onSelectOffset(offset);
  }

  return (
    <div className="space-y-3">
      {insertMode && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
          {openInsertOffset == null ? "에셋을 삽입하거나 이동할 본문 위치를 클릭하세요." : "선택 위치에 에셋을 등록하세요."}
        </div>
      )}
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const selectedHere = activeOffset != null && activeOffset >= segment.start && activeOffset <= segment.end;
        const markerOffsets = markerOffsetsForSegment(segment, chapter.assetSlots, openInsertOffset, activeOffset, isLast);
        const segmentPieces = splitSegmentByOffsets(segment, markerOffsets);
        return (
          <div
            key={segment.key}
            className={cn(
              "relative rounded-lg border bg-background p-3 transition",
              selectedHere ? "border-primary bg-primary/5 ring-2 ring-primary/25" : "border-border",
              insertMode && !selectedHere ? "cursor-crosshair hover:border-primary/40 hover:bg-primary/5" : "",
            )}
            role={insertMode ? "button" : undefined}
            tabIndex={0}
            onClick={(event) => {
              const offsetInSegment = getTextClickOffset(event, event.currentTarget);
              openRegistration(segment.start + (offsetInSegment ?? segment.text.length));
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              const offsetInSegment = getTextClickOffset(event, event.currentTarget);
              openRegistration(segment.start + (offsetInSegment ?? segment.text.length), true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openRegistration(segment.end, true);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const offsetInSegment = getTextClickOffset(event, event.currentTarget);
              const dropOffset = segment.start + (offsetInSegment ?? segment.text.length);
              onSelectOffset(dropOffset);
              if (event.dataTransfer.files.length) {
                onAddFiles(dropOffset, event.dataTransfer.files);
                return;
              }
              const raw = event.dataTransfer.getData("application/x-lovetale-asset");
              if (!raw) return;
              try {
                const dropped = JSON.parse(raw) as Partial<AssetSlot> & { moveSlotId?: string; moveSlotIds?: string[] };
                if (Array.isArray(dropped.moveSlotIds) && dropped.moveSlotIds.length) {
                  void onCommitMoveSlots(dropped.moveSlotIds, dropOffset);
                  return;
                }
                if (dropped.moveSlotId) {
                  void onCommitMoveSlot(dropped.moveSlotId, dropOffset);
                  return;
                }
                onAddSlot(dropOffset, dropped);
              } catch {
                onAddSlot(dropOffset);
              }
            }}
          >
            {segmentPieces.map((piece) => {
              if (piece.type === "text") {
                return (
                  <span
                    key={piece.key}
                    className={cn("whitespace-pre-wrap", insertMode ? "select-text" : "")}
                    style={{
                      color: textStyle.color,
                      fontSize: `${textStyle.fontSize}px`,
                      fontWeight: textStyle.bold ? 700 : 400,
                      fontStyle: textStyle.italic ? "italic" : "normal",
                      lineHeight: 1.85,
                    }}
                  >
                    {piece.text || "본문이 비어 있습니다. 원하는 위치를 선택해 에셋을 삽입하세요."}
                  </span>
                );
              }

              const offsetSlots = slotsAtOffset(chapter.assetSlots, piece.offset);
              const selectedAtOffset = activeOffset === piece.offset;
              const insertOpenAtOffset = openInsertOffset === piece.offset;

              return (
                <div
                  key={piece.key}
                  data-asset-marker="true"
                  className="my-3"
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.stopPropagation()}
                >
                  {insertOpenAtOffset && !offsetSlots.length && (
                    <div className="mb-3 flex items-center gap-2 rounded-md border border-dashed border-primary bg-primary/10 px-3 py-2 text-xs text-primary">
                      <div className="h-px flex-1 bg-primary/30" />
                      이 위치에 에셋이 삽입됩니다
                      <div className="h-px flex-1 bg-primary/30" />
                    </div>
                  )}
                  {(selectedAtOffset || offsetSlots.length > 0) && (
                    <InlineAssetPreview
                      slots={offsetSlots}
                      selected={selectedAtOffset}
                      selectedSlotId={selectedSlotId}
                      saving={saving}
                      onSelectSlot={onSelectSlot}
                      onOpenRegistration={(event) => {
                        event.stopPropagation();
                        openRegistration(piece.offset, true);
                      }}
                      onAddSlots={() => onAddSlots(piece.offset, menuTiers)}
                      onPatchSlot={onPatchSlot}
                      onRemoveSlot={onRemoveSlot}
                      onMoveSlot={onMoveSlot}
                      onRemoveSlots={onRemoveSlots}
                      onMoveSlots={onMoveSlots}
                      storyId={storyId}
                    />
                  )}
                  {insertOpenAtOffset && (
                    <div className="rounded-lg border border-primary/30 bg-card p-3 shadow-sm">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-primary">에셋 삽입</div>
                          <div className="text-xs text-muted-foreground">선택한 본문 위치 바로 아래 행에 저장됩니다.</div>
                        </div>
                      </div>
                      <InlineAssetInsertMenu
                        offset={piece.offset}
                        embedded
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        tiers={menuTiers}
                        onRangeStart={setRangeStart}
                        onRangeEnd={setRangeEnd}
                        onClose={() => undefined}
                        slots={offsetSlots}
                        saving={saving}
                        onCommit={(filesByTier) => onCommitSlots(piece.offset, filesByTier)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function InlineAssetInsertMenu({
  offset,
  embedded = false,
  rangeStart,
  rangeEnd,
  tiers,
  onRangeStart,
  onRangeEnd,
  onClose,
  slots,
  saving,
  onCommit,
}: {
  offset: number;
  embedded?: boolean;
  rangeStart: AssetTier;
  rangeEnd: AssetTier;
  tiers: AssetTier[];
  onRangeStart: (tier: AssetTier) => void;
  onRangeEnd: (tier: AssetTier) => void;
  onClose: () => void;
  slots: AssetSlot[];
  saving: boolean;
  onCommit: (filesByTier: Partial<Record<AssetTier, File>>) => Promise<void> | void;
}) {
  const slotsByTier = new Map(slots.map((slot) => [slot.heat_tier, slot]));
  const [pickedFiles, setPickedFiles] = useState<Partial<Record<AssetTier, File>>>({});
  const hasPickedFiles = Object.values(pickedFiles).some(Boolean);

  useEffect(() => {
    setPickedFiles({});
  }, [offset]);

  function pickFile(tier: AssetTier, file: File) {
    const validationError = validateStoryAssetFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setPickedFiles((prev) => ({ ...prev, [tier]: file }));
  }

  function cancelInsert() {
    setPickedFiles({});
    onClose();
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/30 bg-card p-3",
        embedded ? "w-full shadow-sm" : "w-full shadow-xl",
      )}
      onClick={(event) => event.stopPropagation()}
      onDragOver={(event) => event.preventDefault()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">슬롯 추가</div>
          <div className="text-xs text-muted-foreground">몇 단계까지 넣을지 정하고 파일을 선택하세요.</div>
        </div>
        {!embedded && (
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="메뉴 닫기">
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">시작 호감도</label>
          <select
            value={rangeStart}
            onChange={(event) => onRangeStart(event.target.value as AssetTier)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ASSET_TIERS.map((tier) => (
              <option key={tier.key} value={tier.key}>
                {tier.label} - {tier.hint}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">종료 호감도</label>
          <select
            value={rangeEnd}
            onChange={(event) => onRangeEnd(event.target.value as AssetTier)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ASSET_TIERS.map((tier) => (
              <option key={tier.key} value={tier.key}>
                {tier.label} - {tier.hint}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {tiers.map((tier) => {
          const meta = ASSET_TIERS.find((item) => item.key === tier);
          const slot = slotsByTier.get(tier);
          const pickedFile = pickedFiles[tier];
          return (
            <TierUploadSlot
              key={tier}
              tier={tier}
              label={meta?.label ?? "호감도"}
              hint={meta?.hint ?? ""}
              slot={slot}
              pickedFile={pickedFile}
              onFile={(file) => pickFile(tier, file)}
            />
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setPickedFiles({})} disabled={!hasPickedFiles || saving}>
          선택 초기화
        </Button>
        <Button type="button" variant="outline" onClick={cancelInsert} disabled={saving}>
          취소
        </Button>
        <Button
          onClick={() => onCommit(pickedFiles)}
          disabled={saving || !hasPickedFiles}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "저장 중" : "슬롯추가 및 저장"}
        </Button>
      </div>
    </div>
  );
}

function InlineAssetPreview({
  storyId,
  slots,
  selected,
  selectedSlotId,
  saving,
  onSelectSlot,
  onOpenRegistration,
  onAddSlots,
  onPatchSlot,
  onRemoveSlot,
  onMoveSlot,
  onRemoveSlots,
  onMoveSlots,
}: {
  storyId: string;
  slots: AssetSlot[];
  selected: boolean;
  selectedSlotId: string | null;
  saving: boolean;
  onSelectSlot: (id: string) => void;
  onOpenRegistration: (event: React.MouseEvent<HTMLElement>) => void;
  onAddSlots: () => void;
  onPatchSlot: (id: string, patch: Partial<AssetSlot>) => void;
  onRemoveSlot: (id: string) => void;
  onMoveSlot: (id: string) => void;
  onRemoveSlots: (ids: string[]) => void;
  onMoveSlots: (ids: string[]) => void;
}) {
  const sortedSlots = [...slots].sort(
    (a, b) => ASSET_TIERS.findIndex((tier) => tier.key === a.heat_tier) - ASSET_TIERS.findIndex((tier) => tier.key === b.heat_tier),
  );
  const mediaSlots = sortedSlots.filter((slot) => slot.media_url);
  const hasMedia = mediaSlots.length > 0;
  const primarySlot = mediaSlots[0] ?? sortedSlots[0] ?? null;
  const slotIds = sortedSlots.map((slot) => slot.id);
  if (!sortedSlots.length) return null;

  return (
    <div
      className={cn(
        "my-3 rounded-md border bg-card",
        selected ? "border-primary ring-2 ring-primary/20" : "border-primary/20",
      )}
    >
      <div className="p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-primary">
              본문에 삽입된 에셋 · {hasMedia ? `${mediaSlots.length}개 파일 등록` : `${sortedSlots.length}개 빈슬롯 대기`}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={(event) => {
                event.stopPropagation();
                onOpenRegistration(event);
              }}>
                <Pencil className="size-3" />
                편집
              </Button>
              <Button
                size="sm"
                variant="outline"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-lovetale-asset", JSON.stringify({ moveSlotIds: slotIds }));
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveSlots(slotIds);
                }}
              >
                <Layers3 className="size-3" />
                이동
              </Button>
              <Button size="sm" variant="destructive" onClick={(event) => {
                event.stopPropagation();
                onRemoveSlots(slotIds);
              }}>
                <Trash2 className="size-3" />
                삭제
              </Button>
            </div>
          </div>
          {primarySlot && (
            <InlineInsertedAssetBlock
              slot={primarySlot}
              moveSlotIds={slotIds}
              slotCount={sortedSlots.length}
              mediaCount={mediaSlots.length}
              onSelect={() => onSelectSlot(primarySlot.id)}
            />
          )}
          <div className="flex min-h-24 flex-wrap items-center gap-2 rounded border border-dashed border-primary/30 bg-background p-2">
            {sortedSlots.map((slot) => (
              <InlineAssetMiniThumb
                key={slot.id}
                slot={slot}
                active={slot.id === selectedSlotId}
              onSelect={() => onSelectSlot(slot.id)}
              />
            ))}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenRegistration(event);
              }}
              className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-border bg-muted text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="size-5" />
            </button>
          </div>
      </div>
    </div>
  );
}

function InlineInsertedAssetBlock({
  slot,
  moveSlotIds,
  slotCount,
  mediaCount,
  onSelect,
}: {
  slot: AssetSlot;
  moveSlotIds: string[];
  slotCount: number;
  mediaCount: number;
  onSelect: () => void;
}) {
  const mediaUrl = useSignedCover(slot.media_url);
  const tier = ASSET_TIERS.find((item) => item.key === slot.heat_tier);
  const hasMedia = Boolean(mediaUrl);

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-lovetale-asset", JSON.stringify({ moveSlotIds }));
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "mb-2 block w-full overflow-hidden rounded-lg border text-left transition",
        hasMedia ? "border-primary/30 bg-background hover:border-primary" : "border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10",
      )}
    >
      {hasMedia ? (
        <div className="grid gap-3 p-3 sm:grid-cols-[minmax(180px,260px)_1fr]">
          <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
            {slot.media_type === "video" ? (
              <video src={mediaUrl} className="size-full object-cover" muted />
            ) : (
              <img src={mediaUrl} alt={slot.caption || slot.scene_description || "inserted asset"} className="size-full object-cover" />
            )}
          </div>
          <div className="min-w-0 self-center">
            <div className="text-sm font-semibold text-foreground">본문 사이에 삽입된 에셋</div>
            <div className="mt-1 text-xs text-muted-foreground">
              클릭하면 수정/삭제, 드래그하면 원하는 본문 위치로 바로 이동합니다. 전체 {slotCount}개 슬롯 중 {mediaCount}개 파일이 등록되어 있습니다.
            </div>
            <div className="mt-3 inline-flex rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              {tier?.label ?? "호감도"} · {tier?.hint ?? "적용 단계"}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-28 flex-col items-center justify-center p-4 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <ImageIcon className="size-5" />
          </div>
          <div className="mt-3 text-sm font-semibold text-primary">빈 에셋 슬롯이 본문에 삽입되었습니다</div>
          <div className="mt-1 text-xs text-muted-foreground">
            클릭하면 이 자리에서 파일을 업로드하거나 삭제할 수 있습니다. 현재 {slotCount}개 슬롯이 준비되어 있습니다.
          </div>
        </div>
      )}
    </button>
  );
}

function InlineAssetMiniThumb({
  slot,
  active,
  onSelect,
}: {
  slot: AssetSlot;
  active: boolean;
  onSelect: () => void;
}) {
  const mediaUrl = useSignedCover(slot.media_url);
  const tier = ASSET_TIERS.find((item) => item.key === slot.heat_tier);
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-lovetale-asset", JSON.stringify({ moveSlotId: slot.id }));
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted transition",
        active ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/50",
      )}
      title={`${tier?.label ?? "호감도"} ${slot.media_url ? "등록됨" : "미등록"} · 드래그해서 이동`}
    >
      {mediaUrl ? (
        slot.media_type === "video" ? (
          <video src={mediaUrl} className="size-full object-cover" muted />
        ) : (
          <img src={mediaUrl} alt={slot.caption || slot.scene_description || tier?.label || "asset"} className="size-full object-cover" />
        )
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground">
          <ImageIcon className="size-5" />
        </div>
      )}
      <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {tier?.label ?? "호감도"}
      </span>
    </button>
  );
}

function TierUploadSlot({
  tier,
  label,
  hint,
  slot,
  pickedFile,
  onFile,
}: {
  tier: AssetTier;
  label: string;
  hint: string;
  slot?: AssetSlot;
  pickedFile?: File;
  onFile: (file: File) => void;
}) {
  const mediaUrl = useSignedCover(slot?.media_url);
  const [pickedPreviewUrl, setPickedPreviewUrl] = useState<string | null>(null);
  const previewUrl = pickedPreviewUrl ?? mediaUrl;
  const previewType = pickedFile?.type || slot?.media_type || "";

  useEffect(() => {
    if (!pickedFile) {
      setPickedPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pickedFile);
    setPickedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pickedFile]);

  return (
    <label
      className={cn(
        "flex min-h-16 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background p-2 transition hover:border-primary/50",
        slot?.media_url ? "border-primary/40 bg-primary/5" : "border-border",
      )}
      onClick={(event) => event.stopPropagation()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
        {previewUrl ? (
          previewType.startsWith("video") || previewType === "video" ? (
            <video src={previewUrl} className="size-full object-cover" muted />
          ) : (
            <img src={previewUrl} alt={pickedFile?.name || slot?.caption || slot?.scene_description || label} className="size-full object-cover" />
          )
        ) : (
          <Upload className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>
        <div className={cn("mt-2 truncate text-xs", pickedFile ? "font-medium text-primary" : "text-muted-foreground")}>
          {pickedFile ? `선택됨: ${pickedFile.name}` : slot?.media_url ? "기존 파일 교체 가능" : "이미지/영상 선택"}
        </div>
      </div>
      <input
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        data-tier={tier}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function AssetPlacementGroup({
  storyId,
  offset,
  slots,
  selectedSlotId,
  onSelectSlot,
  onRemoveSlot,
  onAddSlot,
}: {
  storyId: string;
  offset: number;
  slots: AssetSlot[];
  selectedSlotId: string | null;
  onSelectSlot: (id: string) => void;
  onRemoveSlot: (id: string) => void;
  onAddSlot: (seed?: Partial<AssetSlot>) => void;
}) {
  const sortedSlots = [...slots].sort(
    (a, b) => ASSET_TIERS.findIndex((tier) => tier.key === a.heat_tier) - ASSET_TIERS.findIndex((tier) => tier.key === b.heat_tier),
  );
  const usedTiers = new Set(sortedSlots.map((slot) => slot.heat_tier));
  const nextTier = ASSET_TIERS.find((tier) => !usedTiers.has(tier.key));

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-foreground">등록된 에셋 {sortedSlots.length}개</div>
          <div className="text-[11px] text-muted-foreground">offset {offset.toLocaleString()} · 호감도 단계별 에셋</div>
        </div>
        <Button
          size="icon"
          variant="outline"
          disabled={!nextTier}
          title={nextTier ? `${nextTier.label} 슬롯 추가` : "모든 단계가 등록되었습니다"}
          onClick={(event) => {
            event.stopPropagation();
            if (!nextTier) return;
            onAddSlot({ heat_tier: nextTier.key, scene_description: `${nextTier.label} 에셋`, source: "manual" });
          }}
          aria-label="호감도 슬롯 추가"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sortedSlots.map((slot) => (
          <AssetSlotThumb
            key={slot.id}
            storyId={storyId}
            slot={slot}
            active={slot.id === selectedSlotId}
            onSelect={() => onSelectSlot(slot.id)}
            onRemove={() => onRemoveSlot(slot.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AssetSlotThumb({
  storyId,
  slot,
  active,
  onSelect,
  onRemove,
}: {
  storyId: string;
  slot: AssetSlot;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const mediaUrl = useSignedCover(slot.media_url);
  const tier = ASSET_TIERS.find((item) => item.key === slot.heat_tier);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md border p-2 text-left transition",
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
      )}
    >
      <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
        {mediaUrl ? (
          slot.media_type === "video" ? (
            <video src={mediaUrl} className="size-full object-cover" muted />
          ) : (
            <img src={mediaUrl} alt={slot.caption || slot.scene_description || "asset"} className="size-full object-cover" />
          )
        ) : (
          <ImageIcon className="size-4 text-muted-foreground" />
        )}
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {tier?.label ?? "단계"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{slot.scene_description || slot.caption || "에셋"}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{tier?.hint ?? "호감도"} · {slot.media_url ? "등록됨" : "미등록"}</div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 opacity-80 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label="삭제"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </button>
  );
}

function AssetPlacementRow({
  storyId,
  slot,
  active,
  onSelect,
  onPatch,
  onRemove,
}: {
  storyId: string;
  slot: AssetSlot;
  active: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<AssetSlot>) => void;
  onRemove: () => void;
}) {
  const mediaUrl = useSignedCover(slot.media_url);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border p-2 text-left transition",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40",
      )}
    >
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
        {mediaUrl ? (
          slot.media_type === "video" ? (
            <video src={mediaUrl} className="size-full object-cover" muted />
          ) : (
            <img src={mediaUrl} alt={slot.caption || slot.scene_description || "asset"} className="size-full object-cover" />
          )
        ) : (
          <ImageIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {ASSET_TIERS.find((tier) => tier.key === slot.heat_tier)?.label ?? "단계"}
          </span>
          <span className="text-xs text-muted-foreground">offset {slot.offset.toLocaleString()}</span>
        </div>
        <div className="mt-1 truncate text-sm font-medium">{slot.scene_description || "에셋 설명"}</div>
        <div className="truncate text-xs text-muted-foreground">{slot.caption || slot.media_url || "미디어 없음"}</div>
      </div>
      <select
        value={slot.heat_tier}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onPatch({ heat_tier: event.target.value as AssetTier })}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        {ASSET_TIERS.map((tier) => (
          <option key={tier.key} value={tier.key}>
            {tier.label}
          </option>
        ))}
      </select>
      <Button
        size="icon"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label="삭제"
      >
        <Trash2 className="size-4" />
      </Button>
    </button>
  );
}

function SelectedAssetEditor({
  storyId,
  slot,
  compact = false,
  onPatch,
  onRemove,
}: {
  storyId: string;
  slot: AssetSlot;
  compact?: boolean;
  onPatch: (patch: Partial<AssetSlot>) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function uploadFile(file: File | null) {
    if (!file) return;
    const validationError = validateStoryAssetFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploading(true);
    try {
      const key = await uploadStoryAsset(storyId, file);
      onPatch({
        media_url: key,
        media_type: file.type.startsWith("video/") ? "video" : "image",
        media_asset_id: key,
      });
      toast.success("에셋이 업로드되었습니다.");
    } catch (e: any) {
      toast.error(e?.message ?? "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {compact && (
        <div>
                  <div className="text-sm font-semibold">삽입된 에셋 수정</div>
                  <div className="text-xs text-muted-foreground">이 위치의 이미지/영상과 호감도 단계를 수정합니다.</div>
        </div>
      )}
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <label className="text-sm font-medium text-muted-foreground">호감도 단계</label>
        <select
          value={slot.heat_tier}
          onChange={(event) => onPatch({ heat_tier: event.target.value as AssetTier })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {ASSET_TIERS.map((tier) => (
            <option key={tier.key} value={tier.key}>
              {tier.label} - {tier.hint}
            </option>
          ))}
        </select>
      </div>
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <label className="text-sm font-medium text-muted-foreground">에셋 설명</label>
        <Textarea
          value={slot.scene_description}
          onChange={(event) => onPatch({ scene_description: event.target.value })}
          className="min-h-24"
          placeholder="이 위치에 들어갈 에셋 설명"
        />
      </div>
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <label className="text-sm font-medium text-muted-foreground">미디어 유형</label>
        <select
          value={slot.media_type ?? "image"}
          onChange={(event) => onPatch({ media_type: event.target.value as "image" | "video" })}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="image">이미지</option>
          <option value="video">영상</option>
        </select>
      </div>
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <label className="text-sm font-medium text-muted-foreground">파일 업로드</label>
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-background p-4 text-center text-sm text-muted-foreground hover:border-primary/50">
          {uploading ? <Loader2 className="mb-2 size-5 animate-spin" /> : <Upload className="mb-2 size-5" />}
          이미지 또는 영상 선택
          <input
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            onChange={(event) => {
              void uploadFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <label className="text-sm font-medium text-muted-foreground">URL 또는 저장 경로</label>
        <Input
          value={slot.media_url ?? ""}
          onChange={(event) => onPatch({ media_url: event.target.value || null })}
          placeholder="Supabase 저장 경로 또는 URL"
        />
      </div>
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <label className="text-sm font-medium text-muted-foreground">캡션</label>
        <Input value={slot.caption ?? ""} onChange={(event) => onPatch({ caption: event.target.value })} placeholder="짧은 캡션" />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onRemove}>
          <Trash2 className="size-4" />
          에셋 삭제
        </Button>
      </div>
    </div>
  );
}

function AssetLibraryItem({ slot, compact = false }: { slot: AssetLibraryEntry; compact?: boolean }) {
  const mediaUrl = useSignedCover(slot.media_url);
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(
          "application/x-lovetale-asset",
          JSON.stringify({
            media_asset_id: slot.media_asset_id,
            media_url: slot.media_url,
            media_type: slot.media_type,
            scene_description: slot.scene_description,
            caption: slot.caption,
            heat_tier: slot.heat_tier,
            source: "library",
          }),
        );
      }}
      className="group cursor-grab overflow-hidden rounded-md border border-border bg-background active:cursor-grabbing"
      title={slot.scene_description || slot.caption || "에셋"}
    >
      <div className="relative grid aspect-square place-items-center overflow-hidden bg-muted">
        {mediaUrl ? (
          slot.media_type === "video" ? (
            <video src={mediaUrl} className="size-full object-cover" muted />
          ) : (
            <img src={mediaUrl} alt={slot.caption || slot.scene_description || "asset"} className="size-full object-cover" />
          )
        ) : (
          <ImageIcon className="size-4 text-muted-foreground" />
        )}
        {slot.media_type === "video" && (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            영상
          </span>
        )}
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {ASSET_TIERS.find((tier) => tier.key === slot.heat_tier)?.label ?? "에셋"}
        </span>
      </div>
      {!compact && (
        <div className="min-w-0 p-2">
          <div className="truncate text-xs font-medium">{slot.scene_description || slot.caption || "에셋"}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{slot.chapterTitle}</div>
        </div>
      )}
    </div>
  );
}

function PlacementDialog({
  storyId,
  title,
  onClose,
}: {
  storyId: string;
  title: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getPlacement = useServerFn(getStoryHomePlacement);
  const setPlacement = useServerFn(setStoryHomePlacement);

  const placementQ = useQuery({
    queryKey: ["story_placement", storyId],
    queryFn: () => getPlacement({ data: { id: storyId } }),
  });

  const [slots, setSlots] = useState<PlacementSlot[]>([]);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (Array.isArray(placementQ.data)) {
      setSlots(placementQ.data.map((row) => row.slot));
      setSortOrder(placementQ.data[0]?.sort_order ?? 0);
    } else {
      setSlots([]);
      setSortOrder(0);
    }
  }, [placementQ.data]);

  const saveMut = useMutation({
    mutationFn: () => setPlacement({ data: { id: storyId, slots, sort_order: sortOrder } }),
    onSuccess: () => {
      toast.success("노출 위치가 저장되었습니다.");
      qc.invalidateQueries({ queryKey: ["story_placement", storyId] });
      qc.invalidateQueries({ queryKey: ["home_placements"] });
      qc.invalidateQueries({ queryKey: ["home_placement"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const SLOTS: { key: PlacementSlot; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
    { key: "hero", label: "히어로 섹션", icon: Flame, hint: "메인 최상단 대표 노출" },
    { key: "trending", label: "지금 뜨거운 스토리", icon: Star, hint: "인기 콘텐츠 영역" },
    { key: "new", label: "신작", icon: Sparkles, hint: "새로 등록한 콘텐츠" },
    { key: "all", label: "모든 스토리", icon: EyeOff, hint: "홈 하단 전체 목록" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>노출 위치 - {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {SLOTS.map((s) => {
              const active = slots.includes(s.key);
              return (
                <button
                  key={String(s.key)}
                  type="button"
                  onClick={() =>
                    setSlots((prev) =>
                      prev.includes(s.key) ? prev.filter((item) => item !== s.key) : [...prev, s.key],
                    )
                  }
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition",
                    active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
                  )}
                >
                  <span className="inline-flex items-center gap-1 font-medium">
                    <s.icon className="size-4" /> {s.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{s.hint}</span>
                </button>
              );
            })}
          </div>
          {slots.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">Sort order</label>
              <Input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function actionLabel(a: "publish" | "unlist" | "private") {
  return a === "publish" ? "publish" : a === "unlist" ? "unlist" : "private";
}




