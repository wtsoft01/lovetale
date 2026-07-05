// Affection-driven heat tier system.
// Higher affection unlocks more intimate visual content as users chat, read, and make choices.

export type HeatTier = {
  key: "soft" | "warm" | "spicy" | "steamy";
  label: string;
  badge: string;
  min: number;
  max: number;
  preview: string;
  hint: string;
  gradient: string;
  ring: string;
};

export const HEAT_TIERS: HeatTier[] = [
  {
    key: "soft",
    label: "Soft Gaze",
    badge: "차분한 시선",
    min: 0,
    max: 34,
    preview: "기본 이미지, 첫 인사, 낮은 수위의 분위기 컷",
    hint: "스토리를 읽고 첫 대화를 시작해 분위기를 만들어 보세요.",
    gradient: "from-slate-500/30 to-slate-700/30",
    ring: "ring-slate-400/40",
  },
  {
    key: "warm",
    label: "Warm Touch",
    badge: "따뜻한 접점",
    min: 35,
    max: 64,
    preview: "가까운 구도, 표정 변화, 개인적인 대화 컷",
    hint: "공감형 답변과 장면 질문으로 캐릭터의 경계를 낮춰 보세요.",
    gradient: "from-pink-500/30 to-rose-600/30",
    ring: "ring-pink-400/50",
  },
  {
    key: "spicy",
    label: "Spicy Tease",
    badge: "아슬한 긴장",
    min: 65,
    max: 84,
    preview: "긴장감 있는 장면, 높은 호감도 전용 이미지",
    hint: "캐릭터의 말투와 감정선을 따라가며 더 깊은 선택을 이어가세요.",
    gradient: "from-rose-500/40 to-amber-500/30",
    ring: "ring-rose-500/60",
  },
  {
    key: "steamy",
    label: "Steamy Bliss",
    badge: "최고 단계",
    min: 85,
    max: 100,
    preview: "프리미엄 19+ 이미지, 특별 장면, 깊은 관계 대화",
    hint: "최종 단계입니다. 퀘스트와 긴 대화를 통해 마지막 잠금까지 열어 보세요.",
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
