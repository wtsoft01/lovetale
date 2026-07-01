import charLuna from "@/assets/char-luna.jpg";
import charKaito from "@/assets/char-kaito.jpg";
import charSakura from "@/assets/char-sakura.jpg";
import charEden from "@/assets/char-eden.jpg";
import coverTamedHer from "@/assets/cover-tamed-her.jpg";

export type StoryCategory =
  | "trending"
  | "romance"
  | "office"
  | "fantasy"
  | "forbidden"
  | "ntr"
  | "yandere";

export type Story = {
  id: string;
  title: string;
  tagline: string;
  cover: string;
  category: StoryCategory[];
  heat: 1 | 2 | 3; // 1: 야함, 2: 더 야함, 3: 19+ 하드
  mature: boolean;
  length: string; // "30분", "1시간+"
  plays: number;
  rating: number;
  characterId: string; // 부수적 캐릭터
  synopsis: string;
};

export const stories: Story[] = [
  {
    id: "secret-contract",
    title: "비밀 계약: 한 달간의 위장 연인",
    tagline: "차가운 재벌과의 위험한 거래",
    cover: charKaito,
    category: ["trending", "romance", "office", "forbidden"],
    heat: 3,
    mature: true,
    length: "1시간+",
    plays: 48210,
    rating: 4.9,
    characterId: "kaito",
    synopsis:
      "거액의 빚을 갚기 위해 받아들인 한 달간의 계약 연애. 차가웠던 그가 밤마다 무너지기 시작한다.",
  },
  {
    id: "midnight-library",
    title: "한밤의 도서관, 별의 마녀",
    tagline: "금지된 마법서가 깨어나는 밤",
    cover: charLuna,
    category: ["trending", "fantasy", "romance"],
    heat: 2,
    mature: true,
    length: "1시간+",
    plays: 31980,
    rating: 4.85,
    characterId: "luna",
    synopsis:
      "잠들지 못한 견습 마녀가 너에게만 보여주는 또 다른 얼굴. 별빛 아래에서 봉인이 풀린다.",
  },
  {
    id: "rooftop-promise",
    title: "졸업식 전야, 옥상의 고백",
    tagline: "10년지기 소꿉친구의 첫 밤",
    cover: charSakura,
    category: ["trending", "romance"],
    heat: 2,
    mature: true,
    length: "30분",
    plays: 56021,
    rating: 4.95,
    characterId: "sakura",
    synopsis:
      "친구로 지낸 10년. 졸업식 전날 밤, 옥상에서 그녀가 처음 보여주는 표정.",
  },
  {
    id: "betrayal-knight",
    title: "반역의 밤, 검은 기사의 도주",
    tagline: "왕국을 등진 그의 손이 너를 잡는다",
    cover: charEden,
    category: ["fantasy", "forbidden", "yandere"],
    heat: 3,
    mature: true,
    length: "1시간+",
    plays: 18402,
    rating: 4.8,
    characterId: "eden",
    synopsis:
      "충성을 버린 기사가 너만을 위해 검을 들었다. 추격자들이 다가오는 밤, 그의 집착이 드러난다.",
  },
  {
    id: "ceo-after-hours",
    title: "야근 후, 사장실의 두 번째 얼굴",
    tagline: "엘리베이터가 멈춘 그 밤",
    cover: charKaito,
    category: ["office", "forbidden", "romance"],
    heat: 3,
    mature: true,
    length: "30분",
    plays: 27430,
    rating: 4.78,
    characterId: "kaito",
    synopsis:
      "마지막까지 남아있던 야근 밤, 멈춰버린 엘리베이터 안에서 그가 넥타이를 푼다.",
  },
  {
    id: "twin-betrayal",
    title: "친구의 약혼자, 금지된 한 잔",
    tagline: "결혼식 전날 밤의 비밀",
    cover: charLuna,
    category: ["ntr", "forbidden"],
    heat: 3,
    mature: true,
    length: "1시간+",
    plays: 14021,
    rating: 4.7,
    characterId: "luna",
    synopsis:
      "가장 친한 친구의 약혼자. 결혼식 전날 밤, 그녀가 너에게 마지막 부탁을 한다.",
  },
  {
    id: "tamed-her-vol1",
    title: "길들여진 그 밤 · 1권",
    tagline: "눈 떠보니 낯선 천장, 낯선 여자",
    cover: coverTamedHer,
    category: ["trending", "forbidden", "ntr", "romance"],
    heat: 3,
    mature: true,
    length: "1시간+",
    plays: 73210,
    rating: 4.93,
    characterId: "hayoung",
    synopsis:
      "직장을 그만둔 날, 애인 세희와 친구 진태에 대한 의심으로 폭음한 끝에 정신을 잃었다. 깨어난 곳은 모르는 방. 야광 별이 박힌 푸른 천장 아래, 한 번도 본 적 없는 여자가 너를 내려다보고 있다 — 그녀는 누구이고, 어젯밤 너희 사이에 무슨 일이 있었나.",
  },
];

export const storyCategoryLabels: Record<StoryCategory | "all", string> = {
  all: "전체",
  trending: "🔥 트렌딩",
  romance: "로맨스",
  office: "오피스",
  fantasy: "판타지",
  forbidden: "금단",
  ntr: "NTR",
  yandere: "얀데레",
};

export function getStory(id: string) {
  return stories.find((s) => s.id === id);
}
