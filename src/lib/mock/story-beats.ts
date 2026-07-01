import { story as defaultBeats, type StoryBeat } from "./story";

// Per-story beat trees. Stories without a custom tree fall back to the default
// "moonlit window" arc with the opening line replaced by the story's hook so
// every story still feels distinct on first impression.

const secretContract: Record<string, StoryBeat> = {
  start: {
    id: "start",
    speaker: "카이토",
    text: "…계약서엔 안 적혀 있던 조항이 하나 있어. 오늘 밤은, 진짜처럼 굴어줘.",
    narration:
      "재벌가의 차가운 펜트하우스. 그가 넥타이를 풀자, 야경의 불빛이 너의 얼굴 위로 흘렀다.",
    emotion: "tense",
    clip: "penthouse-night",
    choices: [
      { label: "그의 손을 천천히 잡는다", next: "hand", emotion: "passion", affection: 2 },
      { label: "한 발 물러서며 웃는다", next: "tease", emotion: "shy", affection: 1 },
      { label: "조항은 못 본 척한다", next: "ignore", emotion: "tense", affection: -1 },
    ],
  },
  hand: {
    id: "hand",
    speaker: "카이토",
    text: "…이 손, 한 달 뒤엔 놓아야 하는 거 알지?",
    narration: "그의 엄지가 너의 손등을 천천히 쓸었다.",
    emotion: "passion",
    clip: "close-up-hands",
    choices: [
      { label: "그래도 지금은 잡고 있어", next: "kiss", emotion: "passion", affection: 3 },
      { label: "한 달이면 충분해", next: "promise", emotion: "tense", affection: 1 },
    ],
  },
  tease: {
    id: "tease",
    speaker: "카이토",
    text: "…도망갈 거면 처음부터 사인하지 말았어야지.",
    emotion: "tense",
    choices: [
      { label: "사인은 후회 안 해", next: "promise", emotion: "passion", affection: 2 },
      { label: "도망치는 게 아니야", next: "kiss", emotion: "shy", affection: 1 },
    ],
  },
  ignore: {
    id: "ignore",
    speaker: "카이토",
    text: "…그 표정. 제일 위험한 표정인 거 알아?",
    emotion: "tense",
    choices: [
      { label: "그가 다가오게 둔다", next: "kiss", emotion: "passion", affection: 2 },
      { label: "먼저 다가간다", next: "promise", emotion: "passion", affection: 3 },
    ],
  },
  promise: {
    id: "promise",
    speaker: "카이토",
    text: "…약속 하나만 해. 끝나는 날, 울지 마.",
    emotion: "sad",
    clip: "window-rain",
    choices: [
      { label: "약속할 수 없어요", next: "kiss", emotion: "passion", affection: 3 },
    ],
  },
  kiss: {
    id: "kiss",
    speaker: "카이토",
    text: "…계약 위반이야, 이건.",
    narration: "그의 입술이 닿은 순간, 야경이 잠시 멈춘 듯했다. — Chapter 1 끝 —",
    emotion: "passion",
    end: true,
  },
};

const rooftopPromise: Record<string, StoryBeat> = {
  start: {
    id: "start",
    speaker: "사쿠라",
    text: "…내일이면 졸업이잖아. 마지막으로, 옥상에서 보자고 했지.",
    narration:
      "교복 치마가 봄바람에 흔들렸다. 10년을 알았는데, 오늘 처음 보는 표정이었다.",
    emotion: "shy",
    clip: "rooftop-dusk",
    choices: [
      { label: "옆에 가까이 선다", next: "lean", emotion: "passion", affection: 2 },
      { label: "장난스럽게 이름을 부른다", next: "tease", emotion: "happy", affection: 1 },
      { label: "조용히 노을을 본다", next: "silence", emotion: "calm", affection: 0 },
    ],
  },
  lean: {
    id: "lean",
    speaker: "사쿠라",
    text: "…야, 너무 가까워. 들킨다구.",
    emotion: "shy",
    choices: [
      { label: "이미 늦었어, 라고 말한다", next: "confess", emotion: "passion", affection: 3 },
      { label: "한 발 떨어진다", next: "silence", emotion: "sad", affection: -1 },
    ],
  },
  tease: {
    id: "tease",
    speaker: "사쿠라",
    text: "…그 이름, 오늘은 다르게 들려.",
    emotion: "happy",
    choices: [
      { label: "그럼 한 번 더 부른다", next: "confess", emotion: "passion", affection: 2 },
      { label: "왜 그런지 물어본다", next: "silence", emotion: "shy", affection: 1 },
    ],
  },
  silence: {
    id: "silence",
    speaker: "사쿠라",
    text: "…말 안 해도, 다 아는 거. 그게 우리잖아.",
    emotion: "calm",
    choices: [
      { label: "그래서 더 말하고 싶어", next: "confess", emotion: "passion", affection: 3 },
    ],
  },
  confess: {
    id: "confess",
    speaker: "사쿠라",
    text: "…나, 친구로 끝낼 자신 없어.",
    narration: "노을이 그녀의 뺨을 붉게 물들였다. — Chapter 1 끝 —",
    emotion: "passion",
    end: true,
  },
};

// ──────────────────────────────────────────────────────────────────────────
// 길들여진 그 밤 · 1권 — adapted from 소우 「길들여진 여자」 Chapter 1
// Multi-branch (5 endings band: cold / shame / surrender / escape / truth)
// ──────────────────────────────────────────────────────────────────────────
const tamedHer: Record<string, StoryBeat> = {
  start: {
    id: "start",
    speaker: "연우 (나)",
    text: "…여기가 어디지. 어젯밤에 도대체 얼마나 마신 거지?",
    narration:
      "낯선 천장. 짙은 야광색 푸른 천장에 형형색색 별 모형들이 나를 내려다본다. 머리가 깨질 듯이 아프고, 옆자리에서 미세하게 숨소리가 들린다.",
    emotion: "tense",
    clip: "dawn-bedroom",
    choices: [
      {
        label: "조용히 이불을 들춰 옆을 본다",
        next: "reveal",
        emotion: "shy",
        affection: 1,
      },
      {
        label: "기억을 더듬는다 — 진태, 세희, 술집 카시오페아…",
        next: "memory",
        emotion: "tense",
        affection: 0,
      },
      {
        label: "벌떡 일어나 옷부터 찾는다",
        next: "panic",
        emotion: "tense",
        affection: -1,
      },
    ],
  },

  reveal: {
    id: "reveal",
    speaker: "하영",
    text: "…언제 일어났니?",
    narration:
      "이불 끝을 살짝 들친 순간, 그녀의 어깨선이 드러났다. 처음 보는 얼굴. 그러나 향기는 어딘가 익숙했다. 그녀가 천천히 눈을 떴다.",
    emotion: "passion",
    clip: "shoulder-reveal",
    choices: [
      {
        label: "…누, 누구세요?",
        next: "name",
        emotion: "shy",
        affection: 0,
      },
      {
        label: "아무 말도 못한 채 눈을 피한다",
        next: "shameSpiral",
        emotion: "shy",
        affection: -1,
      },
      {
        label: "그녀의 손목을 부드럽게 잡는다",
        next: "pulled",
        emotion: "passion",
        affection: 2,
      },
    ],
  },

  memory: {
    id: "memory",
    speaker: "연우 (나)",
    text: "…진태 그 새끼가 분명히 웃었었어. 「그년 먹어보니까 맛있디?」",
    narration:
      "기억의 끈이 한 가닥씩 풀린다. 마지막 이별주, 친구의 비웃음, 깨진 잔. 그리고 그 다음은… 까맣다.",
    emotion: "sad",
    choices: [
      {
        label: "이불을 들춰 옆을 확인한다",
        next: "reveal",
        emotion: "tense",
        affection: 0,
      },
      {
        label: "주머니의 휴대폰을 더듬어 찾는다",
        next: "phone",
        emotion: "tense",
        affection: 0,
      },
    ],
  },

  panic: {
    id: "panic",
    speaker: "하영",
    text: "…바지? 바지 없어서… 안 보이네.",
    narration:
      "그녀가 베개에 기댄 채 나른하게 웃었다. 그 한마디에 내 얼굴이 빨갛게 달아올랐다.",
    emotion: "shy",
    clip: "morning-tease",
    choices: [
      {
        label: "이불로 몸을 가린 채 그녀를 본다",
        next: "name",
        emotion: "shy",
        affection: 1,
      },
      {
        label: "「장난치지 마세요」",
        next: "shameSpiral",
        emotion: "tense",
        affection: -1,
      },
    ],
  },

  phone: {
    id: "phone",
    speaker: "연우 (나)",
    text: "…부재중 17통. 세희한테서. 진태한테서.",
    narration:
      "휴대폰 화면이 떨리는 손 위에서 깜빡였다. 가장 마지막 메시지는 세희였다 — 「오빠 어디야. 진태가 미안하다고…」",
    emotion: "sad",
    choices: [
      {
        label: "휴대폰을 꺼두고, 옆에 누운 그녀를 본다",
        next: "reveal",
        emotion: "passion",
        affection: 2,
      },
      {
        label: "지금 당장 세희에게 전화한다",
        next: "endingTruth",
        emotion: "tense",
        affection: 0,
      },
    ],
  },

  name: {
    id: "name",
    speaker: "하영",
    text: "하영. 이름. 어젯밤엔 「누나」라고 잘만 불렀잖아.",
    narration:
      "그녀가 손가락 끝으로 내 입술을 톡, 건드렸다. 머릿속이 다시 새하얘진다.",
    emotion: "passion",
    clip: "fingertip-lips",
    choices: [
      {
        label: "…누나. 어젯밤에 우리, 진짜 그…",
        next: "pulled",
        emotion: "shy",
        affection: 2,
      },
      {
        label: "장난스럽게 그녀의 손을 잡는다",
        next: "pulled",
        emotion: "happy",
        affection: 1,
      },
      {
        label: "「죄송해요. 가야 할 것 같아요」 — 일어선다",
        next: "endingEscape",
        emotion: "sad",
        affection: -2,
      },
    ],
  },

  shameSpiral: {
    id: "shameSpiral",
    speaker: "하영",
    text: "…그렇게 안 봐도 돼. 어차피 어젯밤에 다 본 사이잖아.",
    narration:
      "그녀의 목소리에 비웃음은 없었다. 다만 한 가지, 내가 모르는 무언가를 그녀만 알고 있다는 확신이 있었다.",
    emotion: "tense",
    choices: [
      {
        label: "「뭘… 봤다는 거죠?」",
        next: "pulled",
        emotion: "shy",
        affection: 0,
      },
      {
        label: "이불을 끌어안고 침대 끝으로 물러난다",
        next: "endingShame",
        emotion: "sad",
        affection: -2,
      },
    ],
  },

  pulled: {
    id: "pulled",
    speaker: "하영",
    text: "…진태가 너 여기까지 데려다 줬어. 「얘 좀 재워줘」 그러더라.",
    narration:
      "그녀의 손이 내 가슴팍 위에 가볍게 얹혔다. 심장이 한 박자, 두 박자, 그녀의 손바닥 아래에서 부서지듯 뛰었다.",
    emotion: "passion",
    clip: "hand-on-chest",
    choices: [
      {
        label: "「누나… 어젯밤, 무슨 일 있었어요?」",
        next: "truthHint",
        emotion: "tense",
        affection: 1,
      },
      {
        label: "그녀의 손등 위에 내 손을 겹친다",
        next: "endingSurrender",
        emotion: "passion",
        affection: 3,
      },
      {
        label: "조용히 그녀를 안는다",
        next: "endingSurrender",
        emotion: "passion",
        affection: 2,
      },
      {
        label: "「누나, 제가 먼저 — 입맞춰도 돼요?」",
        next: "endingSurrender",
        emotion: "passion",
        affection: 4,
        requireAffection: 60,
        lockedHint: "주인공과의 대화로 충분한 신뢰가 쌓이면 열립니다",
      },
    ],
  },

  truthHint: {
    id: "truthHint",
    speaker: "하영",
    text: "…아무 일도 없었어. 네가 너무 곯아떨어져서. 그래서 더 — 궁금했어, 너라는 애가.",
    narration:
      "그녀가 내 귀에 입술을 가까이 대고 속삭였다. 그 거짓말 같은 진실에, 어쩌면 진실 같은 거짓말에, 나는 천천히 눈을 감았다.",
    emotion: "passion",
    choices: [
      {
        label: "「그럼… 지금 알려줘요, 누나」",
        next: "endingSurrender",
        emotion: "passion",
        affection: 3,
      },
      {
        label: "「먼저, 진태한테 전화해야겠어요」",
        next: "endingTruth",
        emotion: "tense",
        affection: 0,
      },
    ],
  },

  // ── Endings ────────────────────────────────────────────────────────────
  endingEscape: {
    id: "endingEscape",
    speaker: "하영",
    text: "…그래. 가. 다음엔, 다음엔 네가 먼저 두드려.",
    narration:
      "현관문을 닫고 계단을 내려오는 동안, 새벽 공기에 머리가 깨질 듯 맑아졌다. 그러나 그녀의 향기는 옷섶에 끈질기게 남아 있었다. — Chapter 1: 도주 엔딩 —",
    emotion: "sad",
    clip: "door-closed",
    end: true,
  },
  endingShame: {
    id: "endingShame",
    speaker: "연우 (나)",
    text: "…그녀를 똑바로 쳐다보지 못한 채, 침대 밑에 흩어진 옷을 모았다.",
    narration:
      "그녀의 시선이 등 뒤에 박힌 채 떨어지지 않았다. 부끄러움은 욕망보다 오래 남았다. — Chapter 1: 부끄러움 엔딩 —",
    emotion: "shy",
    clip: "clothes-floor",
    end: true,
  },
  endingSurrender: {
    id: "endingSurrender",
    speaker: "하영",
    text: "…처음 본 사이라고, 그렇게 말할 수 있겠어? 지금도?",
    narration:
      "야광 별이 박힌 푸른 천장이 천천히 멀어졌다. 그녀의 머리카락이 내 얼굴 위로 쏟아졌다. — Chapter 1: 길들임 엔딩 · 2권으로 계속 —",
    emotion: "passion",
    clip: "ceiling-stars",
    end: true,
  },
  endingTruth: {
    id: "endingTruth",
    speaker: "진태 (전화)",
    text: "…야, 미안하다. 세희랑 나, 진짜 미안하다. 그 누나는… 그냥 너 좀 재워달라고 한 거야.",
    narration:
      "그녀가 부엌에서 커피를 내리는 소리가 들렸다. 나는 휴대폰을 귀에 댄 채, 그녀의 등을 오래 바라보았다. — Chapter 1: 진실 엔딩 —",
    emotion: "tense",
    clip: "kitchen-back",
    end: true,
  },
};

// Chapter table-of-contents per story (for the prologue picker).
// Map a label + entry beat id; locked chapters render as 잠금 in UI.
export type StoryChapter = {
  id: string;
  title: string;
  subtitle?: string;
  beat: string;
  locked: boolean;
};

const storyChapters: Record<string, StoryChapter[]> = {
  "tamed-her-vol1": [
    { id: "ch1", title: "Ch.1 — 눈 떠보니 낯선 여자", subtitle: "낯선 천장, 모르는 어깨선", beat: "start", locked: false },
    { id: "ch2", title: "Ch.2 — 한여름밤의 포르노그라피", subtitle: "주차장의 시선", beat: "start", locked: true },
    { id: "ch3", title: "Ch.3 — 이게 꿈이 아니길…", subtitle: "거울 속의 우리", beat: "start", locked: true },
    { id: "ch4", title: "Ch.4 — 부끄러웠던 첫 섹스", subtitle: "젖은 손가락, 마른 입술", beat: "start", locked: true },
    { id: "ch5", title: "Ch.5 — 밤에 찾아온 여자", subtitle: "창밖의 그림자", beat: "start", locked: true },
  ],
  "secret-contract": [
    { id: "ch1", title: "Ch.1 — 첫 계약", subtitle: "한 달간의 위장", beat: "start", locked: false },
    { id: "ch2", title: "Ch.2 — 무너지는 밤", subtitle: "넥타이가 풀리는 순간", beat: "start", locked: true },
    { id: "ch3", title: "Ch.3 — 마지막 약속", subtitle: "끝나는 날, 울지 마", beat: "start", locked: true },
  ],
  "rooftop-promise": [
    { id: "ch1", title: "Ch.1 — 옥상의 노을", subtitle: "10년 만의 거리", beat: "start", locked: false },
    { id: "ch2", title: "Ch.2 — 졸업식 새벽", subtitle: "교복을 벗는 밤", beat: "start", locked: true },
  ],
};

const defaultChapters: StoryChapter[] = [
  { id: "ch1", title: "Ch.1 — 첫 만남", subtitle: "예상 15~25분 · 분기 ×3", beat: "start", locked: false },
  { id: "ch2", title: "Ch.2 — 흔들리는 거리", subtitle: "이전 챕터 완료 시 해금", beat: "start", locked: true },
  { id: "ch3", title: "Ch.3 — 마지막 밤", subtitle: "이전 챕터 완료 시 해금", beat: "start", locked: true },
];

export function getStoryChapters(storyId: string): StoryChapter[] {
  return storyChapters[storyId] ?? defaultChapters;
}

const storyBeatsRegistry: Record<string, Record<string, StoryBeat>> = {
  "secret-contract": secretContract,
  "ceo-after-hours": secretContract,
  "rooftop-promise": rooftopPromise,
  "tamed-her-vol1": tamedHer,
};

export function getStoryBeats(storyId: string): Record<string, StoryBeat> {
  return storyBeatsRegistry[storyId] ?? defaultBeats;
}
