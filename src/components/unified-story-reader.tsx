import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Heart,
  Lock,
  MessageCircle,
  Sparkles,
  Send,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  UsersRound,
  Settings2,
  Eye,
  EyeOff,
  Search,
  Phone,
  MoreHorizontal,
  UserRound,
  Bell,
  Type,
  Bot,
  HelpCircle,
  Camera,
  Check,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/_mock/runtime";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { resolveStoryMediaSource } from "@/lib/story-media-url";
import { cn } from "@/lib/utils";
import charEden from "@/assets/char-eden.jpg";
import charHayoung from "@/assets/char-hayoung.jpg";
import charKaito from "@/assets/char-kaito.jpg";
import charLuna from "@/assets/char-luna.jpg";
import charSakura from "@/assets/char-sakura.jpg";
import {
  bumpMyStoryAffection,
  getMyStoryAffection,
} from "@/lib/affection.functions";
import {
  appendReaderChatMessage,
  listReaderChatMessages,
  type ReaderChatMessageRow,
} from "@/lib/reader-chat.functions";
import {
  ASSET_AFFECTION_THRESHOLDS,
  getAffectionStage as getProgressionStage,
  nextAffectionStage,
  stageProgress,
} from "@/lib/affection-progression";
import type { AssetSlot, HeatPreset } from "@/lib/admin-stories-compose.functions";
import { normalizeProseLineBreaks } from "@/lib/text-normalization";

// 분위기 강도 → 필요 호감도 (사용자 화면용 한글 라벨)
const HEAT_INFO: Record<HeatPreset, { label: string; min: number; color: string }> = {
  soft: { label: "잔잔", min: 0, color: "border-slate-400/40 text-slate-300" },
  warm: { label: "따뜻", min: 30, color: "border-amber-400/40 text-amber-300" },
  spicy: { label: "설렘", min: 55, color: "border-rose-400/50 text-rose-300" },
  steamy: {
    label: "뜨거움",
    min: 75,
    color: "border-fuchsia-400/60 text-fuchsia-300",
  },
};

const READER_FONT_OPTIONS = [
  {
    id: "current",
    label: "현재 글씨체",
    fontFamily: "inherit",
    detail: "사이트 기본 글꼴",
  },
  {
    id: "maruburi",
    label: "마루부리",
    fontFamily: "MaruBuri, 'Maru Buri', 'Noto Serif KR', serif",
    detail: "감성적인 웹소설 톤",
  },
  {
    id: "kopub",
    label: "KoPub바탕",
    fontFamily: "'KoPub Batang', 'KoPubWorld Batang', 'Noto Serif KR', serif",
    detail: "긴 본문에 안정적인 바탕체",
  },
] as const;

const LLM_MODEL_OPTIONS = [
  { id: "auto", label: "자동 선택", detail: "등록된 모델 중 상황에 맞게 사용" },
  { id: "deepseek", label: "DeepSeek", detail: "스토리 맥락 대화에 우선 사용" },
  { id: "gpt", label: "ChatGPT", detail: "일반 대화와 균형 잡힌 응답" },
  { id: "gemini", label: "Gemini", detail: "이미지/멀티모달 확장용" },
  { id: "claude", label: "Claude", detail: "차분한 장문 대화" },
] as const;

type ReaderFontId = (typeof READER_FONT_OPTIONS)[number]["id"];
type ReaderLlmId = (typeof LLM_MODEL_OPTIONS)[number]["id"];

type Props = {
  storyId: string;
  title: string;
  cover?: string | null;
  bodyText: string;
  assetSlots: AssetSlot[];
  characterName?: string;
  characterProfiles?: CharacterChatProfile[];
  previewMode?: boolean;
  previewAffection?: number;
  showSlotMarkers?: boolean;
  showAffectionRows?: boolean;
  initialChatOpen?: boolean;
  selectedCharacterId?: string | null;
  nextChapterTitle?: string | null;
  onNextChapter?: () => void;
  onBackToChapters?: () => void;
};

export type CharacterChatProfile = {
  id: string;
  name: string;
  role?: string;
  persona?: string;
  personality?: string;
  speakingStyle?: string;
  relationship?: string;
  notes?: string;
  avatarUrl?: string | null;
  showcaseAssets?: CharacterVisualAsset[];
};

type CharacterVisualAsset = {
  id: string;
  tier: AssetSlot["heat_tier"];
  minAffection: number;
  mediaUrl: string | null;
  mediaType: "image" | "video";
  caption: string;
};

type ReaderCharacterReply = {
  characterName: string;
  avatarUrl?: string | null;
  text: string;
};

type ReaderChatMode = "single" | "group";

type ReaderChatHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  speaker: string;
  avatarUrl?: string | null;
  at: number;
};

type ReaderChatThread = {
  key: string;
  label: string;
  mode: ReaderChatMode;
  avatarUrl?: string | null;
  messages: ReaderChatHistoryMessage[];
};

type ChatPhoneView = "list" | "room";
type AssetGalleryTab = "unlocked" | "locked";
type ChatRewardInput = { delta: number; reason: "chat_message" | "meaningful_chat" | "quest" };

type StoryChatChallenge = {
  id: string;
  label: string;
  prompt: string;
  rewardDelta: number;
};

const MANGA_AVATAR_POOL = [charLuna, charKaito, charSakura, charEden, charHayoung] as const;

function fallbackMangaAvatar(seed: string, index = 0) {
  const sum = Array.from(seed || "lovetale").reduce((acc, char) => acc + char.charCodeAt(0), index);
  return MANGA_AVATAR_POOL[Math.abs(sum) % MANGA_AVATAR_POOL.length];
}

function chatMessageText(message: any) {
  return (message?.parts ?? [])
    .map((part: any) => (part?.type === "text" ? String(part.text ?? "") : ""))
    .join("")
    .trim();
}

function chatRewardForText(text: string, questActive: boolean): ChatRewardInput {
  const clean = text.replace(/\s+/g, " ").trim();
  const hasQuestion = /[?？]|\b왜\b|\b어떻게\b|\b뭐\b|\b어떤\b/.test(clean);
  const hasEmotion = /(좋아|싫어|무서|불안|보고|그리워|미안|고마|궁금|설레|두근|걱정|화나|슬퍼|외로)/.test(clean);
  const isLong = clean.length >= 40;

  if (questActive) return { delta: isLong || hasEmotion ? 4 : 3, reason: "quest" };
  if (isLong && hasEmotion && hasQuestion) return { delta: 3, reason: "meaningful_chat" };
  if (isLong || hasEmotion || hasQuestion) return { delta: 2, reason: "meaningful_chat" };
  return { delta: 1, reason: "chat_message" };
}

function buildChatChallenges(characterName: string, affection: number, excerpt: string): StoryChatChallenge[] {
  const name = characterName || "상대";
  const sceneHint = excerpt.replace(/\s+/g, " ").trim().slice(0, 54);
  const stagePrompt =
    affection >= 75
      ? `${name}에게 지금 가장 숨기고 있는 마음을 물어본다.`
      : affection >= 50
        ? `${name}에게 방금 장면에서 왜 그런 선택을 했는지 조심스럽게 묻는다.`
        : `${name}에게 오늘 처음 기억해줬으면 하는 내 한마디를 남긴다.`;

  return [
    {
      id: "scene-empathy",
      label: "장면 공감",
      prompt: sceneHint
        ? `방금 장면을 읽었어. "${sceneHint}..." 이 순간에 네 마음은 어땠어?`
        : `방금 장면에서 네 마음이 어땠는지 솔직히 말해줘.`,
      rewardDelta: 3,
    },
    {
      id: "character-question",
      label: "마음 묻기",
      prompt: stagePrompt,
      rewardDelta: affection >= 70 ? 4 : 3,
    },
    {
      id: "choice-consult",
      label: "선택 상담",
      prompt: `내가 너에게 더 가까워지려면 지금 어떤 말을 해야 할까?`,
      rewardDelta: 3,
    },
  ];
}

function proactiveCharacterLine(characterName: string, affection: number, excerpt: string) {
  const name = characterName || "상대";
  const scene = excerpt.replace(/\s+/g, " ").trim();
  if (affection >= 75) return `...조금 전 장면, 너도 그냥 넘기지 못했지? 나한테 먼저 물어봐. 이번엔 피하지 않을게.`;
  if (affection >= 50) return `아까부터 네 반응이 신경 쓰였어. 지금 읽은 장면에서 제일 걸리는 게 뭐였어?`;
  if (scene) return `${name}이 조용히 메시지를 보냈다. "방금 읽은 장면, 너는 어떻게 봤어?"`;
  return `${name}에게서 먼저 메시지가 도착했다. "지금 잠깐 얘기할 수 있어?"`;
}

function tierMinForSlot(slot: AssetSlot) {
  switch (slot.heat_tier) {
    case "soft":
      return ASSET_AFFECTION_THRESHOLDS.soft;
    case "warm":
      return ASSET_AFFECTION_THRESHOLDS.warm;
    case "spicy":
      return ASSET_AFFECTION_THRESHOLDS.spicy;
    case "steamy":
      return ASSET_AFFECTION_THRESHOLDS.steamy;
    case "premium":
      return ASSET_AFFECTION_THRESHOLDS.premium;
    default:
      return 0;
  }
}

function displayTierForSlot(slot: AssetSlot): HeatPreset {
  return slot.heat_tier === "premium" ? "steamy" : slot.heat_tier;
}

function isReaderAssetUnlocked(slot: AssetSlot, affection: number) {
  const tier = displayTierForSlot(slot);
  return tier === "soft" || affection >= tierMinForSlot(slot);
}

function chooseSlotForAffection(slots: AssetSlot[], affection: number) {
  if (!slots.length) return null;
  const sorted = [...slots].sort((a, b) => {
    const tierDelta = tierMinForSlot(a) - tierMinForSlot(b);
    if (tierDelta !== 0) return tierDelta;
    return (a.id || "").localeCompare(b.id || "");
  });
  const eligible = sorted.filter((slot) => affection >= tierMinForSlot(slot));
  const pool = eligible.length ? eligible : sorted;
  return pool.reduce<AssetSlot | null>((best, slot) => {
    if (!best) return slot;
    const bestMin = tierMinForSlot(best);
    const slotMin = tierMinForSlot(slot);
    if (slotMin > bestMin) return slot;
    if (slotMin < bestMin) return best;
    if (Boolean(slot.media_url) && !Boolean(best.media_url)) return slot;
    return best;
  }, null);
}

const AFFECTION_STAGES = [
  { min: 0, label: "낯섦", detail: "조용히 관계를 살피는 단계" },
  { min: 30, label: "관심", detail: "가볍게 반응을 주고받는 단계" },
  { min: 55, label: "긴장", detail: "서로의 말에 더 집중하는 단계" },
  { min: 75, label: "몰입", detail: "감정이 본격적으로 깊어지는 단계" },
  { min: 100, label: "최고", detail: "가장 뜨겁게 연결되는 단계" },
] as const;

function getAffectionStage(affection: number) {
  return [...AFFECTION_STAGES]
    .sort((a, b) => a.min - b.min)
    .reduce((best, stage) => (affection >= stage.min ? stage : best), AFFECTION_STAGES[0]);
}

function characterVisualAssetToSlot(asset: CharacterVisualAsset, index: number): AssetSlot {
  return {
    id: asset.id || `character-visual-${index}`,
    offset: 0,
    segment_index: null,
    scene_description: asset.caption || "캐릭터 비주얼",
    heat_tier: asset.tier || "soft",
    media_asset_id: null,
    media_url: asset.mediaUrl,
    media_type: asset.mediaType,
    caption: asset.caption || null,
    source: "manual",
  };
}

// 본문을 슬롯 offset 기준으로 잘라 [{text}, {slot}, {text}...] 배열로
function splitByOffsets(body: string, slots: AssetSlot[]) {
  const sorted = [...slots].sort((a, b) => a.offset - b.offset);
  const out: Array<{ kind: "text"; value: string } | { kind: "slot"; value: AssetSlot }> = [];
  let cursor = 0;
  for (const s of sorted) {
    const off = Math.max(cursor, Math.min(body.length, s.offset));
    if (off > cursor) out.push({ kind: "text", value: body.slice(cursor, off) });
    out.push({ kind: "slot", value: s });
    cursor = off;
  }
  if (cursor < body.length) out.push({ kind: "text", value: body.slice(cursor) });
  return out;
}

function normalizeSpeakerCandidates(candidates: string[] | undefined, fallback?: string) {
  const names = [...(candidates ?? []), fallback ?? ""]
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)
    .filter((name) => !/^(캐릭터 미등록|상대 주인공|주인공|등장인물|남자|여자|그|그녀)$/i.test(name.replace(/\s+/g, "")));
  return Array.from(new Set(names)).sort((a, b) => b.length - a.length);
}

function parseSpeakerLabel(raw: string) {
  const text = raw.trim();
  const match = text.match(/^([가-힣A-Za-z][가-힣A-Za-z0-9 _-]{1,18})\s*[:：]\s*([\s\S]+)$/);
  if (!match) return { speaker: "", text };
  const speaker = match[1].trim();
  if (/^(나|내|독자|사용자|Narrator|나레이터)$/i.test(speaker)) return { speaker: "", text: match[2].trim() };
  return { speaker, text: match[2].trim() };
}

function inferDialogueSpeaker(paragraphs: string[], index: number, candidates: string[]) {
  if (!candidates.length) return "";
  const windowText = paragraphs
    .slice(Math.max(0, index - 2), Math.min(paragraphs.length, index + 3))
    .join(" ")
    .replace(/\s+/g, " ");

  for (const name of candidates) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const attribution = new RegExp(
      `${escaped}\\s*(?:이|가|은|는|도)?\\s*(?:말했다|물었다|대답했다|답했다|속삭였다|중얼거렸다|웃었다|소리쳤다|외쳤다|불렀다|말을 이었다|입을 열었다|고개를 끄덕였다)`,
    );
    if (attribution.test(windowText)) return name;
  }

  for (const name of candidates) {
    if (windowText.includes(name)) return name;
  }

  return candidates[0] ?? "";
}

/**
 * PDF/문서 폭 때문에 생긴 단일 줄바꿈은 접고, 실제 빈 줄 문단만 읽기 단위로 유지한다.
 */
function TextBlock({
  value,
  speakerName,
  speakerCandidates,
  className,
  paragraphClassName,
}: {
  value: string;
  speakerName?: string;
  speakerCandidates?: string[];
  className?: string;
  paragraphClassName?: string;
}) {
  const normalized = normalizeProseLineBreaks(value);
  const paragraphs = normalized.split(/\n{2,}/);
  const candidates = normalizeSpeakerCandidates(speakerCandidates, speakerName);
  return (
    <div data-scene-block className={cn("space-y-5", className)}>
      {paragraphs.map((p, i) => {
        const parsed = parseSpeakerLabel(p);
        const text = (parsed.text || p).trim();
        if (!text) return null;
        const isDialogue = /^[“"'‘『「]/.test(text);
        const isScene = !isDialogue && /(보였|풍경|공기|천장|커튼|방|빛|소리|냄새|기억|느낌|통증|시선|손|눈|입술)/.test(text);
        const inferredSpeaker = parsed.speaker || inferDialogueSpeaker(paragraphs, i, candidates);

        if (isDialogue) {
          return (
            <div
              key={i}
              className="rounded-2xl border border-primary/20 bg-primary/[0.08] px-4 py-3 shadow-[0_12px_36px_rgba(236,72,153,.08)]"
            >
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-primary">
                <span aria-hidden="true">💬</span>
                <span>{inferredSpeaker || "캐릭터 미등록"}</span>
              </div>
              <p className={cn("whitespace-pre-line text-[18px] leading-[2.05] text-white sm:text-[19px]", paragraphClassName)}>
                {text}
              </p>
            </div>
          );
        }

        return (
          <p
            key={i}
            className={cn(
              "whitespace-pre-line text-[17px] leading-[2.08] sm:text-[18px]",
              isScene ? "text-sky-50/82" : "text-white/88",
              paragraphClassName,
            )}
          >
            {isScene && <span className="mr-2 text-sky-300/80" aria-hidden="true">✦</span>}
            {text}
          </p>
        );
      })}
    </div>
  );
}

function useSignedMedia(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const source = resolveStoryMediaSource(path);
    if (!source) {
      setUrl(null);
      return;
    }
    if (source.kind === "direct") {
      setUrl(source.url);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("story-media")
      .createSignedUrl(source.path, 60 * 60)
      .then(({ data }) => !cancelled && setUrl(data?.signedUrl ?? null))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

function SlotRenderer({
  slot,
  affection,
}: {
  slot: AssetSlot;
  affection: number;
}) {
  const tierKey = displayTierForSlot(slot);
  const info = HEAT_INFO[tierKey];
  const minAffection = tierMinForSlot(slot);
  const locked = !isReaderAssetUnlocked(slot, affection);
  const path = slot.media_url ?? slot.media_asset_id; // media_asset_id may be storage path or uuid (not handled here)
  // For now we treat media_url as the only fillable source; media_asset_id resolution is in admin (we pass storage_path to media_url at save).
  const url = useSignedMedia(slot.media_url);

  return (
    <figure
      className={cn(
        "my-4 overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm",
        locked ? "border-dashed border-border/50" : "border-border/50",
      )}
    >
      <div className="relative">
        {locked ? (
          <div className="grid aspect-[16/9] place-items-center bg-gradient-to-br from-muted/40 to-muted/10 text-center p-6">
            <div className="space-y-2">
              <Lock className="mx-auto size-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", info.color)}>
                  {info.label}
                </span>{" "}
                · 호감도 <strong>{minAffection}+</strong> 필요
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                지금 {affection} · {Math.max(0, minAffection - affection)} 더 올리면 열려요
              </p>
            </div>
          </div>
        ) : url ? (
          slot.media_type === "video" ? (
            <video
              src={url}
              autoPlay
              muted
              loop
              playsInline
              controls
              className="w-full"
            />
          ) : (
            <img src={url} alt={slot.scene_description} className="w-full object-cover" />
          )

        ) : (
          <div className="grid aspect-[16/9] place-items-center bg-muted/20 text-center p-6">
            <div className="space-y-2 max-w-md">
              <ImageIcon className="mx-auto size-4 text-primary" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {slot.scene_description}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                (아직 등록된 미디어가 없어요)
              </p>
            </div>
          </div>
        )}
        <Badge
          variant="outline"
          className={cn("absolute top-2 right-2 bg-background/80 text-[10px]", info.color)}
        >
          {info.label}
        </Badge>
      </div>
      {(slot.caption || (!locked && url)) && (
        <figcaption className="px-3 py-2 text-xs text-muted-foreground">
          {slot.caption || slot.scene_description}
        </figcaption>
      )}
    </figure>
  );
}

function ReaderAssetGalleryCard({
  slot,
  affection,
}: {
  slot: AssetSlot;
  affection: number;
}) {
  const tierKey = displayTierForSlot(slot);
  const info = HEAT_INFO[tierKey];
  const minAffection = tierMinForSlot(slot);
  const locked = affection < minAffection;
  const url = useSignedMedia(slot.media_url ?? slot.media_asset_id ?? null);
  const missing = !url;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="relative aspect-[4/3] overflow-hidden bg-white/[0.03]">
        {url ? (
          slot.media_type === "video" ? (
            <video
              src={url}
              muted
              loop
              playsInline
              className={cn("size-full object-cover", locked && "scale-110 blur-md saturate-50")}
            />
          ) : (
            <img
              src={url}
              alt=""
              className={cn("size-full object-cover", locked && "scale-110 blur-md saturate-50")}
            />
          )
        ) : (
          <div className="grid size-full place-items-center">
            <ImageIcon className="size-7 text-white/28" />
          </div>
        )}
        {locked && (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,.22)_0_1px,transparent_1px)] bg-[length:9px_9px] bg-black/45" />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[10px] text-white">
          {locked ? <EyeOff className="size-3 text-rose-300" /> : <Eye className="size-3 text-emerald-300" />}
          {locked ? "잠김" : "열림"}
        </div>
        <Badge
          variant="outline"
          className={cn("absolute right-2 top-2 bg-black/70 text-[10px]", info.color)}
        >
          {info.label}
        </Badge>
      </div>
      <div className="space-y-2 p-3">
        <div className="line-clamp-2 text-xs leading-5 text-white/75">
          {slot.caption || slot.scene_description || (missing ? "등록된 미디어가 없습니다." : "스토리 에셋")}
        </div>
        <div className="flex items-center justify-between text-[11px] text-white/45">
          <span>{slot.media_type === "video" ? "영상" : "이미지"}</span>
          <span>{locked ? `호감도 ${minAffection}+ 필요` : "지금 볼 수 있음"}</span>
        </div>
      </div>
    </article>
  );
}

function ReaderAssetThumb({
  slot,
  affection,
}: {
  slot: AssetSlot;
  affection: number;
}) {
  const tierKey = displayTierForSlot(slot);
  const locked = !isReaderAssetUnlocked(slot, affection);
  const url = useSignedMedia(slot.media_url ?? slot.media_asset_id ?? null);

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      {url ? (
        slot.media_type === "video" ? (
          <video
            src={url}
            muted
            playsInline
            className={cn("size-full object-cover", locked && "scale-110 blur-sm saturate-50")}
          />
        ) : (
          <img
            src={url}
            alt=""
            className={cn("size-full object-cover", locked && "scale-110 blur-sm saturate-50")}
          />
        )
      ) : (
        <div className="grid size-full place-items-center">
          <ImageIcon className="size-5 text-white/25" />
        </div>
      )}
      {locked && (
        <>
          <div className="absolute inset-0 bg-black/38" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,.28)_0_1px,transparent_1px)] bg-[length:8px_8px]" />
          <span className="absolute left-1.5 top-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-white shadow">
            19+
          </span>
        </>
      )}
      {!locked && tierKey === "soft" && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-black shadow">
          OPEN
        </span>
      )}
    </div>
  );
}

function ReaderCharacterVisualStage({
  character,
  slots,
  affection,
  onOpenGallery,
}: {
  character?: CharacterChatProfile;
  slots: AssetSlot[];
  affection: number;
  onOpenGallery?: () => void;
}) {
  const firstUnlocked = slots.find((slot) => isReaderAssetUnlocked(slot, affection));
  const primarySlot = firstUnlocked ?? slots[0] ?? null;
  const primaryUrl = useSignedMedia(primarySlot?.media_url ?? primarySlot?.media_asset_id ?? character?.avatarUrl ?? null);
  const lockedCount = slots.filter((slot) => !isReaderAssetUnlocked(slot, affection)).length;
  const unlockedCount = slots.length - lockedCount;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] shadow-2xl">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="relative min-h-[340px] overflow-hidden bg-black">
          {primaryUrl ? (
            primarySlot?.media_type === "video" ? (
              <video src={primaryUrl} className="size-full object-cover" autoPlay muted loop playsInline />
            ) : (
              <img src={primaryUrl} alt={character?.name ?? "character"} className="size-full object-cover" />
            )
          ) : (
            <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(236,72,153,.35),transparent_34%),linear-gradient(145deg,#09090b,#18181b)]">
              <UserRound className="size-16 text-white/25" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/15 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Character Visual</div>
                <h2 className="mt-1 text-3xl font-extrabold text-white">{character?.name ?? "캐릭터"}</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-white/65">{character?.relationship || character?.role || character?.personality || "호감도에 따라 더 깊은 비주얼이 열립니다."}</p>
              </div>
              <div className="rounded-2xl border border-rose-300/25 bg-rose-500/15 px-4 py-3 text-right">
                <div className="text-[11px] text-rose-100/70">호감도</div>
                <div className="text-2xl font-extrabold text-rose-100">{affection}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
              <div className="text-[11px] text-emerald-100/70">해금</div>
              <div className="mt-1 text-xl font-bold text-emerald-100">{unlockedCount}</div>
            </div>
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-3">
              <div className="text-[11px] text-rose-100/70">잠김</div>
              <div className="mt-1 text-xl font-bold text-rose-100">{lockedCount}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {slots.slice(0, 6).map((slot) => (
              <ReaderAssetThumb key={slot.id} slot={slot} affection={affection} />
            ))}
            {slots.length === 0 && [0, 1, 2].map((item) => (
              <div key={item} className="grid aspect-square place-items-center rounded-xl border border-dashed border-white/10 bg-white/[0.03]">
                <Lock className="size-4 text-white/25" />
              </div>
            ))}
          </div>
          <Button type="button" onClick={onOpenGallery} className="rounded-full">
            누적 콘텐츠 보기
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReaderAmbientBackground({ slot }: { slot: AssetSlot | null }) {
  const url = useSignedMedia(slot?.media_url ?? slot?.media_asset_id ?? null);
  if (!url) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className="h-full w-full scale-110 object-cover opacity-20 blur-md saturate-125 animate-ken-burns"
      />
      <div className="absolute inset-0 bg-background/80" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/75 via-background/88 to-background" />
    </div>
  );
}

function ReaderMessengerAvatar({
  label,
  src,
  group = false,
  className,
}: {
  label: string;
  src?: string | null;
  group?: boolean;
  className?: string;
}) {
  const signedSrc = useSignedMedia(src ?? null);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#f2f2f2] text-sm font-bold text-[#3b2d17]",
        className,
      )}
    >
      {group ? (
        <UsersRound className="size-5 text-[#3b2d17]/70" />
      ) : signedSrc ? (
        <img src={signedSrc} alt="" className="size-full object-cover" />
      ) : (
        <span>{label.trim().slice(0, 1) || "?"}</span>
      )}
    </span>
  );
}

export function UnifiedStoryReader({
  storyId,
  title,
  cover,
  bodyText,
  assetSlots,
  characterName = "캐릭터 미등록",
  characterProfiles,
  previewMode = false,
  previewAffection = 30,
  showSlotMarkers = false,
  showAffectionRows = false,
  initialChatOpen = false,
  selectedCharacterId,
  nextChapterTitle,
  onNextChapter,
  onBackToChapters,
}: Props) {
  const qc = useQueryClient();
  const fetchAff = useServerFn(getMyStoryAffection);
  const bumpAff = useServerFn(bumpMyStoryAffection);
  const [readerMode, setReaderMode] = useState<"reader" | "focus">("reader");

  const affQ = useQuery({
    queryKey: ["story_affection", storyId],
    queryFn: () => fetchAff({ data: { storyId } }),
    enabled: !previewMode,
    staleTime: 30_000,
  });
  const bumpMut = useMutation({
    mutationFn: (reward: { delta: number; reason: string }) =>
      bumpAff({ data: { storyId, delta: reward.delta, reason: reward.reason } }),
    onSuccess: (res) =>
      qc.setQueryData(["story_affection", storyId], {
        affection: res.affection,
        updatedAt: new Date().toISOString(),
      }),
  });

  const affection = previewMode
    ? previewAffection
    : affQ.data?.affection ?? 0;
  const affectionStage = useMemo(() => getProgressionStage(affection), [affection]);
  const nextStage = useMemo(() => nextAffectionStage(affection), [affection]);
  const affectionRows = useMemo(() => [0, 10, 25, 50, 65, 78, 88, 95, 100], []);
  const affectionStageProgress = useMemo(() => stageProgress(affection), [affection]);
  const containerWidth = readerMode === "focus" ? "max-w-3xl" : "max-w-4xl";
  const bodyTextClass =
    readerMode === "focus"
      ? "text-[18px] leading-[2.08] sm:text-[19px]"
      : "text-[17px] leading-[2.02] sm:text-[18px]";
  const visibleSlots = useMemo(() => {
    const groups = new Map<number, AssetSlot[]>();
    for (const slot of assetSlots ?? []) {
      const offset = Math.max(0, Math.min(bodyText.length, Math.round(slot.offset)));
      const current = groups.get(offset) ?? [];
      current.push(slot);
      groups.set(offset, current);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, group]) => {
        const chosen = chooseSlotForAffection(group, affection);
        return chosen ? [chosen] : [];
      });
  }, [assetSlots, bodyText.length, affection]);

  const segments = useMemo(
    () => splitByOffsets(bodyText, visibleSlots),
    [bodyText, visibleSlots],
  );

  const ambientSlot = useMemo(
    () =>
      visibleSlots.find(
        (slot) =>
          slot.media_type !== "video" &&
          Boolean(slot.media_url ?? slot.media_asset_id),
      ) ?? null,
    [visibleSlots],
  );

  const [storyTitle, chapterTitle] = useMemo(() => {
    const parts = title.split(" - ");
    if (parts.length < 2) return [title, title];
    return [parts[0], parts.slice(1).join(" - ")];
  }, [title]);
  const activeVisualCharacter = useMemo(
    () =>
      (characterProfiles ?? []).find((character) => character.id === selectedCharacterId) ??
      (characterProfiles ?? []).find((character) => character.name === characterName) ??
      (characterProfiles ?? [])[0],
    [characterName, characterProfiles, selectedCharacterId],
  );

  const summaryText = useMemo(() => {
    const normalized = normalizeProseLineBreaks(bodyText).replace(/\s+/g, " ").trim();
    return normalized.slice(0, readerMode === "focus" ? 150 : 110);
  }, [bodyText, readerMode]);
  const statusItems = useMemo(() => {
    const charactersForBar = (characterProfiles ?? [])
      .map((character) => character.name?.trim())
      .filter(Boolean)
      .slice(0, 4);
    const names = charactersForBar.length ? charactersForBar : [characterName];
    return [
      { label: "몰입도", value: affection },
      ...names.map((name) => ({ label: `${name} 호감도`, value: affection })),
    ];
  }, [affection, characterName, characterProfiles]);
  const speakerCandidates = useMemo(
    () =>
      normalizeSpeakerCandidates(
        (characterProfiles ?? []).map((character) => character.name ?? ""),
        characterName,
      ),
    [characterName, characterProfiles],
  );

  const packedSlots = useMemo(() => {
    const map = new Map<number, AssetSlot[]>();
    for (const slot of visibleSlots) {
      const offset = Math.max(0, Math.min(bodyText.length, Math.round(slot.offset)));
      const arr = map.get(offset) ?? [];
      arr.push(slot);
      map.set(offset, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([offset, slots]) => ({ offset, slots }));
  }, [visibleSlots, bodyText.length]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(initialChatOpen);
  const [readingExcerpt, setReadingExcerpt] = useState<string>("");
  const [characterReply, setCharacterReply] = useState<ReaderCharacterReply | null>(null);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [assetGalleryOpen, setAssetGalleryOpen] = useState(false);
  const [assetGalleryTab, setAssetGalleryTab] = useState<AssetGalleryTab>("unlocked");
  const [fontPreviewOpen, setFontPreviewOpen] = useState(false);
  const [readerFont, setReaderFont] = useState<ReaderFontId>("maruburi");
  const [chatProfileName, setChatProfileName] = useState("나");
  const [chatProfileBio, setChatProfileBio] = useState("스토리 속 주인공과 대화하며 호감도를 쌓는 독자");
  const [chatProfileImage, setChatProfileImage] = useState<string | null>(null);
  const [chatProfilePrompt, setChatProfilePrompt] = useState("");
  const [chatProfileGenerating, setChatProfileGenerating] = useState(false);
  const [llmModel, setLlmModel] = useState<ReaderLlmId>("auto");
  const signedChatProfileImage = useSignedMedia(chatProfileImage);
  const characterVisualSlots = useMemo(
    () => (activeVisualCharacter?.showcaseAssets ?? []).map(characterVisualAssetToSlot),
    [activeVisualCharacter?.showcaseAssets],
  );
  const mediaAssetSlots = useMemo(
    () => {
      const storySlots = (assetSlots ?? []).filter((slot) => slot.media_url || slot.media_asset_id);
      return characterVisualSlots.length ? characterVisualSlots : storySlots;
    },
    [assetSlots, characterVisualSlots],
  );
  const selectedReaderFont = READER_FONT_OPTIONS.find((option) => option.id === readerFont) ?? READER_FONT_OPTIONS[0];
  const selectedLlmModel = LLM_MODEL_OPTIONS.find((option) => option.id === llmModel) ?? LLM_MODEL_OPTIONS[0];
  const unlockedAssetSlots = useMemo(
    () => mediaAssetSlots.filter((slot) => isReaderAssetUnlocked(slot, affection)),
    [affection, mediaAssetSlots],
  );
  const lockedAssetSlots = useMemo(
    () => mediaAssetSlots.filter((slot) => !isReaderAssetUnlocked(slot, affection)),
    [affection, mediaAssetSlots],
  );
  const unlockedAssetCount = unlockedAssetSlots.length;
  const lockedAssetCount = lockedAssetSlots.length;
  const previewUnlockedAssetSlots = unlockedAssetSlots.slice(0, 6);
  const previewLockedAssetSlots = lockedAssetSlots.slice(0, 6);
  const activeGallerySlots = assetGalleryTab === "unlocked" ? unlockedAssetSlots : lockedAssetSlots;

  // Track which paragraph is currently in viewport for chat scene context.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const t = (visible[0].target as HTMLElement).innerText ?? "";
          if (t.trim().length > 20) setReadingExcerpt(t.slice(0, 600));
        }
      },
      { threshold: [0.3, 0.6] },
    );
    el.querySelectorAll("[data-scene-block]").forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [segments]);

  // Reward affection +1 per minute of reading (lightweight)
  useEffect(() => {
    if (previewMode) return;
    const t = window.setInterval(() => bumpMut.mutate({ delta: 1, reason: "reading_tick" }), 60_000);
    return () => window.clearInterval(t);
  }, [previewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("lovetale.reader.settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        readerFont?: ReaderFontId;
        chatProfileName?: string;
        chatProfileBio?: string;
        chatProfileImage?: string | null;
        llmModel?: ReaderLlmId;
      };
      if (parsed.readerFont === "current" || !parsed.readerFont) {
        setReaderFont("maruburi");
      } else if (READER_FONT_OPTIONS.some((option) => option.id === parsed.readerFont)) {
        setReaderFont(parsed.readerFont);
      }
      if (typeof parsed.chatProfileName === "string") setChatProfileName(parsed.chatProfileName);
      if (typeof parsed.chatProfileBio === "string") setChatProfileBio(parsed.chatProfileBio);
      if (typeof parsed.chatProfileImage === "string" || parsed.chatProfileImage === null) setChatProfileImage(parsed.chatProfileImage);
      if (LLM_MODEL_OPTIONS.some((option) => option.id === parsed.llmModel)) setLlmModel(parsed.llmModel!);
    } catch {
      // Ignore broken local reader settings.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "lovetale.reader.settings",
      JSON.stringify({
        readerFont,
        chatProfileName,
        chatProfileBio,
        chatProfileImage,
        llmModel,
      }),
    );
  }, [chatProfileBio, chatProfileImage, chatProfileName, llmModel, readerFont]);

  async function generateChatProfileImage() {
    if (chatProfileGenerating) return;
    setChatProfileGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");
      const response = await fetch("/api/reader-profile-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: chatProfileName,
          bio: chatProfileBio,
          prompt: chatProfilePrompt,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || payload.reason || "프로필 이미지 생성에 실패했습니다.");
      }
      setChatProfileImage(payload.storagePath || payload.signedUrl || null);
      toast.success("채팅 프로필 이미지를 생성했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "채팅 프로필 이미지 생성에 실패했습니다.");
    } finally {
      setChatProfileGenerating(false);
    }
  }

  function registerChatProfileFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 등록할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setChatProfileImage(String(reader.result ?? "") || null);
      toast.success("채팅 프로필 이미지를 등록했습니다.");
    };
    reader.onerror = () => toast.error("이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  }

  return (
    <div className={cn("relative bg-[#0f0f0f] text-foreground", previewMode ? "min-h-0" : "min-h-dvh")}>
      {!previewMode && <ReaderAmbientBackground slot={ambientSlot} />}
      {/* 읽기 상태바 */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#141413]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1180px] px-4">
          <div className="flex h-12 items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              {onBackToChapters && (
                <button
                  type="button"
                  onClick={onBackToChapters}
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition hover:border-primary/40 hover:text-white"
                  aria-label="회차 선택"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <div className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{chapterTitle}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{storyTitle}</span>
                  <span className="shrink-0">하이퍼챗 준비</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="hidden rounded-full border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-300 sm:inline-flex">
                {affectionStage.label}
              </Badge>
              <div className="hidden items-center gap-1 sm:flex">
                <Button
                  type="button"
                  variant={readerMode === "reader" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReaderMode("reader")}
                  className="h-8 rounded-md px-3 text-xs"
                >
                  리더
                </Button>
                <Button
                  type="button"
                  variant={readerMode === "focus" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReaderMode("focus")}
                  className="h-8 rounded-md px-3 text-xs"
                >
                  집중
                </Button>
              </div>
              {!previewMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setChatOpen(true)}
                  className="h-8 rounded-md border-white/10 bg-white/[0.03] px-3 text-xs"
                >
                  <MessageCircle className="mr-1 size-3.5" />
                  파티챗
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-white/5 bg-[#27272a]">
          <div className="mx-auto flex h-10 max-w-[1180px] items-center gap-3 px-4 text-[12px]">
            <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {statusItems.map((item) => (
                <button key={item.label} type="button" className="flex min-w-[12rem] shrink-0 items-center gap-2 text-white">
                  <span className="whitespace-nowrap font-semibold">{item.label}</span>
                  <Progress value={item.value} className="h-1.5 min-w-24 flex-1 bg-white/10" />
                  <span className="w-6 text-right text-white/70 tabular-nums">{item.value}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAssetPanelOpen(true)}
              className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold text-white transition hover:border-primary/50 hover:bg-primary/15"
              aria-label="읽기 설정 열기"
            >
              <Settings2 className="size-3.5 text-primary" />
              <span className="hidden sm:inline">설정</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 tabular-nums">
                {unlockedAssetCount}/{mediaAssetSlots.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      <Sheet open={assetPanelOpen} onOpenChange={setAssetPanelOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-[#111113] p-0 text-white sm:max-w-[480px]">
          <SheetHeader className="border-b border-white/10 px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-2 text-white">
              <Settings2 className="size-4 text-primary" />
              읽기 설정
            </SheetTitle>
            <SheetDescription className="text-xs leading-5 text-white/50">
              글꼴, 채팅 프로필, AI 모델, 이미지 해금 현황을 한곳에서 확인합니다.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 py-5">
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Type className="size-4 text-primary" />
                  <div className="text-sm font-semibold text-white">글꼴 설정</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/10 bg-white/[0.03] text-xs text-white hover:bg-white/10"
                  onClick={() => setFontPreviewOpen(true)}
                >
                  미리보기
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                {READER_FONT_OPTIONS.map((option) => {
                  const active = option.id === readerFont;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setReaderFont(option.id)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                        active ? "border-primary/70 bg-primary/15" : "border-white/10 bg-white/[0.02] hover:border-primary/40",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-white" style={{ fontFamily: option.fontFamily }}>
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-white/45">{option.detail}</span>
                      </span>
                      {active && <Check className="size-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2">
                <Camera className="size-4 text-primary" />
                <div className="text-sm font-semibold text-white">채팅 프로필</div>
              </div>
              <div className="mt-3 flex items-start gap-3">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
                  {signedChatProfileImage ? (
                    <img src={signedChatProfileImage} alt="" className="size-full object-cover" />
                  ) : (
                    <UserRound className="size-6 text-white/35" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={chatProfileName}
                    onChange={(event) => setChatProfileName(event.target.value)}
                    placeholder="채팅에서 보일 내 이름"
                    className="h-9 border-white/10 bg-white/[0.04] text-white placeholder:text-white/35"
                  />
                  <Input
                    value={chatProfileImage ?? ""}
                    onChange={(event) => setChatProfileImage(event.target.value || null)}
                    placeholder="프로필 이미지 URL"
                    className="h-9 border-white/10 bg-white/[0.04] text-white placeholder:text-white/35"
                  />
                  <Textarea
                    value={chatProfileBio}
                    onChange={(event) => setChatProfileBio(event.target.value)}
                    placeholder="AI가 참고할 내 대화 프로필"
                    className="min-h-20 resize-none border-white/10 bg-white/[0.04] text-xs leading-5 text-white placeholder:text-white/35"
                  />
                  <Textarea
                    value={chatProfilePrompt}
                    onChange={(event) => setChatProfilePrompt(event.target.value)}
                    placeholder="AI 이미지 생성 요청: 예) 차분한 웹툰풍 프로필, 부드러운 조명, 또렷한 얼굴"
                    className="min-h-16 resize-none border-white/10 bg-white/[0.04] text-xs leading-5 text-white placeholder:text-white/35"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={chatProfileGenerating}
                      onClick={generateChatProfileImage}
                      className="h-9 border-primary/30 bg-primary/10 text-xs text-white hover:bg-primary/20"
                    >
                      {chatProfileGenerating ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Sparkles className="mr-1 size-3.5" />}
                      AI 생성
                    </Button>
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-white transition hover:bg-white/10">
                      이미지 등록
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          registerChatProfileFile(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                <div className="text-sm font-semibold text-white">LLM 모델 설정</div>
              </div>
              <div className="mt-3 grid gap-2">
                {LLM_MODEL_OPTIONS.map((option) => {
                  const active = option.id === llmModel;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setLlmModel(option.id)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                        active ? "border-primary/70 bg-primary/15" : "border-white/10 bg-white/[0.02] hover:border-primary/40",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-white">{option.label}</span>
                        <span className="mt-0.5 block text-[11px] text-white/45">{option.detail}</span>
                      </span>
                      {active && <Check className="size-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/40">
                현재 선택: {selectedLlmModel.label}. 실제 호출은 등록된 관리자 LLM API 정책을 우선 따릅니다.
              </p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-primary" />
                <div className="text-sm font-semibold text-white">이용방법</div>
              </div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-white/55">
                <p>본문을 읽다가 하단 채팅창으로 주인공에게 말을 걸면 호감도가 쌓입니다.</p>
                <p>호감도가 오르면 잠긴 이미지와 영상이 순서대로 열립니다.</p>
                <p>왼쪽 휴대폰형 대화기록에서 친구목록과 채팅방을 오가며 이전 대화를 확인할 수 있습니다.</p>
                <p>글꼴과 채팅 프로필은 이 브라우저에 저장되어 다음 방문에도 유지됩니다.</p>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-primary" />
                  <div className="text-sm font-semibold text-white">이미지 해금 현황</div>
                </div>
                <div className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/70">
                  호감도 {affection}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-emerald-200">해금된 이미지 {unlockedAssetCount}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetGalleryTab("unlocked");
                      setAssetGalleryOpen(true);
                    }}
                    className="text-[11px] font-semibold text-white/55 transition hover:text-white"
                  >
                    전체보기
                  </button>
                </div>
                {previewUnlockedAssetSlots.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {previewUnlockedAssetSlots.map((slot) => (
                      <ReaderAssetThumb key={slot.id} slot={slot} affection={affection} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] py-6 text-center text-xs text-white/45">
                    아직 해금된 이미지가 없습니다.
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-rose-200">잠긴 이미지 {lockedAssetCount}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetGalleryTab("locked");
                      setAssetGalleryOpen(true);
                    }}
                    className="text-[11px] font-semibold text-white/55 transition hover:text-white"
                  >
                    전체보기
                  </button>
                </div>
                {previewLockedAssetSlots.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {previewLockedAssetSlots.map((slot) => (
                      <ReaderAssetThumb key={slot.id} slot={slot} affection={affection} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] py-6 text-center text-xs text-white/45">
                    잠긴 이미지가 없습니다.
                  </div>
                )}
              </div>
            </section>

            {false && (
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" />
                <div className="text-sm font-semibold text-white">이미지 해금 현황</div>
              </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[11px] text-white/45">전체</div>
                <div className="mt-1 text-xl font-semibold text-white">{mediaAssetSlots.length}</div>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <div className="text-[11px] text-emerald-200/70">열림</div>
                <div className="mt-1 text-xl font-semibold text-emerald-200">{unlockedAssetCount}</div>
              </div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3">
                <div className="text-[11px] text-rose-200/70">잠김</div>
                <div className="mt-1 text-xl font-semibold text-rose-200">{lockedAssetCount}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Heart className="size-4 fill-primary text-primary" />
                현재 호감도 {affection}
              </div>
              <p className="mt-2 text-xs leading-5 text-white/55">
                잠긴 이미지는 실제 내용이 보이지 않도록 모자이크 처리됩니다. 대화를 이어가면 호감도가 쌓이고 더 높은 단계의 장면을 열 수 있습니다.
              </p>
            </div>

            {mediaAssetSlots.length ? (
              <div className="grid grid-cols-2 gap-3">
                {mediaAssetSlots.map((slot) => (
                  <ReaderAssetGalleryCard key={slot.id} slot={slot} affection={affection} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center">
                <ImageIcon className="mx-auto size-8 text-white/25" />
                <div className="mt-3 text-sm font-semibold text-white">등록된 이미지가 없습니다</div>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  관리자 에셋편집에서 호감도별 이미지나 영상을 등록하면 이곳에 표시됩니다.
                </p>
              </div>
            )}
            </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={assetGalleryOpen} onOpenChange={setAssetGalleryOpen}>
        <DialogContent className="max-h-[86vh] max-w-4xl overflow-hidden border-white/10 bg-[#111113] p-0 text-white">
          <DialogHeader className="border-b border-white/10 px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              이미지 전체보기
            </DialogTitle>
            <DialogDescription className="text-white/50">
              해금된 이미지와 잠긴 이미지를 탭으로 나누어 확인합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b border-white/10 px-5 py-3">
            <div className="grid grid-cols-2 rounded-2xl bg-white/[0.06] p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setAssetGalleryTab("unlocked")}
                className={cn(
                  "rounded-xl px-3 py-2 transition",
                  assetGalleryTab === "unlocked" ? "bg-white text-black" : "text-white/55 hover:text-white",
                )}
              >
                해금된 이미지 {unlockedAssetCount}
              </button>
              <button
                type="button"
                onClick={() => setAssetGalleryTab("locked")}
                className={cn(
                  "rounded-xl px-3 py-2 transition",
                  assetGalleryTab === "locked" ? "bg-white text-black" : "text-white/55 hover:text-white",
                )}
              >
                잠긴 이미지 {lockedAssetCount}
              </button>
            </div>
          </div>

          <div className="max-h-[58vh] overflow-y-auto px-5 py-5">
            {activeGallerySlots.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {activeGallerySlots.map((slot) => (
                  <ReaderAssetGalleryCard key={slot.id} slot={slot} affection={affection} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-10 text-center">
                <ImageIcon className="mx-auto size-8 text-white/25" />
                <div className="mt-3 text-sm font-semibold text-white">
                  {assetGalleryTab === "unlocked" ? "해금된 이미지가 없습니다." : "잠긴 이미지가 없습니다."}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fontPreviewOpen} onOpenChange={setFontPreviewOpen}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#141413] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Type className="size-4 text-primary" />
              글꼴 미리보기
            </DialogTitle>
            <DialogDescription className="text-white/50">
              선택한 글꼴이 긴 본문과 대화문에서 어떻게 보이는지 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
            <div className="flex flex-wrap gap-2">
              {READER_FONT_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={option.id === readerFont ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReaderFont(option.id)}
                  className="h-8 rounded-full text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div style={{ fontFamily: selectedReaderFont.fontFamily }} className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Preview</div>
                <h3 className="mt-2 text-3xl font-bold leading-tight">눈 떠보니 낯선 여자</h3>
                <p className="mt-2 text-sm leading-7 text-white/55">
                  낯선 천장, 흐릿한 기억, 그리고 설명할 수 없는 체온. 독자는 문장 사이의 숨을 따라가며 주인공의 감정에 천천히 들어갑니다.
                </p>
              </div>
              <div className="border-t border-white/10 pt-4 text-[18px] leading-[2.05] text-white/90">
                <p>세상의 모든 시간이 멈추어진 것만 같았던 적막한 느낌이 얼마나 오랫동안 계속된 것일까.</p>
                <p className="mt-4">“여기가 어디지? 어젯밤에 도대체 얼마나 마신 거지?”</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main
        ref={containerRef}
        style={{ fontFamily: selectedReaderFont.fontFamily }}
        className={cn("relative z-10 mx-auto px-5 pt-10", readerMode === "focus" ? "max-w-[768px]" : "max-w-[880px]", previewMode ? "pb-8" : "pb-40")}
      >
        {cover && (
          <div className="pointer-events-none absolute inset-x-5 top-0 -z-10 h-[440px] overflow-hidden rounded-[2rem] opacity-25 blur-[1px]">
            <img src={cover} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f0f]/20 via-[#0f0f0f]/75 to-[#0f0f0f]" />
          </div>
        )}

        <section className="mb-10 border-b border-white/10 pb-8 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 text-[10px] tracking-[0.18em] text-primary">
              EPISODE
            </Badge>
            <Badge variant="outline" className="rounded-full border-white/10 bg-white/[0.03] text-[10px] text-white/60">
              {readerMode === "focus" ? "집중 읽기" : "스토리 읽기"}
            </Badge>
            <Badge variant="outline" className="rounded-full border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-300">
              호감도 {affectionStage.label}
            </Badge>
          </div>
          <div className="mt-5 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              {storyTitle}
            </div>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-white md:text-[3.4rem]">{chapterTitle}</h1>
            <p className={cn("mt-5 max-w-3xl text-white/55", readerMode === "focus" ? "text-base leading-8" : "text-sm leading-7")}>
              {affectionStage.description}{summaryText ? ` · ${summaryText}` : ""}
            </p>
            <div className="mt-5 max-w-sm space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/45">
                <span>호감도 {affection}</span>
                <span>{nextStage ? `${nextStage.label}까지 ${Math.max(0, nextStage.min - affection)}` : "최고 단계"}</span>
              </div>
              <Progress value={affectionStageProgress} className="h-1.5 bg-white/10" />
            </div>
          </div>
        </section>

        {showAffectionRows && (
          <section className="mb-4 rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">호감도별 미리보기</div>
                <div className="text-[11px] text-muted-foreground">등록된 에셋이 각 호감도에서 열리는지 빠르게 확인합니다.</div>
              </div>
              <div className="text-[11px] text-muted-foreground">현재 {affection}</div>
            </div>
            <div className="space-y-3">
              {affectionRows.map((rowAffection) => (
                <div key={rowAffection} className="rounded-md border border-border/70 bg-background p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>호감도 {rowAffection}</span>
                    <span>{rowAffection <= affection ? "노출" : "잠금"}</span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(assetSlots ?? []).length ? (
                      (assetSlots ?? []).map((slot) => (
                        <div key={`row-${rowAffection}-s-${slot.id}`} className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-2">
                          <SlotRenderer slot={slot} affection={rowAffection} />
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">등록된 에셋이 없습니다.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mb-8 text-center text-sm text-white/35">
          이 이야기는 AI와 콘텐츠가 함께 구성하는 가상의 몰입형 스토리입니다.
        </div>

        {characterReply && (
          <section className="mb-9 rounded-3xl border border-primary/20 bg-black/55 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/30 bg-white/[0.04]">
                {characterReply.avatarUrl ? (
                  <img src={characterReply.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-primary">
                    {characterReply.characterName.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{characterReply.characterName}</div>
                <div className="text-[11px] text-white/40">방금 답변</div>
              </div>
              <button
                type="button"
                onClick={() => setCharacterReply(null)}
                className="ml-auto grid size-8 place-items-center rounded-full border border-white/10 text-white/50 transition hover:text-white"
                aria-label="답변 닫기"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="whitespace-pre-line text-[15px] leading-8 text-white/86">{characterReply.text}</p>
          </section>
        )}

        <ReaderCharacterVisualStage
          character={activeVisualCharacter}
          slots={mediaAssetSlots}
          affection={affection}
          onOpenGallery={() => {
            setAssetGalleryTab("unlocked");
            setAssetGalleryOpen(true);
          }}
        />

        <article className={cn("wrtn-like-reader space-y-9", readerMode === "focus" ? "max-w-none" : "max-w-none")}>
          {segments.map((seg, i) =>
            seg.kind === "text" ? (
              <TextBlock
                key={`t${i}`}
                value={seg.value}
                speakerName={characterName}
                speakerCandidates={speakerCandidates}
                className={readerMode === "focus" ? "space-y-5" : "space-y-4"}
                paragraphClassName={bodyTextClass}
              />
            ) : (
              <div key={seg.value.id} className="space-y-2">
                {showSlotMarkers && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-0.5">본문 위치 {Math.max(0, seg.value.offset).toLocaleString()}</span>
                    <span>호감도 {seg.value.heat_tier}</span>
                  </div>
                )}
                <SlotRenderer slot={seg.value} affection={affection} />
              </div>
            ),
          )}
          {segments.length === 0 && (
            <p className="text-muted-foreground text-sm">아직 본문이 등록되지 않았어요.</p>
          )}
        </article>

        {!previewMode && onNextChapter && (
          <section className="mt-12 overflow-hidden rounded-3xl border border-primary/20 bg-card/85 p-5 shadow-glow backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-[10px] text-primary">
                  다 읽었어요
                </Badge>
                <h3 className="mt-3 text-xl font-semibold leading-tight">다음화로 이어볼까요?</h3>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                  {nextChapterTitle ? `다음 이야기: ${nextChapterTitle}` : "이어지는 회차를 바로 열어볼 수 있어요."}
                </p>
              </div>
              <Button type="button" onClick={onNextChapter} className="shrink-0 rounded-full px-5">
                다음화 보기
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </section>
        )}

        {showSlotMarkers && packedSlots.length > 0 && (
          <section className="mt-6 rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">에셋 위치 인덱스</div>
            <div className="space-y-2">
              {packedSlots.map((pack, index) => (
                <div key={pack.offset} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                  <span className="w-10 shrink-0 rounded-full bg-muted px-2 py-0.5 text-center">#{index + 1}</span>
                  <span className="w-24 shrink-0 text-muted-foreground">본문 {pack.offset.toLocaleString()}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {pack.slots.map((slot) => (
                      <span key={slot.id} className="rounded-full border border-border px-2 py-0.5">
                        {slot.heat_tier}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {!previewMode && (
        <ReaderCharacterChatPanel
          storyId={storyId}
          characterName={characterName}
          characterProfiles={characterProfiles}
          selectedCharacterId={selectedCharacterId}
          affection={affection}
          readingExcerpt={readingExcerpt || bodyText.slice(0, 600)}
          open={chatOpen}
          onOpenChange={setChatOpen}
          previewMode={previewMode}
          readerMode={readerMode}
          chatProfileName={chatProfileName}
          chatProfileBio={chatProfileBio}
          chatProfileImage={chatProfileImage}
          llmModel={llmModel}
          onReply={setCharacterReply}
          onChatReward={(reward) =>
            bumpMut.mutate({
              delta: reward?.delta ?? 2,
              reason: reward?.reason ?? "meaningful_chat",
            })
          }
        />
      )}
    </div>
  );
}

const transport = new DefaultChatTransport({
  api: "/api/character-chat",
  headers: (): Record<string, string> => {
    const key = `sb-${
      (import.meta.env.VITE_SUPABASE_URL as string)
        ?.match(/https?:\/\/([^.]+)/)?.[1] ?? ""
    }-auth-token`;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      const token = parsed?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  },
});

function ReaderCharacterChatPanel({
  storyId,
  characterName,
  characterProfiles,
  selectedCharacterId,
  affection,
  readingExcerpt,
  open,
  onOpenChange,
  previewMode,
  readerMode,
  chatProfileName,
  chatProfileBio,
  chatProfileImage,
  llmModel,
  onReply,
  onChatReward,
}: {
  storyId: string;
  characterName: string;
  characterProfiles?: CharacterChatProfile[];
  selectedCharacterId?: string | null;
  affection: number;
  readingExcerpt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewMode: boolean;
  readerMode: "reader" | "focus";
  chatProfileName: string;
  chatProfileBio: string;
  chatProfileImage: string | null;
  llmModel: ReaderLlmId;
  onReply: (reply: ReaderCharacterReply | null) => void;
  onChatReward: (reward?: ChatRewardInput) => void;
}) {
  const cleanCharacters = useMemo<CharacterChatProfile[]>(() => {
    const rows = (characterProfiles ?? [])
      .map((character, index) => ({
        ...character,
        id: String(character.id || character.name || `character-${index + 1}`),
        name: String(character.name || characterName || "캐릭터").trim(),
      }))
      .filter((character) => character.name && character.name !== "캐릭터 미등록");

    return rows.length
      ? rows
      : [{ id: "main-character", name: characterName || "캐릭터", avatarUrl: null }];
  }, [characterName, characterProfiles]);

  const chatCharacters = useMemo(
    () =>
      cleanCharacters.map((character, index) => ({
        ...character,
        avatarUrl: character.avatarUrl || fallbackMangaAvatar(`${character.id}:${character.name}`, index),
      })),
    [cleanCharacters],
  );

  const initialCharacterId =
    selectedCharacterId && chatCharacters.some((character) => character.id === selectedCharacterId)
      ? selectedCharacterId
      : chatCharacters[0]?.id ?? "main-character";
  const [activeCharacterId, setActiveCharacterId] = useState(initialCharacterId);
  const [draft, setDraft] = useState("");
  const [lastReward, setLastReward] = useState(false);
  const [chatMode, setChatMode] = useState<ReaderChatMode>("single");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phoneTab, setPhoneTab] = useState<"friends" | "chats">("chats");
  const [phoneView, setPhoneView] = useState<ChatPhoneView>("list");
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ReaderChatThread>>({});
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const pendingThreadRef = useRef<ReaderChatThread | null>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);
  const proactiveThreadRef = useRef<Record<string, boolean>>({});
  const hydratedRef = useRef(false);
  const notificationAudioRef = useRef<AudioContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeCharacter =
    chatCharacters.find((character) => character.id === activeCharacterId) ?? chatCharacters[0];
  const activeCharacterName = activeCharacter?.name || characterName || "캐릭터";
  const activeAvatarSource = activeCharacter?.avatarUrl ?? null;
  const activeAvatarUrl = useSignedMedia(activeAvatarSource);
  const activeCharacterVisualSlots = useMemo(
    () => (activeCharacter?.showcaseAssets ?? []).map(characterVisualAssetToSlot),
    [activeCharacter?.showcaseAssets],
  );
  const hasMultipleCharacters = chatCharacters.length > 1;
  const targetLabel = chatMode === "group" ? "단체채팅" : activeCharacterName;
  const threadKey = chatMode === "group" ? "group" : `single:${activeCharacter?.id ?? "main-character"}`;
  const dockWidthClass = readerMode === "focus" ? "max-w-[768px]" : "max-w-[880px]";
  const selectedCharacters = chatMode === "group" ? chatCharacters : [activeCharacter].filter(Boolean);

  const { messages, sendMessage, status } = useChat({
    id: `story-${storyId}-${threadKey}`,
    transport,
  });
  const isStreaming = status === "submitted" || status === "streaming";
  const latestAssistantMessage = useMemo(() => {
    const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
    const text = chatMessageText(assistantMessage);
    return assistantMessage && text ? { id: assistantMessage.id, text } : null;
  }, [messages]);

  const fetchReaderChats = useServerFn(listReaderChatMessages);
  const appendReaderChat = useServerFn(appendReaderChatMessage);
  const chatHistoryQ = useQuery({
    queryKey: ["reader_chat_messages", storyId],
    queryFn: () => fetchReaderChats({ data: { storyId, limit: 240 } }),
    enabled: !previewMode && Boolean(storyId),
    staleTime: 30_000,
  });
  const saveChatMutation = useMutation({
    mutationFn: (data: {
      storyId: string;
      role: "user" | "assistant";
      text: string;
      threadKey: string;
      threadLabel: string;
      chatMode: ReaderChatMode;
      characterId?: string | null;
      characterName: string;
      avatarUrl?: string | null;
      affectionAt?: number | null;
    }) => appendReaderChat({ data }),
    onError: (error) => console.warn("[reader-chat] failed to save chat message", error),
  });

  const threadList = useMemo<ReaderChatThread[]>(() => {
    const singles = chatCharacters.map((character) => {
      const key = `single:${character.id}`;
      return (
        threads[key] ?? {
          key,
          label: character.name,
          mode: "single" as ReaderChatMode,
          avatarUrl: character.avatarUrl ?? null,
          messages: [],
        }
      );
    });
    const groupThread =
      threads.group ?? {
        key: "group",
        label: "단체채팅",
        mode: "group" as ReaderChatMode,
        avatarUrl: null,
        messages: [],
      };
    return hasMultipleCharacters ? [...singles, groupThread] : singles;
  }, [chatCharacters, hasMultipleCharacters, threads]);

  const activeThread =
    threadList.find((thread) => thread.key === threadKey) ?? threadList[0];
  const totalUnread = useMemo(
    () => Object.values(unreadByThread).reduce((sum, count) => sum + count, 0),
    [unreadByThread],
  );
  const chattedFriends = useMemo(() => {
    const talkedIds = new Set(
      Object.values(threads)
        .filter((thread) => thread.mode === "single" && thread.messages.length > 0)
        .map((thread) => thread.key.replace(/^single:/, "")),
    );
    const friends = chatCharacters.filter((character) => talkedIds.has(character.id));
    return friends.length ? friends : chatCharacters.slice(0, Math.min(4, chatCharacters.length));
  }, [chatCharacters, threads]);
  const quickPrompts = useMemo(
    () => [
      "지금 장면에서 네 마음은 어때?",
      "내가 어떤 선택을 하면 좋을까?",
      "나에게만 힌트를 줘.",
      "조금 더 가까워지고 싶어.",
    ],
    [],
  );
  const chatChallenges = useMemo(
    () => buildChatChallenges(activeCharacterName, affection, readingExcerpt),
    [activeCharacterName, affection, readingExcerpt],
  );
  const activeChallenge = chatChallenges.find((challenge) => challenge.id === activeChallengeId) ?? null;
  const nextGoal = affection < 30 ? 30 : affection < 55 ? 55 : affection < 75 ? 75 : 100;
  const affectionGap = Math.max(0, nextGoal - affection);

  useEffect(() => {
    if (selectedCharacterId && chatCharacters.some((character) => character.id === selectedCharacterId)) {
      setActiveCharacterId(selectedCharacterId);
      setChatMode("single");
      onOpenChange(true);
    }
  }, [chatCharacters, onOpenChange, selectedCharacterId]);

  useEffect(() => {
    if (!chatCharacters.some((character) => character.id === activeCharacterId)) {
      setActiveCharacterId(chatCharacters[0]?.id ?? "main-character");
    }
  }, [activeCharacterId, chatCharacters]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeThread?.messages.length, isStreaming, latestAssistantMessage?.text]);

  useEffect(() => {
    if (open && historyOpen && phoneTab === "chats") clearThreadUnread(threadKey);
  }, [historyOpen, open, phoneTab, threadKey]);

  useEffect(() => {
    if (previewMode || !open || proactiveThreadRef.current[threadKey]) return;
    if ((activeThread?.messages.length ?? 0) > 0) return;
    proactiveThreadRef.current[threadKey] = true;
    const timer = window.setTimeout(() => {
      const thread = makeThread(threadKey, targetLabel, chatMode, chatMode === "group" ? null : activeAvatarSource);
      const message = {
        role: "assistant" as const,
        speaker: thread.label,
        avatarUrl: thread.avatarUrl ?? null,
        text: proactiveCharacterLine(thread.label, affection, readingExcerpt),
      };
      appendThreadMessage(thread, message);
      persistThreadMessage(thread, message);
      playNotification();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    activeAvatarSource,
    activeThread?.messages.length,
    affection,
    chatMode,
    open,
    previewMode,
    readingExcerpt,
    targetLabel,
    threadKey,
  ]);

  useEffect(() => {
    if (hydratedRef.current || !chatHistoryQ.data?.length) return;
    const next: Record<string, ReaderChatThread> = {};

    for (const row of chatHistoryQ.data as ReaderChatMessageRow[]) {
      const key = row.threadKey || "single:main-character";
      const label = row.threadLabel || row.characterName || "캐릭터";
      const current = next[key] ?? {
        key,
        label,
        mode: row.chatMode === "group" ? "group" : ("single" as ReaderChatMode),
        avatarUrl: row.avatarUrl ?? null,
        messages: [],
      };
      current.messages.push({
        id: row.id,
        role: row.role,
        text: row.text,
        speaker: row.role === "user" ? "나" : row.characterName || label,
        avatarUrl: row.role === "assistant" ? row.avatarUrl ?? current.avatarUrl ?? null : null,
        at: new Date(row.createdAt).getTime() || Date.now(),
      });
      next[key] = { ...current, messages: current.messages.slice(-80) };
    }

    setThreads((prev) => ({ ...next, ...prev }));
    hydratedRef.current = true;
  }, [chatHistoryQ.data]);

  useEffect(() => {
    if (!latestAssistantMessage || latestAssistantMessage.id === lastAssistantMessageIdRef.current) return;
    if (isStreaming) return;
    lastAssistantMessageIdRef.current = latestAssistantMessage.id;
    const thread =
      pendingThreadRef.current ??
      makeThread(threadKey, targetLabel, chatMode, chatMode === "group" ? null : activeAvatarSource);
    const message = {
      role: "assistant" as const,
      speaker: thread.label,
      avatarUrl: thread.avatarUrl ?? null,
      text: latestAssistantMessage.text,
    };
    appendThreadMessage(thread, message);
    persistThreadMessage(thread, message);
    onReply({
      characterName: thread.label,
      avatarUrl: thread.mode === "group" ? null : thread.avatarUrl,
      text: latestAssistantMessage.text,
    });
    playNotification();
    toast(`${thread.label} 답장`, {
      description: latestAssistantMessage.text.slice(0, 72),
      icon: <Bell className="size-4 text-primary" />,
    });
  }, [activeAvatarSource, chatMode, isStreaming, latestAssistantMessage, onReply, targetLabel, threadKey]);

  function makeThread(key: string, label: string, mode: ReaderChatMode, avatarUrl?: string | null): ReaderChatThread {
    return { key, label, mode, avatarUrl: avatarUrl ?? null, messages: [] };
  }

  function appendThreadMessage(
    thread: ReaderChatThread,
    message: Omit<ReaderChatHistoryMessage, "id" | "at">,
  ) {
    setThreads((prev) => {
      const current = prev[thread.key] ?? thread;
      return {
        ...prev,
        [thread.key]: {
          ...current,
          label: thread.label,
          avatarUrl: thread.avatarUrl ?? current.avatarUrl ?? null,
          messages: [
            ...current.messages,
            { ...message, id: `${thread.key}-${Date.now()}-${current.messages.length}`, at: Date.now() },
          ].slice(-80),
        },
      };
    });

    if (message.role === "assistant" && (thread.key !== threadKey || !open || !historyOpen || phoneTab !== "chats")) {
      setUnreadByThread((prev) => ({ ...prev, [thread.key]: (prev[thread.key] ?? 0) + 1 }));
    }
  }

  function persistThreadMessage(
    thread: ReaderChatThread,
    message: Omit<ReaderChatHistoryMessage, "id" | "at">,
  ) {
    if (previewMode) return;
    saveChatMutation.mutate({
      storyId,
      role: message.role,
      text: message.text,
      threadKey: thread.key,
      threadLabel: thread.label,
      chatMode: thread.mode,
      characterId: thread.mode === "group" ? "group" : thread.key.replace(/^single:/, ""),
      characterName: thread.label,
      avatarUrl: thread.avatarUrl ?? null,
      affectionAt: affection,
    });
  }

  async function send() {
    if (!draft.trim() || isStreaming) return;
    if (previewMode) {
      toast.info("미리보기에서는 채팅을 전송하지 않습니다.");
      setDraft("");
      return;
    }

    const text = draft.trim();
    setDraft("");
    const thread = makeThread(threadKey, targetLabel, chatMode, chatMode === "group" ? null : activeAvatarSource);
    pendingThreadRef.current = thread;
    const userMessage = {
      role: "user" as const,
      speaker: "나",
      avatarUrl: null,
      text,
    };
    appendThreadMessage(thread, userMessage);
    persistThreadMessage(thread, userMessage);
    setHistoryOpen(true);
    setPhoneTab("chats");
    setPhoneView("room");

    await sendMessage(
      { text },
      {
        body: {
          storyId,
          sceneExcerpt: readingExcerpt,
          affection,
          chatMode,
          challengeId: activeChallenge?.id ?? null,
          engagementIntent: activeChallenge?.label ?? null,
          characterId: chatMode === "group" ? "group" : activeCharacter?.id,
          characterName: targetLabel,
          characterProfile: chatMode === "group" ? { name: "단체채팅", characters: selectedCharacters } : activeCharacter,
          selectedCharacters,
          readerProfile: {
            name: chatProfileName,
            bio: chatProfileBio,
            image: chatProfileImage,
          },
          preferredLlmModel: llmModel,
        },
      },
    );
    const baseReward = chatRewardForText(text, Boolean(activeChallenge));
    const reward = activeChallenge
      ? { ...baseReward, delta: Math.max(baseReward.delta, activeChallenge.rewardDelta) }
      : baseReward;
    onChatReward(reward);
    if (activeChallenge) {
      toast.success(`${activeChallenge.label} 완료`, {
        description: `호감도 보상 +${reward.delta}`,
        icon: <Check className="size-4 text-emerald-400" />,
      });
      setActiveChallengeId(null);
    }
    setLastReward(true);
    window.setTimeout(() => setLastReward(false), 1600);
  }

  function clearThreadUnread(key: string) {
    setUnreadByThread((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function openThread(key: string) {
    clearThreadUnread(key);
    if (key === "group") {
      setChatMode("group");
    } else {
      setChatMode("single");
      setActiveCharacterId(key.replace(/^single:/, ""));
    }
    onOpenChange(true);
    setPhoneTab("chats");
    setPhoneView("room");
  }

  function playNotification() {
    if (typeof window === "undefined") return;
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = notificationAudioRef.current ?? new AudioContextCtor();
      notificationAudioRef.current = ctx;
      const play = () => {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        const osc = ctx.createOscillator();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
        osc.frequency.setValueAtTime(1046, now);
        osc.type = "sine";
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      };
      if (ctx.state === "suspended") void ctx.resume().then(play).catch(() => undefined);
      else play();
    } catch {
      // Browser audio can be blocked until the user interacts with the page.
    }
  }

  const activeTimeLabel = useMemo(() => {
    const latest = activeThread?.messages[activeThread.messages.length - 1];
    return latest ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(latest.at) : "지금";
  }, [activeThread]);

  return (
    <>
      {!previewMode && (
        <aside
          aria-hidden={!historyOpen}
          className={cn(
            "fixed bottom-24 left-4 top-[114px] z-30 hidden w-[340px] flex-col transition duration-300 md:flex",
            historyOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[calc(100%+1rem)] opacity-0",
          )}
        >
          <div className="relative flex min-h-0 flex-1 flex-col rounded-[2rem] border-[8px] border-[#111] bg-[#111] shadow-[0_24px_80px_rgba(0,0,0,.62)]">
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-4 w-24 -translate-x-1/2 rounded-full bg-[#111]" />
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.55rem] bg-[#f7f4ef] text-[#191919]">
              <div className="flex h-9 items-center justify-between px-5 pt-2 text-[11px] font-bold">
                <span>{activeTimeLabel}</span>
                <span className="h-2.5 w-4 rounded-[3px] border border-[#191919]/50">
                  <span className="block h-full w-3 rounded-[2px] bg-[#191919]" />
                </span>
              </div>

              <div className="flex items-center justify-between px-4 pb-3 pt-2">
                <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.02em]">
                  Talk
                  {totalUnread > 0 && (
                    <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" className="grid size-8 place-items-center rounded-full bg-black/5" aria-label="검색">
                    <Search className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#191919] px-3 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-[#ff4d6d]"
                    aria-label="대화 기록 닫기"
                  >
                    <PanelLeftClose className="size-4" />
                    닫기
                  </button>
                </div>
              </div>

              <div className="mx-4 mb-3 grid grid-cols-2 rounded-2xl bg-black/[0.06] p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneTab("friends");
                    setPhoneView("list");
                  }}
                  className={cn("rounded-xl py-2 transition", phoneTab === "friends" ? "bg-white shadow-sm" : "text-[#7b756f]")}
                >
                  친구
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneTab("chats");
                    setPhoneView("list");
                  }}
                  className={cn("rounded-xl py-2 transition", phoneTab === "chats" ? "bg-white shadow-sm" : "text-[#7b756f]")}
                >
                  채팅
                </button>
              </div>

              {phoneView === "list" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {phoneTab === "friends" ? (
                    <div className="space-y-2">
                      {chattedFriends.map((character) => (
                        <button
                          key={character.id}
                          type="button"
                          onClick={() => openThread(`single:${character.id}`)}
                          className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[0.04]"
                        >
                          <ReaderMessengerAvatar label={character.name} src={character.avatarUrl} className="size-12" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold">{character.name}</span>
                            <span className="block truncate text-[11px] font-medium text-[#8a837b]">
                              {character.role || character.personality || "스토리 주인공"}
                            </span>
                          </span>
                          <Heart className="size-4 text-[#ff4d6d]" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {threadList.map((thread) => {
                        const latest = thread.messages[thread.messages.length - 1];
                        const unread = unreadByThread[thread.key] ?? 0;
                        return (
                          <button
                            key={thread.key}
                            type="button"
                            onClick={() => openThread(thread.key)}
                            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[0.04]"
                          >
                            <ReaderMessengerAvatar
                              label={thread.label}
                              src={thread.avatarUrl}
                              group={thread.mode === "group"}
                              className="size-12"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-extrabold">{thread.label}</span>
                                {latest && (
                                  <span className="shrink-0 text-[10px] font-medium text-[#9c958e]">
                                    {new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(latest.at)}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8a837b]">
                                {latest?.text || "대화를 시작해보세요"}
                              </span>
                            </span>
                            {unread > 0 && (
                              <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-[#b7c9d7] shadow-inner">
                  <div className="flex h-11 items-center justify-between bg-[#a9bfce] px-3 text-[#1d2a33]">
                    <button type="button" onClick={() => setPhoneView("list")} className="inline-flex items-center gap-1 text-xs font-bold">
                      <ArrowLeft className="size-3.5" /> 목록
                    </button>
                    <div className="min-w-0 flex items-center gap-2">
                      <ReaderMessengerAvatar
                        label={activeThread?.label ?? targetLabel}
                        src={activeThread?.avatarUrl ?? null}
                        group={activeThread?.mode === "group"}
                        className="size-7 rounded-xl"
                      />
                      <span className="truncate text-sm font-extrabold">{activeThread?.label ?? targetLabel}</span>
                    </div>
                    <MoreHorizontal className="size-4" />
                  </div>

                  <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                    {(activeThread?.messages.length ?? 0) === 0 ? (
                      <div className="mx-auto mt-8 max-w-[13rem] rounded-2xl bg-white/55 px-3 py-3 text-center text-xs leading-5 text-[#4d5960]">
                        지금 읽는 장면을 떠올리며 말을 걸어보세요.
                      </div>
                    ) : (
                      activeThread!.messages.map((message) => (
                        <div key={message.id} className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
                          {message.role === "assistant" && (
                            <ReaderMessengerAvatar label={message.speaker} src={message.avatarUrl} className="mt-0.5 size-8 rounded-xl" />
                          )}
                          <div className="max-w-[74%]">
                            {message.role === "assistant" && (
                              <div className="mb-1 text-[10px] font-bold text-[#2c3a43]">{message.speaker}</div>
                            )}
                            <div
                              className={cn(
                                "rounded-2xl px-3 py-2 text-xs leading-5 shadow-sm",
                                message.role === "user"
                                  ? "rounded-tr-md bg-[#fee500] text-[#191919]"
                                  : "rounded-tl-md bg-white text-[#191919]",
                              )}
                            >
                              <div className="whitespace-pre-line">{message.text}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {isStreaming && (
                      latestAssistantMessage?.text ? (
                        <div className="flex justify-start gap-2">
                          <ReaderMessengerAvatar
                            label={targetLabel}
                            src={activeThread?.avatarUrl ?? null}
                            group={activeThread?.mode === "group"}
                            className="mt-0.5 size-8 rounded-xl"
                          />
                          <div className="max-w-[74%]">
                            <div className="mb-1 text-[10px] font-bold text-[#2c3a43]">{targetLabel}</div>
                            <div className="rounded-2xl rounded-tl-md bg-white px-3 py-2 text-xs leading-5 text-[#191919] shadow-sm">
                              <div className="whitespace-pre-line">{latestAssistantMessage.text}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#4d5960]">
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#fee500] opacity-70" />
                            <span className="relative inline-flex size-2 rounded-full bg-[#fee500]" />
                          </span>
                          {targetLabel} 입력 중
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 border-t border-black/5 bg-white/80 py-2 text-[10px] font-bold text-[#8a837b]">
                <button type="button" onClick={() => { setPhoneTab("friends"); setPhoneView("list"); }} className={cn("flex flex-col items-center gap-1", phoneTab === "friends" && "text-[#191919]")}>
                  <UserRound className="size-4" /> 친구
                </button>
                <button type="button" onClick={() => { setPhoneTab("chats"); setPhoneView("list"); }} className={cn("flex flex-col items-center gap-1", phoneTab === "chats" && "text-[#191919]")}>
                  <span className="relative">
                    <MessageCircle className="size-4" />
                    {totalUnread > 0 && (
                      <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-[#ff4d6d] px-1 text-[8px] leading-4 text-white">
                        {totalUnread > 9 ? "9+" : totalUnread}
                      </span>
                    )}
                  </span>
                  채팅
                </button>
                <button type="button" className="flex flex-col items-center gap-1">
                  <MoreHorizontal className="size-4" /> 더보기
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {!previewMode && !historyOpen && (
        <button
          type="button"
          onClick={() => {
            setHistoryOpen(true);
            setPhoneTab("chats");
            setPhoneView("list");
          }}
          aria-label="대화 기록 열기"
          className="fixed bottom-28 left-4 z-30 hidden items-center gap-2 rounded-full border border-white/10 bg-black/86 px-3 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl transition hover:border-primary/50 md:flex"
        >
          <PanelLeftOpen className="size-4 text-primary" />
          {totalUnread > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
          휴대폰 열기
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/82 to-transparent pb-4 pt-8">
        <div className={cn("mx-auto space-y-2 px-4", dockWidthClass)}>
          {hasMultipleCharacters && open && (
            <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-black/72 p-1.5 backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chatCharacters.map((character) => {
                const active = chatMode === "single" && character.id === activeCharacter?.id;
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => {
                      setChatMode("single");
                      setActiveCharacterId(character.id);
                    }}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs transition",
                      active
                        ? "border-primary/70 bg-primary text-primary-foreground"
                        : "border-white/10 bg-white/[0.04] text-white/70 hover:border-primary/40 hover:text-white",
                    )}
                  >
                    {character.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setChatMode("group")}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs transition",
                  chatMode === "group"
                    ? "border-primary/70 bg-primary text-primary-foreground"
                    : "border-white/10 bg-white/[0.04] text-white/70 hover:border-primary/40 hover:text-white",
                )}
              >
                단체채팅
              </button>
            </div>
          )}

          {open && (
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/60 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setHistoryOpen((value) => !value)}
                aria-label={historyOpen ? "휴대폰 채팅 닫기" : "휴대폰 채팅 열기"}
                className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-white transition hover:bg-white/10"
              >
                {historyOpen ? <PanelLeftClose className="size-4 text-primary" /> : <PanelLeftOpen className="size-4 text-primary" />}
                {totalUnread > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
                {historyOpen ? "휴대폰 닫기" : "휴대폰"}
              </button>
              <div className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                <span className="font-medium text-white">{targetLabel}</span>
                <span>{chatMode === "group" ? "단체" : "1:1"}</span>
                <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                  호감도 {affection}
                </span>
              </div>
            </div>
          )}

          {open && (
            <div className="rounded-2xl border border-white/10 bg-black/72 p-2 backdrop-blur-xl">
              <div className="mb-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                <div className="relative overflow-hidden rounded-xl bg-white/[0.04]">
                  {activeAvatarUrl ? (
                    <img src={activeAvatarUrl} alt="" className="aspect-square size-full object-cover" />
                  ) : (
                    <div className="grid aspect-square place-items-center">
                      <UserRound className="size-6 text-white/30" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-white">{activeCharacterName}</span>
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-200">호감도 {affection}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1">
                    {(activeCharacterVisualSlots.length ? activeCharacterVisualSlots : []).slice(0, 5).map((slot) => (
                      <ReaderAssetThumb key={slot.id} slot={slot} affection={affection} />
                    ))}
                    {activeCharacterVisualSlots.length === 0 &&
                      [0, 1, 2, 3, 4].map((item) => (
                        <div key={item} className="grid aspect-square place-items-center rounded-lg border border-dashed border-white/10 bg-white/[0.03]">
                          <Lock className="size-3 text-white/25" />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-sky-300" />
                  관계 챌린지
                </span>
                <span>{affectionGap > 0 ? `다음 단계까지 ${affectionGap}` : "완전 해금"}</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {chatChallenges.map((challenge) => (
                  <button
                    key={challenge.id}
                    type="button"
                    onClick={() => {
                      setActiveChallengeId(challenge.id);
                      setDraft(challenge.prompt);
                      setPhoneTab("chats");
                      setPhoneView("room");
                      onOpenChange(true);
                    }}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition",
                      activeChallengeId === challenge.id
                        ? "border-sky-300/70 bg-sky-400/20 text-sky-100"
                        : "border-white/10 bg-white/[0.04] text-white/62 hover:border-sky-300/50 hover:text-white",
                    )}
                  >
                    {challenge.label}
                    <span className="ml-1 text-sky-200">+{challenge.rewardDelta}</span>
                  </button>
                ))}
              </div>
              {activeChallenge && (
                <div className="mt-2 rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-[11px] leading-5 text-sky-50/80">
                  {activeChallenge.label} 진행 중. 그대로 보내거나 네 말투로 바꿔도 됩니다.
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/86 p-2 shadow-2xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => {
                if (!hasMultipleCharacters) return;
                setChatMode("single");
                const currentIndex = Math.max(0, chatCharacters.findIndex((character) => character.id === activeCharacter?.id));
                const next = chatCharacters[(currentIndex + 1) % chatCharacters.length];
                setActiveCharacterId(next.id);
              }}
              className={cn(
                "flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left",
                hasMultipleCharacters && "transition hover:border-primary/40",
              )}
              title={hasMultipleCharacters ? "대화 상대 변경" : targetLabel}
            >
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10">
                {chatMode === "group" ? (
                  <MessageCircle className="size-4 text-primary" />
                ) : activeAvatarUrl ? (
                  <img src={activeAvatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-primary">{activeCharacterName.slice(0, 1)}</span>
                )}
              </span>
              <span className="hidden max-w-28 truncate text-xs font-semibold text-white sm:block">{targetLabel}</span>
            </button>

            <textarea
              value={draft}
              onFocus={() => onOpenChange(true)}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={open ? 2 : 1}
              placeholder={`${targetLabel}에게 메시지 보내기`}
              className="min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="flex shrink-0 items-center gap-1.5">
              {lastReward && <span className="hidden text-[11px] font-semibold text-rose-300 sm:inline">호감도 상승</span>}
              {affectionGap > 0 && (
                <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/55 md:inline">
                  다음 {affectionGap}
                </span>
              )}
              <Button type="submit" size="sm" disabled={!draft.trim() || isStreaming} className="size-10 rounded-full p-0">
                {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </form>
          <div className="flex gap-1.5 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setDraft(prompt);
                  onOpenChange(true);
                }}
                className="shrink-0 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[11px] text-white/62 transition hover:border-primary/40 hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function CharacterChatDock({
  storyId,
  characterName,
  affection,
  readingExcerpt,
  open,
  onOpenChange,
  previewMode,
  readerMode,
  chatProfileName,
  chatProfileBio,
  chatProfileImage,
  llmModel,
  onReply,
  onChatReward,
}: {
  storyId: string;
  characterName: string;
  affection: number;
  readingExcerpt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewMode: boolean;
  readerMode: "reader" | "focus";
  chatProfileName: string;
  chatProfileBio: string;
  chatProfileImage: string | null;
  llmModel: ReaderLlmId;
  onReply: (reply: ReaderCharacterReply | null) => void;
  onChatReward: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastReward, setLastReward] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({
    id: `story-${storyId}`,
    transport,
  });
  const isStreaming = status === "submitted" || status === "streaming";
  const quickPrompts = useMemo(
    () => [
      "지금 장면에서 네 마음은 어때?",
      "내가 어떤 선택을 하면 좋을까?",
      "나에게만 살짝 힌트를 줘.",
      "호감도를 더 쌓으려면 뭘 하면 돼?",
    ],
    [],
  );
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  async function send() {
    if (!draft.trim() || isStreaming) return;
    if (previewMode) {
      toast.info("미리보기 모드에서는 채팅이 전송되지 않아요.");
      setDraft("");
      return;
    }
    const text = draft.trim();
    setDraft("");
    await sendMessage(
      { text },
      {
        body: {
          storyId,
          sceneExcerpt: readingExcerpt,
          affection,
        },
      },
    );
    onChatReward();
    setLastReward(true);
    window.setTimeout(() => setLastReward(false), 1800);
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 transition-transform",
        open ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]",
      )}
    >
      <div className="mx-auto max-w-5xl">
        {/* Toggle handle */}
        <button
          onClick={() => onOpenChange(!open)}
          className="w-full flex items-center gap-2 px-4 h-14 bg-card/95 backdrop-blur-xl border-t border-x border-border/60 rounded-t-2xl shadow-lg"
        >
          <MessageCircle className="size-4 text-primary" />
          <span className="hidden">
            {characterName}와 대화
            <span className="ml-2 text-xs text-muted-foreground">
              · 읽는 중인 장면과 호감도가 반영돼요
            </span>
          </span>
          <span className="min-w-0 flex-1 text-left text-sm font-medium">
            {characterName}와 대화
            <span className="ml-2 text-xs text-muted-foreground">
              읽는 장면과 호감도를 반영해요
            </span>
          </span>
          <span className="hidden rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 sm:inline-flex">
            호감도 {affection}
          </span>
          {open ? <X className="size-4" /> : <ChevronDown className="size-4 rotate-180" />}
        </button>

        {/* Panel */}
        <div className="flex max-h-[64vh] flex-col border-x border-border/60 bg-card/95 backdrop-blur-xl">
          <div className="border-b border-border/40 px-4 py-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  지금 장면에 바로 말을 걸어보세요
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  캐릭터는 현재 읽는 문맥을 참고해서 반응합니다. 대화를 이어갈수록 호감도가 쌓이고, 더 높은 단계의 에셋과 반응을 열 수 있어요.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDraft(prompt)}
                      className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-300">
                    <Heart className="size-3 fill-rose-400" />
                    호감도 {affection}
                  </span>
                  <span className="text-muted-foreground">대화 +2</span>
                </div>
                <Progress value={affection} className="mt-2 h-1.5" />
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {affectionGap > 0
                    ? `다음 반응 단계까지 ${affectionGap}만큼 남았어요. 장면 질문이나 선택 상담을 해보세요.`
                    : "최고 단계에 가까워졌어요. 깊은 대화를 이어가면 특별 반응을 유지할 수 있어요."}
                </p>
                {lastReward && (
                  <div className="mt-2 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300">
                    대화 보상 +2 적용
                  </div>
                )}
              </div>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[220px]">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                {characterName}에게 말을 걸어보세요. 지금 읽고 있는 장면의 분위기로 답해줘요.
              </p>
            )}
            {messages.map((m) => {
              const text = m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60",
                    )}
                  >
                    {!isUser && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        {characterName}
                      </div>
                    )}
                    {text || (isStreaming && !isUser ? "…" : "")}
                  </div>
                </div>
              );
            })}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-muted/60 rounded-2xl px-3 py-2 text-sm">
                  <Loader2 className="inline size-3 animate-spin" />
                </div>
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-border/40 p-3 flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={`${characterName}에게 보낼 말…`}
              className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary max-h-32"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim() || isStreaming}
              className="h-9"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReaderEngagementChatDock({
  storyId,
  characterName,
  characterProfiles,
  affection,
  readingExcerpt,
  open,
  onOpenChange,
  previewMode,
  readerMode,
  chatProfileName,
  chatProfileBio,
  chatProfileImage,
  llmModel,
  onReply,
  onChatReward,
}: {
  storyId: string;
  characterName: string;
  characterProfiles?: CharacterChatProfile[];
  affection: number;
  readingExcerpt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewMode: boolean;
  readerMode: "reader" | "focus";
  chatProfileName: string;
  chatProfileBio: string;
  chatProfileImage: string | null;
  llmModel: ReaderLlmId;
  onReply: (reply: ReaderCharacterReply | null) => void;
  onChatReward: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastReward, setLastReward] = useState(false);
  const [chatMode, setChatMode] = useState<ReaderChatMode>("single");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [phoneTab, setPhoneTab] = useState<"friends" | "chats">("chats");
  const [phoneView, setPhoneView] = useState<ChatPhoneView>("list");
  const [chatThreads, setChatThreads] = useState<Record<string, ReaderChatThread>>({});
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const pendingReplyThreadRef = useRef<{
    key: string;
    label: string;
    mode: ReaderChatMode;
    avatarUrl?: string | null;
    characterId?: string | null;
  } | null>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);
  const hydratedChatHistoryRef = useRef(false);
  const notificationAudioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setPhoneTab("chats");
    setPhoneView("list");
  }, [storyId]);

  const normalizedCharacters = useMemo<CharacterChatProfile[]>(() => {
    const fromProfiles = (characterProfiles ?? [])
      .map((character, index) => ({
        ...character,
        id: String(character.id || character.name || `character-${index + 1}`),
        name: String(character.name || characterName || "캐릭터 미등록"),
      }))
      .filter((character) => character.name.trim());
    return fromProfiles.length
      ? fromProfiles
      : [{ id: "unregistered-character", name: "캐릭터 미등록" }];
  }, [characterProfiles, characterName]);
  const chatCharacters = useMemo(
    () =>
      normalizedCharacters.map((character, index) => ({
        ...character,
        avatarUrl: character.avatarUrl || fallbackMangaAvatar(`${character.id}:${character.name}`, index),
      })),
    [normalizedCharacters],
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState(() => chatCharacters[0]?.id ?? "main-character");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({ id: `story-${storyId}`, transport });
  const isStreaming = status === "submitted" || status === "streaming";
  const activeCharacter =
    chatCharacters.find((character) => character.id === selectedCharacterId) ?? chatCharacters[0];
  const hasMultipleCharacters = chatCharacters.length > 1;
  const activeChatCharacters = chatMode === "group" ? chatCharacters : [activeCharacter].filter(Boolean);
  const activeCharacterName = activeCharacter?.name || characterName;
  const activeAvatarUrl = useSignedMedia(activeCharacter?.avatarUrl ?? null);
  const activeAvatarSource = activeCharacter?.avatarUrl ?? null;
  const targetLabel = chatMode === "group" ? "단톡방" : activeCharacterName;
  const threadKey = chatMode === "group" ? "group" : `single:${activeCharacter?.id ?? "main-character"}`;
  const dockWidthClass = readerMode === "focus" ? "max-w-[768px]" : "max-w-[880px]";
  const fetchReaderChats = useServerFn(listReaderChatMessages);
  const appendReaderChat = useServerFn(appendReaderChatMessage);
  const chatHistoryQ = useQuery({
    queryKey: ["reader_chat_messages", storyId],
    queryFn: () => fetchReaderChats({ data: { storyId, limit: 220 } }),
    enabled: !previewMode && Boolean(storyId),
    staleTime: 30_000,
  });
  const saveChatMutation = useMutation({
    mutationFn: (data: Parameters<typeof appendReaderChat>[0]["data"]) => appendReaderChat({ data }),
    onError: (error) => {
      console.warn("[reader-chat] failed to save chat message", error);
    },
  });
  const latestAssistantMessage = useMemo(() => {
    const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
    const text = chatMessageText(assistantMessage);
    return assistantMessage && text ? { id: assistantMessage.id, text } : null;
  }, [messages]);
  const chatThreadList = useMemo<ReaderChatThread[]>(() => {
    const singleThreads = chatCharacters.map((character) => {
      const key = `single:${character.id}`;
      return (
        chatThreads[key] ?? {
          key,
          label: character.name,
          mode: "single" as ReaderChatMode,
          avatarUrl: character.avatarUrl ?? null,
          messages: [],
        }
      );
    });
    const groupThread =
      chatThreads.group ?? {
        key: "group",
        label: "단톡방",
        mode: "group" as ReaderChatMode,
        avatarUrl: null,
        messages: [],
      };
    return hasMultipleCharacters ? [...singleThreads, groupThread] : singleThreads;
  }, [chatCharacters, chatThreads, hasMultipleCharacters]);
  const activeThread = chatThreadList.find((thread) => thread.key === threadKey) ?? chatThreadList[0];
  const chattedFriends = useMemo(() => {
    const talkedIds = new Set(
      Object.values(chatThreads)
        .filter((thread) => thread.mode === "single" && thread.messages.length > 0)
        .map((thread) => thread.key.replace(/^single:/, "")),
    );
    const friends = chatCharacters.filter((character) => talkedIds.has(character.id));
    return friends.length ? friends : activeCharacter ? [activeCharacter] : [];
  }, [activeCharacter, chatCharacters, chatThreads]);
  const totalUnread = useMemo(
    () => Object.values(unreadByThread).reduce((sum, count) => sum + count, 0),
    [unreadByThread],
  );
  const quickPrompts = useMemo(
    () => [
      "지금 장면에서 네 마음은 어때?",
      "내가 어떤 선택을 하면 좋을까?",
      "나에게만 살짝 힌트를 줘.",
      "호감도를 더 쌓으려면 뭘 하면 돼?",
    ],
    [],
  );
  const nextAffectionGoal = affection < 30 ? 30 : affection < 55 ? 55 : affection < 75 ? 75 : 100;
  const affectionGap = Math.max(0, nextAffectionGoal - affection);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!chatCharacters.some((character) => character.id === selectedCharacterId)) {
      setSelectedCharacterId(chatCharacters[0]?.id ?? "main-character");
    }
  }, [chatCharacters, selectedCharacterId]);

  useEffect(() => {
    if (open && historyOpen && phoneTab === "chats") clearThreadUnread(threadKey);
  }, [historyOpen, open, phoneTab, threadKey]);

  useEffect(() => {
    if (hydratedChatHistoryRef.current || !chatHistoryQ.data?.length) return;

    const nextThreads: Record<string, ReaderChatThread> = {};
    for (const row of chatHistoryQ.data as ReaderChatMessageRow[]) {
      const key = row.threadKey || "single:main-character";
      const label = row.threadLabel || row.characterName || "캐릭터 미등록";
      const mode = row.chatMode === "group" ? "group" : "single";
      const current = nextThreads[key] ?? {
        key,
        label,
        mode,
        avatarUrl: row.avatarUrl ?? null,
        messages: [],
      };
      current.messages.push({
        id: row.id,
        role: row.role,
        text: row.text,
        speaker: row.role === "user" ? "나" : row.characterName || label,
        avatarUrl: row.role === "assistant" ? row.avatarUrl ?? current.avatarUrl ?? null : null,
        at: new Date(row.createdAt).getTime() || Date.now(),
      });
      nextThreads[key] = {
        ...current,
        label,
        avatarUrl: row.avatarUrl ?? current.avatarUrl ?? null,
        messages: current.messages.slice(-80),
      };
    }

    setChatThreads((prev) => ({ ...nextThreads, ...prev }));
    hydratedChatHistoryRef.current = true;
  }, [chatHistoryQ.data]);

  function appendThreadMessage(
    thread: {
      key: string;
      label: string;
      mode: ReaderChatMode;
      avatarUrl?: string | null;
      characterId?: string | null;
    },
    message: Omit<ReaderChatHistoryMessage, "id" | "at">,
  ) {
    setChatThreads((prev) => {
      const current = prev[thread.key] ?? {
        key: thread.key,
        label: thread.label,
        mode: thread.mode,
        avatarUrl: thread.avatarUrl ?? null,
        messages: [],
      };
      return {
        ...prev,
        [thread.key]: {
          ...current,
          label: thread.label,
          avatarUrl: thread.avatarUrl ?? current.avatarUrl ?? null,
          messages: [
            ...current.messages,
            {
              ...message,
              id: `${thread.key}-${Date.now()}-${current.messages.length}`,
              at: Date.now(),
            },
          ].slice(-80),
        },
      };
    });
    if (message.role === "assistant" && (thread.key !== threadKey || !open || !historyOpen || phoneTab !== "chats")) {
      setUnreadByThread((prev) => ({
        ...prev,
        [thread.key]: (prev[thread.key] ?? 0) + 1,
      }));
    }
  }

  function persistThreadMessage(
    thread: {
      key: string;
      label: string;
      mode: ReaderChatMode;
      avatarUrl?: string | null;
      characterId?: string | null;
    },
    message: Omit<ReaderChatHistoryMessage, "id" | "at">,
  ) {
    if (previewMode) return;
    saveChatMutation.mutate({
      storyId,
      role: message.role,
      text: message.text,
      threadKey: thread.key,
      threadLabel: thread.label,
      chatMode: thread.mode,
      characterId: thread.characterId ?? (thread.mode === "group" ? "group" : thread.key.replace(/^single:/, "")),
      characterName: thread.label,
      avatarUrl: thread.avatarUrl ?? null,
      affectionAt: affection,
    });
  }

  useEffect(() => {
    if (!latestAssistantMessage || latestAssistantMessage.id === lastAssistantMessageIdRef.current) return;
    lastAssistantMessageIdRef.current = latestAssistantMessage.id;
    const thread = pendingReplyThreadRef.current ?? {
      key: threadKey,
      label: targetLabel,
      mode: chatMode,
      avatarUrl: chatMode === "group" ? null : activeAvatarSource,
      characterId: chatMode === "group" ? "group" : activeCharacter?.id ?? "main-character",
    };
    const assistantMessage = {
      role: "assistant",
      speaker: thread.label,
      avatarUrl: thread.avatarUrl ?? null,
      text: latestAssistantMessage.text,
    } satisfies Omit<ReaderChatHistoryMessage, "id" | "at">;
    appendThreadMessage(thread, assistantMessage);
    persistThreadMessage(thread, assistantMessage);
    onReply({
      characterName: thread.label,
      avatarUrl: thread.mode === "group" ? null : thread.avatarUrl,
      text: latestAssistantMessage.text,
    });
    playChatNotificationSound();
    toast(`${thread.label} 새 답장`, {
      description: latestAssistantMessage.text.slice(0, 72),
      icon: <Bell className="size-4 text-primary" />,
    });
  }, [activeAvatarSource, activeCharacter?.id, chatMode, latestAssistantMessage, onReply, targetLabel, threadKey]);

  async function send() {
    if (!draft.trim() || isStreaming) return;
    if (previewMode) {
      toast.info("미리보기 모드에서는 채팅이 전송되지 않아요.");
      setDraft("");
      return;
    }
    const text = draft.trim();
    setDraft("");
    const currentThread = {
      key: threadKey,
      label: targetLabel,
      mode: chatMode,
      avatarUrl: chatMode === "group" ? null : activeAvatarSource,
      characterId: chatMode === "group" ? "group" : activeCharacter?.id ?? "main-character",
    };
    pendingReplyThreadRef.current = currentThread;
    const userMessage = {
      role: "user",
      speaker: "나",
      avatarUrl: null,
      text,
    } satisfies Omit<ReaderChatHistoryMessage, "id" | "at">;
    appendThreadMessage(currentThread, userMessage);
    persistThreadMessage(currentThread, userMessage);
    await sendMessage({
      text,
    }, {
      body: {
        storyId,
        sceneExcerpt: readingExcerpt,
        affection,
        chatMode,
        characterId: chatMode === "group" ? "group" : activeCharacter?.id,
        characterName: targetLabel,
        characterProfile:
          chatMode === "group"
            ? { name: "단톡방", characters: activeChatCharacters }
            : activeCharacter,
        selectedCharacters: activeChatCharacters,
        readerProfile: {
          name: chatProfileName,
          bio: chatProfileBio,
          image: chatProfileImage,
        },
        preferredLlmModel: llmModel,
      },
    });
    onChatReward();
    setLastReward(true);
    window.setTimeout(() => setLastReward(false), 1800);
  }

  function cycleCharacter() {
    if (chatCharacters.length <= 1) return;
    setChatMode("single");
    const activeIndex = Math.max(
      0,
      chatCharacters.findIndex((character) => character.id === activeCharacter?.id),
    );
    const next = chatCharacters[(activeIndex + 1) % chatCharacters.length];
    setSelectedCharacterId(next.id);
  }

  function clearThreadUnread(key: string) {
    setUnreadByThread((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function playChatNotificationSound() {
    if (typeof window === "undefined") return;
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = notificationAudioRef.current ?? new AudioContextCtor();
      notificationAudioRef.current = ctx;
      const play = () => {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        const first = ctx.createOscillator();
        const second = ctx.createOscillator();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        first.frequency.setValueAtTime(880, now);
        second.frequency.setValueAtTime(1174, now + 0.12);
        first.type = "sine";
        second.type = "sine";
        first.connect(gain);
        second.connect(gain);
        gain.connect(ctx.destination);
        first.start(now);
        first.stop(now + 0.16);
        second.start(now + 0.13);
        second.stop(now + 0.36);
      };
      if (ctx.state === "suspended") {
        void ctx.resume().then(play).catch(() => undefined);
      } else {
        play();
      }
    } catch {
      // Browser audio can be blocked until the reader interacts with the page.
    }
  }

  function selectChatThread(key: string) {
    clearThreadUnread(key);
    if (key === "group") {
      setChatMode("group");
      onOpenChange(true);
      setPhoneTab("chats");
      setPhoneView("room");
      return;
    }
    const characterId = key.replace(/^single:/, "");
    setChatMode("single");
    setSelectedCharacterId(characterId);
    onOpenChange(true);
    setPhoneTab("chats");
    setPhoneView("room");
  }

  const latestActiveMessage = activeThread?.messages[activeThread.messages.length - 1] ?? null;
  const activeTimeLabel = latestActiveMessage
    ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(latestActiveMessage.at)
    : "지금";

  return (
    <>
      {!previewMode && (
        <aside
          aria-hidden={!historyOpen}
          className={cn(
            "fixed bottom-24 left-4 top-[114px] z-30 hidden w-[360px] flex-col transition duration-300 md:flex",
            historyOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[calc(100%+1rem)] opacity-0",
          )}
        >
          <div className="relative flex min-h-0 flex-1 flex-col rounded-[2.25rem] border-[9px] border-[#111] bg-[#111] shadow-[0_24px_80px_rgba(0,0,0,.65)]">
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-5 w-28 -translate-x-1/2 rounded-full bg-[#111]" />
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.7rem] bg-[#f7f4ef] text-[#191919]">
              <div className="flex h-9 items-center justify-between bg-[#f7f4ef] px-5 pt-2 text-[11px] font-bold">
                <span>{activeTimeLabel}</span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-4 rounded-[3px] border border-[#191919]/50">
                    <span className="block h-full w-3 rounded-[2px] bg-[#191919]" />
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between px-4 pb-3 pt-2">
                <div>
                  <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.02em]">
                    Talk
                    {totalUnread > 0 && (
                      <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-medium text-[#7b756f]">스토리 속 주인공들과 대화</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full bg-black/5 text-[#2c2c2c]"
                    aria-label="대화 검색"
                  >
                    <Search className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    className="grid size-8 place-items-center rounded-full bg-black/5 text-[#2c2c2c]"
                    aria-label="대화 기록 접기"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mx-4 mb-3 grid grid-cols-2 rounded-2xl bg-black/[0.06] p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneTab("friends");
                    setPhoneView("list");
                  }}
                  className={cn(
                    "rounded-xl py-2 transition",
                    phoneTab === "friends" ? "bg-white shadow-sm" : "text-[#7b756f]",
                  )}
                >
                  친구
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneTab("chats");
                    setPhoneView("list");
                  }}
                  className={cn(
                    "rounded-xl py-2 transition",
                    phoneTab === "chats" ? "bg-white shadow-sm" : "text-[#7b756f]",
                  )}
                >
                  채팅
                </button>
              </div>

              {phoneView === "list" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {phoneTab === "friends" ? (
                  <div className="space-y-1">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-[#8a837b]">
                      <span>대화한 캐릭터 {chattedFriends.length}</span>
                      <span>호감도 {affection}</span>
                    </div>
                    {chattedFriends.map((character) => {
                      const active = chatMode === "single" && character.id === activeCharacter?.id;
                      return (
                        <button
                          key={character.id}
                          type="button"
                          onClick={() => selectChatThread(`single:${character.id}`)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition",
                            active ? "bg-[#fee500]/50" : "hover:bg-black/[0.04]",
                          )}
                        >
                          <ReaderMessengerAvatar label={character.name} src={character.avatarUrl} className="size-12" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold">{character.name}</span>
                            <span className="block truncate text-[11px] text-[#77706a]">
                              {character.personality || character.relationship || "읽는 장면에 맞춰 대화할 수 있어요"}
                            </span>
                          </span>
                          <Heart className="size-4 fill-[#ff6aa9] text-[#ff6aa9]" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {chatThreadList.map((thread) => {
                      const latest = thread.messages[thread.messages.length - 1];
                      const active = thread.key === threadKey;
                      const unread = unreadByThread[thread.key] ?? 0;
                      return (
                        <button
                          key={thread.key}
                          type="button"
                          onClick={() => selectChatThread(thread.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition",
                            active
                              ? "bg-[#fee500]/55"
                              : unread > 0
                                ? "bg-[#ff4d6d]/10 hover:bg-[#ff4d6d]/15"
                                : "hover:bg-black/[0.04]",
                          )}
                        >
                          <ReaderMessengerAvatar
                            label={thread.label}
                            src={thread.avatarUrl}
                            group={thread.mode === "group"}
                            className="size-12"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1">
                              <span className="truncate text-sm font-extrabold">{thread.label}</span>
                              {thread.mode === "group" && (
                                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-bold text-[#665f57]">
                                  {chatCharacters.length}
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-[#77706a]">
                              {latest ? latest.text : "아직 대화가 없습니다"}
                            </span>
                          </span>
                          <span className="text-[10px] font-semibold text-[#a29a91]">
                            {latest
                              ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(latest.at)
                              : ""}
                            {unread > 0 && (
                              <span className="ml-1 inline-grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-sm">
                                {unread > 99 ? "99+" : unread}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              ) : (
              <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-[#b7c9d7] shadow-inner">
                <div className="flex h-12 items-center justify-between bg-[#a9bfce] px-3 text-[#1d2a33]">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPhoneView("list")}
                      className="rounded-full bg-white/40 px-2 py-1 text-[11px] font-extrabold"
                    >
                      목록
                    </button>
                    <ReaderMessengerAvatar
                      label={activeThread?.label ?? targetLabel}
                      src={activeThread?.avatarUrl ?? null}
                      group={activeThread?.mode === "group"}
                      className="size-8 rounded-xl"
                    />
                    <span className="truncate text-sm font-extrabold">{activeThread?.label ?? targetLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-4" />
                    <MoreHorizontal className="size-4" />
                  </div>
                </div>

                <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {(activeThread?.messages.length ?? 0) === 0 ? (
                    <div className="mx-auto mt-16 max-w-[14rem] rounded-2xl bg-white/55 px-3 py-3 text-center text-xs leading-5 text-[#4d5960]">
                      지금 읽는 장면에 대해 말을 걸어보세요. 대화가 쌓이면 이 화면에 실제 채팅처럼 저장됩니다.
                    </div>
                  ) : (
                    activeThread!.messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}
                      >
                        {message.role === "assistant" && (
                          <ReaderMessengerAvatar
                            label={message.speaker}
                            src={message.avatarUrl}
                            className="mt-0.5 size-8 rounded-xl"
                          />
                        )}
                        <div className={cn("max-w-[74%]", message.role === "user" ? "items-end" : "items-start")}>
                          {message.role === "assistant" && (
                            <div className="mb-1 text-[10px] font-bold text-[#2c3a43]">{message.speaker}</div>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 text-xs leading-5 shadow-sm",
                              message.role === "user"
                                ? "rounded-tr-md bg-[#fee500] text-[#191919]"
                                : "rounded-tl-md bg-white text-[#191919]",
                            )}
                          >
                            <div className="whitespace-pre-line">{message.text}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {isStreaming && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#4d5960]">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#fee500] opacity-70" />
                        <span className="relative inline-flex size-2 rounded-full bg-[#fee500]" />
                      </span>
                      {targetLabel} 입력 중
                    </div>
                  )}
                </div>
              </div>
              )}

              {false && (
              <div className="mx-3 mb-3 overflow-hidden rounded-[1.5rem] bg-[#b7c9d7] shadow-inner">
                <div className="flex h-11 items-center justify-between bg-[#a9bfce] px-3 text-[#1d2a33]">
                  <div className="flex min-w-0 items-center gap-2">
                    <ReaderMessengerAvatar
                      label={activeThread?.label ?? targetLabel}
                      src={activeThread?.avatarUrl ?? null}
                      group={activeThread?.mode === "group"}
                      className="size-7 rounded-xl"
                    />
                    <span className="truncate text-sm font-extrabold">{activeThread?.label ?? targetLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="size-4" />
                    <MoreHorizontal className="size-4" />
                  </div>
                </div>

                <div ref={scrollRef} className="max-h-[220px] min-h-[170px] space-y-2 overflow-y-auto px-3 py-3">
                  {(activeThread?.messages.length ?? 0) === 0 ? (
                    <div className="mx-auto mt-8 max-w-[14rem] rounded-2xl bg-white/55 px-3 py-3 text-center text-xs leading-5 text-[#4d5960]">
                      지금 읽고 있는 장면에 대해 말을 걸어보세요. 대화가 쌓이면 진짜 휴대폰 채팅처럼 남습니다.
                    </div>
                  ) : (
                    activeThread!.messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}
                      >
                        {message.role === "assistant" && (
                          <ReaderMessengerAvatar
                            label={message.speaker}
                            src={message.avatarUrl}
                            className="mt-0.5 size-8 rounded-xl"
                          />
                        )}
                        <div className={cn("max-w-[74%]", message.role === "user" ? "items-end" : "items-start")}>
                          {message.role === "assistant" && (
                            <div className="mb-1 text-[10px] font-bold text-[#2c3a43]">{message.speaker}</div>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 text-xs leading-5 shadow-sm",
                              message.role === "user"
                                ? "rounded-tr-md bg-[#fee500] text-[#191919]"
                                : "rounded-tl-md bg-white text-[#191919]",
                            )}
                          >
                            <div className="whitespace-pre-line">{message.text}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {isStreaming && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#4d5960]">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#fee500] opacity-70" />
                        <span className="relative inline-flex size-2 rounded-full bg-[#fee500]" />
                      </span>
                      {targetLabel} 입력 중
                    </div>
                  )}
                </div>
              </div>
              )}

              <div className="grid grid-cols-3 border-t border-black/5 bg-white/80 py-2 text-[10px] font-bold text-[#8a837b]">
                <button type="button" onClick={() => { setPhoneTab("friends"); setPhoneView("list"); }} className={cn("flex flex-col items-center gap-1", phoneTab === "friends" && "text-[#191919]")}>
                  <UserRound className="size-4" />
                  친구
                </button>
                <button type="button" onClick={() => { setPhoneTab("chats"); setPhoneView("list"); }} className={cn("flex flex-col items-center gap-1", phoneTab === "chats" && "text-[#191919]")}>
                  <span className="relative">
                    <MessageCircle className="size-4" />
                    {totalUnread > 0 && (
                      <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-[#ff4d6d] px-1 text-[8px] leading-4 text-white">
                        {totalUnread > 9 ? "9+" : totalUnread}
                      </span>
                    )}
                  </span>
                  채팅
                </button>
                <button type="button" className="flex flex-col items-center gap-1">
                  <MoreHorizontal className="size-4" />
                  더보기
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {!previewMode && !historyOpen && (
        <button
          type="button"
          onClick={() => {
            setPhoneTab("chats");
            setPhoneView("list");
            setHistoryOpen(true);
          }}
          aria-label="대화 기록 펼치기"
          className="fixed bottom-28 left-4 z-30 hidden items-center gap-2 rounded-full border border-white/10 bg-black/86 px-3 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl transition hover:border-primary/50 md:flex"
        >
          <PanelLeftOpen className="size-4 text-primary" />
          {totalUnread > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
          대화 기록
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/82 to-transparent pb-4 pt-8">
      <div className={cn("mx-auto space-y-2 px-4", dockWidthClass)}>
        {hasMultipleCharacters && open && (
          <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-black/72 p-1.5 backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chatCharacters.map((character) => {
              const active = chatMode === "single" && character.id === activeCharacter?.id;
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => {
                    setChatMode("single");
                    setSelectedCharacterId(character.id);
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs transition",
                    active
                      ? "border-primary/70 bg-primary text-primary-foreground"
                      : "border-white/10 bg-white/[0.04] text-white/70 hover:border-primary/40 hover:text-white",
                  )}
                >
                  {character.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setChatMode("group")}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs transition",
                chatMode === "group"
                  ? "border-primary/70 bg-primary text-primary-foreground"
                  : "border-white/10 bg-white/[0.04] text-white/70 hover:border-primary/40 hover:text-white",
              )}
            >
              단톡방
            </button>
          </div>
        )}
        {open && (
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/60 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              aria-label={historyOpen ? "대화 기록 접기" : "대화 기록 펼치기"}
              className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-white transition hover:bg-white/10"
            >
              {historyOpen ? <PanelLeftClose className="size-4 text-primary" /> : <PanelLeftOpen className="size-4 text-primary" />}
              {totalUnread > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-[#ff4d6d] px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              대화 기록
            </button>
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              <span className="font-medium text-white">{targetLabel}</span>
              <span>{chatMode === "group" ? "단톡방" : "1:1 대화"}</span>
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/86 p-2 shadow-2xl backdrop-blur-xl"
        >
          <button
            type="button"
            onClick={cycleCharacter}
            className={cn(
              "flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left",
              hasMultipleCharacters && "transition hover:border-primary/40",
            )}
            title={chatCharacters.length > 1 ? "대화 상대 변경" : targetLabel}
          >
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10">
              {chatMode === "group" ? (
                <MessageCircle className="size-4 text-primary" />
              ) : activeAvatarUrl ? (
                <img src={activeAvatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-primary">
                  {activeCharacterName.slice(0, 1)}
                </span>
              )}
            </span>
            <span className="hidden max-w-28 truncate text-xs font-semibold text-white sm:block">
              {targetLabel}
            </span>
          </button>

          <textarea
            value={draft}
            onFocus={() => onOpenChange(true)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={open ? 2 : 1}
            placeholder={`${targetLabel}에게 질문하기`}
            className="min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="flex shrink-0 items-center gap-1.5">
            {lastReward && <span className="hidden text-[11px] font-semibold text-rose-300 sm:inline">+2</span>}
            <span className="hidden rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 md:inline">
              {affection}
            </span>
            <Button type="submit" size="sm" disabled={!draft.trim() || isStreaming} className="size-10 rounded-full p-0">
              {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
    </>
  );

  if (!open) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/85 to-transparent pb-4 pt-8">
        <div className="mx-auto flex max-w-[720px] justify-center px-4">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="group flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/80 px-2.5 py-2.5 shadow-2xl backdrop-blur-xl transition hover:border-primary/40"
          >
            <div className="animate-pulse-glow relative flex h-11 flex-1 items-center gap-3 overflow-hidden rounded-xl border border-primary/25 bg-white/[0.03] px-3 text-left shadow-glow">
              <span className="pointer-events-none absolute inset-y-0 left-0 w-16 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 group-hover:translate-x-[680%]" />
              <MessageCircle className="size-4 shrink-0 text-primary" />
              {activeAvatarUrl && (
                <img src={activeAvatarUrl} alt="" className="size-7 shrink-0 rounded-full border border-primary/30 object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {activeCharacterName}에게 메시지 입력
              </span>
              <span className="shrink-0 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                호감도 {affection}
              </span>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition group-hover:bg-primary group-hover:text-primary-foreground">
              <Send className="size-4" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 translate-y-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/90 to-transparent pt-10 transition-transform">
      <div className="mx-auto max-w-[768px] px-4">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-t-2xl border-x border-t border-white/10 bg-black/90 px-3 shadow-lg backdrop-blur-xl"
        >
          <MessageCircle className="size-4 text-primary" />
          {activeAvatarUrl && (
            <img src={activeAvatarUrl} alt="" className="size-7 rounded-full border border-primary/30 object-cover" />
          )}
          <span className="min-w-0 text-center text-sm font-medium">
            {activeCharacterName}와 대화
          </span>
          <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
            호감도 {affection}
          </span>
          <X className="size-4" />
        </button>

        <div className="flex max-h-[46vh] flex-col border-x border-white/10 bg-black/90 backdrop-blur-xl">
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {chatCharacters.length > 1 ? (
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {chatCharacters.map((character) => {
                    const active = character.id === activeCharacter?.id;
                    return (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => setSelectedCharacterId(character.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
                          active
                            ? "border-primary/60 bg-primary text-primary-foreground"
                            : "border-border bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        )}
                      >
                        {active && activeAvatarUrl && (
                          <img src={activeAvatarUrl} alt="" className="size-4 rounded-full object-cover" />
                        )}
                        {character.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                  {activeCharacterName}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                  <Heart className="size-3 fill-rose-400" />
                  {affection}
                </span>
                {lastReward && <span className="text-[11px] font-semibold text-rose-300">+2</span>}
              </div>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  className="shrink-0 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="min-h-[96px] flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {messages.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {activeCharacterName}에게 말을 걸어보세요.
              </p>
            )}
            {messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={cn("flex items-start gap-2", isUser ? "justify-end" : "justify-start")}>
                  {!isUser && (
                    <div className="mt-1 grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted/60">
                      {activeAvatarUrl ? (
                        <img src={activeAvatarUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-[11px] font-semibold text-muted-foreground">{activeCharacterName.slice(0, 1)}</span>
                      )}
                    </div>
                  )}
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line", isUser ? "bg-primary text-primary-foreground" : "bg-muted/60")}>
                    {!isUser && <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{activeCharacterName}</div>}
                    {text || (isStreaming && !isUser ? "..." : "")}
                  </div>
                </div>
              );
            })}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted/60 px-3 py-2 text-sm">
                  <Loader2 className="inline size-3 animate-spin" />
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end justify-center gap-2 border-t border-white/10 p-2"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={`${activeCharacterName}에게 보낼 말을 입력하세요`}
              className="min-h-10 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || isStreaming} className="h-9">
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
