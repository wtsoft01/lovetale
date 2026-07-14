import { useEffect, useMemo, useState, type ComponentType } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CreditCard,
  DollarSign,
  Loader2,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useServerFn } from "@/lib/_mock/runtime";
import {
  checkIsAdmin,
  confirmCreditOrder,
  getAdminRevenueOverview,
  markOrderFailed,
  refundCreditOrder,
  type AdminRevenueRechargeRow,
  type AdminRevenueUsageRow,
} from "@/lib/admin.functions";
import {
  listCreatorRevenueRules,
  updateCreatorRevenueRule,
  type CreatorRevenueRule,
} from "@/lib/revenue-rules.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [{ title: "매출관리 | Lovetale Studio" }],
  }),
  component: AdminRevenuePage,
});

type RechargeStatus = AdminRevenueRechargeRow["status"];
type RevenueTab = "orders" | "usage" | "creators";
type StatusFilter = "all" | RechargeStatus;
type UsageFilter = "all" | AdminRevenueUsageRow["productType"];

const STATUS_META: Record<RechargeStatus, { label: string; className: string }> = {
  pending: { label: "대기", className: "border-muted bg-muted/40 text-muted-foreground" },
  submitted: { label: "확인중", className: "border-amber-400/40 bg-amber-500/10 text-amber-300" },
  confirmed: { label: "완료", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" },
  failed: { label: "실패", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  refunded: { label: "환불", className: "border-sky-400/40 bg-sky-500/10 text-sky-300" },
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function AdminRevenuePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const checkAdmin = useServerFn(checkIsAdmin);
  const getOverview = useServerFn(getAdminRevenueOverview);
  const confirm = useServerFn(confirmCreditOrder);
  const fail = useServerFn(markOrderFailed);
  const refund = useServerFn(refundCreditOrder);
  const listRules = useServerFn(listCreatorRevenueRules);
  const updateRule = useServerFn(updateCreatorRevenueRule);

  const [tab, setTab] = useState<RevenueTab>("orders");
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [usageSearch, setUsageSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [confirmTarget, setConfirmTarget] = useState<AdminRevenueRechargeRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminRevenueRechargeRow | null>(null);
  const [txInput, setTxInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [creatorDrafts, setCreatorDrafts] = useState<Record<string, { sharePercent: number; note: string }>>({});

  const adminQuery = useQuery({
    queryKey: ["is_admin", user?.id],
    enabled: Boolean(user),
    queryFn: () => checkAdmin(),
  });

  const overviewQuery = useQuery({
    queryKey: ["admin_revenue_overview"],
    enabled: Boolean(adminQuery.data?.isAdmin),
    queryFn: () => getOverview(),
    refetchInterval: 60_000,
  });

  const rulesQuery = useQuery({
    queryKey: ["creator_revenue_rules"],
    enabled: Boolean(adminQuery.data?.isAdmin),
    queryFn: () => listRules(),
  });

  useEffect(() => {
    if (!adminQuery.data?.isAdmin) return;
    const channel = supabase
      .channel("admin_revenue_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_orders" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin_revenue_overview"] });
          qc.invalidateQueries({ queryKey: ["admin_orders"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminQuery.data?.isAdmin, qc]);

  const overview = overviewQuery.data;
  const summary = overview?.summary;
  const creatorRows = rulesQuery.data ?? [];

  const filteredOrders = useMemo(() => {
    const keyword = orderSearch.trim().toLowerCase();
    return (overview?.recharges ?? []).filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!keyword) return true;
      return [
        order.id,
        order.userId,
        order.userEmail,
        order.displayName,
        order.packageId,
        order.txHash,
        order.note,
        order.walletAddress,
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
    });
  }, [orderSearch, overview?.recharges, statusFilter]);

  const filteredUsage = useMemo(() => {
    const keyword = usageSearch.trim().toLowerCase();
    return (overview?.usages ?? []).filter((usage) => {
      if (usageFilter !== "all" && usage.productType !== usageFilter) return false;
      if (!keyword) return true;
      return [
        usage.userId,
        usage.userEmail,
        usage.displayName,
        usage.reason,
        usage.productLabel,
        usage.storyTitle,
        usage.refId,
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
    });
  }, [overview?.usages, usageFilter, usageSearch]);

  const creatorSummary = useMemo(
    () => ({
      creators: creatorRows.length,
      grossCredits: creatorRows.reduce((sum, row) => sum + row.grossCredits, 0),
      authorShareCredits: creatorRows.reduce((sum, row) => sum + row.authorShareCredits, 0),
      salesCount: creatorRows.reduce((sum, row) => sum + row.salesCount, 0),
    }),
    [creatorRows],
  );

  function invalidateRevenue() {
    qc.invalidateQueries({ queryKey: ["admin_revenue_overview"] });
    qc.invalidateQueries({ queryKey: ["admin_dashboard_stats"] });
    qc.invalidateQueries({ queryKey: ["admin_orders"] });
    qc.invalidateQueries({ queryKey: ["my_credit_orders"] });
    qc.invalidateQueries({ queryKey: ["credit_orders"] });
    qc.invalidateQueries({ queryKey: ["my_profile"] });
    qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
    qc.invalidateQueries({ queryKey: ["creator_revenue_rules"] });
  }

  const confirmMut = useMutation({
    mutationFn: (input: { orderId: string; txHash: string; note?: string }) => confirm({ data: input }),
    onSuccess: () => {
      toast.success("주문을 승인하고 크레딧을 지급했습니다.");
      invalidateRevenue();
      setConfirmTarget(null);
      setTxInput("");
      setNoteInput("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const failMut = useMutation({
    mutationFn: (input: { orderId: string; note?: string }) => fail({ data: input }),
    onSuccess: () => {
      toast.success("주문을 실패 상태로 변경했습니다.");
      invalidateRevenue();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundMut = useMutation({
    mutationFn: (input: { orderId: string; reason?: string }) => refund({ data: input }),
    onSuccess: () => {
      toast.success("환불 처리와 크레딧 회수를 반영했습니다.");
      invalidateRevenue();
      setRefundTarget(null);
      setRefundReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRuleMut = useMutation({
    mutationFn: (input: { userId: string; sharePercent: number; note?: string }) => updateRule({ data: input }),
    onSuccess: (_, input) => {
      toast.success("창작자 정산 규칙을 저장했습니다.");
      setCreatorDrafts((prev) => {
        const next = { ...prev };
        delete next[input.userId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["creator_revenue_rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openConfirmDialog(order: AdminRevenueRechargeRow) {
    setConfirmTarget(order);
    setTxInput(order.txHash ?? "");
    setNoteInput(order.note ?? "");
  }

  function openRefundDialog(order: AdminRevenueRechargeRow) {
    setRefundTarget(order);
    setRefundReason(order.refundReason ?? "");
  }

  function refreshAll() {
    overviewQuery.refetch();
    rulesQuery.refetch();
  }

  if (adminQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!adminQuery.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="font-display text-2xl font-semibold">접근 권한이 없습니다</h1>
        <p className="mt-1 text-sm text-muted-foreground">관리자 권한이 있는 계정으로 로그인해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge variant="secondary" className="mb-3 gap-1">
            <ReceiptText className="h-3.5 w-3.5" />
            Admin
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">매출관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            크레딧 충전 주문, 유료 콘텐츠 사용, 창작자 정산 규칙을 한 화면에서 확인합니다.
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll} disabled={overviewQuery.isFetching || rulesQuery.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${overviewQuery.isFetching || rulesQuery.isFetching ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </header>

      {overviewQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {(overviewQuery.error as Error).message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          icon={DollarSign}
          label="확정 매출"
          value={summary ? currency.format(summary.rechargeRevenueUsd) : "-"}
          hint="승인된 충전 주문"
        />
        <MetricCard
          icon={ReceiptText}
          label="확인 대기"
          value={summary ? `${summary.rechargePending.toLocaleString("ko-KR")}건` : "-"}
          tone={summary && summary.rechargePending > 0 ? "warning" : "default"}
        />
        <MetricCard
          icon={Wallet}
          label="지급 크레딧"
          value={summary ? formatCredits(summary.rechargeCreditsIssued) : "-"}
        />
        <MetricCard
          icon={CreditCard}
          label="사용 크레딧"
          value={summary ? formatCredits(summary.usageCreditsSpent) : "-"}
          hint={`${summary?.usageCount.toLocaleString("ko-KR") ?? 0}건`}
        />
        <MetricCard
          icon={TrendingUp}
          label="작가 배분"
          value={summary ? formatCredits(summary.authorShareCredits) : "-"}
        />
        <MetricCard
          icon={RotateCcw}
          label="환불"
          value={summary ? `${summary.rechargeRefunded.toLocaleString("ko-KR")}건` : "-"}
        />
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(value as RevenueTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-lg bg-muted/60 p-1 md:w-[520px]">
          <TabsTrigger value="orders">충전 주문</TabsTrigger>
          <TabsTrigger value="usage">크레딧 사용</TabsTrigger>
          <TabsTrigger value="creators">창작자 정산</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3">
          <FilterBar
            searchValue={orderSearch}
            onSearchChange={setOrderSearch}
            searchPlaceholder="주문 ID, 회원, TX, 지갑 주소 검색"
            selectValue={statusFilter}
            onSelectChange={(value) => setStatusFilter(value as StatusFilter)}
            options={[
              { value: "all", label: "전체 상태" },
              { value: "pending", label: "대기" },
              { value: "submitted", label: "확인중" },
              { value: "confirmed", label: "완료" },
              { value: "failed", label: "실패" },
              { value: "refunded", label: "환불" },
            ]}
          />
          <RechargeTable
            rows={filteredOrders}
            loading={overviewQuery.isLoading}
            onConfirm={openConfirmDialog}
            onRefund={openRefundDialog}
            onFail={(order) => failMut.mutate({ orderId: order.id, note: "admin marked failed" })}
            actionPending={confirmMut.isPending || refundMut.isPending || failMut.isPending}
          />
        </TabsContent>

        <TabsContent value="usage" className="space-y-3">
          <FilterBar
            searchValue={usageSearch}
            onSearchChange={setUsageSearch}
            searchPlaceholder="회원, 콘텐츠, 참조 ID 검색"
            selectValue={usageFilter}
            onSelectChange={(value) => setUsageFilter(value as UsageFilter)}
            options={[
              { value: "all", label: "전체 사용" },
              { value: "story", label: "스토리 구매" },
              { value: "media", label: "미디어 잠금해제" },
              { value: "other", label: "기타" },
            ]}
          />
          <UsageTable rows={filteredUsage} loading={overviewQuery.isLoading} />
        </TabsContent>

        <TabsContent value="creators" className="space-y-4">
          <section className="grid gap-3 md:grid-cols-4">
            <MiniMetric label="창작자" value={`${creatorSummary.creators.toLocaleString("ko-KR")}명`} />
            <MiniMetric label="판매" value={`${creatorSummary.salesCount.toLocaleString("ko-KR")}건`} />
            <MiniMetric label="총 판매 크레딧" value={formatCredits(creatorSummary.grossCredits)} />
            <MiniMetric label="작가 배분 예정" value={formatCredits(creatorSummary.authorShareCredits)} />
          </section>
          <CreatorRulesTable
            rows={creatorRows}
            loading={rulesQuery.isLoading}
            drafts={creatorDrafts}
            onDraftChange={(userId, draft) => setCreatorDrafts((prev) => ({ ...prev, [userId]: draft }))}
            onSave={(row, draft) =>
              updateRuleMut.mutate({
                userId: row.userId,
                sharePercent: draft.sharePercent,
                note: draft.note.trim() || undefined,
              })
            }
            saving={updateRuleMut.isPending}
            error={rulesQuery.error as Error | null}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        order={confirmTarget}
        txInput={txInput}
        noteInput={noteInput}
        pending={confirmMut.isPending}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        onTxChange={setTxInput}
        onNoteChange={setNoteInput}
        onSubmit={() => {
          if (!confirmTarget) return;
          confirmMut.mutate({
            orderId: confirmTarget.id,
            txHash: txInput.trim(),
            note: noteInput.trim() || undefined,
          });
        }}
      />

      <RefundDialog
        order={refundTarget}
        reason={refundReason}
        pending={refundMut.isPending}
        onOpenChange={(open) => !open && setRefundTarget(null)}
        onReasonChange={setRefundReason}
        onSubmit={() => {
          if (!refundTarget) return;
          refundMut.mutate({
            orderId: refundTarget.id,
            reason: refundReason.trim() || undefined,
          });
        }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card className={tone === "warning" ? "border-amber-500/40 bg-amber-500/5" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${tone === "warning" ? "text-amber-400" : "text-muted-foreground"}`} />
        </div>
        <div className="mt-2 text-xl font-semibold">{value}</div>
        {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  selectValue,
  onSelectChange,
  options,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  selectValue: string;
  onSelectChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 md:flex-row md:items-center md:justify-between">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>
      <select
        value={selectValue}
        onChange={(event) => onSelectChange(event.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground md:w-44"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RechargeTable({
  rows,
  loading,
  actionPending,
  onConfirm,
  onRefund,
  onFail,
}: {
  rows: AdminRevenueRechargeRow[];
  loading: boolean;
  actionPending: boolean;
  onConfirm: (order: AdminRevenueRechargeRow) => void;
  onRefund: (order: AdminRevenueRechargeRow) => void;
  onFail: (order: AdminRevenueRechargeRow) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">충전 주문</CardTitle>
        <CardDescription>입금 확인, 크레딧 지급, 실패 처리, 환불 회수를 처리합니다.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-y bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">일시</th>
                <th className="px-4 py-3">회원</th>
                <th className="px-4 py-3">상품</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">네트워크</th>
                <th className="px-4 py-3">TX / 메모</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    매출 데이터를 불러오는 중입니다.
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/25">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-medium">
                        {order.displayName || order.userEmail || order.userId}
                      </div>
                      <div className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
                        {order.userEmail ? order.userId : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{formatPackageName(order.packageId)}</div>
                      <div className="text-xs text-muted-foreground">{formatCredits(order.credits)}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{currency.format(order.amountUsd)}</td>
                    <td className="px-4 py-3 text-xs">
                      <div>{order.currency}</div>
                      <div className="text-muted-foreground">{order.network}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-mono text-[11px]">
                        {order.txHash || order.walletAddress || "-"}
                      </div>
                      {order.note || order.refundReason ? (
                        <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                          {order.refundReason || order.note}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {order.status !== "confirmed" && order.status !== "refunded" ? (
                          <Button size="sm" variant="outline" disabled={actionPending} onClick={() => onConfirm(order)}>
                            <Check className="mr-1 h-3.5 w-3.5" />
                            승인
                          </Button>
                        ) : null}
                        {order.status === "confirmed" ? (
                          <Button size="sm" variant="outline" disabled={actionPending} onClick={() => onRefund(order)}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            환불
                          </Button>
                        ) : null}
                        {order.status !== "failed" && order.status !== "confirmed" && order.status !== "refunded" ? (
                          <Button size="sm" variant="ghost" disabled={actionPending} onClick={() => onFail(order)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    조건에 맞는 충전 주문이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageTable({ rows, loading }: { rows: AdminRevenueUsageRow[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">크레딧 사용 매출</CardTitle>
        <CardDescription>스토리 구매와 미디어 잠금해제에서 발생한 크레딧 사용 내역입니다.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-y bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">일시</th>
                <th className="px-4 py-3">회원</th>
                <th className="px-4 py-3">구분</th>
                <th className="px-4 py-3">콘텐츠</th>
                <th className="px-4 py-3 text-right">사용</th>
                <th className="px-4 py-3 text-right">작가 몫</th>
                <th className="px-4 py-3 text-right">잔액</th>
                <th className="px-4 py-3">참조</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    사용 내역을 불러오는 중입니다.
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((usage) => (
                  <tr key={usage.id} className="hover:bg-muted/25">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(usage.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-medium">
                        {usage.displayName || usage.userEmail || usage.userId}
                      </div>
                      <div className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
                        {usage.userEmail ? usage.userId : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[11px]">
                        {formatUsageType(usage)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[280px] truncate font-medium">{usage.storyTitle || usage.productLabel}</div>
                      {usage.storyId ? (
                        <div className="max-w-[280px] truncate font-mono text-[11px] text-muted-foreground">
                          {usage.storyId}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCredits(usage.creditsSpent)}</td>
                    <td className="px-4 py-3 text-right">{formatCredits(usage.authorShare)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCredits(usage.balanceAfter)}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-[180px] truncate font-mono text-[11px] text-muted-foreground">
                        {usage.refType ? `${usage.refType}:` : ""}
                        {usage.refId ?? "-"}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    조건에 맞는 크레딧 사용 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CreatorRulesTable({
  rows,
  loading,
  drafts,
  saving,
  error,
  onDraftChange,
  onSave,
}: {
  rows: CreatorRevenueRule[];
  loading: boolean;
  drafts: Record<string, { sharePercent: number; note: string }>;
  saving: boolean;
  error: Error | null;
  onDraftChange: (userId: string, draft: { sharePercent: number; note: string }) => void;
  onSave: (row: CreatorRevenueRule, draft: { sharePercent: number; note: string }) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="h-4 w-4" />
          창작자 정산 규칙
        </CardTitle>
        <CardDescription>개별 작가의 판매 실적과 수익 배분율을 관리합니다. 별도 설정이 없으면 기본 70%가 적용됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            창작자 정산 데이터를 불러오는 중입니다.
          </div>
        ) : rows.length ? (
          rows.map((row) => {
            const draft = drafts[row.userId] ?? {
              sharePercent: row.sharePercent,
              note: row.note ?? "",
            };
            const changed = draft.sharePercent !== row.sharePercent || draft.note !== (row.note ?? "");
            return (
              <div key={row.userId} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.displayName || row.email || "이름 없는 창작자"}</p>
                      <Badge variant="outline">스토리 {row.storyCount}</Badge>
                      <Badge variant="outline">판매중 {row.listedCount}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.email ?? row.userId} · 판매 {row.salesCount.toLocaleString("ko-KR")}건 · 매출{" "}
                      {formatCredits(row.grossCredits)} · 작가 배분 {formatCredits(row.authorShareCredits)}
                    </p>
                  </div>
                  <Button size="sm" disabled={!changed || saving} onClick={() => onSave(row, draft)}>
                    {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                    저장
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">작가 배분율 (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.sharePercent}
                      onChange={(event) =>
                        onDraftChange(row.userId, {
                          ...draft,
                          sharePercent: Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0))),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">운영 메모</Label>
                    <Input
                      value={draft.note}
                      placeholder="예: 프로모션 작가, 계약 수익률"
                      onChange={(event) => onDraftChange(row.userId, { ...draft, note: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            아직 판매 또는 정산 대상 창작자가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmDialog({
  order,
  txInput,
  noteInput,
  pending,
  onOpenChange,
  onTxChange,
  onNoteChange,
  onSubmit,
}: {
  order: AdminRevenueRechargeRow | null;
  txInput: string;
  noteInput: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onTxChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent>
        {order ? (
          <>
            <DialogHeader>
              <DialogTitle>충전 주문 승인</DialogTitle>
              <DialogDescription>
                회원에게 {formatCredits(order.credits)}를 지급하고 주문을 완료 처리합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <OrderSummary order={order} />
              <div className="space-y-1.5">
                <Label htmlFor="tx">트랜잭션 해시</Label>
                <Input
                  id="tx"
                  value={txInput}
                  onChange={(event) => onTxChange(event.target.value)}
                  className="font-mono text-xs"
                  placeholder="0x..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">운영 메모</Label>
                <Input
                  id="note"
                  value={noteInput}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="예: 입금 확인 완료"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button disabled={pending || !txInput.trim()} onClick={onSubmit}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                승인하고 지급
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  order,
  reason,
  pending,
  onOpenChange,
  onReasonChange,
  onSubmit,
}: {
  order: AdminRevenueRechargeRow | null;
  reason: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent>
        {order ? (
          <>
            <DialogHeader>
              <DialogTitle>환불 및 크레딧 회수</DialogTitle>
              <DialogDescription>
                회원 잔액에서 {formatCredits(order.credits)}를 회수하고 주문을 환불 상태로 변경합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <OrderSummary order={order} />
              <div className="space-y-1.5">
                <Label htmlFor="refundReason">환불 사유</Label>
                <Input
                  id="refundReason"
                  value={reason}
                  onChange={(event) => onReasonChange(event.target.value)}
                  placeholder="예: 미사용 청약철회 승인"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button variant="destructive" disabled={pending} onClick={onSubmit}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                환불 처리
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OrderSummary({ order }: { order: AdminRevenueRechargeRow }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <div>
        회원: <span className="font-mono">{order.userEmail || order.userId}</span>
      </div>
      <div>
        상품: {formatPackageName(order.packageId)} · {formatCredits(order.credits)}
      </div>
      <div>
        금액: {currency.format(order.amountUsd)} · {order.currency}/{order.network}
      </div>
      <div>
        입금 지갑: <span className="font-mono">{order.walletAddress}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RechargeStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function formatCredits(value: number) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")} cr`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPackageName(packageId: string) {
  if (packageId.startsWith("sub_")) return `구독 ${packageId.replace(/^sub_/, "")}`;
  return packageId.replace(/_/g, " ");
}

function formatUsageType(usage: AdminRevenueUsageRow) {
  if (usage.productType === "story") return "스토리 구매";
  if (usage.productType === "media") return "미디어 잠금해제";
  return usage.productLabel || usage.reason;
}
