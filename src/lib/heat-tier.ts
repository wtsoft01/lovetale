// Affection-driven "heat" tier system.
// Higher affection unlocks more intimate visual content as users chat & choose.
// Designed to be visible to users so they can anticipate what's coming next —
// this gamifies the chat loop and increases session time.

export type HeatTier = {
  key: "soft" | "warm" | "spicy" | "steamy";
  label: string;
  badge: string; // short emoji+text for the meter
  min: number;
  max: number;
  preview: string; // what unlocks at this tier
  hint: string; // what to do to climb
  gradient: string; // tailwind gradient classes
  ring: string;
};

export const HEAT_TIERS: HeatTier[] = [
  {
    key: "soft",
    label: "Soft Gaze",
    badge: "🌙 차분",
    min: 0,
    max: 34,
    preview: "옷차림 단정 · 시선과 손끝의 떨림",
    hint: "대화를 시작해 분위기를 풀어보세요.",
    gradient: "from-slate-500/30 to-slate-700/30",
    ring: "ring-slate-400/40",
  },
  {
    key: "warm",
    label: "Warm Touch",
    badge: "🌸 밀착",
    min: 35,
    max: 64,
    preview: "가까운 컷 · 살짝 드러난 어깨와 쇄골",
    hint: "공감과 농담으로 그/그녀의 마음을 열어보세요.",
    gradient: "from-pink-500/30 to-rose-600/30",
    ring: "ring-pink-400/50",
  },
  {
    key: "spicy",
    label: "Spicy Tease",
    badge: "🔥 열기",
    min: 65,
    max: 84,
    preview: "관능적인 슬로우 컷 · 입맞춤 직전",
    hint: "원하는 마음을 솔직하게 전해보세요.",
    gradient: "from-rose-500/40 to-amber-500/30",
    ring: "ring-rose-500/60",
  },
  {
    key: "steamy",
    label: "Steamy Bliss",
    badge: "💋 탐닉",
    min: 85,
    max: 100,
    preview: "프리미엄 19+ 시네마틱 · 가장 깊은 장면 해금",
    hint: "최고치에 도달! 숨겨진 엔딩이 열려요.",
    gradient: "from-rose-600/60 via-fuchsia-600/40 to-violet-600/50",
    ring: "ring-rose-500/80",
  },
];

export function tierFor(affection: number): HeatTier {
  const a = Math.max(0, Math.min(100, affection));
  return HEAT_TIERS.find((t) => a >= t.min && a <= t.max) ?? HEAT_TIERS[0];
}

export function nextTier(affection: number): HeatTier | null {
  const cur = tierFor(affection);
  const idx = HEAT_TIERS.findIndex((t) => t.key === cur.key);
  return idx < HEAT_TIERS.length - 1 ? HEAT_TIERS[idx + 1] : null;
}

export function tierProgress(affection: number): number {
  const t = tierFor(affection);
  const span = t.max - t.min + 1;
  return Math.min(100, Math.round(((affection - t.min) / span) * 100));
}
