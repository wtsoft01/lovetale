import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Coins,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@/lib/_mock/runtime";
import { createDraftStory, listAdminStories } from "@/lib/admin-stories.functions";
import { ensureStoryMediaBucket } from "@/lib/storage.functions";
import { fetchWithSupabaseAuth } from "@/lib/supabase-auth-fetch";
import { normalizeProseLineBreaks } from "@/lib/text-normalization";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/import")({
  head: () => ({ meta: [{ title: "새 콘텐츠 등록 | Lovetale Studio" }] }),
  component: NewContentPage,
});

const CONTENT_TYPES = [
  { key: "web_novel", label: "웹소설", desc: "텍스트 중심" },
  { key: "romance_sim", label: "연애 시뮬레이션", desc: "캐릭터 대화 중심" },
  { key: "story_rpg", label: "스토리게임", desc: "선택지와 분기형 게임" },
  { key: "webtoon", label: "웹툰", desc: "이미지 중심" },
  { key: "short_story", label: "단편", desc: "짧은 완결형" },
  { key: "other", label: "기타", desc: "자유 형식" },
] as const;

const HEAT_PRESETS = [
  { key: "soft", label: "Soft" },
  { key: "warm", label: "Warm" },
  { key: "spicy", label: "Spicy" },
  { key: "steamy", label: "Steamy" },
] as const;

const AUDIENCES = [
  { key: "all", label: "전체" },
  { key: "female", label: "여성향" },
  { key: "male", label: "남성향" },
] as const;

const MAX_EPISODE_BODY_CHARS = 100_000;

type CreationMode = "new_story" | "append_episode";
type PreviewType = "image" | "video";
type ContentType = (typeof CONTENT_TYPES)[number]["key"];
type HeatPreset = (typeof HEAT_PRESETS)[number]["key"];
type Audience = (typeof AUDIENCES)[number]["key"];

type AiMetadataResult = {
  title?: string;
  logline?: string;
  storyOverview?: string;
  episodeTitle?: string;
  episodeSummary?: string;
  characterName?: string;
  characterRole?: string;
  characterPersona?: string;
  characterSpeakingStyle?: string;
  tags?: string[];
};

async function requestImportAi(input: {
  mode: "episode_summary" | "story_metadata";
  title: string;
  text: string;
  storyOverview?: string;
}) {
  const response = await fetchWithSupabaseAuth("/api/admin/import-summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || payload?.reason || "AI 자동 생성에 실패했습니다.");
  }
  return payload as { ok: true; summary?: string; metadata?: AiMetadataResult };
}

function NewContentPage() {
  const createDraft = useServerFn(createDraftStory);
  const fetchStories = useServerFn(listAdminStories);

  const [mode, setMode] = useState<CreationMode>("new_story");
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [storyOverview, setStoryOverview] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [episodeBody, setEpisodeBody] = useState("");
  const [episodeSummary, setEpisodeSummary] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [contentType, setContentType] = useState<ContentType>("web_novel");
  const [audience, setAudience] = useState<Audience>("all");
  const [maxHeat, setMaxHeat] = useState<HeatPreset>("warm");
  const [priceCredits, setPriceCredits] = useState(0);
  const [tagsText, setTagsText] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterRole, setCharacterRole] = useState("상대 주인공");
  const [characterPersona, setCharacterPersona] = useState("");
  const [characterSpeakingStyle, setCharacterSpeakingStyle] = useState("");
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
    const needle = search.trim().toLowerCase();
    return rows.filter((row: any) => `${row.title} ${row.logline ?? ""}`.toLowerCase().includes(needle));
  }, [storiesQ.data, search]);

  const selectedStory = useMemo(
    () => (storiesQ.data ?? []).find((story: any) => story.id === targetStoryId),
    [storiesQ.data, targetStoryId],
  );
  const nextEpisodeNumber = Number(selectedStory?.chapters_count ?? 0) + 1;
  const episodeBodyLimitReached = episodeBody.length >= MAX_EPISODE_BODY_CHARS;
  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

  const summaryMut = useMutation({
    mutationFn: () =>
      requestImportAi({
        mode: "episode_summary",
        title: episodeTitle.trim() || title.trim(),
        text: episodeBody,
    }),
    onSuccess: (result) => {
      setEpisodeSummary(String(result.summary ?? ""));
      toast.success("회원 노출용 회차 요약을 생성했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const metadataMut = useMutation({
    mutationFn: () =>
      requestImportAi({
        mode: "story_metadata",
        title: title.trim() || episodeTitle.trim(),
        text: episodeBody || storyOverview,
        storyOverview,
      }),
    onSuccess: (result) => {
      const meta = result.metadata ?? {};
      if (meta.title) setTitle(meta.title);
      if (meta.logline) setLogline(meta.logline);
      if (meta.storyOverview) setStoryOverview(meta.storyOverview);
      if (meta.episodeTitle && !episodeTitle.trim()) setEpisodeTitle(meta.episodeTitle);
      if (meta.episodeSummary) setEpisodeSummary(meta.episodeSummary);
      if (meta.characterName) setCharacterName(meta.characterName);
      if (meta.characterRole) setCharacterRole(meta.characterRole);
      if (meta.characterPersona) setCharacterPersona(meta.characterPersona);
      if (meta.characterSpeakingStyle) setCharacterSpeakingStyle(meta.characterSpeakingStyle);
      if (meta.tags?.length) setTagsText(meta.tags.join(", "));
      toast.success("회원 노출용 상품 소개와 태그를 채웠습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateEpisodeBody(value: string) {
    if (value.length > MAX_EPISODE_BODY_CHARS) {
      setEpisodeBody(value.slice(0, MAX_EPISODE_BODY_CHARS));
      toast.warning("회차 본문은 최대 10만자까지 입력할 수 있습니다.");
      return;
    }
    setEpisodeBody(value);
  }
  async function handleSubmit() {
    if (submitting) return;
    const isEpisode = mode === "append_episode";
    if (isEpisode && !targetStoryId) {
      toast.error("회차를 추가할 기존 상품을 선택하세요.");
      return;
    }

    setSubmitting(true);
    try {
      const fallbackTitle =
        mode === "new_story" ? title.trim() || episodeTitle.trim() || "Untitled story" : episodeTitle.trim();
      const { id } = await createDraft({
        data: {
          title: fallbackTitle,
          contentType,
          sourceText: normalizeProseLineBreaks(episodeBody).trim(),
          storyOverview: isEpisode ? "" : storyOverview.trim(),
          logline: isEpisode ? null : logline.trim(),
          episodeTitle: episodeTitle.trim(),
          episodeSummary: episodeSummary.trim(),
          authorName: isEpisode ? "" : authorName.trim(),
          targetStoryId: isEpisode ? targetStoryId || undefined : undefined,
          coverUrl: isEpisode ? null : coverUrl,
          previewUrl: isEpisode ? null : previewUrl,
          previewType: !isEpisode && previewUrl ? previewType : null,
          tags: isEpisode ? [] : tags,
          audience: isEpisode ? undefined : audience,
          maxHeat: isEpisode ? undefined : maxHeat,
          priceCredits: isEpisode ? undefined : priceCredits,
          characterName: isEpisode ? "" : characterName.trim(),
          characterRole: isEpisode ? "" : characterRole.trim(),
          characterPersona: isEpisode ? "" : characterPersona.trim(),
          characterSpeakingStyle: isEpisode ? "" : characterSpeakingStyle.trim(),
        },
      });

      toast.success(mode === "append_episode" ? "회차를 추가했습니다." : "새 스토리를 만들었습니다.");
      const tab = mode === "append_episode" ? "chapter" : "info";
      window.location.assign(`/admin/stories?workspace=${encodeURIComponent(id)}&tab=${tab}`);
    } catch (error: any) {
      setSubmitting(false);
      toast.error(error?.message ?? "콘텐츠 저장에 실패했습니다.");
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
      toast.success(kind === "cover" ? "표지 이미지를 등록했습니다." : "미리보기 파일을 등록했습니다.");
    } catch (error: any) {
      toast.error(error?.message ?? "업로드에 실패했습니다.");
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
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        to="/admin/stories"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        스토리관리로 돌아가기
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
            Content CMS
          </span>
          <h1 className="mt-1 font-display text-3xl font-semibold">새 콘텐츠 등록</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => metadataMut.mutate()}
          disabled={metadataMut.isPending || (episodeBody.trim().length < 80 && storyOverview.trim().length < 40)}
        >
          {metadataMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          AI 채우기
        </Button>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeButton
            active={mode === "new_story"}
            icon={BookOpen}
            title="새 스토리 생성"
            onClick={() => setMode("new_story")}
          />
          <ModeButton
            active={mode === "append_episode"}
            icon={Layers3}
            title="회차 추가"
            onClick={() => setMode("append_episode")}
          />
        </div>

        {mode === "append_episode" ? (
          <EpisodeAppendForm
            stories={stories as any[]}
            selectedStory={selectedStory}
            targetStoryId={targetStoryId}
            search={search}
            nextEpisodeNumber={nextEpisodeNumber}
            episodeTitle={episodeTitle}
            episodeSummary={episodeSummary}
            episodeBody={episodeBody}
            episodeBodyLimitReached={episodeBodyLimitReached}
            summaryPending={summaryMut.isPending}
            onSearch={setSearch}
            onSelectStory={setTargetStoryId}
            onEpisodeTitle={setEpisodeTitle}
            onEpisodeSummary={setEpisodeSummary}
            onEpisodeBody={updateEpisodeBody}
            onSummarize={() => summaryMut.mutate()}
          />
        ) : (
          <NewStoryForm
            title={title}
            logline={logline}
            storyOverview={storyOverview}
            authorName={authorName}
            contentType={contentType}
            audience={audience}
            maxHeat={maxHeat}
            priceCredits={priceCredits}
            tagsText={tagsText}
            characterName={characterName}
            characterRole={characterRole}
            characterPersona={characterPersona}
            characterSpeakingStyle={characterSpeakingStyle}
            coverUrl={coverUrl}
            coverPreview={coverPreview}
            previewUrl={previewUrl}
            previewPreview={previewPreview}
            previewType={previewType}
            uploadingCover={uploadingCover}
            uploadingPreview={uploadingPreview}
            episodeTitle={episodeTitle}
            episodeSummary={episodeSummary}
            episodeBody={episodeBody}
            episodeBodyLimitReached={episodeBodyLimitReached}
            summaryPending={summaryMut.isPending}
            onTitle={setTitle}
            onLogline={setLogline}
            onStoryOverview={setStoryOverview}
            onAuthorName={setAuthorName}
            onContentType={setContentType}
            onAudience={setAudience}
            onMaxHeat={setMaxHeat}
            onPriceCredits={setPriceCredits}
            onTagsText={setTagsText}
            onCharacterName={setCharacterName}
            onCharacterRole={setCharacterRole}
            onCharacterPersona={setCharacterPersona}
            onCharacterSpeakingStyle={setCharacterSpeakingStyle}
            onCoverUrl={(value) => {
              setCoverUrl(value || null);
              setCoverPreview(null);
            }}
            onPreviewUrl={(value) => {
              setPreviewUrl(value || null);
              setPreviewPreview(null);
            }}
            onPreviewType={setPreviewType}
            onUploadMedia={uploadMedia}
            onEpisodeTitle={setEpisodeTitle}
            onEpisodeSummary={setEpisodeSummary}
            onEpisodeBody={updateEpisodeBody}
            onSummarize={() => summaryMut.mutate()}
          />
        )}

        <Button onClick={handleSubmit} disabled={submitDisabled} className="h-11 w-full">
          {submitting ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Plus className="mr-1 size-3.5" />}
          {mode === "append_episode" ? "회차 추가하고 편집 열기" : "새 스토리 만들고 편집 열기"}
        </Button>
      </section>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: typeof BookOpen;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left text-sm",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/40",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="font-medium">{title}</span>
    </button>
  );
}

function EpisodeAppendForm(props: {
  stories: any[];
  selectedStory: any;
  targetStoryId: string;
  search: string;
  nextEpisodeNumber: number;
  episodeTitle: string;
  episodeSummary: string;
  episodeBody: string;
  episodeBodyLimitReached: boolean;
  summaryPending: boolean;
  onSearch: (value: string) => void;
  onSelectStory: (id: string) => void;
  onEpisodeTitle: (value: string) => void;
  onEpisodeSummary: (value: string) => void;
  onEpisodeBody: (value: string) => void;
  onSummarize: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-background p-3">
        <label className="text-xs font-medium text-muted-foreground">기존 상품 선택</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="스토리 제목으로 검색"
            className="pl-9"
          />
        </div>
        {props.selectedStory && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
            <div className="text-xs text-muted-foreground">선택한 상품</div>
            <div className="font-medium">{props.selectedStory.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              기존 {props.selectedStory.chapters_count ?? 0}회차, 다음 회차 번호 {props.nextEpisodeNumber}
            </div>
          </div>
        )}
        <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
          {props.stories.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => props.onSelectStory(story.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left text-sm",
                props.targetStoryId === story.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{story.title}</span>
                <span className="text-xs text-muted-foreground">{story.chapters_count ?? 0}회차</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{story.logline || "줄거리 없음"}</div>
            </button>
          ))}
          {!props.stories.length && (
            <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
              선택할 상품이 없습니다.
            </div>
          )}
        </div>
      </div>

      <EpisodeFields
        episodeTitle={props.episodeTitle}
        episodeSummary={props.episodeSummary}
        episodeBody={props.episodeBody}
        episodeBodyLimitReached={props.episodeBodyLimitReached}
        summaryPending={props.summaryPending}
        titlePlaceholder={props.selectedStory ? `비우면 ${props.nextEpisodeNumber}화` : "기존 상품을 먼저 선택하세요"}
        onEpisodeTitle={props.onEpisodeTitle}
        onEpisodeSummary={props.onEpisodeSummary}
        onEpisodeBody={props.onEpisodeBody}
        onSummarize={props.onSummarize}
      />
    </div>
  );
}

function NewStoryForm(props: {
  title: string;
  logline: string;
  storyOverview: string;
  authorName: string;
  contentType: ContentType;
  audience: Audience;
  maxHeat: HeatPreset;
  priceCredits: number;
  tagsText: string;
  characterName: string;
  characterRole: string;
  characterPersona: string;
  characterSpeakingStyle: string;
  coverUrl: string | null;
  coverPreview: string | null;
  previewUrl: string | null;
  previewPreview: string | null;
  previewType: PreviewType;
  uploadingCover: boolean;
  uploadingPreview: boolean;
  episodeTitle: string;
  episodeSummary: string;
  episodeBody: string;
  episodeBodyLimitReached: boolean;
  summaryPending: boolean;
  onTitle: (value: string) => void;
  onLogline: (value: string) => void;
  onStoryOverview: (value: string) => void;
  onAuthorName: (value: string) => void;
  onContentType: (value: ContentType) => void;
  onAudience: (value: Audience) => void;
  onMaxHeat: (value: HeatPreset) => void;
  onPriceCredits: (value: number) => void;
  onTagsText: (value: string) => void;
  onCharacterName: (value: string) => void;
  onCharacterRole: (value: string) => void;
  onCharacterPersona: (value: string) => void;
  onCharacterSpeakingStyle: (value: string) => void;
  onCoverUrl: (value: string) => void;
  onPreviewUrl: (value: string) => void;
  onPreviewType: (value: PreviewType) => void;
  onUploadMedia: (file: File, kind: "cover" | "preview") => void;
  onEpisodeTitle: (value: string) => void;
  onEpisodeSummary: (value: string) => void;
  onEpisodeBody: (value: string) => void;
  onSummarize: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="스토리 제목">
              <Input value={props.title} onChange={(event) => props.onTitle(event.target.value)} placeholder="비우면 Untitled story" />
            </Field>
            <Field label="작가명">
              <Input value={props.authorName} onChange={(event) => props.onAuthorName(event.target.value)} placeholder="선택 입력" />
            </Field>
          </div>
          <Field label="로그라인">
            <Input
              value={props.logline}
              onChange={(event) => props.onLogline(event.target.value)}
              placeholder="회원이 클릭하고 싶게 만드는 한 줄 소개"
              maxLength={180}
            />
          </Field>
          <Field label="스토리 줄거리">
            <Textarea
              value={props.storyOverview}
              onChange={(event) => props.onStoryOverview(event.target.value)}
              placeholder="관계, 갈등, 비밀, 감정 변화를 담은 회원 노출용 소개문"
              className="min-h-32 resize-y"
            />
          </Field>
        </div>
        <CoverUploader
          coverUrl={props.coverUrl}
          coverPreview={props.coverPreview}
          uploadingCover={props.uploadingCover}
          onCoverUrl={props.onCoverUrl}
          onUpload={(file) => props.onUploadMedia(file, "cover")}
        />
      </section>

      <section className="space-y-3">
        <Field label="스토리 유형">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CONTENT_TYPES.map((type) => (
              <ChoiceButton
                key={type.key}
                active={props.contentType === type.key}
                title={type.label}
                desc={type.desc}
                onClick={() => props.onContentType(type.key)}
              />
            ))}
          </div>
        </Field>
        <Field label="노출/과금 기준">
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={props.audience}
              onChange={(event) => props.onAudience(event.target.value as Audience)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {AUDIENCES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={props.maxHeat}
              onChange={(event) => props.onMaxHeat(event.target.value as HeatPreset)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {HEAT_PRESETS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Coins className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                min={0}
                value={props.priceCredits}
                onChange={(event) => props.onPriceCredits(Math.max(0, Number(event.target.value) || 0))}
                className="pl-8"
              />
            </div>
          </div>
        </Field>
      </section>

      <Field label="태그">
        <Input
          value={props.tagsText}
          onChange={(event) => props.onTagsText(event.target.value)}
          placeholder="계약연애, 긴장감, 로맨스"
        />
      </Field>

      <section className="space-y-3">
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="text-sm font-semibold">상대 캐릭터</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="이름">
              <Input value={props.characterName} onChange={(event) => props.onCharacterName(event.target.value)} placeholder="상대 주인공 이름" />
            </Field>
            <Field label="역할">
              <Input value={props.characterRole} onChange={(event) => props.onCharacterRole(event.target.value)} placeholder="CEO, 소꿉친구, 계약 상대 등" />
            </Field>
          </div>
          <Field label="성격/관계 설정">
            <Textarea
              value={props.characterPersona}
              onChange={(event) => props.onCharacterPersona(event.target.value)}
              placeholder="사용자와의 관계, 성격, 비밀, 갈등, 감정선"
              className="min-h-24"
            />
          </Field>
          <Field label="말투">
            <Textarea
              value={props.characterSpeakingStyle}
              onChange={(event) => props.onCharacterSpeakingStyle(event.target.value)}
              placeholder="짧게 말함, 반말/존댓말, 감정 표현 방식 등"
              className="min-h-20"
            />
          </Field>
        </div>
        <PreviewUploader
          previewUrl={props.previewUrl}
          previewPreview={props.previewPreview}
          previewType={props.previewType}
          uploadingPreview={props.uploadingPreview}
          onPreviewUrl={props.onPreviewUrl}
          onPreviewType={props.onPreviewType}
          onUpload={(file) => props.onUploadMedia(file, "preview")}
        />
      </section>

      <section className="rounded-lg border border-border bg-background p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Layers3 className="size-4 text-primary" />
          첫 회차 정보
        </div>
        <EpisodeFields
          episodeTitle={props.episodeTitle}
          episodeSummary={props.episodeSummary}
          episodeBody={props.episodeBody}
          episodeBodyLimitReached={props.episodeBodyLimitReached}
          summaryPending={props.summaryPending}
          titlePlaceholder="비우면 1화"
          onEpisodeTitle={props.onEpisodeTitle}
          onEpisodeSummary={props.onEpisodeSummary}
          onEpisodeBody={props.onEpisodeBody}
          onSummarize={props.onSummarize}
        />
      </section>
    </div>
  );
}

function EpisodeFields(props: {
  episodeTitle: string;
  episodeSummary: string;
  episodeBody: string;
  episodeBodyLimitReached: boolean;
  summaryPending: boolean;
  titlePlaceholder: string;
  onEpisodeTitle: (value: string) => void;
  onEpisodeSummary: (value: string) => void;
  onEpisodeBody: (value: string) => void;
  onSummarize: () => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="회차 제목">
        <Input value={props.episodeTitle} onChange={(event) => props.onEpisodeTitle(event.target.value)} placeholder={props.titlePlaceholder} />
      </Field>
      <Field label="회차 요약">
        <Textarea
          value={props.episodeSummary}
          onChange={(event) => props.onEpisodeSummary(event.target.value)}
          placeholder="핵심 사건과 감정 변화"
          className="min-h-24 resize-y"
        />
      </Field>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-xs font-medium text-muted-foreground">회차 본문 콘텐츠</label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => props.onEpisodeBody(normalizeProseLineBreaks(props.episodeBody))}
            >
              PDF 줄바꿈 정리
            </Button>
            <span
              className={cn(
                "text-[11px]",
                props.episodeBodyLimitReached ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {props.episodeBody.length.toLocaleString()} / {MAX_EPISODE_BODY_CHARS.toLocaleString()}자
            </span>
          </div>
        </div>
        <Textarea
          value={props.episodeBody}
          onChange={(event) => props.onEpisodeBody(event.target.value)}
          onBlur={() => props.onEpisodeBody(normalizeProseLineBreaks(props.episodeBody))}
          onPaste={(event) => {
            const target = event.currentTarget;
            window.setTimeout(() => props.onEpisodeBody(normalizeProseLineBreaks(target.value)), 0);
          }}
          placeholder="회차 본문"
          className="min-h-[420px] resize-y whitespace-pre-line font-mono text-[13px] leading-[1.75]"
          spellCheck={false}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={props.onSummarize}
            disabled={props.summaryPending || props.episodeBody.trim().length < 80}
          >
            {props.summaryPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Wand2 className="mr-1 size-3" />}
            AI 회차 요약
          </Button>
        </div>
      </div>
    </div>
  );
}

function CoverUploader(props: {
  coverUrl: string | null;
  coverPreview: string | null;
  uploadingCover: boolean;
  onCoverUrl: (value: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[96px_minmax(0,1fr)]">
      <div className="aspect-[4/5] overflow-hidden rounded-lg border border-border bg-card">
        {props.coverPreview || props.coverUrl ? (
          <img src={props.coverPreview ?? props.coverUrl ?? ""} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <ImageIcon className="size-7 text-muted-foreground/60" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">표지 이미지</label>
        <UploadLabel disabled={props.uploadingCover} accept="image/*" onUpload={props.onUpload}>
          {props.uploadingCover ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          업로드
        </UploadLabel>
        <Input
          value={props.coverUrl ?? ""}
          onChange={(event) => props.onCoverUrl(event.target.value)}
          placeholder="이미지 URL 또는 storage path"
          className="text-xs"
        />
      </div>
    </div>
  );
}

function PreviewUploader(props: {
  previewUrl: string | null;
  previewPreview: string | null;
  previewType: PreviewType;
  uploadingPreview: boolean;
  onPreviewUrl: (value: string) => void;
  onPreviewType: (value: PreviewType) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[132px_minmax(0,1fr)]">
      <div className="aspect-video overflow-hidden rounded-lg border border-border bg-card">
        {props.previewPreview || props.previewUrl ? (
          props.previewType === "video" ? (
            <video src={props.previewPreview ?? props.previewUrl ?? ""} className="size-full object-cover" muted controls />
          ) : (
            <img src={props.previewPreview ?? props.previewUrl ?? ""} alt="" className="size-full object-cover" />
          )
        ) : (
          <div className="grid size-full place-items-center">
            <Video className="size-7 text-muted-foreground/60" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">미리보기</label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant={props.previewType === "image" ? "default" : "outline"}
            size="sm"
            onClick={() => props.onPreviewType("image")}
          >
            이미지
          </Button>
          <Button
            type="button"
            variant={props.previewType === "video" ? "default" : "outline"}
            size="sm"
            onClick={() => props.onPreviewType("video")}
          >
            영상
          </Button>
          <UploadLabel disabled={props.uploadingPreview} accept="image/*,video/*" onUpload={props.onUpload}>
            {props.uploadingPreview ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          </UploadLabel>
        </div>
        <Input
          value={props.previewUrl ?? ""}
          onChange={(event) => props.onPreviewUrl(event.target.value)}
          placeholder="미리보기 URL 또는 storage path"
          className="text-xs"
        />
      </div>
    </div>
  );
}

function UploadLabel({
  disabled,
  accept,
  children,
  onUpload,
}: {
  disabled: boolean;
  accept: string;
  children: ReactNode;
  onUpload: (file: File) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function ChoiceButton({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-left",
        active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-muted-foreground">{desc}</div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
