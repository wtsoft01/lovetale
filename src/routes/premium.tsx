import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bitcoin,
  Check,
  Coins,
  Copy,
  Crown,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { title: "크레딧 충전 — Lovetale" },
      {
        name: "description",
        content:
          "암호화폐로 빠르게 Lovetale 크레딧을 충전하세요. USDT · BTC · ETH 지원.",
      },
    ],
  }),
  component: Premium,
});

type Package = {
  id: string;
  name: string;
  icon: typeof Sparkles;
  credits: number;
  bonus?: number;
  priceUsd: number;
  badge?: string | null;
  accent?: boolean;
  features: string[];
};

const PACKAGES: Package[] = [
  {
    id: "starter",
    name: "Starter",
    icon: Sparkles,
    credits: 500,
    priceUsd: 9,
    features: ["500 크레딧", "약 250회 AI 대사", "유효기간 무제한"],
  },
  {
    id: "popular",
    name: "Popular",
    icon: Crown,
    credits: 1500,
    bonus: 200,
    priceUsd: 19,
    badge: "BEST",
    accent: true,
    features: ["1,500 + 200 보너스", "19+ 시나리오 풀 액세스", "우선 응답 속도"],
  },
  {
    id: "whale",
    name: "Whale",
    icon: Coins,
    credits: 5000,
    bonus: 1000,
    priceUsd: 49,
    features: ["5,000 + 1,000 보너스", "신규 스토리 우선 공개", "VIP Discord 채널"],
  },
];

type CryptoOption = {
  currency: string;
  network: string;
  label: string;
  address: string;
};

const CRYPTO_OPTIONS: CryptoOption[] = [
  {
    currency: "USDT",
    network: "TRC20",
    label: "USDT (Tron · TRC20)",
    address: "TJYeasdFCXxxxx-DEMO-TRC20-ADDRESS-xxxxx9aQ",
  },
  {
    currency: "USDT",
    network: "ERC20",
    label: "USDT (Ethereum · ERC20)",
    address: "0xDEMO000000USDTERC20ADDRESS000000000000a1",
  },
  {
    currency: "BTC",
    network: "Bitcoin",
    label: "Bitcoin (BTC)",
    address: "bc1qDEMO0btcaddress0lumiere0xxxxxxxxxxxxxx",
  },
  {
    currency: "ETH",
    network: "Ethereum",
    label: "Ethereum (ETH)",
    address: "0xDEMO000000ETHADDRESS00000000000000000b2",
  },
];

function Premium() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Package | null>(null);
  const qc = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["credit_orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_orders")
        .select("id, package_id, credits, amount_usd, currency, network, status, tx_hash, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <header className="text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-primary">
          Crypto Top-up
        </span>
        <h1 className="mt-2 font-display text-4xl font-semibold md:text-5xl">
          크레딧으로 <span className="text-gradient">더 깊은 이야기</span>를
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          현재는 암호화폐 결제만 지원합니다. 카드 · 간편결제는 곧 추가될 예정이에요.
        </p>
      </header>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {PACKAGES.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              className={
                "relative flex flex-col rounded-2xl border p-6 transition " +
                (p.accent
                  ? "border-primary/50 bg-card shadow-glow"
                  : "border-border bg-card hover:border-primary/30")
              }
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  {p.badge}
                </span>
              )}
              <div className="mb-4 flex items-center gap-2">
                <div
                  className={
                    "grid h-9 w-9 place-items-center rounded-lg " +
                    (p.accent
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-elevated text-muted-foreground")
                  }
                >
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-display text-xl font-semibold">{p.name}</h3>
              </div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold">
                  ${p.priceUsd}
                </span>
                <span className="text-xs text-muted-foreground">USD 상당</span>
              </div>
              <div className="mb-6 text-sm text-muted-foreground">
                {p.credits.toLocaleString()} 크레딧
                {p.bonus ? (
                  <span className="ml-1 text-primary">
                    + {p.bonus.toLocaleString()} 보너스
                  </span>
                ) : null}
              </div>
              <ul className="mb-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => setSelected(p)}
                className={
                  p.accent
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : ""
                }
                variant={p.accent ? "default" : "outline"}
              >
                <Wallet className="mr-2 h-4 w-4" />
                암호화폐로 결제
              </Button>
            </div>
          );
        })}
      </div>

      <section className="mt-14 rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">최근 결제 내역</h2>
          {!user && (
            <Link to="/auth" className="text-xs text-primary hover:underline">
              로그인하고 내역 보기 →
            </Link>
          )}
        </div>
        {!user ? (
          <p className="text-sm text-muted-foreground">
            로그인 후 결제 내역을 확인할 수 있어요.
          </p>
        ) : ordersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        ) : !ordersQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">아직 결제 내역이 없어요.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {ordersQuery.data.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <div className="font-medium capitalize">{o.package_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()} · {o.credits}{" "}
                    크레딧 · {o.currency}/{o.network}
                  </div>
                </div>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CheckoutDialog
        pkg={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ["credit_orders"] });
          qc.invalidateQueries({ queryKey: ["my_credit_orders"] });
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    submitted: { label: "확인 중", cls: "bg-amber-500/15 text-amber-400" },
    confirmed: { label: "완료", cls: "bg-emerald-500/15 text-emerald-400" },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
  };
  const v = map[status] ?? map.pending;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

function CheckoutDialog({
  pkg,
  onOpenChange,
  onSubmitted,
}: {
  pkg: Package | null;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const [option, setOption] = useState<CryptoOption>(CRYPTO_OPTIONS[0]);
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalCredits = useMemo(
    () => (pkg ? pkg.credits + (pkg.bonus ?? 0) : 0),
    [pkg],
  );

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("주소를 복사했어요");
  };

  const submit = async () => {
    if (!pkg) return;
    if (!user) {
      toast.error("로그인이 필요해요");
      return;
    }
    if (!txHash.trim()) {
      toast.error("트랜잭션 해시를 입력해주세요");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("credit_orders").insert({
      user_id: user.id,
      package_id: pkg.id,
      credits: totalCredits,
      amount_usd: pkg.priceUsd,
      currency: option.currency,
      network: option.network,
      wallet_address: option.address,
      tx_hash: txHash.trim(),
      status: "submitted",
    });
    setSubmitting(false);
    if (error) {
      toast.error("주문 생성에 실패했어요");
      return;
    }
    toast.success("입금 확인 후 크레딧이 충전돼요 (보통 5–30분)");
    setTxHash("");
    onSubmitted();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!pkg} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {pkg && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                {pkg.name} · ${pkg.priceUsd}
              </DialogTitle>
              <DialogDescription>
                결제 통화를 선택하고, 표시된 주소로 정확한 금액을 송금한 뒤
                트랜잭션 해시를 제출하세요.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border bg-surface-elevated/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">받게 될 크레딧</span>
                <span className="font-semibold">
                  {totalCredits.toLocaleString()} cr
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">결제 금액</span>
                <span className="font-semibold">${pkg.priceUsd} USD 상당</span>
              </div>
            </div>

            <Tabs
              value={`${option.currency}-${option.network}`}
              onValueChange={(v) => {
                const next = CRYPTO_OPTIONS.find(
                  (o) => `${o.currency}-${o.network}` === v,
                );
                if (next) setOption(next);
              }}
              className="mt-1"
            >
              <TabsList className="grid w-full grid-cols-4">
                {CRYPTO_OPTIONS.map((o) => (
                  <TabsTrigger
                    key={`${o.currency}-${o.network}`}
                    value={`${o.currency}-${o.network}`}
                    className="text-xs"
                  >
                    {o.currency === "BTC" ? (
                      <Bitcoin className="mr-1 h-3 w-3" />
                    ) : null}
                    {o.currency}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {o.network}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {CRYPTO_OPTIONS.map((o) => (
                <TabsContent
                  key={`${o.currency}-${o.network}`}
                  value={`${o.currency}-${o.network}`}
                  className="mt-3"
                >
                  <Label className="text-xs text-muted-foreground">
                    입금 주소 ({o.label})
                  </Label>
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background p-2">
                    <code className="flex-1 truncate text-xs">{o.address}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(o.address)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    네트워크 수수료는 발신자 부담
                  </Badge>
                </TabsContent>
              ))}
            </Tabs>

            <div className="mt-2">
              <Label htmlFor="txhash" className="text-xs text-muted-foreground">
                트랜잭션 해시 (TX Hash)
              </Label>
              <Input
                id="txhash"
                placeholder="0x... 또는 네트워크별 TX ID"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              결제 확인 요청
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              송금이 네트워크에서 확인되면 자동으로 크레딧이 충전돼요.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
