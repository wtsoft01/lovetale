import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  PlugZap,
  Plus,
  RefreshCcw,
  Save,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteLlmProvider,
  listLlmProviders,
  LLM_USAGE_PURPOSES,
  resetLlmProviderQuota,
  testLlmProvider,
  upsertLlmProvider,
  type LlmProvider,
  type LlmUsagePurpose,
} from "@/lib/llm-providers.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/llm")({
  head: () => ({ meta: [{ title: "LLM API 관리 | Lovetale Studio" }] }),
  component: LlmAdminPage,
});

type ProviderKind = "openai" | "anthropic" | "google" | "deepseek" | "openrouter" | "lovable" | "custom";

type FormState = {
  id?: string;
  label: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  usagePurposes: LlmUsagePurpose[];
  monthlyTokenQuota: number;
  priority: number;
  isActive: boolean;
  resetDayOfMonth: number;
  notes: string;
};

const PROVIDER_PRESETS: Array<{
  label: string;
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  keyHint: string;
  priority: number;
  usagePurposes: LlmUsagePurpose[];
}> = [
  {
    label: "OpenAI",
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    keyHint: "sk-...",
    priority: 100,
    usagePurposes: ["general_chat"],
  },
  {
    label: "Google Gemini",
    provider: "google",
    model: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyHint: "AIza...",
    priority: 110,
    usagePurposes: ["image_generation", "video_generation", "asset_recommendation"],
  },
  {
    label: "Anthropic Claude",
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    baseUrl: "https://api.anthropic.com/v1",
    keyHint: "sk-ant-...",
    priority: 120,
    usagePurposes: ["summary", "general_chat"],
  },
  {
    label: "OpenRouter",
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-...",
    priority: 130,
    usagePurposes: ["general_chat"],
  },
  {
    label: "DeepSeek",
    provider: "deepseek",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    keyHint: "sk-...",
    priority: 140,
    usagePurposes: ["translation", "summary"],
  },
];

const emptyForm: FormState = {
  label: "",
  provider: "openai",
  baseUrl: "",
  model: "",
  apiKey: "",
  usagePurposes: ["general_chat"],
  monthlyTokenQuota: 0,
  priority: 100,
  isActive: true,
  resetDayOfMonth: 1,
  notes: "",
};

const purposeLabelMap = new Map(LLM_USAGE_PURPOSES.map((item) => [item.key, item.label]));

function fmt(n: number) {
  return n.toLocaleString();
}

function togglePurpose(current: LlmUsagePurpose[], purpose: LlmUsagePurpose, checked: boolean) {
  const next = checked ? [...new Set([...current, purpose])] : current.filter((item) => item !== purpose);
  return next.length ? next : ["general_chat"];
}

function LlmAdminPage() {
  const qc = useQueryClient();
  const list = useServerFn(listLlmProviders);
  const upsert = useServerFn(upsertLlmProvider);
  const remove = useServerFn(deleteLlmProvider);
  const reset = useServerFn(resetLlmProviderQuota);
  const test = useServerFn(testLlmProvider);

  const q = useQuery({ queryKey: ["llm_providers"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const rows = q.data ?? [];
  const totals = useMemo(
    () => ({
      count: rows.length,
      active: rows.filter((row) => row.isActive).length,
      totalQuota: rows.reduce((sum, row) => sum + row.monthlyTokenQuota, 0),
      totalUsed: rows.reduce((sum, row) => sum + row.usedTokens, 0),
    }),
    [rows],
  );

  const upsertMut = useMutation({
    mutationFn: (data: FormState) =>
      upsert({
        data: {
          id: data.id,
          label: data.label,
          provider: data.provider,
          baseUrl: data.baseUrl || null,
          model: data.model || null,
          apiKey: data.apiKey || undefined,
          usagePurposes: data.usagePurposes,
          monthlyTokenQuota: Number(data.monthlyTokenQuota) || 0,
          priority: Number(data.priority) || 100,
          isActive: data.isActive,
          resetDayOfMonth: Number(data.resetDayOfMonth) || 1,
          notes: data.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("LLM API가 저장되었습니다.");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["llm_providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("LLM API를 삭제했습니다.");
      qc.invalidateQueries({ queryKey: ["llm_providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (id: string) => reset({ data: { id } }),
    onSuccess: () => {
      toast.success("사용량을 초기화했습니다.");
      qc.invalidateQueries({ queryKey: ["llm_providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function runTest(row: LlmProvider) {
    setTestingId(row.id);
    try {
      const result = await test({ data: { id: row.id } });
      if (result.ok) {
        const msg = `연결 성공 · ${result.tokens} tokens · ${result.text || "pong"}`;
        setTestResults((prev) => ({ ...prev, [row.id]: { ok: true, msg } }));
        toast.success(`${row.label} 연결 성공`);
      } else {
        const msg = result.error || `HTTP ${result.status ?? "?"}`;
        setTestResults((prev) => ({ ...prev, [row.id]: { ok: false, msg } }));
        toast.error(`${row.label} 연결 실패: ${msg.slice(0, 120)}`);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setTestResults((prev) => ({ ...prev, [row.id]: { ok: false, msg } }));
      toast.error(`${row.label} 테스트 오류: ${msg.slice(0, 120)}`);
    } finally {
      setTestingId(null);
    }
  }

  function openCreate(preset?: (typeof PROVIDER_PRESETS)[number]) {
    setForm(
      preset
        ? {
            ...emptyForm,
            label: preset.label,
            provider: preset.provider,
            baseUrl: preset.baseUrl,
            model: preset.model,
            priority: preset.priority,
            usagePurposes: preset.usagePurposes,
          }
        : emptyForm,
    );
    setOpen(true);
  }

  function openEdit(row: LlmProvider) {
    setForm({
      id: row.id,
      label: row.label,
      provider: row.provider as ProviderKind,
      baseUrl: row.baseUrl ?? "",
      model: row.model ?? "",
      apiKey: "",
      usagePurposes: row.usagePurposes.length ? row.usagePurposes : ["general_chat"],
      monthlyTokenQuota: row.monthlyTokenQuota,
      priority: row.priority,
      isActive: row.isActive,
      resetDayOfMonth: row.resetDayOfMonth,
      notes: row.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl font-semibold">LLM API 관리</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            API마다 사용처를 지정합니다. 본문 번역은 DeepSeek, 이미지/영상 생성은 Gemini 또는 OpenAI,
            일반 사용은 ChatGPT처럼 목적별로 나누어 운영할 수 있습니다.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="size-4" /> API 추가
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="등록 API" value={`${totals.count}`} />
        <SummaryCard label="활성 API" value={`${totals.active}`} />
        <SummaryCard label="월 할당량 합계" value={fmt(totals.totalQuota)} suffix="tok" />
        <SummaryCard label="이번 달 사용량" value={fmt(totals.totalUsed)} suffix="tok" />
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <PlugZap className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">빠른 등록</h2>
          <span className="text-xs text-muted-foreground">프리셋은 추천 사용처를 자동 선택합니다.</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.provider}
              type="button"
              onClick={() => openCreate(preset)}
              className="rounded-md border border-border bg-background p-3 text-left transition hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{preset.label}</span>
                <Badge variant="secondary">{preset.provider}</Badge>
              </div>
              <div className="mt-2 truncate text-xs text-muted-foreground">{preset.model}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {preset.usagePurposes.map((purpose) => (
                  <Badge key={purpose} variant="outline" className="text-[10px]">
                    {purposeLabelMap.get(purpose)}
                  </Badge>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      {q.isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> API 목록을 불러오는 중
        </div>
      ) : q.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <ShieldAlert className="mr-1 inline size-4" />
          {(q.error as Error).message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
          <Activity className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">아직 등록된 API가 없습니다. 첫 API를 추가하세요.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left">제공사</th>
                <th className="px-3 py-2 text-left">사용처</th>
                <th className="px-3 py-2 text-left">모델</th>
                <th className="px-3 py-2 text-right">사용량 / 할당량</th>
                <th className="px-3 py-2 text-center">상태</th>
                <th className="px-3 py-2 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pct = row.monthlyTokenQuota > 0 ? Math.min(100, (row.usedTokens / row.monthlyTokenQuota) * 100) : 0;
                const testResult = testResults[row.id];
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-[11px] text-muted-foreground">{row.apiKeyMasked}</div>
                      {testResult && (
                        <div className={`mt-1 flex items-center gap-1 text-[11px] ${testResult.ok ? "text-emerald-600" : "text-destructive"}`} title={testResult.msg}>
                          {testResult.ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                          <span className="max-w-56 truncate">{testResult.msg}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="uppercase">{row.provider}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {row.usagePurposes.map((purpose) => (
                          <Badge key={purpose} variant="outline" className="text-[10px]">
                            {purposeLabelMap.get(purpose) ?? purpose}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.model || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-mono text-xs">
                        {fmt(row.usedTokens)} / {row.monthlyTokenQuota === 0 ? "무제한" : fmt(row.monthlyTokenQuota)}
                      </div>
                      {row.monthlyTokenQuota > 0 && (
                        <div className="ml-auto mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.isActive ? <Badge className="bg-emerald-500/15 text-emerald-600">활성</Badge> : <Badge variant="outline">중지</Badge>}
                      <div className="mt-1 text-[11px] text-muted-foreground">우선순위 {row.priority}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => runTest(row)} disabled={testingId === row.id} title="연결 테스트">
                          {testingId === row.id ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => resetMut.mutate(row.id)} disabled={resetMut.isPending} title="사용량 초기화">
                          <RefreshCcw className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>수정</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`${row.label} API를 삭제할까요?`)) removeMut.mutate(row.id);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "LLM API 수정" : "LLM API 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>이름</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="예: DeepSeek 번역용" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>제공사</Label>
                <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v as ProviderKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google Gemini</SelectItem>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="lovable">Lovable AI</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>모델</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o-mini" />
              </div>
            </div>
            <div>
              <Label>사용처</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {LLM_USAGE_PURPOSES.map((purpose) => (
                  <label key={purpose.key} className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3 hover:border-primary/50">
                    <Checkbox
                      checked={form.usagePurposes.includes(purpose.key)}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, usagePurposes: togglePurpose(form.usagePurposes, purpose.key, checked === true) })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{purpose.label}</span>
                      <span className="block text-xs text-muted-foreground">{purpose.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Base URL</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="공식 endpoint 사용 시 비워도 됩니다." />
              </div>
            </div>
            <div>
              <Label>API Key {form.id && <span className="text-xs text-muted-foreground">(변경할 때만 입력)</span>}</Label>
              <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={form.id ? "비워두면 기존 키 유지" : "API Key"} autoComplete="off" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>월 토큰 할당량</Label>
                <Input type="number" min={0} value={form.monthlyTokenQuota} onChange={(e) => setForm({ ...form, monthlyTokenQuota: Number(e.target.value) })} />
              </div>
              <div>
                <Label>우선순위</Label>
                <Input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
              </div>
              <div>
                <Label>월 초기화일</Label>
                <Input type="number" min={1} max={28} value={form.resetDayOfMonth} onChange={(e) => setForm({ ...form, resetDayOfMonth: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} id="llm-active" />
              <Label htmlFor="llm-active">활성화</Label>
            </div>
            <div>
              <Label>메모</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="계정, 용도, 갱신 정보 등" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={() => upsertMut.mutate(form)} disabled={upsertMut.isPending || !form.label || (!form.id && !form.apiKey)}>
              {upsertMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold">
        {value} {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
