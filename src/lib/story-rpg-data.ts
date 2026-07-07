import heroBanner from "@/assets/hero-banner.jpg";
import charHayoung from "@/assets/char-hayoung.jpg";
import charKaito from "@/assets/char-kaito.jpg";
import charLuna from "@/assets/char-luna.jpg";

export type StoryRpgChoice = {
  label: string;
  effect: string;
  tone: string;
  result: string;
  routeHint: string;
  image?: string;
  nextSceneId?: string;
  affectionDelta: number;
  tensionDelta: number;
  trustDelta: number;
};

export type StoryRpgScene = {
  id: string;
  title: string;
  text: string;
  partnerLine: string;
  choices: StoryRpgChoice[];
};

export type StoryRpgAsset = {
  id: string;
  url: string;
  type: "image" | "video";
  tier: "soft" | "warm" | "spicy" | "steamy" | "premium";
  minAffection: number;
  caption: string;
};

export type StoryRpg = {
  id: string;
  title: string;
  subtitle: string;
  leadName: string;
  partnerRole: string;
  mood: string;
  cover: string;
  background: string;
  logline: string;
  sceneTitle: string;
  sceneText: string;
  partnerLine: string;
  affection: number;
  tension: number;
  trust: number;
  currentRoute: string;
  currentChapter: string;
  endings: { unlocked: number; total: number };
  images: { unlocked: number; locked: number };
  visualAssets: StoryRpgAsset[];
  routes: Array<{ name: string; status: string; condition: string; progress: number }>;
  choices: StoryRpgChoice[];
  scenes?: StoryRpgScene[];
  tags: string[];
};

export const storyRpgFallbackImages = [
  { cover: charKaito, background: heroBanner },
  { cover: charHayoung, background: charHayoung },
  { cover: charLuna, background: charLuna },
];
