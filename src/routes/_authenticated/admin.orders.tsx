import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import {
  checkIsAdmin,
  confirmCreditOrder,
  listAdminOrders,
  markOrderFailed,
  refundCreditOrder,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [{ title: "결제 주문 관리 | Lovetale Studio" }],
  }),
  component: AdminOrdersPage,
});

type OrderStatus = "pending" | "submitted" | "confirmed" | "failed" | "refunded";

type AdminOrder = {
  id: string;
  user_id: string;
  package_id: string;
  credits: number;
  amount_usd: number;
  currency: string;
  network: string;
  wallet_address: string;
  tx_hash: string | null;
  status: OrderStatus;
  note: string | null;
  confirmed_at?: string | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

function AdminOrdersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const checkAdmin = useServerFn(checkIsAdmin);
  const fetchOrders = useServerFn(listAdminOrders);
  const confirm = useServerFn(confirmCreditOrder);
  const fail = useServerFn(markOrderFailed);
  const refund = useServerFn(refundCreditOrder);

  const adminQuery = useQuery({
    queryKey: ["is_admin", user?.id],
    enabled: Boolean(user),
    queryFn: () => checkAdmin(),
  });

  const ordersQuery = useQuery({
    queryKey: ["admin_orders"],
    enabled: Boolean(adminQuery.data?.isAdmin),
    queryFn: () => fetchOrders() as Promise<AdminOrder[]>,
  });

  useEffect(() => {
    if (!adminQuery.data?.isAdmin) return;
    const channel = supabase
      .channel("admin_credit_orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_orders" },
        () => qc.invalidateQueries({ queryKey: ["admin_orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminQuery.data?.isAdmin, qc]);

  const [confirmTarget, setConfirmTarget] = useState<AdminOrder | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminOrder | null>(null);
  const [txInput, setTxInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const summary = useMemo(() => {
    const rows = ordersQuery.data ?? [];
    return {
      pending: rows.filter((row) => row.status === "pending" || row.status === "submitted").length,
      confirmed: rows.filter((row) => row.status === "confirmed").length,
      refunded: rows.filter((row) => row.status === "refunded").length,
      revenue: rows
        .filter((row) => row.status === "confirmed")
        .reduce((sum, row) => sum + Number(row.amount_usd ?? 0), 0),
    };
  }, [ordersQuery.data]);

  const invalidateOrders = () => {
    qc.invalidateQueries({ queryKey: ["admin_orders"] });
    qc.invalidateQueries({ queryKey: ["my_credit_orders"] });
    qc.invalidateQueries({ queryKey: ["credit_orders"] });
    qc.invalidateQueries({ queryKey: ["my_profile"] });
    qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
  };

  const confirmMut = useMutation({
    mutationFn: (input: { orderId: string; txHash: string; note?: string }) => confirm({ data: input }),
    onSuccess: () => {
      toast.success("주문을 승인하고 크레딧을 지급했습니다.");
      invalidateOrders();
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
      invalidateOrders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundMut = useMutation({
    mutationFn: (input: { orderId: string; reason?: string }) => refund({ data: input }),
    onSuccess: () => {
      toast.success("환불 처리와 크레딧 회수를 반영했습니다.");
      invalidateOrders();
      setRefundTarget(null);
      setRefundReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <header className="mb-6">
        <span className="text-xs uppercase tracking-[0.3em] text-primary">Admin</span>
        <h1 className="mt-1 font-display text-3xl font-semibold">결제 주문 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          입금 확인, 크레딧 지급, 실패 처리, 환불 회수를 한 화면에서 처리합니다.
        </p>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <Metric label="확인 대기" value={`${summary.pending}건`} />
        <Metric label="승인 완료" value={`${summary.confirmed}건`} />
        <Metric label="환불" value={`${summary.refunded}건`} />
        <Metric label="확정 매출" value={`$${summary.revenue.toFixed(2)}`} />
      </section>

      {ordersQuery.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">생성일</th>
                <th className="px-4 py-3">사용자</th>
                <th className="px-4 py-3">상품</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">네트워크</th>
                <th className="px-4 py-3">TX</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {ordersQuery.data?.map((order) => (
                <tr key={order.id} className="hover:bg-surface-elevated/30">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">{order.user_id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{formatPackageName(order.package_id)}</div>
                    <div className="text-xs text-muted-foreground">{order.credits.toLocaleString()} cr</div>
                  </td>
                  <td className="px-4 py-3">${Number(order.amount_usd ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs">
                    {order.currency}/{order.network}
                  </td>
                  <td className="max-w-[150px] truncate px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {order.tx_hash || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {order.status !== "confirmed" && order.status !== "refunded" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setConfirmTarget(order);
                            setTxInput(order.tx_hash ?? "");
                            setNoteInput(order.note ?? "");
                          }}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          승인
                        </Button>
                      )}
                      {order.status === "confirmed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRefundTarget(order);
                            setRefundReason(order.refund_reason ?? "");
                          }}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          환불
                        </Button>
                      )}
                      {order.status !== "failed" && order.status !== "confirmed" && order.status !== "refunded" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => failMut.mutate({ orderId: order.id, note: "admin marked failed" })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!ordersQuery.data?.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    표시할 주문이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(confirmTarget)} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent>
          {confirmTarget && (
            <>
              <DialogHeader>
                <DialogTitle>주문 승인</DialogTitle>
                <DialogDescription>
                  회원에게 {confirmTarget.credits.toLocaleString()} cr을 지급하고 주문을 완료 처리합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <OrderSummary order={confirmTarget} />
                <div>
                  <Label htmlFor="tx">트랜잭션 해시</Label>
                  <Input
                    id="tx"
                    value={txInput}
                    onChange={(event) => setTxInput(event.target.value)}
                    className="mt-1 font-mono text-xs"
                    placeholder="0x..."
                  />
                </div>
                <div>
                  <Label htmlFor="note">운영 메모</Label>
                  <Input
                    id="note"
                    value={noteInput}
                    onChange={(event) => setNoteInput(event.target.value)}
                    className="mt-1"
                    placeholder="예: 입금 확인 완료"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={confirmMut.isPending || !txInput.trim()}
                  onClick={() =>
                    confirmMut.mutate({
                      orderId: confirmTarget.id,
                      txHash: txInput.trim(),
                      note: noteInput.trim() || undefined,
                    })
                  }
                >
                  {confirmMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  승인하고 크레딧 지급
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(refundTarget)} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent>
          {refundTarget && (
            <>
              <DialogHeader>
                <DialogTitle>환불 및 크레딧 회수</DialogTitle>
                <DialogDescription>
                  회원 잔액에서 {refundTarget.credits.toLocaleString()} cr을 회수하고 환불 상태로 변경합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <OrderSummary order={refundTarget} />
                <div>
                  <Label htmlFor="refundReason">환불 사유</Label>
                  <Input
                    id="refundReason"
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    className="mt-1"
                    placeholder="예: 미사용 청약철회 승인"
                  />
                </div>
                <Button
                  className="w-full"
                  variant="destructive"
                  disabled={refundMut.isPending}
                  onClick={() =>
                    refundMut.mutate({
                      orderId: refundTarget.id,
                      reason: refundReason.trim() || undefined,
                    })
                  }
                >
                  {refundMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  환불 처리
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/45 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function OrderSummary({ order }: { order: AdminOrder }) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated/40 p-3 text-xs text-muted-foreground">
      <div>
        사용자: <span className="font-mono">{order.user_id}</span>
      </div>
      <div>
        상품: {formatPackageName(order.package_id)} · {order.credits.toLocaleString()} cr
      </div>
      <div>
        금액: ${Number(order.amount_usd ?? 0).toFixed(2)} · {order.currency}/{order.network}
      </div>
      <div>
        입금 지갑: <span className="font-mono">{order.wallet_address}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    submitted: { label: "확인중", cls: "bg-amber-500/15 text-amber-400" },
    confirmed: { label: "완료", cls: "bg-emerald-500/15 text-emerald-400" },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
    refunded: { label: "환불", cls: "bg-blue-500/15 text-blue-400" },
  };
  const value = map[status] ?? map.pending;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${value.cls}`}>{value.label}</span>;
}

function formatPackageName(packageId: string) {
  if (packageId.startsWith("sub_")) return `구독 ${packageId.replace(/^sub_/, "")}`;
  return packageId.replace(/_/g, " ");
}
