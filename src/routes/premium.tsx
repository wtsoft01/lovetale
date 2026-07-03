import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bitcoin,
  Bot,
  CalendarDays,
  Check,
  Clock3,
  Coins,
  Copy,
  Crown,
  Gift,
  Loader2,
  MessageCircle,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { title: "?꾨━誘몄뾼 쨌 ?щ젅??| Lovetale" },
      {
        name: "description",
        content: "Lovetale ?щ젅?㏐낵 ??援щ룆 ?곹뭹??鍮꾧탳?섍퀬, ?ㅽ넗由ъ? AI ?곗씠???ъ슜?됱쓣 ?좏깮?⑸땲??",
      },
    ],
  }),
  component: Premium,
});

type Tone = "pink" | "blue" | "gold";

type CreditPackage = {
  kind: "credit";
  id: string;
  name: string;
  icon: typeof Sparkles;
  tone: Tone;
  credits: number;
  bonus: number;
  bonusRate: number;
  listPriceUsd: number;
  priceUsd: number;
  badge?: string | null;
  features: string[];
};

type SubscriptionPlan = {
  kind: "subscription";
  id: string;
  name: string;
  tone: Tone;
  monthlyCredits: number;
  freeStories: number;
  priceUsd: number;
  listPriceUsd: number;
  badge?: string | null;
  estimatedUsage: string;
  modelAccess: string[];
  includedUsage: string[];
  features: string[];
};

type CheckoutItem = {
  kind: CreditPackage["kind"] | SubscriptionPlan["kind"];
  id: string;
  name: string;
  priceUsd: number;
  listPriceUsd: number;
  credits: number;
  note: string;
  summaryRows: Array<{ label: string; value: string }>;
};

const CREDIT_PACKAGES: CreditPackage[] = [
  {
    kind: "credit",
    id: "mini",
    name: "Mini",
    icon: Sparkles,
    tone: "pink",
    credits: 500,
    bonus: 50,
    bonusRate: 10,
    listPriceUsd: 7,
    priceUsd: 5,
    features: ["500 + 50 크레딧", "가볍게 체험", "스토리 잠금 해제"],
  },
  {
    kind: "credit",
    id: "light",
    name: "Light",
    icon: Coins,
    tone: "blue",
    credits: 1500,
    bonus: 225,
    bonusRate: 15,
    listPriceUsd: 19,
    priceUsd: 15,
    badge: "?멸린",
    features: ["1,500 + 225 크레딧", "캐릭터채팅", "짧은 제작 테스트"],
  },
  {
    kind: "credit",
    id: "standard",
    name: "Standard",
    icon: Crown,
    tone: "pink",
    credits: 2900,
    bonus: 580,
    bonusRate: 20,
    listPriceUsd: 39,
    priceUsd: 29,
    badge: "BEST",
    features: ["2,900 + 580 크레딧", "스토리마켓 구매 여유", "AI 제작 반복"],
  },
  {
    kind: "credit",
    id: "pro",
    name: "Pro",
    icon: Sparkles,
    tone: "gold",
    credits: 5900,
    bonus: 1475,
    bonusRate: 25,
    listPriceUsd: 79,
    priceUsd: 59,
    features: ["5,900 + 1,475 크레딧", "장편 제작", "대량 에셋 작업"],
  },
  {
    kind: "credit",
    id: "studio",
    name: "Studio",
    icon: Coins,
    tone: "pink",
    credits: 9900,
    bonus: 2970,
    bonusRate: 30,
    listPriceUsd: 139,
    priceUsd: 99,
    badge: "추천 플랜",
    features: ["9,900 + 2,970 크레딧", "스토리 판매 준비", "운영급 제작 분량"],
  },
];

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    kind: "subscription",
    id: "sub_story_plus",
    name: "Story Plus",
    tone: "blue",
    monthlyCredits: 7000,
    freeStories: 1,
    priceUsd: 30,
    listPriceUsd: 39,
    estimatedUsage: "가벼운 채팅과 스토리 체험 중심",
    modelAccess: ["DeepSeek", "Gemini", "ChatGPT", "Claude"],
    includedUsage: ["AI 채팅", "무료 스토리 열람", "기본 이미지 생성", "캐릭터 데이터 저장"],
    features: ["무료 스토리 1개", "AI 모델 선택", "기본 이미지 생성 분량 포함", "개인 데이터 저장"],
  },
  {
    kind: "subscription",
    id: "sub_immersion",
    name: "Immersion",
    tone: "pink",
    monthlyCredits: 16000,
    freeStories: 3,
    priceUsd: 59,
    listPriceUsd: 79,
    badge: "추천 구독",
    estimatedUsage: "스토리 감상과 캐릭터채팅을 깊게 즐기는 이용자용",
    modelAccess: ["DeepSeek", "Gemini Pro", "ChatGPT", "Claude"],
    includedUsage: ["AI 채팅", "스토리 열람", "이미지 생성", "캐릭터 제작 보조", "자작스토리 초안"],
    features: ["무료 스토리 3개", "이미지 생성 기본량 포함", "스토리 캐릭터 기억 강화", "자작스토리 초안 생성"],
  },
  {
    kind: "subscription",
    id: "sub_creator_max",
    name: "Creator Max",
    tone: "gold",
    monthlyCredits: 32000,
    freeStories: 5,
    priceUsd: 99,
    listPriceUsd: 139,
    badge: "작가 추천",
    estimatedUsage: "자작스토리 제작과 멀티모달 생성까지 함께 사용하는 플랜",
    modelAccess: ["DeepSeek", "Gemini Pro", "ChatGPT 고급", "Claude 고급"],
    includedUsage: ["AI 채팅", "스토리 열람", "이미지 생성", "영상 생성 보조", "캐릭터 제작", "마켓 등록 준비"],
    features: ["무료 스토리 5개", "자작스토리 제작 사용량 포함", "이미지/영상 생성 우선권", "스토리마켓 판매 준비 작업"],
  },
];
const TONE_STYLES: Record<
  Tone,
  {
    card: string;
    icon: string;
    badge: string;
    text: string;
    check: string;
    button: string;
    soft: string;
  }
> = {
  pink: {
    card: "border-pink-500/70 bg-card/50 hover:border-pink-400 shadow-[0_0_0_1px_rgba(236,72,153,.12)]",
    icon: "bg-pink-500/20 text-pink-300",
    badge: "border-pink-400/40 bg-pink-500/10 text-pink-600 dark:text-pink-200",
    text: "text-pink-500 dark:text-pink-300",
    check: "text-pink-500 dark:text-pink-300",
    button: "border-pink-400/45 text-pink-600 hover:bg-pink-500/10 dark:text-pink-200 dark:hover:text-pink-100",
    soft: "bg-pink-500/10 text-pink-600 dark:text-pink-200",
  },
  blue: {
    card: "border-blue-500/70 bg-card/50 hover:border-blue-400 shadow-[0_0_0_1px_rgba(59,130,246,.12)]",
    icon: "bg-blue-500/20 text-blue-300",
    badge: "border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-200",
    text: "text-blue-500 dark:text-blue-300",
    check: "text-blue-500 dark:text-blue-300",
    button: "border-blue-400/45 text-blue-600 hover:bg-blue-500/10 dark:text-blue-200 dark:hover:text-blue-100",
    soft: "bg-blue-500/10 text-blue-600 dark:text-blue-200",
  },
  gold: {
    card:
      "border-emerald-500/55 bg-card/50 hover:border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,.10)] dark:border-yellow-300/60 dark:hover:border-yellow-300/80 dark:shadow-[0_0_0_1px_rgba(250,204,21,.10)]",
    icon: "bg-emerald-500/15 text-emerald-600 dark:bg-yellow-300/15 dark:text-yellow-300",
    badge: "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:border-yellow-300/35 dark:bg-yellow-300/10 dark:text-yellow-200",
    text: "text-emerald-600 dark:text-yellow-300",
    check: "text-emerald-600 dark:text-yellow-300",
    button:
      "border-emerald-500/45 text-emerald-700 hover:bg-emerald-500/10 dark:border-yellow-300/45 dark:text-yellow-200 dark:hover:bg-yellow-300/10",
    soft: "bg-emerald-500/10 text-emerald-700 dark:bg-yellow-300/10 dark:text-yellow-200",
  },
};

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
    label: "USDT (Tron 쨌 TRC20)",
    address: "TJYeasdFCXxxxx-DEMO-TRC20-ADDRESS-xxxxx9aQ",
  },
  {
    currency: "USDT",
    network: "ERC20",
    label: "USDT (Ethereum 쨌 ERC20)",
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

type CreditOrder = {
  id: string;
  package_id: string;
  credits: number;
  amount_usd: number;
  currency: string;
  network: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
};

function Premium() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<CheckoutItem | null>(null);
  const qc = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["credit_orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_orders")
        .select("id, package_id, credits, amount_usd, currency, network, status, tx_hash, created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as CreditOrder[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-1 text-[11px]">
            <Coins className="size-3" />
            PREMIUM
          </Badge>
          <h1 className="text-base font-semibold">충전,구독</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit gap-1.5 rounded-full">
          <Link to="/orders">
            <Wallet className="size-4" />
            구매내역
          </Link>
        </Button>
      </section>

      <Tabs defaultValue="credits" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-full">
          <TabsTrigger value="credits" className="rounded-full">
            ?щ젅??異⑹쟾
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="rounded-full">
            ??援щ룆
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credits" className="mt-0">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {CREDIT_PACKAGES.map((pkg) => (
              <CreditPackageCard key={pkg.id} pkg={pkg} onSelect={() => setSelected(toCreditCheckout(pkg))} />
            ))}
          </section>
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-0 space-y-4">
          <section className="grid gap-3 lg:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <SubscriptionCard key={plan.id} plan={plan} onSelect={() => setSelected(toSubscriptionCheckout(plan))} />
            ))}
          </section>
          <div className="grid gap-3 rounded-3xl border border-border/60 bg-card/35 p-4 text-xs text-muted-foreground md:grid-cols-3">
            <MiniMetric icon={Bot} label="紐⑤뜽 ?좏깮" value="DeepSeek 쨌 Gemini 쨌 ChatGPT 쨌 Claude" />
            <MiniMetric icon={Clock3} label="?ъ슜 湲곗?" value="梨꾪똿, ?ㅽ넗由??대엺, ?대?吏/?곸긽 ?앹꽦??湲곕낯 ?ъ슜?됱뿉??李④컧" />
            <MiniMetric icon={CalendarDays} label="珥덇낵 ?ъ슜" value="??湲곕낯 ?ъ슜?됱쓣 ?섏쑝硫??щ젅??異붽? 異⑹쟾 ??怨꾩냽 ?댁슜" />
          </div>
        </TabsContent>
      </Tabs>

      <section className="grid gap-3 rounded-3xl border border-blue-500/45 bg-card/45 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-500/15 text-blue-500 dark:text-blue-200">
            <Gift className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">결제 전 먼저 체험해볼 수 있어요</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              출석체크와 첫 이용 미션으로 무료크래딧을 받고, 스토리 열람과 캐릭터채팅을 먼저 테스트해 보세요.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full rounded-full border-blue-400/45 text-blue-600 hover:bg-blue-500/10 md:w-auto dark:text-blue-200">
          <Link to="/rewards">
            무료크래딧
            <Gift className="ml-1.5 size-4" />
          </Link>
        </Button>
      </section>

      <section className="rounded-3xl border border-border/60 bg-card/45 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">理쒓렐 異⑹쟾 쨌 援щ룆 ?붿껌</h2>
          {!user && (
            <Link to="/auth" className="text-xs text-primary hover:underline">
              濡쒓렇??            </Link>
          )}
        </div>

        {!user ? (
          <p className="py-6 text-center text-sm text-muted-foreground">濡쒓렇?명븯硫?異⑹쟾 諛?援щ룆 ?붿껌 ?곹깭瑜??뺤씤?????덉뒿?덈떎.</p>
        ) : ordersQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            遺덈윭?ㅻ뒗 以?          </div>
        ) : !ordersQuery.data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">?꾩쭅 ?붿껌 ?댁뿭???놁뒿?덈떎.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {ordersQuery.data.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatPackageName(order.package_id)}</span>
                    <span className="text-xs text-muted-foreground">{order.credits.toLocaleString()} cr</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()} 쨌 {order.currency}/{order.network} 쨌 ${order.amount_usd}
                  </div>
                </div>
                <StatusBadge status={order.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="group rounded-3xl border border-border/60 bg-card/35 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
          <span>충전,구독 유의사항</span>
          <span className="text-xs text-muted-foreground transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-4 space-y-3 border-t border-border/50 pt-4 text-xs leading-6 text-muted-foreground">
          <p>
            異⑹쟾???щ젅?㏐낵 援щ룆 湲곕낯 ?ъ슜?됱? 寃곗젣 ?뺤씤 ??諛붾줈 ?ъ슜?????덉뒿?덈떎. ?붿???肄섑뀗痢??뱀꽦???ъ슜??            ?쒖옉?섎㈃ ?섎텋???대젮?곕땲 寃곗젣 ???곹뭹怨?湲덉븸????踰????뺤씤??二쇱꽭??
          </p>
          <ul className="space-y-2">
            <li>泥?빟泥좏쉶??援щℓ?쇰줈遺??7???대궡, ?щ젅?㏃씠??援щ룆 ?쒗깮???꾪? ?ъ슜?섏? ?딆? 寃쎌슦?먮쭔 媛?ν빀?덈떎.</li>
            <li>?щ젅???좏슚湲곌컙? 寃곗젣?쇰줈遺??1?꾩씠硫? 援щ룆 湲곕낯 ?ъ슜?됱? ?대떦 援щ룆 湲곌컙 ?덉뿉???곗꽑 ?ъ슜?⑸땲??</li>
            <li>AI ?ъ슜?쒓컙? ?좏깮 紐⑤뜽, ?듬? 湲몄씠, ?대?吏/?곸긽 ?앹꽦 ?щ????곕씪 ?щ씪吏????덉뒿?덈떎.</li>
            <li>?댁슜?쎄? ?꾨컲?쇰줈 怨꾩젙???쒗븳?섎㈃ ?⑥? ?щ젅?㏐낵 援щ룆 ?쒗깮? ?섎텋 ?놁씠 ?뚮㈇?????덉뒿?덈떎.</li>
            <li>?섎텋 ?붿껌怨??댁슜 臾몄쓽???щ툕?뚯씪 怨좉컼?쇳꽣瑜??듯빐 ?묒닔??二쇱꽭??</li>
          </ul>
        </div>
      </details>

      <CheckoutDialog
        item={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ["credit_orders"] });
          qc.invalidateQueries({ queryKey: ["my_credit_orders"] });
        }}
      />
    </div>
  );
}

function CreditPackageCard({ pkg, onSelect }: { pkg: CreditPackage; onSelect: () => void }) {
  const Icon = pkg.icon;
  const total = pkg.credits + pkg.bonus;
  const discountRate = Math.round(((pkg.listPriceUsd - pkg.priceUsd) / pkg.listPriceUsd) * 100);
  const tone = TONE_STYLES[pkg.tone];

  return (
    <article className={`relative rounded-3xl border p-4 transition ${tone.card}`}>
      {pkg.badge && (
        <span className={`absolute right-4 top-4 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
          {pkg.badge}
        </span>
      )}
      <div className="mb-4 flex items-center gap-2">
        <div className={`grid size-9 place-items-center rounded-2xl ${tone.icon}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{pkg.name}</h2>
          <p className="text-xs text-muted-foreground">{total.toLocaleString()} cr</p>
        </div>
      </div>

      <PriceBlock priceUsd={pkg.priceUsd} listPriceUsd={pkg.listPriceUsd} tone={tone} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
          {discountRate}% ?좎씤
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
          蹂대꼫??{pkg.bonusRate}%
        </Badge>
      </div>

      <FeatureList features={pkg.features} checkClass={tone.check} />

      <Button onClick={onSelect} className={`mt-5 w-full rounded-full ${tone.button}`} variant="outline">
        <Wallet className="mr-1.5 size-4" />
        異⑹쟾?섍린
      </Button>
    </article>
  );
}

function SubscriptionCard({ plan, onSelect }: { plan: SubscriptionPlan; onSelect: () => void }) {
  const tone = TONE_STYLES[plan.tone];
  const discountRate = Math.round(((plan.listPriceUsd - plan.priceUsd) / plan.listPriceUsd) * 100);

  return (
    <article className={`relative rounded-3xl border p-5 transition ${tone.card}`}>
      {plan.badge && (
        <span className={`absolute right-5 top-5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone.badge}`}>
          {plan.badge}
        </span>
      )}
      <div className="mb-4 flex items-center gap-3">
        <div className={`grid size-10 place-items-center rounded-2xl ${tone.icon}`}>
          <MessageCircle className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{plan.name}</h2>
          <p className="text-xs text-muted-foreground">월 구독 · 자동 갱신 준비형</p>
        </div>
      </div>

      <PriceBlock priceUsd={plan.priceUsd} listPriceUsd={plan.listPriceUsd} tone={tone} suffix="/월" />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
          {discountRate}% 절약
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
          무료 스토리 {plan.freeStories}개
        </Badge>
      </div>

      <div className="mb-4 grid gap-2 rounded-2xl border border-border/50 bg-background/35 p-3 text-xs">
        <MiniMetric icon={Coins} label="월 기본 사용량" value={`${plan.monthlyCredits.toLocaleString()} cr`} />
        <MiniMetric icon={Clock3} label="이용 기준" value={plan.estimatedUsage} />
        <MiniMetric icon={Bot} label="선택 모델" value={plan.modelAccess.join(" · ")} />
      </div>

      <div className="mb-4 rounded-2xl border border-border/50 bg-background/25 p-3">
        <div className="mb-2 text-[10px] font-medium text-muted-foreground">기본 사용량에 포함되는 활동</div>
        <div className="flex flex-wrap gap-1.5">
          {plan.includedUsage.map((item) => (
            <Badge key={item} variant="outline" className={`rounded-full text-[10px] ${tone.badge}`}>
              {item}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          梨꾪똿, ?ㅽ넗由??대엺, ?대?吏/?곸긽 ?앹꽦, 罹먮┃???쒖옉? 紐⑤몢 ??湲곕낯 ?ъ슜?됱뿉??李④컧?⑸땲?? 湲곕낯 ?ъ슜?됱쓣 ?섏쑝硫?          ?щ젅??異붽? 異⑹쟾???꾩슂?⑸땲??
        </p>
      </div>

      <FeatureList features={plan.features} checkClass={tone.check} />

      <Button onClick={onSelect} className={`mt-5 w-full rounded-full ${tone.button}`} variant="outline">
        <CalendarDays className="mr-1.5 size-4" />
        援щ룆 ?좎껌
      </Button>
    </article>
  );
}

function PriceBlock({
  priceUsd,
  listPriceUsd,
  tone,
  suffix,
}: {
  priceUsd: number;
  listPriceUsd: number;
  tone: (typeof TONE_STYLES)[Tone];
  suffix?: string;
}) {
  return (
    <div className="mb-3 space-y-1">
      <div className="flex items-end gap-2">
        <span className={`text-3xl font-semibold ${tone.text}`}>${priceUsd}</span>
        {suffix && <span className="pb-1 text-xs text-muted-foreground">{suffix}</span>}
        <span className="pb-1 text-xs text-muted-foreground line-through">${listPriceUsd}</span>
      </div>
    </div>
  );
}

function FeatureList({ features, checkClass }: { features: string[]; checkClass: string }) {
  return (
    <ul className="space-y-2 text-xs text-muted-foreground">
      {features.map((feature) => (
        <li key={feature} className="flex items-center gap-2">
          <Check className={`size-3.5 ${checkClass}`} />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="truncate font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    submitted: { label: "확인중", cls: "bg-amber-500/15 text-amber-500" },
    confirmed: { label: "완료", cls: "bg-emerald-500/15 text-emerald-500" },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
  };
  const value = map[status] ?? map.pending;
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${value.cls}`}>{value.label}</span>;
}

function CheckoutDialog({
  item,
  onOpenChange,
  onSubmitted,
}: {
  item: CheckoutItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const [option, setOption] = useState<CryptoOption>(CRYPTO_OPTIONS[0]);
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("?낃툑 二쇱냼瑜?蹂듭궗?덉뒿?덈떎.");
  };

  const submit = async () => {
    if (!item) return;
    if (!user) {
      toast.error("濡쒓렇?몄씠 ?꾩슂?⑸땲??");
      return;
    }
    if (!txHash.trim()) {
      toast.error("TX Hash瑜??낅젰?섏꽭??");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("credit_orders").insert({
      user_id: user.id,
      package_id: item.id,
      credits: item.credits,
      amount_usd: item.priceUsd,
      currency: option.currency,
      network: option.network,
      wallet_address: option.address,
      tx_hash: txHash.trim(),
      status: "submitted",
      note: item.note,
    });
    setSubmitting(false);

    if (error) {
      toast.error("?붿껌 ?앹꽦???ㅽ뙣?덉뒿?덈떎.");
      return;
    }

    toast.success(item.kind === "subscription" ? "援щ룆 ?좎껌???묒닔?덉뒿?덈떎." : "異⑹쟾 ?붿껌???묒닔?덉뒿?덈떎.");
    setTxHash("");
    onSubmitted();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                {item.name} 쨌 ${item.priceUsd}
              </DialogTitle>
              <DialogDescription>
                입금 후 TX Hash를 입력하면 관리자가 확인 후 {item.kind === "subscription" ? "구독과 기본 사용량" : "크레딧"}을 반영합니다.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border border-border/60 bg-card/40 p-3 text-sm">
              {item.summaryRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-right font-semibold">{row.value}</span>
                </div>
              ))}
            </div>

            <Tabs
              value={`${option.currency}-${option.network}`}
              onValueChange={(value) => {
                const next = CRYPTO_OPTIONS.find((candidate) => `${candidate.currency}-${candidate.network}` === value);
                if (next) setOption(next);
              }}
            >
              <TabsList className="grid w-full grid-cols-4">
                {CRYPTO_OPTIONS.map((candidate) => (
                  <TabsTrigger key={`${candidate.currency}-${candidate.network}`} value={`${candidate.currency}-${candidate.network}`} className="text-xs">
                    {candidate.currency === "BTC" ? <Bitcoin className="mr-1 size-3" /> : null}
                    {candidate.currency}
                  </TabsTrigger>
                ))}
              </TabsList>
              {CRYPTO_OPTIONS.map((candidate) => (
                <TabsContent key={`${candidate.currency}-${candidate.network}`} value={`${candidate.currency}-${candidate.network}`} className="mt-3">
                  <Label className="text-xs text-muted-foreground">?낃툑 二쇱냼 쨌 {candidate.label}</Label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-2">
                    <code className="min-w-0 flex-1 truncate text-xs">{candidate.address}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(candidate.address)} aria-label="?낃툑 二쇱냼 蹂듭궗">
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            <div>
              <Label htmlFor="txhash" className="text-xs text-muted-foreground">
                TX Hash
              </Label>
              <Input
                id="txhash"
                placeholder="0x... ?먮뒗 ?ㅽ듃?뚰겕 TX ID"
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full rounded-full">
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {item.kind === "subscription" ? "援щ룆 ?뺤씤 ?붿껌" : "異⑹쟾 ?붿껌"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toCreditCheckout(pkg: CreditPackage): CheckoutItem {
  const totalCredits = pkg.credits + pkg.bonus;
  return {
    kind: "credit",
    id: pkg.id,
    name: pkg.name,
    priceUsd: pkg.priceUsd,
    listPriceUsd: pkg.listPriceUsd,
    credits: totalCredits,
    note: JSON.stringify({
      kind: "credit",
      packageId: pkg.id,
      credits: pkg.credits,
      bonus: pkg.bonus,
      bonusRate: pkg.bonusRate,
    }),
    summaryRows: [
      { label: "지급 크레딧", value: `${totalCredits.toLocaleString()} cr` },
      { label: "정가", value: `$${pkg.listPriceUsd} USD` },
      { label: "판매가", value: `$${pkg.priceUsd} USD` },
      { label: "보너스", value: `+${pkg.bonus.toLocaleString()} cr (${pkg.bonusRate}%)` },
    ],
  };
}

function toSubscriptionCheckout(plan: SubscriptionPlan): CheckoutItem {
  return {
    kind: "subscription",
    id: plan.id,
    name: plan.name,
    priceUsd: plan.priceUsd,
    listPriceUsd: plan.listPriceUsd,
    credits: plan.monthlyCredits,
    note: JSON.stringify({
      kind: "subscription",
      planId: plan.id,
      planName: plan.name,
      months: 1,
      monthlyCredits: plan.monthlyCredits,
      freeStories: plan.freeStories,
      estimatedUsage: plan.estimatedUsage,
      modelAccess: plan.modelAccess,
      includedUsage: plan.includedUsage,
      overagePolicy: "월 기본 사용량 초과 시 크레딧 추가 충전 필요",
    }),
    summaryRows: [
      { label: "구독 기간", value: "1개월" },
      { label: "월 기본 사용량", value: `${plan.monthlyCredits.toLocaleString()} cr` },
      { label: "무료 스토리", value: `${plan.freeStories}개` },
      { label: "사용 기준", value: plan.estimatedUsage },
      { label: "판매가", value: `$${plan.priceUsd} USD / 월` },
    ],
  };
}

function formatPackageName(packageId: string) {
  const credit = CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
  if (credit) return credit.name;
  const subscription = SUBSCRIPTION_PLANS.find((plan) => plan.id === packageId);
  if (subscription) return `${subscription.name} 구독`;
  return packageId;
}
