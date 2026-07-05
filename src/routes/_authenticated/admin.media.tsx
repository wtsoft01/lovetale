import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  FileWarning,
  Film,
  Grid2X2,
  Image,
  Link2,
  ListChecks,
  Loader2,
  Mic,
  Music,
  Search,
  Tags,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { listCharacterStories } from "@/lib/admin-characters.functions";
import { listAdminStories } from "@/lib/admin-stories.functions";
import {
  checkMediaDuplicate,
  listMediaAssets,
  registerMediaAsset,
  updateMediaAsset,
  type MediaAssetRow,
} from "@/lib/admin-media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/media")({
  head: () => ({ meta: [{ title: "Media Library — Studio" }] }),
  component: MediaPage,
});

type AssetType = "image" | "animation" | "video" | "audio" | "voice" | "document";
type UploadItem = {
  file: File;
  hash?: string;
  assetType: AssetType;
  storyId: string;
  chapterId: string;
  beatId: string;
  tags: string;
  status: "queued" | "validating" | "duplicate" | "invalid" | "uploading" | "done" | "failed";
  errors: string[];
  duplicateName?: string;
};

type LibraryAsset = MediaAssetRow & {
  source_kind: "media" | "character";
  story_title: string;
  character_id: string | null;
  character_name: string | null;
  character_role: string | null;
  signed_url?: string | null;
};

const MAX_SIZE: Record<AssetType, number> = {
  image: 20 * 1024 * 1024,
  animation: 120 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio: 80 * 1024 * 1024,
  voice: 40 * 1024 * 1024,
  document: 10 * 1024 * 1024,
};

const ASSET_META: Record<AssetType, { label: string; icon: typeof Image; accepts: string[] }> = {
  image: { label: "이미지", icon: Image, accepts: ["image/jpeg", "image/png", "image/webp"] },
  animation: { label: "애니메이션", icon: Film, accepts: ["image/gif", "video/webm", "video/mp4"] },
  video: { label: "영상", icon: Film, accepts: ["video/mp4", "video/webm", "video/quicktime"] },
  audio: { label: "BGM/SFX", icon: Music, accepts: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"] },
  voice: { label: "보이스", icon: Mic, accepts: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"] },
  document: { label: "원고", icon: FileWarning, accepts: ["text/plain", "application/pdf"] },
};

const KEEP_VALUE = "__keep__";

function MediaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const listStories = useServerFn(listAdminStories);
  const listCharacters = useServerFn(listCharacterStories);
  const listAssets = useServerFn(listMediaAssets);
  const checkDup = useServerFn(checkMediaDuplicate);
  const register = useServerFn(registerMediaAsset);
  const updateAsset = useServerFn(updateMediaAsset);

  const [q, setQ] = useState("");
  const [assetType, setAssetType] = useState<AssetType | "all">("all");
  const [storyId, setStoryId] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "duplicate" | "invalid" | "processing" | "failed" | "archived">("all");
  const [characterKey, setCharacterKey] = useState("");
  const [sourceKind, setSourceKind] = useState<"all" | "media" | "character">("all");
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batch, setBatch] = useState({ storyId: "", chapterId: "", beatId: "", tags: "" });
  const [bulkPatch, setBulkPatch] = useState({
    storyId: KEEP_VALUE,
    chapterId: KEEP_VALUE,
    beatId: KEEP_VALUE,
    characterId: KEEP_VALUE,
    tags: "",
    tagMode: "append" as "append" | "replace",
    status: KEEP_VALUE,
  });

  const storiesQ = useQuery({
    queryKey: ["admin_stories", "media_picker"],
    queryFn: () => listStories({ data: { q: "", status: "all" } }),
  });
  const charactersQ = useQuery({
    queryKey: ["admin_character_stories", "media_library"],
    queryFn: () => listCharacters(),
  });
  const assetsQ = useQuery({
    queryKey: ["media_assets", q, storyId, assetType, tag, status],
    queryFn: () => listAssets({ data: { q, storyId: storyId || null, assetType, tag, status } }),
  });

  const uploadM = useMutation({
    mutationFn: uploadAll,
    onSuccess: () => {
      toast.success("업로드 검증과 등록이 완료되었습니다.");
      qc.invalidateQueries({ queryKey: ["media_assets"] });
      setStep(3);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkUpdateM = useMutation({
    mutationFn: applyBulkPatch,
    onSuccess: (count) => {
      toast.success(`${count}개 에셋을 정리했습니다.`);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["media_assets"] });
    },
    onError: (e: Error) => toast.error(e.message || "일괄 수정에 실패했습니다."),
  });

  const counts = useMemo(() => {
    const rows = buildLibraryAssets(assetsQ.data ?? [], storiesQ.data ?? [], charactersQ.data ?? []);
    return {
      total: rows.length,
      ready: rows.filter((a) => a.status === "ready").length,
      invalid: rows.filter((a) => a.status === "invalid").length,
      linked: rows.filter((a) => !!a.story_id || !!a.beat_id || !!a.character_name).length,
    };
  }, [assetsQ.data, charactersQ.data, storiesQ.data]);

  const libraryAssets = useMemo(
    () => buildLibraryAssets(assetsQ.data ?? [], storiesQ.data ?? [], charactersQ.data ?? []),
    [assetsQ.data, charactersQ.data, storiesQ.data],
  );

  const storyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of libraryAssets) {
      if (asset.story_id) map.set(asset.story_id, asset.story_title || asset.story_id);
    }
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [libraryAssets]);

  const characterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of libraryAssets) {
      if (asset.character_name) map.set(asset.character_id || asset.character_name, asset.character_name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [libraryAssets]);

  const filteredAssets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return libraryAssets.filter((asset) => {
      if (storyId && asset.story_id !== storyId) return false;
      if (assetType !== "all" && asset.asset_type !== assetType) return false;
      if (status !== "all" && asset.status !== status) return false;
      if (sourceKind !== "all" && asset.source_kind !== sourceKind) return false;
      if (characterKey && (asset.character_id || asset.character_name) !== characterKey) return false;
      if (tag && !(asset.tags ?? []).some((item) => item.toLowerCase().includes(tag.toLowerCase()))) return false;
      if (!needle) return true;
      const haystack = [
        asset.file_name,
        asset.story_title,
        asset.character_name,
        asset.character_role,
        asset.chapter_id,
        asset.beat_id,
        asset.storage_path,
        ...(asset.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [assetType, characterKey, libraryAssets, q, sourceKind, status, storyId, tag]);

  const selectedAssets = useMemo(
    () => filteredAssets.filter((asset) => selectedIds.includes(asset.id)),
    [filteredAssets, selectedIds],
  );
  const editableSelectedAssets = useMemo(
    () => selectedAssets.filter((asset) => asset.source_kind === "media"),
    [selectedAssets],
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredAssets.some((asset) => asset.id === id)));
  }, [filteredAssets]);

  useEffect(() => {
    const pending = filteredAssets
      .filter((asset) => shouldSignAsset(asset) && !signedUrls[asset.id])
      .slice(0, 80);
    if (!pending.length) return;
    let cancelled = false;
    supabase.storage
      .from("story-media")
      .createSignedUrls(pending.map((asset) => asset.storage_path), 60 * 60)
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        data?.forEach((row, index) => {
          if (row?.signedUrl) next[pending[index].id] = row.signedUrl;
        });
        if (Object.keys(next).length) setSignedUrls((prev) => ({ ...prev, ...next }));
      });
    return () => {
      cancelled = true;
    };
  }, [filteredAssets, signedUrls]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: UploadItem[] = Array.from(files).map((file) => {
      const inferred = inferAssetType(file);
      return {
        file,
        assetType: inferred,
        storyId: batch.storyId,
        chapterId: batch.chapterId,
        beatId: batch.beatId,
        tags: batch.tags,
        status: "queued",
        errors: validateFile(file, inferred),
      };
    });
    setItems((prev) => [...prev, ...next]);
    setWizardOpen(true);
    setStep(1);
  }

  async function validateDuplicates() {
    const validated: UploadItem[] = [];
    for (const item of items) {
      const hash = await sha256(item.file);
      const errors = validateFile(item.file, item.assetType);
      if (errors.length) {
        validated.push({ ...item, hash, errors, status: "invalid" });
        continue;
      }
      const dup = await checkDup({ data: { contentHash: hash } });
      validated.push({
        ...item,
        hash,
        errors,
        status: dup.duplicate ? "duplicate" : "queued",
        duplicateName: dup.asset?.file_name,
      });
    }
    setItems(validated);
    setStep(2);
  }

  async function uploadAll() {
    const ready = items.filter((i) => i.status === "queued" && i.hash && !i.errors.length);
    if (!ready.length) throw new Error("업로드 가능한 파일이 없습니다.");
    for (const item of ready) {
      setItems((prev) => prev.map((x) => (x === item ? { ...x, status: "uploading" } : x)));
      const ext = item.file.name.split(".").pop() || "bin";
      const path = `${item.assetType}s/${item.storyId || "unassigned"}/${item.hash}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("story-media")
        .upload(path, item.file, { upsert: false, contentType: item.file.type });
      if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) {
        setItems((prev) => prev.map((x) => (x === item ? { ...x, status: "failed", errors: [uploadError.message] } : x)));
        continue;
      }
      await register({
        data: {
          storyId: item.storyId || null,
          chapterId: item.chapterId || null,
          beatId: item.beatId || null,
          assetType: item.assetType,
          storagePath: path,
          fileName: item.file.name,
          fileSize: item.file.size,
          mimeType: item.file.type || "application/octet-stream",
          contentHash: item.hash!,
          tags: splitTags(item.tags),
          status: "ready",
          validationErrors: [],
          metadata: { source: "admin_bulk_wizard" },
        },
      });
      setItems((prev) => prev.map((x) => (x === item ? { ...x, status: "done" } : x)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectVisible() {
    const visibleIds = filteredAssets.map((asset) => asset.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedIds, ...visibleIds])]);
  }

  async function copySelectedPaths() {
    const rows = (selectedAssets.length ? selectedAssets : filteredAssets).map((asset) => asset.storage_path).filter(Boolean);
    if (!rows.length) {
      toast.error("복사할 에셋 경로가 없습니다.");
      return;
    }
    await navigator.clipboard.writeText(rows.join("\n"));
    toast.success(`${rows.length}개 에셋 경로를 복사했습니다.`);
  }

  async function applyBulkPatch() {
    if (!editableSelectedAssets.length) throw new Error("수정 가능한 선택 에셋이 없습니다.");
    const selectedCharacter = characterOptions.find((character) => character.id === bulkPatch.characterId);
    const nextTags = splitTags(bulkPatch.tags);
    let changed = 0;

    for (const asset of editableSelectedAssets) {
      const patch: Record<string, unknown> = { id: asset.id };
      if (bulkPatch.storyId !== KEEP_VALUE) patch.storyId = bulkPatch.storyId || null;
      if (bulkPatch.chapterId !== KEEP_VALUE) patch.chapterId = bulkPatch.chapterId || null;
      if (bulkPatch.beatId !== KEEP_VALUE) patch.beatId = bulkPatch.beatId || null;
      if (bulkPatch.status !== KEEP_VALUE) patch.status = bulkPatch.status;
      if (nextTags.length) {
        patch.tags = bulkPatch.tagMode === "replace" ? nextTags : [...new Set([...(asset.tags ?? []), ...nextTags])];
      }
      if (bulkPatch.characterId !== KEEP_VALUE) {
        const metadata = recordOfUnknown(asset.metadata);
        patch.metadata = bulkPatch.characterId
          ? {
              ...metadata,
              characterId: bulkPatch.characterId,
              characterName: selectedCharacter?.name ?? asset.character_name ?? "",
              characterRole: asset.character_role ?? "",
            }
          : {
              ...metadata,
              characterId: null,
              characterName: null,
              characterRole: null,
            };
      }

      if (Object.keys(patch).length <= 1) continue;
      await updateAsset({ data: patch });
      changed += 1;
    }

    if (!changed) throw new Error("적용할 변경사항이 없습니다.");
    return changed;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">MEDIA LIBRARY</span>
          <h1 className="mt-1 font-display text-3xl font-semibold">미디어 자료실</h1>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} accept="image/*,video/*,audio/*,.txt,.pdf" />
          <Button onClick={() => fileRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" /> 대량 업로드</Button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-4">
        <StatCard icon={Image} label="현재 결과" value={counts.total} hint="검색·필터 적용" />
        <StatCard icon={CheckCircle2} label="정상" value={counts.ready} hint="등록 완료" />
        <StatCard icon={Link2} label="연결됨" value={counts.linked} hint="스토리/비트 배치" />
        <StatCard icon={AlertTriangle} label="검증 필요" value={counts.invalid} hint="형식·용량 확인" />
      </div>

      <section className="grid min-h-[620px] gap-4 xl:grid-cols-[300px_1fr_320px]">
        <aside className="rounded-lg border border-border bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="파일명, 스토리, 캐릭터 검색" className="pl-9" />
          </div>
          <FilterLabel label="스토리" />
          <select value={storyId} onChange={(e) => setStoryId(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">전체 스토리</option>
            {storyOptions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <FilterLabel label="캐릭터" />
          <select value={characterKey} onChange={(e) => setCharacterKey(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">전체 캐릭터</option>
            {characterOptions.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
          </select>
          <FilterLabel label="소스 타입" />
          <div className="grid grid-cols-2 gap-1">
            {(["all", "image", "animation", "video", "audio", "voice"] as const).map((type) => (
              <button key={type} onClick={() => setAssetType(type)} className={`rounded-lg border px-2 py-1.5 text-xs ${assetType === type ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{type === "all" ? "전체" : ASSET_META[type].label}</button>
            ))}
          </div>
          <FilterLabel label="등록 경로" />
          <div className="grid grid-cols-3 gap-1">
            {([
              ["all", "전체"],
              ["media", "자료"],
              ["character", "캐릭터"],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSourceKind(key)} className={`rounded-lg border px-2 py-1.5 text-xs ${sourceKind === key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
          <FilterLabel label="상태" />
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">전체</option><option value="ready">정상</option><option value="archived">보관</option><option value="invalid">검증 필요</option><option value="duplicate">중복</option><option value="failed">실패</option>
          </select>
          <FilterLabel label="태그" />
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="예: warm, chapter-1" />
        </aside>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">에셋 보드</h2>
              <p className="text-xs text-muted-foreground">{filteredAssets.length}개 표시 · {selectedAssets.length}개 선택</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {assetsQ.isLoading || charactersQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Button variant="outline" size="sm" onClick={toggleSelectVisible}><ListChecks className="mr-2 h-4 w-4" /> 전체선택</Button>
              <Button variant="outline" size="sm" onClick={copySelectedPaths}><CopyCheck className="mr-2 h-4 w-4" /> 경로복사</Button>
              <button onClick={() => setViewMode(viewMode === "grid" ? "compact" : "grid")} className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground" title="보기 전환">
                {viewMode === "grid" ? <Grid2X2 className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {selectedAssets.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              <span>{selectedAssets.length}개 선택됨</span>
              <button onClick={() => setSelectedIds([])} className="text-xs text-muted-foreground hover:text-foreground">선택 해제</button>
            </div>
          )}
          <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2 2xl:grid-cols-4" : "space-y-2"}>
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selectedIds.includes(asset.id)}
                signedUrl={asset.signed_url ?? signedUrls[asset.id] ?? null}
                compact={viewMode === "compact"}
                onSelect={() => toggleSelect(asset.id)}
              />
            ))}
            {!assetsQ.isLoading && !charactersQ.isLoading && !filteredAssets.length && <div className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">표시할 에셋이 없습니다.</div>}
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">관리 요약</h2>
          <div className="mt-4 space-y-3">
            <ActionRow icon={Tags} title="스토리별 관리" text={`${storyOptions.length}개 스토리의 에셋을 필터링합니다.`} />
            <ActionRow icon={Image} title="캐릭터 에셋" text={`${characterOptions.length}명 캐릭터 이미지/연결자료를 함께 표시합니다.`} />
            <ActionRow icon={CopyCheck} title="대량 작업" text="선택한 에셋 경로를 복사해 편집기·운영시트에 바로 활용합니다." />
          </div>
          <div className="mt-5 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">선택 에셋 정리</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{editableSelectedAssets.length}/{selectedAssets.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              <select value={bulkPatch.storyId} onChange={(e) => setBulkPatch({ ...bulkPatch, storyId: e.target.value })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <option value={KEEP_VALUE}>스토리 유지</option>
                <option value="">스토리 연결 해제</option>
                {(storiesQ.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <Input value={bulkPatch.chapterId === KEEP_VALUE ? "" : bulkPatch.chapterId} onChange={(e) => setBulkPatch({ ...bulkPatch, chapterId: e.target.value || KEEP_VALUE })} placeholder="회차 ID/명 입력 시 변경" className="h-9 text-xs" />
              <Input value={bulkPatch.beatId === KEEP_VALUE ? "" : bulkPatch.beatId} onChange={(e) => setBulkPatch({ ...bulkPatch, beatId: e.target.value || KEEP_VALUE })} placeholder="비트 ID 입력 시 변경" className="h-9 text-xs" />
              <select value={bulkPatch.characterId} onChange={(e) => setBulkPatch({ ...bulkPatch, characterId: e.target.value })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <option value={KEEP_VALUE}>캐릭터 유지</option>
                <option value="">캐릭터 연결 해제</option>
                {characterOptions.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
              <div className="grid grid-cols-[1fr_86px] gap-2">
                <Input value={bulkPatch.tags} onChange={(e) => setBulkPatch({ ...bulkPatch, tags: e.target.value })} placeholder="태그 쉼표 구분" className="h-9 text-xs" />
                <select value={bulkPatch.tagMode} onChange={(e) => setBulkPatch({ ...bulkPatch, tagMode: e.target.value as "append" | "replace" })} className="rounded-lg border border-border bg-card px-2 py-2 text-xs">
                  <option value="append">추가</option>
                  <option value="replace">교체</option>
                </select>
              </div>
              <select value={bulkPatch.status} onChange={(e) => setBulkPatch({ ...bulkPatch, status: e.target.value })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <option value={KEEP_VALUE}>상태 유지</option>
                <option value="ready">정상</option>
                <option value="archived">보관</option>
                <option value="invalid">검증 필요</option>
              </select>
              <Button className="w-full" size="sm" disabled={!editableSelectedAssets.length || bulkUpdateM.isPending} onClick={() => bulkUpdateM.mutate()}>
                {bulkUpdateM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                선택 항목 적용
              </Button>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Link to="/admin/stories" className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/40">스토리관리에서 배치</Link>
            <Link to="/admin/characters" className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/40">캐릭터관리로 이동</Link>
          </div>
        </aside>
      </section>

      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={() => setWizardOpen(false)}>
          <div className="mx-auto flex h-full max-w-6xl flex-col rounded-lg border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div><h2 className="font-display text-2xl font-semibold">스토리별 대량 업로드 위자드</h2><p className="mt-1 text-sm text-muted-foreground">파일 선택 → 해시 중복/검증 → 저장소 업로드 및 라이브러리 등록</p></div>
              <button onClick={() => setWizardOpen(false)} className="text-sm text-muted-foreground">닫기</button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[280px_1fr]">
              <aside className="rounded-lg border border-border bg-card p-4">
                <Step active={step === 1} done={step > 1} label="1. 기본 연결" />
                <Step active={step === 2} done={step > 2} label="2. 중복·검증" />
                <Step active={step === 3} done={false} label="3. 등록 완료" />
                <div className="mt-5 space-y-3">
                  <select value={batch.storyId} onChange={(e) => setBatch({ ...batch, storyId: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="">스토리 선택</option>
                    {(storiesQ.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <Input value={batch.chapterId} onChange={(e) => setBatch({ ...batch, chapterId: e.target.value })} placeholder="챕터 ID 또는 이름" />
                  <Input value={batch.beatId} onChange={(e) => setBatch({ ...batch, beatId: e.target.value })} placeholder="비트 ID" />
                  <Input value={batch.tags} onChange={(e) => setBatch({ ...batch, tags: e.target.value })} placeholder="태그 쉼표 구분" />
                  <Button variant="outline" className="w-full" onClick={() => setItems((prev) => prev.map((i) => ({ ...i, ...batch })))}>선택값 전체 적용</Button>
                </div>
              </aside>
              <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">총 {items.length}개 · 중복 {items.filter((i) => i.status === "duplicate").length}개 · 오류 {items.filter((i) => i.status === "invalid" || i.status === "failed").length}개</div>
                  <div className="flex gap-2"><Button variant="outline" onClick={validateDuplicates}>중복·검증 실행</Button><Button disabled={uploadM.isPending} onClick={() => uploadM.mutate()}>{uploadM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}업로드 등록</Button></div>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => <UploadRow key={`${item.file.name}-${idx}`} item={item} onChange={(patch) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, ...patch } : x))} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadRow({ item, onChange }: { item: UploadItem; onChange: (patch: Partial<UploadItem>) => void }) {
  return <div className="grid gap-2 rounded-lg border border-border bg-background p-3 xl:grid-cols-[1fr_140px_120px_120px_1fr_120px]">
    <div className="min-w-0"><div className="truncate text-sm font-medium">{item.file.name}</div><div className="text-[11px] text-muted-foreground">{formatBytes(item.file.size)} · {item.file.type || "unknown"}</div></div>
    <select value={item.assetType} onChange={(e) => onChange({ assetType: e.target.value as AssetType, errors: validateFile(item.file, e.target.value as AssetType) })} className="rounded border border-border bg-card px-2 py-1 text-xs">{Object.entries(ASSET_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select>
    <Input value={item.chapterId} onChange={(e) => onChange({ chapterId: e.target.value })} placeholder="챕터" className="h-8 text-xs" />
    <Input value={item.beatId} onChange={(e) => onChange({ beatId: e.target.value })} placeholder="비트" className="h-8 text-xs" />
    <Input value={item.tags} onChange={(e) => onChange({ tags: e.target.value })} placeholder="태그" className="h-8 text-xs" />
    <StatusPill item={item} />
  </div>;
}

function buildLibraryAssets(mediaRows: MediaAssetRow[], stories: any[], characterStories: any[]): LibraryAsset[] {
  const storyTitles = new Map<string, string>();
  for (const story of stories ?? []) storyTitles.set(story.id, story.title);
  for (const story of characterStories ?? []) storyTitles.set(story.storyId, story.storyTitle);

  const characterByPath = new Map<string, { id: string; name: string; role: string; storyId: string }>();
  const charactersByStory = new Map<string, Array<{ id: string; name: string; role: string }>>();
  for (const story of characterStories ?? []) {
    const rows = (story.characters ?? []) as any[];
    charactersByStory.set(
      story.storyId,
      rows.map((character) => ({
        id: String(character.id ?? character.name ?? ""),
        name: String(character.name ?? ""),
        role: String(character.role ?? ""),
      })),
    );
    for (const character of rows) {
      const avatar = String(character.avatarUrl ?? "").trim();
      if (!avatar) continue;
      characterByPath.set(avatar, {
        id: String(character.id ?? character.name ?? ""),
        name: String(character.name ?? ""),
        role: String(character.role ?? ""),
        storyId: story.storyId,
      });
    }
  }

  const mediaAssets: LibraryAsset[] = mediaRows.map((asset) => {
    const metadata = recordOfUnknown(asset.metadata);
    const pathCharacter = characterByPath.get(asset.storage_path);
    const explicitCharacterId = stringOf(metadata.characterId ?? metadata.character_id);
    const explicitCharacterName = stringOf(metadata.characterName ?? metadata.character_name ?? metadata.name);
    const storyCharacters = asset.story_id ? charactersByStory.get(asset.story_id) ?? [] : [];
    const matchedCharacter =
      pathCharacter ??
      storyCharacters.find((character) => character.id && character.id === explicitCharacterId) ??
      storyCharacters.find((character) => character.name && character.name === explicitCharacterName) ??
      null;
    return {
      ...asset,
      source_kind: "media",
      story_title: asset.story_id ? storyTitles.get(asset.story_id) ?? "스토리 미지정" : "스토리 미지정",
      character_id: explicitCharacterId || matchedCharacter?.id || null,
      character_name: explicitCharacterName || matchedCharacter?.name || null,
      character_role: stringOf(metadata.characterRole ?? metadata.character_role) || matchedCharacter?.role || null,
      signed_url: isDirectMediaUrl(asset.storage_path) ? asset.storage_path : null,
    };
  });

  const registeredPaths = new Set(mediaRows.map((asset) => asset.storage_path));
  const characterAssets: LibraryAsset[] = [];
  for (const story of characterStories ?? []) {
    for (const character of story.characters ?? []) {
      const avatar = String(character.avatarUrl ?? "").trim();
      if (!avatar || registeredPaths.has(avatar)) continue;
      characterAssets.push({
        id: `character:${story.storyId}:${character.id || character.name}`,
        user_id: "",
        story_id: story.storyId,
        chapter_id: null,
        beat_id: null,
        asset_type: "image",
        storage_path: avatar,
        file_name: `${character.name || "캐릭터"} 프로필`,
        file_size: 0,
        mime_type: "image/*",
        content_hash: `character:${story.storyId}:${character.id || character.name}`,
        tags: ["character", ...(Array.isArray(character.tags) ? character.tags : [])],
        status: "ready",
        validation_errors: [],
        metadata: { source: "character_card", characterId: character.id, characterName: character.name },
        created_at: story.updatedAt,
        updated_at: story.updatedAt,
        source_kind: "character",
        story_title: story.storyTitle,
        character_id: String(character.id ?? character.name ?? ""),
        character_name: String(character.name ?? ""),
        character_role: String(character.role ?? ""),
        signed_url: isDirectMediaUrl(avatar) ? avatar : null,
      });
    }
  }

  return [...mediaAssets, ...characterAssets].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

function recordOfUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isDirectMediaUrl(value: string) {
  return /^(https?:|data:|blob:)/i.test(value);
}

function shouldSignAsset(asset: LibraryAsset) {
  return Boolean(asset.storage_path) && !asset.signed_url && !isDirectMediaUrl(asset.storage_path);
}

function AssetCard({
  asset,
  selected,
  signedUrl,
  compact,
  onSelect,
}: {
  asset: LibraryAsset;
  selected: boolean;
  signedUrl: string | null;
  compact: boolean;
  onSelect: () => void;
}) {
  const meta = ASSET_META[(asset.asset_type as AssetType) || "document"] ?? ASSET_META.document;
  const Icon = meta.icon;
  if (compact) {
    return (
      <div className={`grid grid-cols-[40px_56px_1fr_auto] items-center gap-3 rounded-lg border p-2 ${selected ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
        <input type="checkbox" checked={selected} onChange={onSelect} className="mx-auto size-4 accent-primary" aria-label={`${asset.file_name} 선택`} />
        <AssetThumb asset={asset} signedUrl={signedUrl} icon={Icon} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{asset.file_name}</div>
          <div className="truncate text-xs text-muted-foreground">{asset.story_title} · {asset.character_name || asset.chapter_id || "연결 미지정"}</div>
        </div>
        <span className="rounded bg-primary/10 px-2 py-1 text-[10px] text-primary">{meta.label}</span>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-lg border bg-background ${selected ? "border-primary ring-1 ring-primary/50" : "border-border"}`}>
      <div className="relative">
        <AssetThumb asset={asset} signedUrl={signedUrl} icon={Icon} large />
        <label className="absolute left-2 top-2 inline-flex size-7 items-center justify-center rounded-full border border-white/20 bg-black/55">
          <input type="checkbox" checked={selected} onChange={onSelect} className="size-4 accent-primary" aria-label={`${asset.file_name} 선택`} />
        </label>
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">{asset.source_kind === "character" ? "캐릭터" : meta.label}</span>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium">{asset.file_name}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{asset.story_title}</div>
        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
          {asset.character_name && <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-sky-200">{asset.character_name}</span>}
          {(asset.tags ?? []).slice(0, 4).map((t) => <span key={t} className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{t}</span>)}
        </div>
        <div className="mt-2 truncate text-[11px] text-muted-foreground">{formatBytes(asset.file_size)} · {asset.chapter_id || "회차 미지정"}</div>
      </div>
    </div>
  );
}

function AssetThumb({ asset, signedUrl, icon: Icon, large = false }: { asset: LibraryAsset; signedUrl: string | null; icon: typeof Image; large?: boolean }) {
  const src = asset.signed_url ?? signedUrl ?? (isDirectMediaUrl(asset.storage_path) ? asset.storage_path : null);
  const className = large ? "aspect-[4/3] w-full" : "size-14 rounded-md";
  if (asset.asset_type === "video" && src) {
    return <video src={src} className={`${className} bg-surface-elevated object-cover`} muted playsInline />;
  }
  if ((asset.asset_type === "image" || asset.asset_type === "animation") && src) {
    return <img src={src} alt={asset.file_name} className={`${className} bg-surface-elevated object-cover`} loading="lazy" />;
  }
  return <div className={`grid ${className} place-items-center bg-surface-elevated/70`}><Icon className="h-7 w-7 text-muted-foreground" /></div>;
}

function StatusPill({ item }: { item: UploadItem }) {
  const label = item.status === "queued" ? "대기" : item.status === "duplicate" ? `중복${item.duplicateName ? `: ${item.duplicateName}` : ""}` : item.status === "invalid" ? item.errors[0] : item.status === "uploading" ? "업로드 중" : item.status === "done" ? "완료" : item.status;
  const tone = item.status === "done" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : item.status === "duplicate" || item.status === "invalid" || item.status === "failed" ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-muted-foreground border-border";
  return <div className={`truncate rounded border px-2 py-1 text-[11px] ${tone}`} title={label}>{label}</div>;
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Image; label: string; value: number; hint: string }) { return <div className="rounded-lg border border-border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><div className="mt-3 flex items-end justify-between gap-3"><div><div className="font-medium">{label}</div><div className="text-xs text-muted-foreground">{hint}</div></div><div className="font-display text-2xl font-semibold">{value}</div></div></div>; }
function ActionRow({ icon: Icon, title, text }: { icon: typeof Image; title: string; text: string }) { return <div className="rounded-lg border border-border bg-background p-3"><div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" /> {title}</div><div className="mt-1 text-xs text-muted-foreground">{text}</div></div>; }
function FilterLabel({ label }: { label: string }) { return <div className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>; }
function Step({ active, done, label }: { active: boolean; done: boolean; label: string }) { return <div className={`mb-2 rounded-lg border px-3 py-2 text-sm ${active ? "border-primary bg-primary/10" : done ? "border-emerald-500/30 bg-emerald-500/10" : "border-border text-muted-foreground"}`}>{done ? "✓ " : ""}{label}</div>; }
function splitTags(value: string) { return value.split(",").map((t) => t.trim()).filter(Boolean); }
function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`; }
function inferAssetType(file: File): AssetType { if (file.type.startsWith("image/gif")) return "animation"; if (file.type.startsWith("image/")) return "image"; if (file.type.startsWith("video/")) return "video"; if (file.type.startsWith("audio/")) return "audio"; return "document"; }
function validateFile(file: File, type: AssetType) { const errors: string[] = []; if (!ASSET_META[type].accepts.includes(file.type) && !(type === "document" && file.name.endsWith(".txt"))) errors.push("허용되지 않는 형식"); if (file.size > MAX_SIZE[type]) errors.push(`최대 ${formatBytes(MAX_SIZE[type])} 초과`); return errors; }
async function sha256(file: File) { const buf = await file.arrayBuffer(); const hash = await crypto.subtle.digest("SHA-256", buf); return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
