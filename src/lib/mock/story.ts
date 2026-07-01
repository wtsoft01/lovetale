export type Emotion = "calm" | "shy" | "happy" | "sad" | "passion" | "tense";

export type StoryChoice = {
  label: string;
  next: string;
  emotion?: Emotion;
  affection?: number; // delta -3..+3
  // Hidden until player's affection reaches this threshold (unlocked via chat).
  requireAffection?: number;
  // Optional hint shown on the locked card.
  lockedHint?: string;
};

export type StoryBeat = {
  id: string;
  speaker?: string;
  text: string;
  narration?: string;
  emotion: Emotion;
  // Optional asset trigger label (e.g. looping clip key)
  clip?: string;
  choices?: StoryChoice[];
  end?: boolean;
};

export const emotionTint: Record<Emotion, string> = {
  calm: "from-background/70 via-background/30 to-background/60",
  shy: "from-pink-900/40 via-background/30 to-background/70",
  happy: "from-amber-900/30 via-background/30 to-background/70",
  sad: "from-slate-900/60 via-background/40 to-background/80",
  passion: "from-rose-900/60 via-background/40 to-background/80",
  tense: "from-violet-900/60 via-background/40 to-background/80",
};

export const emotionLabel: Record<Emotion, string> = {
  calm: "차분",
  shy: "수줍음",
  happy: "기쁨",
  sad: "쓸쓸",
  passion: "두근",
  tense: "긴장",
};

export const story: Record<string, StoryBeat> = {
  start: {
    id: "start",
    speaker: "그녀",
    text: "…여기서 너를 기다리고 있었어. 늦었잖아.",
    narration: "달빛이 머리카락을 은빛으로 물들였다. 너는 한 걸음 다가갔다.",
    emotion: "shy",
    clip: "moonlit-window",
    choices: [
      { label: "조용히 안아준다", next: "hug", emotion: "passion", affection: 2 },
      { label: "장난스럽게 사과한다", next: "joke", emotion: "happy", affection: 1 },
      { label: "그저 바라본다", next: "gaze", emotion: "tense", affection: 0 },
    ],
  },
  hug: {
    id: "hug",
    speaker: "그녀",
    text: "…바보. 이렇게 갑자기 하면, 심장이 멈춰버린다구.",
    narration: "그녀의 작은 손이 너의 옷자락을 꼭 쥐었다.",
    emotion: "passion",
    clip: "embrace-soft",
    choices: [
      { label: "이름을 부른다", next: "name", emotion: "shy", affection: 2 },
      { label: "더 가까이 끌어당긴다", next: "closer", emotion: "passion", affection: 3 },
    ],
  },
  joke: {
    id: "joke",
    speaker: "그녀",
    text: "흥. 그런 식으로 넘어갈 거라 생각했어?",
    narration: "입꼬리는 올라가 있었다.",
    emotion: "happy",
    choices: [
      { label: "손을 잡는다", next: "name", emotion: "shy", affection: 2 },
      { label: "어깨를 토닥인다", next: "gaze", emotion: "calm", affection: 1 },
    ],
  },
  gaze: {
    id: "gaze",
    speaker: "그녀",
    text: "…왜 그렇게 봐? 부끄럽잖아.",
    emotion: "shy",
    choices: [
      { label: "예쁘다고 말한다", next: "name", emotion: "passion", affection: 3 },
      { label: "미안하다고 한다", next: "joke", emotion: "sad", affection: -1 },
    ],
  },
  name: {
    id: "name",
    speaker: "그녀",
    text: "…한 번만 더 불러줘. 내 이름을.",
    narration: "그 목소리는 작지만 단단했다.",
    emotion: "passion",
    clip: "close-up",
    choices: [
      { label: "이름을 속삭인다", next: "ending_warm", emotion: "happy", affection: 3 },
    ],
  },
  closer: {
    id: "closer",
    speaker: "그녀",
    text: "…오늘 밤, 도망 못 가게 할 거야.",
    emotion: "passion",
    clip: "close-up",
    choices: [
      { label: "그래도 좋다고 답한다", next: "ending_warm", emotion: "happy", affection: 3 },
    ],
  },
  ending_warm: {
    id: "ending_warm",
    speaker: "그녀",
    text: "…고마워. 와줘서.",
    narration: "창밖의 달은, 둘만의 것이었다. — Chapter 1 끝 —",
    emotion: "happy",
    end: true,
  },
};
