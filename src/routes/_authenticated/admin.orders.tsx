import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, X, Check } from "lucide-react";
import { toast } from "sonner";

import {
  checkIsAdmin,
  listAdminOrders,
  confirmCreditOrder,
  markOrderFailed,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [{ title: "관리자 — Lovetale" }],
  }),
  component: AdminPage,
});

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
  status: "pending" | "submitted" | "confirmed" | "failed";
  note: string | null;
  created_at: string;
};

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const checkAdmin = useServerFn(checkIsAdmin);
  const fetchOrders = useServerFn(listAdminOrders);
  const confirm = useServerFn(confirmCreditOrder);
  const fail = useServerFn(markOrderFailed);

  const adminQuery = useQuery({
    queryKey: ["is_admin", user?.id],
    enabled: !!user,
    queryFn: () => checkAdmin(),
  });

  const ordersQuery = useQuery({
    queryKey: ["admin_orders"],
    enabled: !!adminQuery.data?.isAdmin,
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

  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [txInput, setTxInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  const confirmMut = useMutation({
    mutationFn: (input: { orderId: string; txHash: string; note?: string }) =>
      confirm({ data: input }),
    onSuccess: () => {
      toast.success("주문을 완료 처리했어요");
      qc.invalidateQueries({ queryKey: ["admin_orders"] });
      qc.invalidateQueries({ queryKey: ["my_profile"] });
      qc.invalidateQueries({ queryKey: ["my_profile_balance"] });
      setSelected(null);
      setTxInput("");
      setNoteInput("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const failMut = useMutation({
    mutationFn: (input: { orderId: string; note?: string }) =>
      fail({ data: input }),
    onSuccess: () => {
      toast.success("주문을 실패로 표시했어요");
      qc.invalidateQueries({ queryKey: ["admin_orders"] });
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
        <h1 className="font-display text-2xl font-semibold">접근 권한이 없어요</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          관리자 권한이 있는 계정으로 로그인해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 md:px-10">
      <header className="mb-8">
        <span className="text-xs uppercase tracking-[0.3em] text-primary">
          Admin
        </span>
        <h1 className="mt-1 font-display text-3xl font-semibold">
          결제 주문 관리
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          입금 확인 후 트랜잭션 해시를 입력해 수동으로 완료 처리하세요.
        </p>
      </header>

      {ordersQuery.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">생성</th>
                <th className="px-4 py-3">사용자</th>
                <th className="px-4 py-3">패키지</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">통화</th>
                <th className="px-4 py-3">TX</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {ordersQuery.data?.map((o) => (
                <tr key={o.id} className="hover:bg-surface-elevated/30">
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {o.user_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {o.package_id}
                    <div className="text-xs text-muted-foreground">
                      {o.credits.toLocaleString()} cr
                    </div>
                  </td>
                  <td className="px-4 py-3">${o.amount_usd}</td>
                  <td className="px-4 py-3 text-xs">
                    {o.currency}/{o.network}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {o.tx_hash ? `${o.tx_hash.slice(0, 14)}…` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {o.status !== "confirmed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelected(o);
                            setTxInput(o.tx_hash ?? "");
                            setNoteInput(o.note ?? "");
                          }}
                        >
                          <Check className="mr-1 h-3 w-3" /> 완료
                        </Button>
                      )}
                      {o.status !== "failed" && o.status !== "confirmed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            failMut.mutate({ orderId: o.id, note: "admin marked failed" })
                          }
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
                    표시할 주문이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>주문 완료 처리</DialogTitle>
                <DialogDescription>
                  사용자에게 {selected.credits.toLocaleString()} 크레딧이 적립돼요.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-surface-elevated/40 p-3 text-xs text-muted-foreground">
                  <div>사용자: <span className="font-mono">{selected.user_id}</span></div>
                  <div>금액: ${selected.amount_usd} · {selected.currency}/{selected.network}</div>
                  <div>받을 지갑: <span className="font-mono">{selected.wallet_address}</span></div>
                </div>
                <div>
                  <Label htmlFor="tx">트랜잭션 해시</Label>
                  <Input
                    id="tx"
                    value={txInput}
                    onChange={(e) => setTxInput(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    placeholder="0x…"
                  />
                </div>
                <div>
                  <Label htmlFor="note">메모 (선택)</Label>
                  <Input
                    id="note"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="mt-1"
                    placeholder="입금액·확인 시간 등"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={confirmMut.isPending || !txInput.trim()}
                  onClick={() =>
                    confirmMut.mutate({
                      orderId: selected.id,
                      txHash: txInput.trim(),
                      note: noteInput.trim() || undefined,
                    })
                  }
                >
                  {confirmMut.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  완료 처리하고 크레딧 적립
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: AdminOrder["status"] }) {
  const map: Record<AdminOrder["status"], { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    submitted: { label: "확인 중", cls: "bg-amber-500/15 text-amber-400" },
    confirmed: { label: "완료", cls: "bg-emerald-500/15 text-emerald-400" },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
  };
  const v = map[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
