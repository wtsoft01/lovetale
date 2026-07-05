import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  LayoutGrid,
  Loader2,
  MonitorSmartphone,
  Plus,
  Sparkles,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CoverImage } from "@/components/cover-image";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  addHomePlacement,
  adminListPlacements,
  removeHomePlacement,
  updateHomePlacement,
  type AdminHomePlacementRow,
  type HomeSlot,
} from "@/lib/home-placements.functions";
import { listAdminStories } from "@/lib/admin-stories.functions";

export const Route = createFileRoute("/_authenticated/admin/placements")({
  head: () => ({ meta: [{ title: "메인 노출관리 | Lovetale Studio" }] }),
  component: PlacementsPage,
});

type SlotConfig = {
  value: HomeSlot;
  label: string;
  hint: string;
  pages: string;
  icon: LucideIcon;
  accent: string;
};

type SurfaceConfig = {
  id: "home" | "explore" | "marketplace" | "story_rpg";
  label: string;
  path: string;
  summary: string;
  slots: HomeSlot[];
  icon: LucideIcon;
  status: "synced" | "separate";
  separateLink?: string;
};

const SLOTS: SlotConfig[] = [
  {
    value: "hero",
    label: "히어로 섹션",
    hint: "홈 최상단 대표 노출",
    pages: "홈",
    icon: Flame,
    accent: "text-rose-300",
  },
  {
    value: "trending",
    label: "지금 뜨거운 스토리",
    hint: "홈과 스토리탐색 추천 영역",
    pages: "홈 · 스토리탐색",
    icon: Star,
    accent: "text-sky-300",
  },
  {
    value: "new",
    label: "신작",
    hint: "홈 신작 영역",
    pages: "홈",
    icon: Sparkles,
    accent: "text-amber-300",
  },
  {
    value: "all",
    label: "모든 스토리",
    hint: "공개된 전체 스토리 목록",
    pages: "홈",
    icon: LayoutGrid,
    accent: "text-emerald-300",
  },
];

const SURFACES: SurfaceConfig[] = [
  {
    id: "home",
    label: "홈",
    path: "/",
    summary: "첫 화면에 보이는 대표 영역",
    slots: ["hero", "trending", "new", "all"],
    icon: MonitorSmartphone,
    status: "synced",
  },
  {
    id: "explore",
    label: "스토리탐색",
    path: "/explore",
    summary: "탐색 페이지 추천 콘텐츠",
    slots: ["trending"],
    icon: Compass,
    status: "synced",
  },
  {
    id: "marketplace",
    label: "스토리마켓",
    path: "/marketplace",
    summary: "판매/구매 데이터 기반 별도 노출",
    slots: [],
    icon: Store,
    status: "separate",
    separateLink: "/admin/stories",
  },
  {
    id: "story_rpg",
    label: "스토리게임",
    path: "/interactive-rpg",
    summary: "스토리게임관리에서 별도 편성",
    slots: [],
    icon: Gamepad2,
    status: "separate",
    separateLink: "/admin/story-rpg",
  },
];

function PlacementsPage() {
  const [surfaceId, setSurfaceId] = useState<SurfaceConfig["id"]>("home");
  const [slotValue, setSlotValue] = useState<HomeSlot>("hero");
  const listFn = useServerFn(adminListPlacements);
  const summaries = useQueries({
    queries: SLOTS.map((slot) => ({
      queryKey: ["admin_placements", slot.value],
      queryFn: () => listFn({ data: { slot: slot.value } }),
    })),
  });

  const rowsBySlot = SLOTS.reduce<Record<HomeSlot, AdminHomePlacementRow[]>>((acc, slot, index) => {
    acc[slot.value] = summaries[index]?.data ?? [];
    return acc;
  }, {} as Record<HomeSlot, AdminHomePlacementRow[]>);
  const activeSurface = SURFACES.find((surface) => surface.id === surfaceId) ?? SURFACES[0];
  const activeSlots = SLOTS.filter((slot) => activeSurface.slots.includes(slot.value));
  const activeSlot = activeSlots.find((slot) => slot.value === slotValue) ?? activeSlots[0];

  useEffect(() => {
    if (activeSurface.slots.length > 0 && !activeSurface.slots.includes(slotValue)) {
      setSlotValue(activeSurface.slots[0]);
    }
  }, [activeSurface, slotValue]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Display CMS</span>
          <h1 className="mt-1 font-display text-3xl font-semibold">페이지별 노출관리</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={activeSurface.path}>사용자 화면</a>
        </Button>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          const selected = surface.id === activeSurface.id;
          const uniqueStoryCount = new Set(
            surface.slots.flatMap((slot) => rowsBySlot[slot]?.filter((row) => row.is_active).map((row) => row.story_id) ?? []),
          ).size;
          return (
            <button
              key={surface.id}
              type="button"
              onClick={() => setSurfaceId(surface.id)}
              className={`rounded-lg border p-3 text-left transition ${
                selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card/70 hover:border-primary/40"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-semibold">{surface.label}</span>
                </div>
                <Badge variant={surface.status === "synced" ? "default" : "outline"} className="text-[10px]">
                  {surface.status === "synced" ? `${uniqueStoryCount}개` : "별도관리"}
                </Badge>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{surface.summary}</div>
            </button>
          );
        })}
      </section>

      {activeSlots.length > 0 ? (
        <>
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {activeSlots.map((slot) => {
              const Icon = slot.icon;
              const rows = rowsBySlot[slot.value] ?? [];
              const activeCount = rows.filter((row) => row.is_active).length;
              const selected = activeSlot?.value === slot.value;
              return (
                <button
                  key={slot.value}
                  type="button"
                  onClick={() => setSlotValue(slot.value)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card/70 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`size-4 ${slot.accent}`} />
                      <span className="text-sm font-semibold">{slot.label}</span>
                    </div>
                    <Badge variant={selected ? "default" : "outline"} className="text-[10px]">
                      {activeCount}/{rows.length}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{slot.hint}</span>
                    <span>{slot.pages}</span>
                  </div>
                </button>
              );
            })}
          </section>

          {activeSlot && (
            <SlotPanel
              key={`${activeSurface.id}:${activeSlot.value}`}
              slot={activeSlot.value}
              slotLabel={activeSlot.label}
              surfaceLabel={activeSurface.label}
            />
          )}
        </>
      ) : (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{activeSurface.label}는 별도 관리됩니다</h2>
              <p className="mt-1 text-sm text-muted-foreground">{activeSurface.summary}</p>
            </div>
            {activeSurface.separateLink && (
              <Button asChild size="sm">
                <a href={activeSurface.separateLink}>관리 화면</a>
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SlotPanel({ slot, slotLabel, surfaceLabel }: { slot: HomeSlot; slotLabel: string; surfaceLabel: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPlacements);
  const updateFn = useServerFn(updateHomePlacement);
  const removeFn = useServerFn(removeHomePlacement);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_placements", slot],
    queryFn: () => listFn({ data: { slot } }),
  });

  const invalidate = (storyId?: string) => {
    qc.invalidateQueries({ queryKey: ["admin_placements"] });
    qc.invalidateQueries({ queryKey: ["home_placements"] });
    qc.invalidateQueries({ queryKey: ["home_placement"] });
    qc.invalidateQueries({ queryKey: ["story_placement"] });
    qc.invalidateQueries({ queryKey: ["admin_stories"] });
    if (storyId) qc.invalidateQueries({ queryKey: ["story_placement", storyId] });
  };

  const mUpdate = useMutation({
    mutationFn: (vars: { id: string; storyId?: string; sort_order?: number; is_active?: boolean }) =>
      updateFn({ data: { id: vars.id, sort_order: vars.sort_order, is_active: vars.is_active } }),
    onSuccess: (_data, vars) => invalidate(vars.storyId),
    onError: (e: Error) => toast.error(e.message),
  });
  const mRemove = useMutation({
    mutationFn: (vars: { id: string; storyId?: string }) => removeFn({ data: { id: vars.id } }),
    onSuccess: (_data, vars) => {
      invalidate(vars.storyId);
      toast.success("노출에서 제거했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  const rows = data ?? [];
  const isAllSlot = slot === "all";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">
              {surfaceLabel} · {slotLabel}
            </h2>
            <div className="text-[11px] text-muted-foreground">
              {isAllSlot ? "공개 상태의 전체 스토리가 자동으로 표시됩니다." : "스토리관리의 노출설정과 같은 데이터로 동기화됩니다."}
            </div>
          </div>
          <Badge variant="outline">{rows.length}</Badge>
        </div>
        <div className="space-y-2 p-3">
          {rows.length === 0 ? (
            <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              노출 중인 스토리가 없습니다.
            </div>
          ) : (
            rows.map((row, idx) => {
              const story = row.user_stories;
              const warn = !story?.is_public || !story?.is_listed;
              return (
                <div key={row.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-2">
                  <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {story?.cover_url ? (
                      <CoverImage src={story.cover_url} alt={story.title} className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center">
                        <BookOpen className="size-5 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{story?.title ?? "삭제된 스토리"}</div>
                    <div className="flex items-center gap-1.5">
                      {!isAllSlot && <span className="text-[11px] text-muted-foreground">순서 #{row.sort_order}</span>}
                      {warn && (
                        <Badge variant="destructive" className="text-[9px]">
                          비공개
                        </Badge>
                      )}
                      {!row.is_active && (
                        <Badge variant="outline" className="text-[9px]">
                          비활성
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isAllSlot && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() =>
                            mUpdate.mutate({
                              id: row.id,
                              storyId: row.story_id,
                              sort_order: Math.max(0, row.sort_order - 1),
                            })
                          }
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            mUpdate.mutate({ id: row.id, storyId: row.story_id, sort_order: row.sort_order + 1 })
                          }
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => mUpdate.mutate({ id: row.id, storyId: row.story_id, is_active: !row.is_active })}
                    >
                      {row.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => mRemove.mutate({ id: row.id, storyId: row.story_id })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <AddCard slot={slot} existing={rows.map((row) => row.story_id)} onAdded={invalidate} />
    </div>
  );
}

function AddCard({
  slot,
  existing,
  onAdded,
}: {
  slot: HomeSlot;
  existing: string[];
  onAdded: (storyId?: string) => void;
}) {
  const [q, setQ] = useState("");
  const listFn = useServerFn(listAdminStories);
  const addFn = useServerFn(addHomePlacement);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_stories_for_placement", q],
    queryFn: () => listFn({ data: { status: "published", q, contentType: "all" } }),
  });

  const mAdd = useMutation({
    mutationFn: (story_id: string) => addFn({ data: { slot, story_id, sort_order: existing.length } }),
    onSuccess: (_data, storyId) => {
      onAdded(storyId);
      toast.success("노출에 추가했습니다.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stories = (data ?? []).filter((story) => !existing.includes(story.id));

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4" /> 스토리 추가
        </h2>
      </div>
      <div className="space-y-3 p-3">
        <Input placeholder="스토리 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {stories.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                추가 가능한 스토리가 없습니다.{" "}
                <Link to="/admin/stories" className="text-primary hover:underline">
                  스토리관리
                </Link>
              </p>
            ) : (
              stories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => mAdd.mutate(story.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-background/50 p-2 text-left hover:border-primary/50"
                >
                  <div className="size-11 shrink-0 overflow-hidden rounded-md bg-muted">
                    {story.cover_url ? (
                      <CoverImage src={story.cover_url} alt={story.title} className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center">
                        <BookOpen className="size-4 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{story.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {story.is_public && story.is_listed ? "노출 가능" : "추가 시 공개 전환"}
                    </div>
                  </div>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
