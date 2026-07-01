import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CoverImage } from "@/components/cover-image";
import {
  adminListPlacements,
  addHomePlacement,
  updateHomePlacement,
  removeHomePlacement,
  type HomeSlot,
} from "@/lib/home-placements.functions";
import { listAdminStories } from "@/lib/admin-stories.functions";

export const Route = createFileRoute("/_authenticated/admin/placements")({
  head: () => ({ meta: [{ title: "메인 노출 위치 | Lovetale Studio" }] }),
  component: PlacementsPage,
});

const SLOTS: { value: HomeSlot; label: string; desc: string }[] = [
  { value: "hero", label: "히어로섹션", desc: "메인 상단 대표 배너" },
  { value: "trending", label: "지금 뜨거운 스토리", desc: "현재 반응이 뜨거운 작품" },
  { value: "new", label: "신작", desc: "새로 공개된 작품" },
  { value: "all", label: "모든 스토리", desc: "홈 하단 전체 목록" },
];

function PlacementsPage() {
  const [tab, setTab] = useState<HomeSlot>("hero");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">메인 노출 위치</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          히어로섹션, 지금 뜨거운 스토리, 신작, 모든 스토리를 같은 방식으로 관리합니다.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as HomeSlot)}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          {SLOTS.map((slot) => (
            <TabsTrigger key={slot.value} value={slot.value}>
              {slot.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SLOTS.map((slot) => (
          <TabsContent key={slot.value} value={slot.value} className="space-y-5">
            <p className="text-sm text-muted-foreground">{slot.desc}</p>
            <SlotPanel slot={slot.value} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SlotPanel({ slot }: { slot: HomeSlot }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPlacements);
  const updateFn = useServerFn(updateHomePlacement);
  const removeFn = useServerFn(removeHomePlacement);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_placements", slot],
    queryFn: () => listFn({ data: { slot } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin_placements", slot] });
    qc.invalidateQueries({ queryKey: ["home_placement"] });
  };

  const mUpdate = useMutation({
    mutationFn: (vars: { id: string; sort_order?: number; is_active?: boolean }) =>
      updateFn({ data: vars }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const mRemove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("삭제되었습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  const rows = data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>현재 노출 ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              아직 노출 중인 스토리가 없습니다. 오른쪽에서 추가하세요.
            </p>
          ) : (
            rows.map((row, idx) => {
              const story = row.user_stories;
              const warn = !story?.is_public || !story?.is_listed;
              return (
                <div key={row.id} className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-2">
                  <div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
                    {story?.cover_url ? (
                      <CoverImage src={story.cover_url} alt={story.title} className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{story?.title ?? "삭제된 스토리"}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">순서 #{row.sort_order}</span>
                      {warn && <Badge variant="destructive" className="text-[9px]">비공개</Badge>}
                      {!row.is_active && <Badge variant="outline" className="text-[9px]">비활성</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={idx === 0}
                      onClick={() => mUpdate.mutate({ id: row.id, sort_order: Math.max(0, row.sort_order - 1) })}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => mUpdate.mutate({ id: row.id, sort_order: row.sort_order + 1 })}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => mUpdate.mutate({ id: row.id, is_active: !row.is_active })}
                    >
                      {row.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => mRemove.mutate(row.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AddCard slot={slot} existing={rows.map((row) => row.story_id)} onAdded={invalidate} />
    </div>
  );
}

function AddCard({ slot, existing, onAdded }: { slot: HomeSlot; existing: string[]; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const listFn = useServerFn(listAdminStories);
  const addFn = useServerFn(addHomePlacement);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_stories_for_placement", q],
    queryFn: () => listFn({ data: { status: "published", q, contentType: "all" } }),
  });

  const mAdd = useMutation({
    mutationFn: (story_id: string) => addFn({ data: { slot, story_id, sort_order: existing.length } }),
    onSuccess: () => {
      onAdded();
      toast.success("추가되었습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stories = (data ?? []).filter((story) => !existing.includes(story.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="size-4" /> 스토리 추가
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="제목 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {stories.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                추가 가능한 스토리가 없습니다.{" "}
                <Link to="/admin/stories" className="text-primary hover:underline">
                  콘텐츠 관리
                </Link>
              </p>
            ) : (
              stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => mAdd.mutate(story.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card/60 p-2 text-left hover:border-primary/50"
                >
                  <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
                    {story.cover_url ? (
                      <CoverImage src={story.cover_url} alt={story.title} className="size-full object-cover" />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">{story.title}</span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
