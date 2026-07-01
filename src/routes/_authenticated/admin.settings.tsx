import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { Loader2, Save, Store, Users2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listCreatorRevenueRules,
  updateCreatorRevenueRule,
  type CreatorRevenueRule,
} from "@/lib/revenue-rules.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "스토리마켓 설정 — Studio" }] }),
  component: StoryMarketSettingsPage,
});

function StoryMarketSettingsPage() {
  const qc = useQueryClient();
  const listRules = useServerFn(listCreatorRevenueRules);
  const updateRule = useServerFn(updateCreatorRevenueRule);
  const [editing, setEditing] = useState<Record<string, { sharePercent: number; note: string }>>({});

  const rulesQ = useQuery({
    queryKey: ["creator_revenue_rules"],
    queryFn: () => listRules(),
  });

  const updateM = useMutation({
    mutationFn: (input: { userId: string; sharePercent: number; note: string }) =>
      updateRule({ data: input }),
    onSuccess: () => {
      toast.success("수익공유룰이 저장되었습니다.");
      qc.invalidateQueries({ queryKey: ["creator_revenue_rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = rulesQ.data ?? [];
  const totalGross = rows.reduce((sum, row) => sum + row.grossCredits, 0);
  const totalShare = rows.reduce((sum, row) => sum + row.authorShareCredits, 0);

  const draftFor = (row: CreatorRevenueRule) =>
    editing[row.userId] ?? { sharePercent: row.sharePercent, note: row.note ?? "" };

  const patchDraft = (row: CreatorRevenueRule, patch: Partial<{ sharePercent: number; note: string }>) => {
    const current = draftFor(row);
    setEditing((prev) => ({ ...prev, [row.userId]: { ...current, ...patch } }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3 gap-1"><Store className="h-3 w-3" /> Story Market</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">스토리마켓 수익공유룰</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            회원별 작가 수익공유율을 설정합니다. 별도 설정이 없는 작가는 기본 70%가 적용됩니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>크리에이터</CardDescription>
            <CardTitle className="text-2xl">{rows.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>마켓 총 판매</CardDescription>
            <CardTitle className="text-2xl">{totalGross.toLocaleString()} cr</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>작가 분배 누계</CardDescription>
            <CardTitle className="text-2xl">{totalShare.toLocaleString()} cr</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users2 className="h-5 w-5" /> 작가별 룰</CardTitle>
          <CardDescription>스토리를 만든 회원 또는 이미 수익공유룰이 설정된 회원이 표시됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {rulesQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
            </div>
          )}

          {rulesQ.error && (
            <p className="text-sm text-destructive">{(rulesQ.error as Error).message}</p>
          )}

          {!rulesQ.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">아직 스토리를 만든 회원이 없습니다.</p>
          )}

          <div className="space-y-3">
            {rows.map((row) => {
              const draft = draftFor(row);
              const changed = draft.sharePercent !== row.sharePercent || draft.note !== (row.note ?? "");
              return (
                <div key={row.userId} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{row.displayName || row.email || "이름 없는 작가"}</p>
                        <Badge variant="outline">스토리 {row.storyCount}</Badge>
                        <Badge variant="outline">판매중 {row.listedCount}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.email ?? row.userId} · 판매 {row.salesCount.toLocaleString()}건 · 매출 {row.grossCredits.toLocaleString()} cr · 작가분배 {row.authorShareCredits.toLocaleString()} cr
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={!changed || updateM.isPending}
                      onClick={() => updateM.mutate({ userId: row.userId, sharePercent: draft.sharePercent, note: draft.note })}
                    >
                      {updateM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                      저장
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">작가 수익공유율 (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.sharePercent}
                        onChange={(e) => patchDraft(row, { sharePercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">운영 메모</Label>
                      <Input
                        value={draft.note}
                        placeholder="예: 프로모션 작가, 계약 수익률 등"
                        onChange={(e) => patchDraft(row, { note: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}