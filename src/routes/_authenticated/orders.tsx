import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, ExternalLink, Loader2, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "구매내역 | Lovetale" },
      { name: "description", content: "크레딧 충전 주문 상태와 결제 요청 내역을 확인합니다." },
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
        .select("id, package_id, credits, amount_usd, currency, network, wallet_address, tx_hash, status, created_at, updated_at")
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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <Wallet className="size-3" />
            ORDERS
          </Badge>
          <h1 className="text-base font-semibold">구매내역</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit gap-1.5 rounded-full">
          <Link to="/premium">
            <Coins className="size-4" />
            충전하기
          </Link>
        </Button>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-border/60 bg-card/45 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          불러오는 중
        </div>
      ) : !data?.length ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card/35 p-10 text-center text-sm text-muted-foreground">
          아직 구매내역이 없습니다.
        </div>
      ) : (
        <section className="space-y-3">
          {data.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </section>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <article className="rounded-3xl border border-border/60 bg-card/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold capitalize">{order.package_id}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              {order.credits.toLocaleString()} cr
            </span>
            <span className="text-xs text-muted-foreground">${order.amount_usd}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {order.currency}/{order.network} · {new Date(order.created_at).toLocaleString()}
          </div>
          {order.tx_hash && (
            <div className="mt-2 flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{order.tx_hash}</span>
            </div>
          )}
        </div>
        <StatusPill status={order.status} />
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: Order["status"] }) {
  const map: Record<Order["status"], { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    submitted: { label: "확인중", cls: "bg-amber-500/15 text-amber-400" },
    confirmed: { label: "완료", cls: "bg-emerald-500/15 text-emerald-400" },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
  };
  const value = map[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${value.cls}`}>{value.label}</span>;
}
