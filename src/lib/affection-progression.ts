export type AffectionReason =
  | "reading_tick"
  | "reading_page"
  | "chat_message"
  | "meaningful_chat"
  | "choice"
  | "quest"
  | "asset_unlock"
  | "admin"
  | "manual"
  | string;

export type AffectionStage = {
  key: string;
  min: number;
  max: number;
  label: string;
  description: string;
  unlockHint: string;
  gainMultiplier: number;
  recommendedActions: string[];
};

export const AFFECTION_STAGES: AffectionStage[] = [
  {
    key: "stranger",
    min: 0,
    max: 9,
    label: "낯섦",
    description: "처음 말을 걸 수 있는 단계입니다.",
    unlockHint: "기본 이미지와 첫 인사를 해금합니다.",
    gainMultiplier: 2.2,
    recommendedActions: ["첫 채팅", "1화 읽기", "프로필 확인"],
  },
  {
    key: "interest",
    min: 10,
    max: 24,
    label: "관심",
    description: "상대가 사용자의 반응을 기억하기 시작합니다.",
    unlockHint: "가벼운 표정 변화와 일상 대화를 해금합니다.",
    gainMultiplier: 1.8,
    recommendedActions: ["짧은 대화", "다음 회차 읽기", "공감 선택지"],
  },
  {
    key: "friendly",
    min: 25,
    max: 49,
    label: "친근",
    description: "일반적인 대화와 읽기만으로도 비교적 빠르게 오릅니다.",
    unlockHint: "따뜻한 장면, 가까운 구도 이미지, 개인적인 질문을 해금합니다.",
    gainMultiplier: 1.3,
    recommendedActions: ["연속 읽기", "상대 질문에 답하기", "호감 선택지"],
  },
  {
    key: "trust",
    min: 50,
    max: 64,
    label: "신뢰",
    description: "여기부터는 단순 반복보다 맥락에 맞는 대화와 선택이 중요합니다.",
    unlockHint: "비밀 대화, 긴장감 있는 장면, 일부 잠금 이미지를 해금합니다.",
    gainMultiplier: 0.75,
    recommendedActions: ["회차 핵심 장면 읽기", "감정형 채팅", "캐릭터별 퀘스트"],
  },
  {
    key: "tension",
    min: 65,
    max: 77,
    label: "긴장",
    description: "관계가 깊어지며 보상 효율이 크게 줄어듭니다.",
    unlockHint: "캐릭터의 숨겨진 태도와 높은 단계 에셋을 해금합니다.",
    gainMultiplier: 0.5,
    recommendedActions: ["스토리 선택지", "연속 대화", "장면별 미션"],
  },
  {
    key: "immersion",
    min: 78,
    max: 87,
    label: "몰입",
    description: "일반 채팅만으로는 느리게 오르고, 의미 있는 상호작용이 필요합니다.",
    unlockHint: "고수위 직전 장면과 캐릭터의 깊은 속마음을 해금합니다.",
    gainMultiplier: 0.32,
    recommendedActions: ["특별 대화", "스토리 퀘스트", "잠금 이미지 해금"],
  },
  {
    key: "bond",
    min: 88,
    max: 94,
    label: "깊은 유대",
    description: "핵심 퀘스트와 고품질 대화가 필요합니다.",
    unlockHint: "프리미엄 이미지 일부와 결말 분기 조건을 해금합니다.",
    gainMultiplier: 0.2,
    recommendedActions: ["핵심 퀘스트", "캐릭터별 장문 대화", "결정적 선택"],
  },
  {
    key: "final",
    min: 95,
    max: 100,
    label: "완전 해금",
    description: "최종 단계는 일반 행동 보상으로 거의 오르지 않습니다.",
    unlockHint: "최종 이미지, 특별 결말, 깊은 관계 대화를 해금합니다.",
    gainMultiplier: 0.1,
    recommendedActions: ["최종 퀘스트", "고난도 선택지", "스토리 완주"],
  },
];

export const ASSET_AFFECTION_THRESHOLDS = {
  soft: 0,
  warm: 35,
  spicy: 65,
  steamy: 85,
  premium: 95,
} as const;

const REASON_MULTIPLIER: Record<string, number> = {
  reading_tick: 0.6,
  reading_page: 0.8,
  chat_message: 1,
  meaningful_chat: 1.4,
  choice: 1.25,
  quest: 2.2,
  asset_unlock: 0.7,
  admin: 1,
  manual: 1,
};

export function clampAffection(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getAffectionStage(affection: number) {
  const value = clampAffection(affection);
  return AFFECTION_STAGES.find((stage) => value >= stage.min && value <= stage.max) ?? AFFECTION_STAGES[0];
}

export function nextAffectionStage(affection: number) {
  const current = getAffectionStage(affection);
  const index = AFFECTION_STAGES.findIndex((stage) => stage.key === current.key);
  return index >= 0 && index < AFFECTION_STAGES.length - 1 ? AFFECTION_STAGES[index + 1] : null;
}

export function stageProgress(affection: number) {
  const stage = getAffectionStage(affection);
  const span = Math.max(1, stage.max - stage.min);
  return Math.max(0, Math.min(100, Math.round(((clampAffection(affection) - stage.min) / span) * 100)));
}

export function actionMultiplier(reason?: AffectionReason) {
  return REASON_MULTIPLIER[String(reason || "chat_message")] ?? 1;
}

export function calculateAffectionDelta(currentAffection: number, rawDelta: number, reason?: AffectionReason) {
  const current = clampAffection(currentAffection);
  const delta = Number(rawDelta) || 0;
  if (delta === 0) return 0;
  if (String(reason) === "admin" || String(reason) === "manual") return Math.max(-100, Math.min(100, Math.round(delta)));
  if (delta < 0) return Math.max(-100, Math.round(delta));

  const stage = getAffectionStage(current);
  const weighted = delta * stage.gainMultiplier * actionMultiplier(reason);
  const rounded = current < 50 ? Math.max(1, Math.round(weighted)) : Math.floor(weighted);
  return Math.max(0, Math.min(100 - current, rounded));
}

export function applyAffectionDelta(currentAffection: number, rawDelta: number, reason?: AffectionReason) {
  const appliedDelta = calculateAffectionDelta(currentAffection, rawDelta, reason);
  return {
    affection: clampAffection(currentAffection + appliedDelta),
    appliedDelta,
    stage: getAffectionStage(currentAffection + appliedDelta),
    previousStage: getAffectionStage(currentAffection),
  };
}
