import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Plus,
  Search,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@/lib/_mock/runtime";
import { createDraftStory, listAdminStories } from "@/lib/admin-stories.functions";
import { ensureStoryMediaBucket } from "@/lib/storage.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/import")({
  head: () => ({ meta: [{ title: "새 콘텐츠 등록 - Lovetale Studio" }] }),
  component: NewContentPage,
});

const TYPES = [
  { key: "web_novel", label: "웹소설", desc: "텍스트 중심" },
  { key: "romance_sim", label: "연애 시뮬", desc: "호감도/선택지" },
  { key: "webtoon", label: "웹툰", desc: "이미지 중심" },
  { key: "short_story", label: "단편", desc: "짧은 완결" },
  { key: "other", label: "기타", desc: "자유 형식" },
] as const;

const MAX_EPISODE_BODY_CHARS = 100_000;

type CreationMode = "new_story" | "append_episode";
type PreviewType = "image" | "video";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

async function requestEpisodeSummary(title: string, text: string) {
  const token = await getAccessToken();
  const response = await fetch("/api/admin/import-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title, text }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || payload?.reason || "회차 요약 생성에 실패했습니다.");
  }
  return { summary: String(payload.summary ?? "") };
}

function NewContentPage() {
  const createDraft = useServerFn(createDraftStory);
  const fetchStories = useServerFn(listAdminStories);
  const [mode, setMode] = useState<CreationMode>("new_story");
  const [title, setTitle] = useState("");
  const [storyOverview, setStoryOverview] = useState("");
  const [episodeBody, setEpisodeBody] = useState("");
  const [episodeSummary, setEpisodeSummary] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [contentType, setContentType] = useState<(typeof TYPES)[number]["key"]>("web_novel");
  const [targetStoryId, setTargetStoryId] = useState("");
  const [search, setSearch] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPreview, setPreviewPreview] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>("image");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const storiesQ = useQuery({
    queryKey: ["admin_stories", "picker"],
    queryFn: () => fetchStories({ data: {} }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const stories = useMemo(() => {
    const rows = storiesQ.data ?? [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row: any) => `${row.title} ${row.logline ?? ""}`.toLowerCase().includes(q));
  }, [storiesQ.data, search]);

  const selectedStory = useMemo(
    () => (storiesQ.data ?? []).find((story: any) => story.id === targetStoryId),
    [storiesQ.data, targetStoryId],
  );
  const nextEpisodeNumber = Number(selectedStory?.chapters_count ?? 0) + 1;
  const episodeBodyLimitReached = episodeBody.length >= MAX_EPISODE_BODY_CHARS;

  const summaryMut = useMutation({
    mutationFn: () => requestEpisodeSummary(title.trim(), episodeBody),
    onSuccess: (result) => {
      setEpisodeSummary(result.summary);
      toast.success("회차 요약을 생성했어요.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateEpisodeBody(value: string) {
    if (value.length > MAX_EPISODE_BODY_CHARS) {
      setEpisodeBody(value.slice(0, MAX_EPISODE_BODY_CHARS));
      toast.warning("회차 본문은 최대 10만자까지 입력할 수 있어요.");
      return;
    }
    setEpisodeBody(value);
  }

  async function handleSubmit() {
    if (submitting) return;
    const isEpisode = mode === "append_episode";
    if (isEpisode && !targetStoryId) {
      toast.error("회차를 추가할 기존 상품을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const { id } = await createDraft({
        data: {
          title: title.trim(),
          contentType,
          sourceText: isEpisode ? episodeBody.trim() : "",
          storyOverview: isEpisode ? "" : storyOverview.trim(),
          episodeSummary: isEpisode ? episodeSummary.trim() : "",
          authorName: isEpisode ? "" : authorName.trim(),
          targetStoryId: isEpisode ? targetStoryId || undefined : undefined,
          coverUrl: isEpisode ? null : coverUrl,
          previewUrl: isEpisode ? null : previewUrl,
          previewType: !isEpisode && previewUrl ? previewType : null,
        },
      });

      toast.success(mode === "append_episode" ? "회차를 추가했어요." : "새 스토리를 만들었어요.");
      window.location.assign(`/admin/stories/${encodeURIComponent(id)}/compose?mode=append_episode`);
    } catch (error: any) {
      setSubmitting(false);
      toast.error(error?.message ?? "콘텐츠 저장에 실패했어요.");
    }
  }

  async function uploadMedia(file: File, kind: "cover" | "preview") {
    const setUploading = kind === "cover" ? setUploadingCover : setUploadingPreview;
    try {
      setUploading(true);
      await ensureStoryMediaBucket();
      const ext = file.name.split(".").pop() || "bin";
      const key = `${kind === "cover" ? "covers" : "previews"}/new/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("story-media")
        .upload(key, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      const localPreview = URL.createObjectURL(file);
      if (kind === "cover") {
        setCoverUrl(key);
        setCoverPreview(localPreview);
      } else {
        setPreviewUrl(key);
        setPreviewPreview(localPreview);
        setPreviewType(file.type.startsWith("video/") ? "video" : "image");
      }
      toast.success(kind === "cover" ? "표지 이미지를 등록했어요." : "미리보기 파일을 등록했어요.");
    } catch (error: any) {
      toast.error(error?.message ?? "업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
  }

  const submitDisabled =
    submitting ||
    uploadingCover ||
    uploadingPreview ||
    (mode === "append_episode" && !targetStoryId);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        to="/admin/stories"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        콘텐츠 관리로 돌아가기
      </Link>

      <header className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
          Content CMS
        </span>
        <h1 className="font-display text-3xl font-semibold">새 콘텐츠 등록</h1>
        <p className="text-sm text-muted-foreground">
          새 스토리는 상품 정보를 먼저 만들고, 회차 추가는 기존 상품에 간단한 회차 정보만 붙입니다.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("new_story")}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-left text-sm",
              mode === "new_story"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <BookOpen className="size-4 shrink-0" />
            <span>
              <span className="block font-medium">새 스토리 생성</span>
              <span className="block text-xs text-muted-foreground">상품 제목, 표지, 유형, 줄거리 입력</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("append_episode")}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-left text-sm",
              mode === "append_episode"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <Layers3 className="size-4 shrink-0" />
            <span>
              <span className="block font-medium">회차 추가</span>
              <span className="block text-xs text-muted-foreground">기존 상품 선택 후 회차 제목/요약 입력</span>
            </span>
          </button>
        </div>

        {mode === "append_episode" ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-background p-3">
              <label className="text-xs font-medium text-muted-foreground">기존 상품 선택</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="스토리 제목으로 검색"
                  className="pl-9"
                />
              </div>
              {selectedStory && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                  <div className="text-xs text-muted-foreground">선택한 상품</div>
                  <div className="font-medium">{selectedStory.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    기존 {selectedStory.chapters_count ?? 0}회차, 다음 회차 번호 {nextEpisodeNumber}
                  </div>
                </div>
              )}
              <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                {(stories as any[]).map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => setTargetStoryId(story.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm",
                      targetStoryId === story.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{story.title}</span>
                      <span className="text-xs text-muted-foreground">{story.chapters_count ?? 0}회차</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {story.logline || "줄거리 없음"}
                    </div>
                  </button>
                ))}
                {!stories.length && (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                    선택할 상품이 없어요.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                회차 제목
                {selectedStory ? ` (자동 번호: ${nextEpisodeNumber}회차)` : ""}
              </label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={selectedStory ? `비워두면 Episode ${nextEpisodeNumber}` : "기존 상품을 먼저 선택하세요"}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">회차 요약</label>
                <span className="text-[11px] text-muted-foreground">{episodeSummary.length.toLocaleString()}자</span>
              </div>
              <Textarea
                value={episodeSummary}
                onChange={(event) => setEpisodeSummary(event.target.value)}
                placeholder="이번 회차에서 벌어지는 핵심 사건이나 관리 메모를 간단히 입력하세요. 비워도 저장됩니다."
                className="min-h-28 resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">회차 본문 콘텐츠</label>
                <span
                  className={cn(
                    "text-[11px]",
                    episodeBodyLimitReached ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                >
                  {episodeBody.length.toLocaleString()} / {MAX_EPISODE_BODY_CHARS.toLocaleString()}자
                </span>
              </div>
              <Textarea
                value={episodeBody}
                onChange={(event) => updateEpisodeBody(event.target.value)}
                placeholder="해당 회차의 본문 텍스트를 입력하세요. 최대 10만자까지 저장할 수 있으며, 줄바꿈은 편집/미리보기 화면에 유지됩니다."
                className="min-h-[440px] resize-y whitespace-pre-wrap font-mono text-[13px] leading-[1.75]"
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>본문을 먼저 붙여넣은 뒤 AI 요약을 생성할 수 있습니다.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => summaryMut.mutate()}
                  disabled={summaryMut.isPending || episodeBody.trim().length < 80}
                >
                  {summaryMut.isPending ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Wand2 className="mr-1 size-3" />
                  )}
                  AI로 회차 요약
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">스토리 제목</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="비워두면 Untitled story"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">작가명</label>
                <Input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  placeholder="작가명 선택 입력"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">스토리 유형</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {TYPES.map((type) => (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => setContentType(type.key)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left",
                      contentType === type.key
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/40",
                    )}
                  >
                    <div className="text-sm font-medium">{type.label}</div>
                    <div className="text-[11px] text-muted-foreground">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground">표지 이미지</label>
              <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)]">
                <div className="aspect-[4/5] overflow-hidden rounded-xl border border-border bg-background">
                  {coverPreview || coverUrl ? (
                    <img src={coverPreview ?? coverUrl ?? ""} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center">
                      <ImageIcon className="size-7 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label
                    className={cn(
                      "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50",
                      uploadingCover && "pointer-events-none opacity-60",
                    )}
                  >
                    {uploadingCover ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    이미지 업로드
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadMedia(file, "cover");
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <Input
                    value={coverUrl ?? ""}
                    onChange={(event) => {
                      setCoverUrl(event.target.value || null);
                      setCoverPreview(null);
                    }}
                    placeholder="이미지 URL 또는 storage path"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground">미리보기 이미지/영상</label>
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="aspect-video overflow-hidden rounded-xl border border-border bg-background">
                  {previewPreview || previewUrl ? (
                    previewType === "video" ? (
                      <video src={previewPreview ?? previewUrl ?? ""} className="size-full object-cover" muted controls />
                    ) : (
                      <img src={previewPreview ?? previewUrl ?? ""} alt="" className="size-full object-cover" />
                    )
                  ) : (
                    <div className="grid size-full place-items-center">
                      <Video className="size-7 text-muted-foreground/60" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={previewType === "image" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPreviewType("image")}
                    >
                      이미지
                    </Button>
                    <Button
                      type="button"
                      variant={previewType === "video" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPreviewType("video")}
                    >
                      영상
                    </Button>
                  </div>
                  <label
                    className={cn(
                      "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50",
                      uploadingPreview && "pointer-events-none opacity-60",
                    )}
                  >
                    {uploadingPreview ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    파일 업로드
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadMedia(file, "preview");
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <Input
                    value={previewUrl ?? ""}
                    onChange={(event) => {
                      setPreviewUrl(event.target.value || null);
                      setPreviewPreview(null);
                    }}
                    placeholder="미리보기 URL 또는 storage path"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">스토리 줄거리</label>
                <span className="text-[11px] text-muted-foreground">{storyOverview.length.toLocaleString()}자</span>
              </div>
              <Textarea
                value={storyOverview}
                onChange={(event) => setStoryOverview(event.target.value)}
                placeholder="스토리 줄거리, 주요 설정, 상품 소개 문구 등을 입력하세요. 비워도 저장됩니다."
                className="min-h-40 resize-none"
              />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          {mode === "append_episode"
            ? "회차 추가는 기존 상품 선택만 필수입니다. 제목을 비우면 다음 회차 번호로 자동 저장됩니다."
            : "새 스토리는 미입력 정보가 있어도 먼저 저장할 수 있고, 편집 화면에서 상품/회차/에셋 정보를 이어서 보완할 수 있습니다."}
        </div>

        <Button onClick={handleSubmit} disabled={submitDisabled} className="h-11 w-full">
          {submitting ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Plus className="mr-1 size-3.5" />}
          {mode === "append_episode" ? "회차 추가하고 편집 열기" : "새 스토리 만들고 회차 입력하기"}
        </Button>
      </section>
    </div>
  );
}
