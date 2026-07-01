import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  FileWarning,
  Film,
  Image,
  Link2,
  Loader2,
  Mic,
  Music,
  Search,
  Tags,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { listAdminStories } from "@/lib/admin-stories.functions";
import {
  checkMediaDuplicate,
  listMediaAssets,
  registerMediaAsset,
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

function MediaPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const listStories = useServerFn(listAdminStories);
  const listAssets = useServerFn(listMediaAssets);
  const checkDup = useServerFn(checkMediaDuplicate);
  const register = useServerFn(registerMediaAsset);

  const [q, setQ] = useState("");
  const [assetType, setAssetType] = useState<AssetType | "all">("all");
  const [storyId, setStoryId] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "duplicate" | "invalid" | "processing" | "failed">("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batch, setBatch] = useState({ storyId: "", chapterId: "", beatId: "", tags: "" });

  const storiesQ = useQuery({
    queryKey: ["admin_stories", "media_picker"],
    queryFn: () => listStories({ data: { q: "", status: "all" } }),
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

  const counts = useMemo(() => {
    const rows = assetsQ.data ?? [];
    return {
      total: rows.length,
      ready: rows.filter((a: any) => a.status === "ready").length,
      invalid: rows.filter((a: any) => a.status === "invalid").length,
      linked: rows.filter((a: any) => !!a.story_id || !!a.beat_id).length,
    };
  }, [assetsQ.data]);

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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Multimodal Source</span>
          <h1 className="mt-1 font-display text-3xl font-semibold">멀티모달 소스 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">스토리별 대량 업로드, 해시 중복 방지, 검증, 태깅, 검색·필터를 한 화면에서 처리합니다.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} accept="image/*,video/*,audio/*,.txt,.pdf" />
          <Button onClick={() => fileRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" /> 대량 업로드 위자드</Button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-4">
        <StatCard icon={Image} label="현재 결과" value={counts.total} hint="검색·필터 적용" />
        <StatCard icon={CheckCircle2} label="정상" value={counts.ready} hint="등록 완료" />
        <StatCard icon={Link2} label="연결됨" value={counts.linked} hint="스토리/비트 배치" />
        <StatCard icon={AlertTriangle} label="검증 필요" value={counts.invalid} hint="형식·용량 확인" />
      </div>

      <section className="grid min-h-[620px] gap-4 xl:grid-cols-[320px_1fr_380px]">
        <aside className="rounded-lg border border-border bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="파일명, 챕터, 비트 검색" className="pl-9" />
          </div>
          <FilterLabel label="스토리" />
          <select value={storyId} onChange={(e) => setStoryId(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">전체 스토리</option>
            {(storiesQ.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <FilterLabel label="소스 타입" />
          <div className="grid grid-cols-2 gap-1">
            {(["all", "image", "animation", "video", "audio", "voice"] as const).map((type) => (
              <button key={type} onClick={() => setAssetType(type)} className={`rounded-lg border px-2 py-1.5 text-xs ${assetType === type ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{type === "all" ? "전체" : ASSET_META[type].label}</button>
            ))}
          </div>
          <FilterLabel label="상태" />
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">전체</option><option value="ready">정상</option><option value="invalid">검증 필요</option><option value="duplicate">중복</option><option value="failed">실패</option>
          </select>
          <FilterLabel label="태그" />
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="예: warm, chapter-1" />
        </aside>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">소스 보드</h2>
            {assetsQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {(assetsQ.data ?? []).map((asset: any) => <AssetCard key={asset.id} asset={asset} />)}
            {!assetsQ.isLoading && !(assetsQ.data ?? []).length && <div className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">표시할 소스가 없습니다.</div>}
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">태깅·연결 패널</h2>
          <p className="mt-1 text-xs text-muted-foreground">업로드 시 스토리/챕터/비트와 태그를 지정하면 에디터에서 바로 배치할 수 있습니다.</p>
          <div className="mt-4 space-y-3">
            <ActionRow icon={Tags} title="태그 검색" text="캐릭터, 챕터, 무드, 해금 단계 기준으로 필터" />
            <ActionRow icon={CopyCheck} title="해시 중복 방지" text="SHA-256 해시로 같은 파일 업로드 차단" />
            <ActionRow icon={XCircle} title="업로드 검증" text="MIME 형식과 타입별 최대 용량 검사" />
          </div>
          <Link to="/admin/stories" className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/40">콘텐츠 CMS에서 배치하기</Link>
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

function AssetCard({ asset }: { asset: any }) {
  const meta = ASSET_META[(asset.asset_type as AssetType) || "document"] ?? ASSET_META.document;
  const Icon = meta.icon;
  return <div className="overflow-hidden rounded-lg border border-border bg-background"><div className="grid aspect-video place-items-center bg-surface-elevated/60"><Icon className="h-8 w-8 text-muted-foreground" /></div><div className="p-3"><div className="flex items-center justify-between gap-2 text-sm font-medium"><span className="truncate">{asset.file_name}</span><span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{meta.label}</span></div><div className="mt-1 text-[11px] text-muted-foreground">{formatBytes(asset.file_size)} · {asset.chapter_id || "챕터 미지정"} · {asset.beat_id || "비트 미지정"}</div><div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">{(asset.tags ?? []).slice(0, 5).map((t: string) => <span key={t} className="rounded border border-border px-1.5 py-0.5">{t}</span>)}</div></div></div>;
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