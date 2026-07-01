import charLuna from "@/assets/char-luna.jpg";
import charKaito from "@/assets/char-kaito.jpg";
import charSakura from "@/assets/char-sakura.jpg";
import charEden from "@/assets/char-eden.jpg";
import charHayoung from "@/assets/char-hayoung.jpg";

export type CharacterCategory =
  | "trending"
  | "female-oriented"
  | "male-oriented"
  | "fantasy"
  | "dark";

export type Character = {
  id: string;
  name: string;
  age: number;
  portrait: string;
  tags: string[];
  intro: string;
  scenario: string;
  categories: CharacterCategory[];
  mature: boolean;
  chats: number;
  rating: number;
};

export const characters: Character[] = [
  {
    id: "luna",
    name: "루나 셀레스트",
    age: 22,
    portrait: charLuna,
    tags: ["다정함", "마법사", "츤데레", "판타지"],
    intro: "별빛 도서관에서 너를 기다리던 견습 마녀.",
    scenario: "잃어버린 별의 조각을 찾는 한밤의 여정",
    categories: ["trending", "male-oriented", "fantasy"],
    mature: false,
    chats: 18420,
    rating: 4.9,
  },
  {
    id: "kaito",
    name: "카이토 렌",
    age: 27,
    portrait: charKaito,
    tags: ["도시", "재벌", "비밀 연애", "지배적"],
    intro: "낮에는 차가운 CEO, 밤에는 너에게만 무너지는 남자.",
    scenario: "비밀 계약 — 한 달간의 연인 행세",
    categories: ["trending", "female-oriented", "dark"],
    mature: true,
    chats: 24180,
    rating: 4.8,
  },
  {
    id: "sakura",
    name: "하루노 사쿠라",
    age: 19,
    portrait: charSakura,
    tags: ["츤데레", "학원물", "달콤함", "소꿉친구"],
    intro: "10년지기 소꿉친구의 갑작스러운 고백.",
    scenario: "졸업식 전날 밤, 옥상에서의 약속",
    categories: ["trending", "male-oriented"],
    mature: false,
    chats: 31002,
    rating: 4.95,
  },
  {
    id: "eden",
    name: "에덴 폰 라이히",
    age: 28,
    portrait: charEden,
    tags: ["기사", "판타지", "충성", "다크"],
    intro: "왕국의 검은 기사, 오직 너만을 위한 검.",
    scenario: "반역의 밤, 너의 손을 잡고 도망치다",
    categories: ["female-oriented", "fantasy", "dark"],
    mature: true,
    chats: 12970,
    rating: 4.85,
  },
  {
    id: "hayoung",
    name: "하영",
    age: 29,
    portrait: charHayoung,
    tags: ["연상", "주인집 누나", "은밀함", "관능", "19+"],
    intro:
      "…언제 일어났니? 어젯밤 일, 진짜 하나도 기억 안 나? 그럼 내가 천천히… 알려줘야겠네.",
    scenario: "낯선 새벽, 모르는 방의 천장과 그녀",
    categories: ["female-oriented", "dark"],
    mature: true,
    chats: 8210,
    rating: 4.92,
  },
];

export const trendingIds = ["sakura", "kaito", "hayoung", "luna"];

export const categoryLabels: Record<CharacterCategory | "all", string> = {
  all: "전체",
  trending: "트렌딩",
  "female-oriented": "여성향",
  "male-oriented": "남성향",
  fantasy: "판타지",
  dark: "Dark · 19+",
};

export function getCharacter(id: string) {
  return characters.find((c) => c.id === id);
}
