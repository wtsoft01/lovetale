import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@/lib/_mock/runtime";
import {
  ArrowRight,
  ExternalLink,
  Gamepad2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  cloneStoryAsRpg,
  getAdminStory,
  listAdminStories,
  updateAdminStory,
  type AdminStoryRow,
} from "@/lib/admin-stories.functions";
import { generateStoryRpgScenario } from "@/lib/admin-story-ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/story-rpg")({
  head: () => ({ meta: [{ title: "스토리게임관리 | Lovetale Studio" }] }),
  component: AdminStoryRpgPage,
});

type StoryRpgRouteDraft = {
  name: string;
  status: string;
  condition: string;
  progress: number;
};

type StoryRpgChoiceDraft = {
  label: string;
  effect: string;
  tone: string;
  result: string;
  routeHint: string;
  nextSceneId?: string;
  affectionDelta: number;
  tensionDelta: number;
  trustDelta: number;
};

type StoryRpgSceneDraft = {
  id: string;
  title: string;
  text: string;
  partnerLine: string;
  goal: string;
  mood: string;
  choices: StoryRpgChoiceDraft[];
};

type StoryRpgDraft = {
  enabled: boolean;
  sourceStoryId?: string;
  sourceTitle?: string;
  currentRoute: string;
  initialAffection: number;
  initialTension: number;
  initialTrust: number;
  endingsTotal: number;
  routes: StoryRpgRouteDraft[];
  scenes: StoryRpgSceneDraft[];
};

function recordOf(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function clampPercent(value: unknown, fallback = 0) {
  const n = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : fallback));
}

function compactNumber(value: number) {
  if (value >= 10000) return `${Math.round(value / 1000).toLocaleString()}k`;
  return value.toLocaleString();
}

function contentTypeLabel(type: string) {
  switch (type) {
    case "web_novel":
      return "스토리";
    case "romance_sim":
      return "연애시뮬";
    case "short_story":
      return "단편";
    case "webtoon":
      return "웹툰";
    case "story_rpg":
      return "스토리게임";
    default:
      return "콘텐츠";
  }
}

function makeSceneId(index: number) {
  return `scene-${index + 1}`;
}

function defaultChoices(routeName = "Main Route"): StoryRpgChoiceDraft[] {
  return [
    {
      label: "조심스럽게 다가간다",
      effect: "+2 호감도",
      tone: "다정",
      result: "상대의 경계가 조금 낮아지고 다음 장면이 부드럽게 이어집니다.",
      routeHint: routeName,
      affectionDelta: 2,
      tensionDelta: -1,
      trustDelta: 1,
    },
    {
      label: "상황을 먼저 살핀다",
      effect: "+2 신뢰도",
      tone: "침착",
      result: "감정보다 단서를 먼저 보는 선택이 새로운 분기를 엽니다.",
      routeHint: "Trust Route",
      affectionDelta: 0,
      tensionDelta: -1,
      trustDelta: 2,
    },
  ];
}

function normalizeChoice(raw: any, index = 0, fallbackRoute = "Main Route"): StoryRpgChoiceDraft {
  return {
    label: String(raw?.label || "").trim() || `${index + 1}번 선택지`,
    effect: String(raw?.effect || "").trim() || "관계 변화",
    tone: String(raw?.tone || "").trim() || "선택",
    result: String(raw?.result || "").trim() || "선택 결과를 입력하세요.",
    routeHint: String(raw?.routeHint || raw?.route || "").trim() || fallbackRoute,
    nextSceneId: String(raw?.nextSceneId || "").trim() || undefined,
    affectionDelta: Number.isFinite(Number(raw?.affectionDelta)) ? Number(raw.affectionDelta) : 1,
    tensionDelta: Number.isFinite(Number(raw?.tensionDelta)) ? Number(raw.tensionDelta) : 0,
    trustDelta: Number.isFinite(Number(raw?.trustDelta)) ? Number(raw.trustDelta) : 1,
  };
}

function normalizeChoices(raw: unknown, fallbackRoute = "Main Route") {
  if (!Array.isArray(raw) || raw.length === 0) return defaultChoices(fallbackRoute);
  return raw.map((choice, index) => normalizeChoice(choice, index, fallbackRoute)).slice(0, 5);
}

function normalizeRoutes(raw: unknown, fallbackRoute = "Main Route"): StoryRpgRouteDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { name: fallbackRoute, status: "진행 중", condition: "첫 선택을 시작하세요", progress: 0 },
      { name: "Hidden Route", status: "잠김", condition: "호감도와 신뢰도 조건 필요", progress: 0 },
    ];
  }
  return raw
    .map((route: any) => ({
      name: String(route?.name || "").trim() || fallbackRoute,
      status: String(route?.status || "").trim() || "진행 중",
      condition: String(route?.condition || "").trim() || "선택에 따라 진행",
      progress: clampPercent(route?.progress, 0),
    }))
    .slice(0, 8);
}

function normalizeScenes(raw: unknown, fallbackRoute = "Main Route"): StoryRpgSceneDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      {
        id: "scene-1",
        title: "첫 선택",
        text: "",
        partnerLine: "",
        goal: "플레이어가 첫 관계 방향을 선택합니다.",
        mood: "도입",
        choices: defaultChoices(fallbackRoute),
      },
    ];
  }
  return raw
    .map((scene: any, index) => ({
      id: String(scene?.id || "").trim() || makeSceneId(index),
      title: String(scene?.title || "").trim() || `장면 ${index + 1}`,
      text: String(scene?.text || scene?.body || "").trim(),
      partnerLine: String(scene?.partnerLine || scene?.line || "").trim(),
      goal: String(scene?.goal || "").trim(),
      mood: String(scene?.mood || "").trim() || "분기",
      choices: normalizeChoices(scene?.choices, fallbackRoute),
    }))
    .slice(0, 30);
}

function buildDraftFromStory(story: any): StoryRpgDraft {
  const card = recordOf(story?.character_card);
  const rpg = recordOf(card.storyRpg);
  const currentRoute = String(rpg.currentRoute ?? "Main Route");
  const firstSceneTitle = String(rpg.startSceneTitle ?? "첫 선택");
  const firstSceneText = String(rpg.startSceneText ?? "");
  const firstPartnerLine = String(rpg.partnerLine ?? "");
  const scenes = normalizeScenes(rpg.scenes, currentRoute);
  if (!Array.isArray(rpg.scenes) || rpg.scenes.length === 0) {
    scenes[0] = {
      ...scenes[0],
      title: firstSceneTitle,
      text: firstSceneText,
      partnerLine: firstPartnerLine,
      choices: normalizeChoices(rpg.choices, currentRoute),
    };
  }
  return {
    enabled: Boolean(rpg.enabled ?? card.contentType === "story_rpg"),
    sourceStoryId: String(rpg.sourceStoryId || card.sourceStoryId || "").trim() || undefined,
    sourceTitle: String(rpg.sourceTitle || "").trim() || undefined,
    currentRoute,
    initialAffection: clampPercent(rpg.initialAffection, 0),
    initialTension: clampPercent(rpg.initialTension, 35),
    initialTrust: clampPercent(rpg.initialTrust, 20),
    endingsTotal: Math.max(1, Math.floor(Number(rpg.endingsTotal ?? 5))),
    routes: normalizeRoutes(rpg.routes, currentRoute),
    scenes,
  };
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clampPercent(value, 0)}%` }} />
      </div>
    </div>
  );
}

function ScenarioChip({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tone === "default" && "border-border bg-card text-muted-foreground",
        tone === "good" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        tone === "warn" && "border-amber-400/30 bg-amber-400/10 text-amber-300",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {label}
    </span>
  );
}

function RelationMini({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border px-3 py-2",
        tone === "default" && "border-border bg-background/60",
        tone === "good" && "border-emerald-400/25 bg-emerald-400/10",
        tone === "warn" && "border-amber-400/25 bg-amber-400/10",
      )}
    >
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold">{value}</div>
    </div>
  );
}

function sceneTitleById(scenes: StoryRpgSceneDraft[], id?: string) {
  if (!id) return "엔딩/종료";
  const scene = scenes.find((item) => item.id === id);
  return scene?.title || scene?.id || "연결 오류";
}

function choiceLinkState(choice: StoryRpgChoiceDraft, scenes: StoryRpgSceneDraft[]) {
  if (!choice.nextSceneId) return { label: "엔딩", className: "border-amber-400/40 bg-amber-400/10 text-amber-300" };
  const exists = scenes.some((scene) => scene.id === choice.nextSceneId);
  if (!exists) return { label: "연결 확인 필요", className: "border-destructive/40 bg-destructive/10 text-destructive" };
  return { label: "다음 장면", className: "border-primary/40 bg-primary/10 text-primary" };
}

function SceneFlowSummary({ scene, scenes }: { scene: StoryRpgSceneDraft; scenes: StoryRpgSceneDraft[] }) {
  const endingCount = scene.choices.filter((choice) => !choice.nextSceneId).length;
  const brokenCount = scene.choices.filter(
    (choice) => choice.nextSceneId && !scenes.some((target) => target.id === choice.nextSceneId),
  ).length;
  const firstNext = scene.choices.find((choice) => choice.nextSceneId)?.nextSceneId;

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-border bg-background/70 p-3 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {scene.mood || "분위기 없음"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            선택지 {scene.choices.length}
          </span>
          {endingCount ? (
            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300">
              엔딩 {endingCount}
            </span>
          ) : null}
          {brokenCount ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
              연결 오류 {brokenCount}
            </span>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {scene.goal || scene.text || "장면 목표와 본문을 입력하세요."}
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3 text-primary" />
        {firstNext ? sceneTitleById(scenes, firstNext) : "엔딩/종료"}
      </div>
    </div>
  );
}

function ChoiceFlowPreview({ choice, scenes }: { choice: StoryRpgChoiceDraft; scenes: StoryRpgSceneDraft[] }) {
  const state = choiceLinkState(choice, scenes);
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background/70 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", state.className)}>
            {state.label}
          </span>
          <span className="text-xs text-muted-foreground">{choice.routeHint || "루트 미지정"}</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3" />
          {sceneTitleById(scenes, choice.nextSceneId)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <StatDelta label="호감" value={choice.affectionDelta} />
        <StatDelta label="긴장" value={choice.tensionDelta} />
        <StatDelta label="신뢰" value={choice.trustDelta} />
      </div>
    </div>
  );
}

function StatDelta({ label, value }: { label: string; value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        "rounded-full bg-muted px-2 py-0.5 text-muted-foreground",
        positive && "bg-emerald-400/10 text-emerald-300",
        negative && "bg-rose-400/10 text-rose-300",
      )}
    >
      {label} {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

function LabeledNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  );
}

function AdminStoryRpgPage() {
  const qc = useQueryClient();
  const fetchStories = useServerFn(listAdminStories);
  const fetchStory = useServerFn(getAdminStory);
  const saveStory = useServerFn(updateAdminStory);
  const cloneRpg = useServerFn(cloneStoryAsRpg);
  const generateRpg = useServerFn(generateStoryRpgScenario);

  const [sourceStoryId, setSourceStoryId] = useState("");
  const [q, setQ] = useState("");
  const [maxScenes, setMaxScenes] = useState(18);
  const [selectedRpgId, setSelectedRpgId] = useState("");
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [loglineDraft, setLoglineDraft] = useState("");
  const [isPublicDraft, setIsPublicDraft] = useState(false);
  const [isListedDraft, setIsListedDraft] = useState(false);
  const [rpgDraft, setRpgDraft] = useState<StoryRpgDraft>(() => buildDraftFromStory(null));
  const [previewSceneId, setPreviewSceneId] = useState("");
  const [previewStats, setPreviewStats] = useState({ affection: 0, tension: 35, trust: 20 });
  const [previewResult, setPreviewResult] = useState("");

  const allStoriesQ = useQuery({
    queryKey: ["admin_story_rpg_sources"],
    queryFn: () => fetchStories({ data: { status: "all", contentType: "all" } }),
  });

  const rpgStoriesQ = useQuery({
    queryKey: ["admin_story_rpg_rows"],
    queryFn: () => fetchStories({ data: { status: "all", contentType: "story_rpg" } }),
  });

  const detailQ = useQuery({
    queryKey: ["admin_story_rpg_detail", selectedRpgId],
    queryFn: () => fetchStory({ data: { id: selectedRpgId } }),
    enabled: Boolean(selectedRpgId),
  });

  const sourceStories = useMemo(
    () =>
      (allStoriesQ.data ?? [])
        .filter((story) => story.content_type !== "story_rpg")
        .filter((story) => {
          if (!q.trim()) return true;
          const needle = q.trim().toLowerCase();
          return `${story.title} ${story.logline ?? ""} ${story.story_overview}`.toLowerCase().includes(needle);
        }),
    [allStoriesQ.data, q],
  );
  const rpgStories = rpgStoriesQ.data ?? [];
  const selectedSource = sourceStories.find((story) => story.id === sourceStoryId);
  const rpgBySourceId = useMemo(() => {
    const map = new Map<string, AdminStoryRow[]>();
    for (const story of rpgStories) {
      if (!story.source_story_id) continue;
      const rows = map.get(story.source_story_id) ?? [];
      rows.push(story);
      map.set(story.source_story_id, rows);
    }
    return map;
  }, [rpgStories]);
  const selectedSourceRpgs = sourceStoryId ? (rpgBySourceId.get(sourceStoryId) ?? []) : [];
  const selectedSourceRpg = selectedSourceRpgs[0];
  const selectedRpgSummary = rpgStories.find((story) => story.id === selectedRpgId);
  const selectedRpgCard = recordOf((detailQ.data as any)?.character_card);
  const selectedRpgCharacters = Array.isArray(selectedRpgCard.characters) ? selectedRpgCard.characters : [];
  const selectedRpgChatCharacters = selectedRpgCharacters.filter((character: any) => character?.chatEnabled !== false);

  useEffect(() => {
    const created = new URLSearchParams(window.location.search).get("created");
    if (created) {
      setSelectedRpgId(created);
      return;
    }
    if (!selectedRpgId && rpgStories[0]?.id) setSelectedRpgId(rpgStories[0].id);
  }, [rpgStories, selectedRpgId]);

  useEffect(() => {
    const story = detailQ.data;
    if (!story) return;
    setTitleDraft(String(story.title ?? ""));
    setLoglineDraft(String(story.logline ?? ""));
    setIsPublicDraft(Boolean(story.is_public));
    setIsListedDraft(Boolean(story.is_listed));
    const nextDraft = buildDraftFromStory(story);
    setRpgDraft(nextDraft);
    setPreviewSceneId(nextDraft.scenes[0]?.id ?? "");
    setPreviewStats({
      affection: nextDraft.initialAffection,
      tension: nextDraft.initialTension,
      trust: nextDraft.initialTrust,
    });
    setPreviewResult("");
  }, [detailQ.data]);

  const createRpgMut = useMutation({
    mutationFn: async () => {
      if (!sourceStoryId) throw new Error("RPG로 변환할 원본 스토리를 선택해 주세요.");
      setActiveStoryId(sourceStoryId);
      const cloned = await cloneRpg({
        data: {
          sourceStoryId,
          title: selectedSource ? `${selectedSource.title} RPG` : undefined,
        },
      });
      setActiveStoryId(cloned.id);
      const generated = await generateRpg({ data: { storyId: cloned.id, maxScenes } });
      return { clonedId: cloned.id, generated };
    },
    onSuccess: ({ clonedId, generated }) => {
      toast.success(`${generated.scenes}개 장면으로 RPG 시나리오를 생성했습니다.`);
      setSourceStoryId("");
      setSelectedRpgId(clonedId);
      setActiveStoryId(null);
      window.history.replaceState({}, "", `/admin/story-rpg?created=${encodeURIComponent(clonedId)}`);
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_rows"] });
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_sources"] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
      qc.invalidateQueries({ queryKey: ["story_rpg_public_list"] });
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_detail", clonedId] });
    },
    onError: (error: Error) => {
      setActiveStoryId(null);
      toast.error(error.message);
    },
  });

  function openRpgWork(story: AdminStoryRow) {
    setSelectedRpgId(story.id);
    window.history.replaceState({}, "", `/admin/story-rpg?created=${encodeURIComponent(story.id)}`);
  }

  const rewriteRpgMut = useMutation({
    mutationFn: async (storyId: string) => {
      setActiveStoryId(storyId);
      return generateRpg({ data: { storyId, maxScenes } });
    },
    onSuccess: (result) => {
      toast.success(`${result.scenes}개 장면으로 RPG 시나리오를 다시 작성했습니다.`);
      setActiveStoryId(null);
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_rows"] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
      qc.invalidateQueries({ queryKey: ["story_rpg_public_list"] });
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_detail", selectedRpgId] });
    },
    onError: (error: Error) => {
      setActiveStoryId(null);
      toast.error(error.message);
    },
  });

  const saveRpgMut = useMutation({
    mutationFn: async (options?: { publish?: boolean }) => {
      if (!selectedRpgId) throw new Error("저장할 RPG 작업본을 선택해 주세요.");
      const nextIsPublic = options?.publish ? true : isPublicDraft;
      const nextIsListed = options?.publish ? true : isListedDraft;
      const currentCard = recordOf((detailQ.data as any)?.character_card);
      const scenes = normalizeScenes(rpgDraft.scenes, rpgDraft.currentRoute);
      const firstScene = scenes[0];
      const nextStoryRpg = {
        ...recordOf(currentCard.storyRpg),
        enabled: true,
        sourceStoryId: rpgDraft.sourceStoryId,
        sourceTitle: rpgDraft.sourceTitle,
        currentRoute: rpgDraft.currentRoute.trim() || "Main Route",
        initialAffection: clampPercent(rpgDraft.initialAffection, 0),
        initialTension: clampPercent(rpgDraft.initialTension, 35),
        initialTrust: clampPercent(rpgDraft.initialTrust, 20),
        endingsTotal: Math.max(1, Math.floor(Number(rpgDraft.endingsTotal) || 1)),
        routes: normalizeRoutes(rpgDraft.routes, rpgDraft.currentRoute),
        choices: firstScene?.choices ?? [],
        startSceneTitle: firstScene?.title ?? "첫 선택",
        startSceneText: firstScene?.text ?? "",
        partnerLine: firstScene?.partnerLine ?? "",
        scenes,
      };
      return saveStory({
        data: {
          id: selectedRpgId,
          title: titleDraft.trim() || "스토리게임",
          logline: loglineDraft.trim() || null,
          is_public: nextIsPublic,
          is_listed: nextIsListed,
          status: nextIsPublic && nextIsListed ? "published" : "draft",
          character_card: {
            ...currentCard,
            contentType: "story_rpg",
            storyRpg: nextStoryRpg,
          },
        },
      });
    },
    onSuccess: (_story, options) => {
      toast.success("RPG 작업본이 저장되었습니다.");
      if (options?.publish) {
        setIsPublicDraft(true);
        setIsListedDraft(true);
      }
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_rows"] });
      qc.invalidateQueries({ queryKey: ["admin_story_rpg_detail", selectedRpgId] });
      qc.invalidateQueries({ queryKey: ["admin_stories"] });
      qc.invalidateQueries({ queryKey: ["story_rpg_public_list"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateScene(index: number, patch: Partial<StoryRpgSceneDraft>) {
    setRpgDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, ...patch } : scene)),
    }));
  }

  function addScene() {
    setRpgDraft((prev) => ({
      ...prev,
      scenes: [
        ...prev.scenes,
        {
          id: makeSceneId(prev.scenes.length),
          title: `장면 ${prev.scenes.length + 1}`,
          text: "",
          partnerLine: "",
          goal: "",
          mood: "분기",
          choices: defaultChoices(prev.currentRoute),
        },
      ],
    }));
  }

  function removeScene(index: number) {
    const removedId = rpgDraft.scenes[index]?.id;
    setRpgDraft((prev) => ({
      ...prev,
      scenes: prev.scenes
        .filter((_, sceneIndex) => sceneIndex !== index)
        .map((scene) => ({
          ...scene,
          choices: scene.choices.map((choice) =>
            choice.nextSceneId === removedId ? { ...choice, nextSceneId: undefined } : choice,
          ),
        })),
    }));
  }

  function updateChoice(sceneIndex: number, choiceIndex: number, patch: Partial<StoryRpgChoiceDraft>) {
    setRpgDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene, currentSceneIndex) =>
        currentSceneIndex === sceneIndex
          ? {
              ...scene,
              choices: scene.choices.map((choice, currentChoiceIndex) =>
                currentChoiceIndex === choiceIndex ? { ...choice, ...patch } : choice,
              ),
            }
          : scene,
      ),
    }));
  }

  function addChoice(sceneIndex: number) {
    setRpgDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene, currentSceneIndex) =>
        currentSceneIndex === sceneIndex
          ? {
              ...scene,
              choices: [
                ...scene.choices,
                {
                  label: "새 선택지",
                  effect: "관계 변화",
                  tone: "선택",
                  result: "선택 결과를 입력하세요.",
                  routeHint: prev.currentRoute,
                  nextSceneId: prev.scenes[sceneIndex + 1]?.id,
                  affectionDelta: 1,
                  tensionDelta: 0,
                  trustDelta: 1,
                },
              ],
            }
          : scene,
      ),
    }));
  }

  function removeChoice(sceneIndex: number, choiceIndex: number) {
    setRpgDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene, currentSceneIndex) =>
        currentSceneIndex === sceneIndex
          ? { ...scene, choices: scene.choices.filter((_, currentChoiceIndex) => currentChoiceIndex !== choiceIndex) }
          : scene,
      ),
    }));
  }

  const previewScene = useMemo(
    () => rpgDraft.scenes.find((scene) => scene.id === previewSceneId) ?? rpgDraft.scenes[0],
    [previewSceneId, rpgDraft.scenes],
  );

  const scenarioStats = useMemo(() => {
    const idCounts = new Map<string, number>();
    let missingSceneIds = 0;
    for (const scene of rpgDraft.scenes) {
      const id = scene.id.trim();
      if (!id) {
        missingSceneIds += 1;
        continue;
      }
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
    const sceneIds = new Set(idCounts.keys());
    const duplicateSceneIds = Array.from(idCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);

    let choices = 0;
    let endings = 0;
    let brokenLinks = 0;
    let emptyScenes = 0;
    let emptyChoices = 0;
    for (const scene of rpgDraft.scenes) {
      if (!scene.text.trim()) emptyScenes += 1;
      for (const choice of scene.choices) {
        choices += 1;
        if (!choice.label.trim()) emptyChoices += 1;
        if (!choice.nextSceneId) {
          endings += 1;
          continue;
        }
        if (!sceneIds.has(choice.nextSceneId)) brokenLinks += 1;
      }
    }

    return {
      scenes: rpgDraft.scenes.length,
      choices,
      endings,
      brokenLinks,
      emptyScenes,
      emptyChoices,
      duplicateSceneIds,
      missingSceneIds,
    };
  }, [rpgDraft.scenes]);

  function resetPreview() {
    setPreviewSceneId(rpgDraft.scenes[0]?.id ?? "");
    setPreviewStats({
      affection: rpgDraft.initialAffection,
      tension: rpgDraft.initialTension,
      trust: rpgDraft.initialTrust,
    });
    setPreviewResult("");
  }

  function playPreviewChoice(choice: StoryRpgChoiceDraft) {
    setPreviewStats((prev) => ({
      affection: clampPercent(prev.affection + choice.affectionDelta, prev.affection),
      tension: clampPercent(prev.tension + choice.tensionDelta, prev.tension),
      trust: clampPercent(prev.trust + choice.trustDelta, prev.trust),
    }));
    const nextScene = choice.nextSceneId
      ? rpgDraft.scenes.find((scene) => scene.id === choice.nextSceneId)
      : null;
    setPreviewResult(
      nextScene
        ? `${choice.result}\n\n다음 장면: ${nextScene.title}`
        : `${choice.result}\n\n이 선택지는 엔딩 또는 종료 지점으로 처리됩니다.`,
    );
    if (nextScene) setPreviewSceneId(nextScene.id);
  }

  const loading = allStoriesQ.isLoading || rpgStoriesQ.isLoading;
  const creating = createRpgMut.isPending;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Story RPG</span>
          <h1 className="mt-1 text-2xl font-semibold">스토리게임관리</h1>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-card px-2.5 py-1">원본 {sourceStories.length}</span>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
              작업본 {rpgStories.length}
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">
              독립 저장
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/interactive-rpg"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:border-primary/40"
          >
            <ExternalLink className="h-4 w-4" /> 사용자 화면
          </Link>
          <Link
            to="/admin/stories"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:border-primary/40"
          >
            일반 콘텐츠
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="h-4 w-4 text-primary" /> 원본에서 게임 만들기
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border bg-background px-2 py-0.5">원본</span>
              <ArrowRight className="h-3 w-3" />
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">시나리오 변환</span>
              <ArrowRight className="h-3 w-3" />
              <span className="rounded-full border border-border bg-background px-2 py-0.5">독립 작업본</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">생성 장면 수</label>
            <Input
              type="number"
              min={6}
              max={30}
              className="w-24"
              value={maxScenes}
              onChange={(event) => setMaxScenes(Math.max(6, Math.min(30, Number(event.target.value) || 18)))}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="원본 스토리 제목, 소개문 검색"
                className="pl-9"
              />
            </div>
            <div className="max-h-[18rem] overflow-y-auto rounded-lg border border-border">
              {allStoriesQ.isLoading ? (
                <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 원본 스토리를 불러오는 중
                </div>
              ) : sourceStories.length ? (
                <div className="divide-y divide-border">
                  {sourceStories.map((story) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => {
                        setSourceStoryId(story.id);
                        const existing = rpgBySourceId.get(story.id)?.[0];
                        if (existing) setSelectedRpgId(existing.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-surface-elevated/60",
                        sourceStoryId === story.id && "bg-primary/10",
                      )}
                    >
                      <CoverThumb story={story} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="block truncate text-sm font-medium">{story.title}</span>
                          {rpgBySourceId.has(story.id) ? (
                            <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                              작업본 {rpgBySourceId.get(story.id)?.length ?? 0}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                          <span>{contentTypeLabel(story.content_type)}</span>
                          <span>· 회차 {story.chapters_count}</span>
                          <span>· {compactNumber(story.body_chars)}자</span>
                          <span>· {story.is_public && story.is_listed ? "노출" : "비공개"}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">불러올 일반 스토리가 없습니다.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="text-xs text-muted-foreground">선택 원본</div>
            <div className="mt-1 min-h-10 text-sm font-medium">
              {selectedSource ? selectedSource.title : "스토리를 선택하세요"}
            </div>
            {selectedSource ? (
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] text-muted-foreground">
                <span className="rounded-md border border-border bg-card px-1.5 py-1">회차 {selectedSource.chapters_count}</span>
                <span className="rounded-md border border-border bg-card px-1.5 py-1">{compactNumber(selectedSource.body_chars)}자</span>
                <span className="rounded-md border border-border bg-card px-1.5 py-1">작업본 {selectedSourceRpgs.length}</span>
              </div>
            ) : null}
            <Button
              type="button"
              className="mt-4 w-full"
              disabled={!sourceStoryId || creating}
              onClick={() => {
                if (selectedSourceRpg) {
                  openRpgWork(selectedSourceRpg);
                  return;
                }
                createRpgMut.mutate();
              }}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedSourceRpg ? (
                <Play className="h-4 w-4" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {selectedSourceRpg ? "열기" : "생성"}
            </Button>
            {selectedSourceRpg ? (
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full"
                disabled={!sourceStoryId || creating}
                onClick={() => createRpgMut.mutate()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                새 작업본
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold">RPG 작업본</div>
              <div className="text-xs text-muted-foreground">{rpgStories.length}개 · 독립 콘텐츠</div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => rpgStoriesQ.refetch()}
              disabled={rpgStoriesQ.isFetching}
            >
              {rpgStoriesQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중
            </div>
          ) : rpgStories.length ? (
            <div className="max-h-[48rem] divide-y divide-border overflow-y-auto">
              {rpgStories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => setSelectedRpgId(story.id)}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface-elevated/60",
                    selectedRpgId === story.id && "bg-primary/10",
                  )}
                >
                  <CoverThumb story={story} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="block truncate text-sm font-medium">{story.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          story.is_public && story.is_listed
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {story.is_public && story.is_listed ? "노출중" : "비공개"}
                      </span>
                    </span>
                    {story.source_title ? (
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                        원본: {story.source_title}
                      </span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded-md bg-background px-1.5 py-0.5">장면 {story.rpg_scenes_count || story.chapters_count}</span>
                      <span className="rounded-md bg-background px-1.5 py-0.5">엔딩 {story.rpg_endings_total || "-"}</span>
                      <span className="rounded-md bg-background px-1.5 py-0.5">
                        {story.source_story_id ? "원본 연결" : "원본 없음"}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Gamepad2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">아직 RPG 작업본이 없습니다.</div>
              <div className="mt-1 text-xs text-muted-foreground">상단에서 원본 스토리를 선택해 생성하세요.</div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          {!selectedRpgId ? (
            <div className="p-10 text-center text-sm text-muted-foreground">수정할 RPG 작업본을 선택하세요.</div>
          ) : detailQ.isLoading ? (
            <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 편집 데이터를 불러오는 중
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="text-sm font-semibold">작업본 편집</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <ScenarioChip
                      label={isPublicDraft && isListedDraft ? "사용자 노출중" : "비공개"}
                      tone={isPublicDraft && isListedDraft ? "good" : "warn"}
                    />
                    <ScenarioChip label={`장면 ${scenarioStats.scenes}`} />
                    <ScenarioChip label={`선택지 ${scenarioStats.choices}`} />
                    <ScenarioChip label={`엔딩 ${scenarioStats.endings}`} tone={scenarioStats.endings ? "warn" : "default"} />
                    <ScenarioChip
                      label={scenarioStats.brokenLinks ? `끊긴 연결 ${scenarioStats.brokenLinks}` : "연결 정상"}
                      tone={scenarioStats.brokenLinks ? "danger" : "good"}
                    />
                    {scenarioStats.emptyScenes ? <ScenarioChip label={`본문 없음 ${scenarioStats.emptyScenes}`} tone="warn" /> : null}
                    {scenarioStats.emptyChoices ? <ScenarioChip label={`선택지 문구 없음 ${scenarioStats.emptyChoices}`} tone="warn" /> : null}
                    {scenarioStats.duplicateSceneIds ? (
                      <ScenarioChip label={`중복 ID ${scenarioStats.duplicateSceneIds}`} tone="danger" />
                    ) : null}
                    {scenarioStats.missingSceneIds ? (
                      <ScenarioChip label={`ID 없음 ${scenarioStats.missingSceneIds}`} tone="danger" />
                    ) : null}
                  </div>
                  {rpgDraft.sourceTitle || rpgDraft.sourceStoryId ? (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      원본: {rpgDraft.sourceTitle || rpgDraft.sourceStoryId}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => rewriteRpgMut.mutate(selectedRpgId)}
                    disabled={activeStoryId === selectedRpgId && rewriteRpgMut.isPending}
                  >
                    {activeStoryId === selectedRpgId && rewriteRpgMut.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    다시 생성
                  </Button>
                  <Link
                    to="/story-rpg/$id"
                    params={{ id: selectedRpgId }}
                    search={{ preview: true }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/50"
                  >
                    <Play className="h-3 w-3" /> 미리보기
                  </Link>
                  {isPublicDraft && isListedDraft ? (
                    <Link
                      to="/interactive-rpg"
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:border-primary/50"
                    >
                      <ExternalLink className="h-3 w-3" /> 목록 확인
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => saveRpgMut.mutate({ publish: true })}
                      disabled={saveRpgMut.isPending}
                    >
                      {saveRpgMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                      공개 저장
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={() => saveRpgMut.mutate()} disabled={saveRpgMut.isPending}>
                    {saveRpgMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    저장
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <RelationMini
                  label="원본"
                  value={rpgDraft.sourceTitle || selectedRpgSummary?.source_title || "독립 생성"}
                  tone={rpgDraft.sourceStoryId || selectedRpgSummary?.source_story_id ? "good" : "default"}
                />
                <RelationMini
                  label="작업본"
                  value={isPublicDraft && isListedDraft ? "사용자 노출" : "비공개 편집"}
                  tone={isPublicDraft && isListedDraft ? "good" : "warn"}
                />
                <RelationMini
                  label="채팅 캐릭터"
                  value={`${selectedRpgChatCharacters.length}/${selectedRpgCharacters.length}명`}
                  tone={selectedRpgChatCharacters.length ? "good" : "warn"}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">RPG 제목</label>
                  <Input className="mt-1" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="rounded-lg border border-border bg-background/60 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={isPublicDraft}
                      onChange={(event) => setIsPublicDraft(event.target.checked)}
                    />
                    공개
                  </label>
                  <label className="rounded-lg border border-border bg-background/60 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={isListedDraft}
                      onChange={(event) => setIsListedDraft(event.target.checked)}
                    />
                    목록 노출
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">사용자 노출 소개문</label>
                <Textarea
                  className="mt-1 min-h-20"
                  value={loglineDraft}
                  onChange={(event) => setLoglineDraft(event.target.value)}
                  placeholder="사용자가 RPG를 시작하고 싶게 만드는 짧은 소개문"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground">현재 루트</label>
                  <Input
                    className="mt-1"
                    value={rpgDraft.currentRoute}
                    onChange={(event) => setRpgDraft((prev) => ({ ...prev, currentRoute: event.target.value }))}
                  />
                </div>
                <NumberField
                  label="시작 호감도"
                  value={rpgDraft.initialAffection}
                  onChange={(value) => setRpgDraft((prev) => ({ ...prev, initialAffection: value }))}
                />
                <NumberField
                  label="시작 긴장도"
                  value={rpgDraft.initialTension}
                  onChange={(value) => setRpgDraft((prev) => ({ ...prev, initialTension: value }))}
                />
                <NumberField
                  label="예상 엔딩 수"
                  value={rpgDraft.endingsTotal}
                  max={99}
                  onChange={(value) => setRpgDraft((prev) => ({ ...prev, endingsTotal: value }))}
                />
              </div>

              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">미리 플레이</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={resetPreview}>
                    <RotateCcw className="h-3 w-3" /> 처음부터
                  </Button>
                </div>

                {previewScene ? (
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          {previewScene.mood || "장면"}
                        </span>
                        <span className="text-sm font-semibold">{previewScene.title}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/85">
                        {previewScene.text || "장면 본문이 아직 없습니다."}
                      </p>
                      {previewScene.partnerLine ? (
                        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm font-medium">
                          "{previewScene.partnerLine}"
                        </div>
                      ) : null}
                      {previewResult ? (
                        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
                          {previewResult}
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {previewScene.choices.length ? (
                          previewScene.choices.map((choice, index) => (
                            <button
                              key={`${previewScene.id}-${choice.label}-${index}`}
                              type="button"
                              onClick={() => playPreviewChoice(choice)}
                              className="rounded-lg border border-border bg-background p-3 text-left text-sm transition hover:border-primary/50 hover:bg-primary/5"
                            >
                              <span className="font-semibold">{choice.label}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {choice.tone} · {choice.effect}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                            이 장면에는 선택지가 없습니다. 엔딩 또는 종료 장면으로 처리됩니다.
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="text-sm font-semibold">상태</div>
                      <div className="mt-3 space-y-3">
                        <PreviewStat label="호감도" value={previewStats.affection} />
                        <PreviewStat label="긴장도" value={previewStats.tension} />
                        <PreviewStat label="신뢰도" value={previewStats.trust} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    미리 플레이할 장면이 없습니다. 장면을 먼저 추가하세요.
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">장면</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addScene}>
                    <Plus className="h-3 w-3" /> 장면 추가
                  </Button>
                </div>

                <div className="space-y-3">
                  {rpgDraft.scenes.map((scene, sceneIndex) => (
                    <details
                      key={`${scene.id}-${sceneIndex}`}
                      open={sceneIndex === 0}
                      className="rounded-md border border-border bg-card p-3"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                        <span className="min-w-0 truncate">
                          {sceneIndex + 1}. {scene.title || scene.id}
                        </span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">{scene.choices.length}개 선택지</span>
                      </summary>
                      <SceneFlowSummary scene={scene} scenes={rpgDraft.scenes} />

                      <div className="mt-3 space-y-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_120px]">
                          <Input value={scene.id} onChange={(event) => updateScene(sceneIndex, { id: event.target.value })} />
                          <Input value={scene.title} onChange={(event) => updateScene(sceneIndex, { title: event.target.value })} />
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeScene(sceneIndex)}
                            disabled={rpgDraft.scenes.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" /> 삭제
                          </Button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            value={scene.mood}
                            onChange={(event) => updateScene(sceneIndex, { mood: event.target.value })}
                            placeholder="분위기"
                          />
                          <Input
                            value={scene.goal}
                            onChange={(event) => updateScene(sceneIndex, { goal: event.target.value })}
                            placeholder="장면 목표"
                          />
                        </div>
                        <Textarea
                          className="min-h-40"
                          value={scene.text}
                          onChange={(event) => updateScene(sceneIndex, { text: event.target.value })}
                          placeholder="플레이어에게 보여줄 장면 본문"
                        />
                        <Input
                          value={scene.partnerLine}
                          onChange={(event) => updateScene(sceneIndex, { partnerLine: event.target.value })}
                          placeholder="상대 주인공 대사"
                        />

                        <div className="rounded-md border border-border bg-background/70 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-semibold text-muted-foreground">선택지</div>
                            <Button type="button" size="sm" variant="outline" onClick={() => addChoice(sceneIndex)}>
                              <Plus className="h-3 w-3" /> 선택지 추가
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {scene.choices.map((choice, choiceIndex) => (
                              <div key={`${choice.label}-${choiceIndex}`} className="space-y-2 rounded-md border border-border bg-card p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-muted-foreground">선택지 {choiceIndex + 1}</div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeChoice(sceneIndex, choiceIndex)}
                                    disabled={scene.choices.length <= 1}
                                  >
                                    삭제
                                  </Button>
                                </div>
                                <ChoiceFlowPreview choice={choice} scenes={rpgDraft.scenes} />
                                <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_1fr]">
                                  <Input
                                    value={choice.label}
                                    onChange={(event) => updateChoice(sceneIndex, choiceIndex, { label: event.target.value })}
                                    placeholder="선택지 문구"
                                  />
                                  <Input
                                    value={choice.tone}
                                    onChange={(event) => updateChoice(sceneIndex, choiceIndex, { tone: event.target.value })}
                                    placeholder="톤"
                                  />
                                  <Input
                                    value={choice.effect}
                                    onChange={(event) => updateChoice(sceneIndex, choiceIndex, { effect: event.target.value })}
                                    placeholder="효과"
                                  />
                                </div>
                                <Textarea
                                  className="min-h-16"
                                  value={choice.result}
                                  onChange={(event) => updateChoice(sceneIndex, choiceIndex, { result: event.target.value })}
                                  placeholder="선택 결과"
                                />
                                <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_90px_90px_90px]">
                                  <Input
                                    value={choice.routeHint}
                                    onChange={(event) => updateChoice(sceneIndex, choiceIndex, { routeHint: event.target.value })}
                                    placeholder="루트"
                                  />
                                  <select
                                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                                    value={choice.nextSceneId ?? ""}
                                    onChange={(event) =>
                                      updateChoice(sceneIndex, choiceIndex, {
                                        nextSceneId: event.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">종료/엔딩</option>
                                    {rpgDraft.scenes.map((targetScene) => (
                                      <option key={targetScene.id} value={targetScene.id}>
                                        {targetScene.title || targetScene.id}
                                      </option>
                                    ))}
                                  </select>
                                  <LabeledNumberInput
                                    label="호감"
                                    value={choice.affectionDelta}
                                    onChange={(value) => updateChoice(sceneIndex, choiceIndex, { affectionDelta: value })}
                                  />
                                  <LabeledNumberInput
                                    label="긴장"
                                    value={choice.tensionDelta}
                                    onChange={(value) => updateChoice(sceneIndex, choiceIndex, { tensionDelta: value })}
                                  />
                                  <LabeledNumberInput
                                    label="신뢰"
                                    value={choice.trustDelta}
                                    onChange={(value) => updateChoice(sceneIndex, choiceIndex, { trustDelta: value })}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        max={max}
        className="mt-1"
        value={value}
        onChange={(event) => onChange(Math.max(0, Math.min(max, Number(event.target.value) || 0)))}
      />
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Input
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  );
}

function CoverThumb({ story }: { story: AdminStoryRow }) {
  const [failed, setFailed] = useState(false);
  if (story.cover_url && !failed) {
    return (
      <img
        src={story.cover_url}
        alt=""
        className="h-14 w-10 shrink-0 rounded-md border border-border bg-muted object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
      <Gamepad2 className="h-4 w-4" />
    </span>
  );
}
