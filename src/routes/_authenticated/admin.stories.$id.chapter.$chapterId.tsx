import { useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useServerFn } from "@/lib/_mock/runtime";
import { getStoryChapterText, saveStoryChapterText } from "@/lib/admin-stories-compose.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/stories/$id/chapter/$chapterId")({
  head: () => ({ meta: [{ title: "회차 편집 | Lovetale Studio" }] }),
  component: ChapterTextEditorPage,
});

function ChapterTextEditorPage() {
  const { id, chapterId } = Route.useParams();
  const fetchChapter = useServerFn(getStoryChapterText);
  const saveChapter = useServerFn(saveStoryChapterText);
  const qc = useQueryClient();

  const episodeRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const freeRef = useRef<HTMLInputElement>(null);

  const chapterQ = useQuery({
    queryKey: ["story_chapter_text", id, chapterId],
    queryFn: () => fetchChapter({ data: { id, chapterId } }),
    staleTime: 0,
  });

  const saveM = useMutation({
    mutationFn: async () => {
      const current = chapterQ.data?.chapter;
      if (!current) throw new Error("Chapter is not loaded");
      return saveChapter({
        data: {
          id,
          chapter: {
            id: current.id,
            episodeNumber: Number(episodeRef.current?.value) || current.episodeNumber,
            title: titleRef.current?.value ?? current.title,
            summary: summaryRef.current?.value ?? current.summary,
            body: bodyRef.current?.value ?? current.body,
            isFree: Boolean(freeRef.current?.checked),
            priceCredits: Number(priceRef.current?.value) || 0,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("회차가 저장되었습니다.");
      qc.invalidateQueries({ queryKey: ["story_chapter_text", id, chapterId] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
      qc.invalidateQueries({ queryKey: ["admin_story_workspace", id] });
    },
    onError: (error: any) => toast.error(error?.message ?? "저장 실패"),
  });

  if (chapterQ.isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          회차 정보를 불러오는 중입니다.
        </div>
      </main>
    );
  }

  if (chapterQ.isError || !chapterQ.data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Button variant="ghost" asChild className="mb-4">
          <Link to="/admin/stories">
            <ArrowLeft className="size-4" /> 스토리관리
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          회차 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      </main>
    );
  }

  const { title, chapter } = chapterQ.data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" asChild className="-ml-3 mb-2">
            <Link to="/admin/stories">
              <ArrowLeft className="size-4" /> 스토리관리
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">{chapter.episodeNumber}화 회차 편집</h1>
          <p className="mt-1 text-sm text-muted-foreground">{title}</p>
        </div>
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          {saveM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          저장
        </Button>
      </div>

      <section key={chapter.id} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="episode-number">
            회차 번호
          </label>
          <Input
            ref={episodeRef}
            id="episode-number"
            type="number"
            min={1}
            defaultValue={chapter.episodeNumber}
            className="max-w-40"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="chapter-title">
            회차 제목
          </label>
          <Input ref={titleRef} id="chapter-title" defaultValue={chapter.title} placeholder="회차 제목" />
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="chapter-summary">
            회차 요약
          </label>
          <Textarea
            ref={summaryRef}
            id="chapter-summary"
            defaultValue={chapter.summary}
            placeholder="회차 요약"
            className="min-h-24 resize-y"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="text-sm font-medium text-muted-foreground">과금</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input ref={freeRef} type="checkbox" defaultChecked={chapter.isFree} className="size-4 accent-primary" />
              무료 회차
            </label>
            <Input
              ref={priceRef}
              type="number"
              min={0}
              defaultValue={chapter.priceCredits}
              className="w-32"
              aria-label="회차 가격"
            />
            <span className="text-xs text-muted-foreground">크레딧</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="chapter-body">
              본문 콘텐츠
            </label>
            <span className="text-xs text-muted-foreground">
              현재 {chapter.body.length.toLocaleString()}자 · 에셋 {chapter.assetSlotsCount}개
            </span>
          </div>
          <Textarea
            ref={bodyRef}
            id="chapter-body"
            defaultValue={chapter.body}
            placeholder="회차 본문을 입력하세요."
            maxLength={100000}
            className="min-h-[62vh] resize-y whitespace-pre-wrap font-mono text-sm leading-7"
          />
        </div>
      </section>
    </main>
  );
}
