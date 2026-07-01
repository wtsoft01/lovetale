import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "주문 현황 — Lovetale" },
      { name: "description", content: "암호화폐 결제 주문 실시간 현황." },
    ],
  }),
  component: OrdersPage,
});

type Order = {
  id: string;
  package_id: string;
  credits: number;
  amount_usd: number;
  currency: string;
  network: string;
  wallet_address: string;
  tx_hash: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed";
  created_at: string;
  updated_at: string;
};

function OrdersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my_credit_orders", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("credit_orders")
        .select(
          "id, package_id, credits, amount_usd, currency, network, wallet_address, tx_hash, status, created_at, updated_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`credit_orders:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "credit_orders",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["my_credit_orders", user.id] });
          qc.invalidateQueries({ queryKey: ["credit_orders", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 md:px-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <span className="text-xs uppercase tracking-[0.3em] text-primary">
            Orders
          </span>
          <h1 className="mt-1 font-display text-3xl font-semibold">주문 현황</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            결제 상태는 자동으로 새로고침돼요.
          </p>
        </div>
        <Link to="/premium">
          <Button variant="outline" size="sm">
            <Wallet className="mr-2 h-4 w-4" /> 충전하기
          </Button>
        </Link>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : !data?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          아직 주문이 없어요.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((o) => (
            <li
              key={o.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-semibold capitalize">
                      {o.package_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {o.credits.toLocaleString()} cr · ${o.amount_usd}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {o.currency}/{o.network} ·{" "}
                    {new Date(o.created_at).toLocaleString()}
                  </div>
                  {o.tx_hash && (
                    <div className="mt-2 flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{o.tx_hash}</span>
                    </div>
                  )}
                </div>
                <StatusPill status={o.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Order["status"] }) {
  const map: Record<Order["status"], { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    submitted: { label: "확인 중", cls: "bg-amber-500/15 text-amber-400" },
    confirmed: {
      label: "완료",
      cls: "bg-emerald-500/15 text-emerald-400",
    },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
  };
  const v = map[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  );
}
