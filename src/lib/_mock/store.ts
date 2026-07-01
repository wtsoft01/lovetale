// Browser-only localStorage-backed mock store powering the demo build.
// No network, no Supabase — all state lives in the current browser.

const KEY = "lovetale_mock_v1";

export type MockUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHint: string; // any password works in demo, but we keep last set value
  createdAt: string;
};

export type MockProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  age_verified: boolean;
  is_subscribed: boolean;
  subscription_expires_at: string | null;
  created_at: string;
};

export type MockStory = {
  id: string;
  user_id: string;
  title: string;
  logline: string | null;
  cover_url: string | null;
  body_text: string | null;
  beats: any[];
  asset_slots: any[];
  character_card: any;
  status: string;
  is_public: boolean;
  is_listed: boolean;
  price_credits: number;
  audience: string;
  max_heat: string;
  tags: string[];
  compose_step: string;
  source_prompt: string;
  created_at: string;
  updated_at: string;
};

export type MockSession = {
  id: string;
  user_id: string;
  story_id: string;
  character_id: string | null;
  current_node: string;
  affection: number;
  mode: "vn" | "chat";
  is_completed: boolean;
  is_bookmarked: boolean;
  ending_id: string | null;
  updated_at: string;
};

type Schema = {
  users: MockUser[];
  profiles: MockProfile[];
  roles: { user_id: string; role: "admin" | "editor" | "moderator" }[];
  stories: MockStory[];
  sessions: MockSession[];
  affections: { user_id: string; story_id: string; affection: number; updated_at: string }[];
  unlocks: {
    user_id: string;
    story_id: string;
    beat_id: string;
    heat_tier: string;
    credits_spent: number;
    created_at: string;
  }[];
  savedEndings: {
    id: string;
    user_id: string;
    story_id: string;
    ending_id: string;
    ending_title: string;
    ending_kind: string | null;
    created_at: string;
  }[];
  purchases: {
    id: string;
    buyer_id: string;
    story_id: string;
    price_credits_paid: number;
    created_at: string;
  }[];
  homePlacements: {
    id: string;
    slot: "hero" | "trending" | "new";
    sort_order: number;
    is_active: boolean;
    story_id: string;
    created_at: string;
  }[];
  currentUserId: string | null;
  bootstrapped: boolean;
};

function empty(): Schema {
  return {
    users: [],
    profiles: [],
    roles: [],
    stories: [],
    sessions: [],
    affections: [],
    unlocks: [],
    savedEndings: [],
    purchases: [],
    homePlacements: [],
    currentUserId: null,
    bootstrapped: false,
  };
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

let cache: Schema | null = null;

function load(): Schema {
  if (cache) return cache;
  if (!isBrowser()) {
    cache = empty();
    return cache;
  }
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Schema) : empty();
  } catch {
    cache = empty();
  }
  if (!cache.bootstrapped) seed(cache);
  return cache;
}

function save() {
  if (!isBrowser() || !cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent("mock-store-changed"));
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function seed(s: Schema) {
  // Seed with a handful of demo public stories so the marketplace isn't empty.
  // Author = a phantom user that no one logs in as.
  const demoAuthor: MockUser = {
    id: "demo-author",
    email: "studio@lovetale.demo",
    displayName: "Lovetale Studio",
    passwordHint: "",
    createdAt: new Date().toISOString(),
  };
  s.users.push(demoAuthor);
  s.profiles.push({
    id: demoAuthor.id,
    display_name: demoAuthor.displayName,
    avatar_url: null,
    credits: 0,
    age_verified: true,
    is_subscribed: false,
    subscription_expires_at: null,
    created_at: demoAuthor.createdAt,
  });

  const samples = [
    {
      title: "비밀 계약: 한 달간의 위장 연인",
      logline: "차가운 재벌과의 위험한 거래, 그 끝에 남는 진심.",
      max_heat: "spicy",
      price: 0,
      tags: ["로맨스", "재벌", "오피스"],
    },
    {
      title: "한밤의 도서관, 별의 마녀",
      logline: "잠들지 못한 견습 마녀가 너에게만 보여주는 또 다른 얼굴.",
      max_heat: "warm",
      price: 0,
      tags: ["판타지", "마법", "다정"],
    },
    {
      title: "졸업식 전야, 옥상의 고백",
      logline: "10년지기 소꿉친구의 첫 밤.",
      max_heat: "warm",
      price: 0,
      tags: ["청춘", "소꿉친구"],
    },
    {
      title: "야근 후, 사장실의 두 번째 얼굴",
      logline: "엘리베이터가 멈춘 그 밤, 그가 넥타이를 푼다.",
      max_heat: "spicy",
      price: 12,
      tags: ["오피스", "금단"],
    },
  ];
  const now = Date.now();
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    s.stories.push({
      id: uid(),
      user_id: demoAuthor.id,
      title: x.title,
      logline: x.logline,
      cover_url: null,
      body_text:
        "잠깐의 침묵이 흐르고, 그가 천천히 너에게 다가왔다. 시간은 멈춘 듯 느렸고, 심장만 너무 크게 뛰었다.\n\n" +
        "“…진짜로 괜찮은 거 맞아?”\n\n낮은 목소리가 귓가에 닿았을 때, 너는 무어라 답해야 할지 알 수 없었다.",
      beats: [],
      asset_slots: [],
      character_card: { contentType: "web_novel", chapters: [], characters: [], storyOverview: x.logline },
      status: "published",
      is_public: true,
      is_listed: true,
      price_credits: x.price,
      audience: "all",
      max_heat: x.max_heat,
      tags: x.tags,
      compose_step: "published",
      source_prompt: "demo seed",
      created_at: new Date(now - i * 86400_000).toISOString(),
      updated_at: new Date(now - i * 86400_000).toISOString(),
    });
  }

  // Promote first as hero, next two as trending, last as new.
  s.homePlacements.push({
    id: uid(),
    slot: "hero",
    sort_order: 0,
    is_active: true,
    story_id: s.stories[0].id,
    created_at: new Date().toISOString(),
  });
  s.homePlacements.push({
    id: uid(),
    slot: "trending",
    sort_order: 0,
    is_active: true,
    story_id: s.stories[1].id,
    created_at: new Date().toISOString(),
  });
  s.homePlacements.push({
    id: uid(),
    slot: "trending",
    sort_order: 1,
    is_active: true,
    story_id: s.stories[2].id,
    created_at: new Date().toISOString(),
  });
  s.homePlacements.push({
    id: uid(),
    slot: "new",
    sort_order: 0,
    is_active: true,
    story_id: s.stories[3].id,
    created_at: new Date().toISOString(),
  });

  s.bootstrapped = true;
  // Don't save yet — wait until first mutation; but persist anyway so the
  // hero appears on first load before any user action.
  cache = s;
  save();
}

export const mockStore = {
  read(): Schema {
    return load();
  },
  write(mutator: (s: Schema) => void) {
    const s = load();
    mutator(s);
    save();
  },
  reset() {
    if (!isBrowser()) return;
    localStorage.removeItem(KEY);
    cache = null;
  },
  uid,
  currentUserId(): string | null {
    return load().currentUserId;
  },
  requireUserId(): string {
    const id = load().currentUserId;
    if (!id) throw new Error("로그인이 필요합니다.");
    return id;
  },
  currentProfile(): MockProfile | null {
    const s = load();
    if (!s.currentUserId) return null;
    return s.profiles.find((p) => p.id === s.currentUserId) ?? null;
  },
  rolesOf(userId: string): ("admin" | "editor" | "moderator")[] {
    return load().roles.filter((r) => r.user_id === userId).map((r) => r.role);
  },
};

// ── Mock auth API used by the auth page + provider ──────────────────────
export function mockSignUp(email: string, _password: string, displayName?: string) {
  const s = load();
  const existing = s.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    throw new Error("이미 가입된 이메일이에요. 로그인해 주세요.");
  }
  const id = uid();
  const isFirstHuman = s.users.filter((u) => u.id !== "demo-author").length === 0;
  const user: MockUser = {
    id,
    email,
    displayName: displayName || email.split("@")[0],
    passwordHint: _password,
    createdAt: new Date().toISOString(),
  };
  s.users.push(user);
  s.profiles.push({
    id,
    display_name: user.displayName,
    avatar_url: null,
    credits: 100,
    age_verified: false,
    is_subscribed: false,
    subscription_expires_at: null,
    created_at: user.createdAt,
  });
  if (isFirstHuman) {
    s.roles.push({ user_id: id, role: "admin" });
    s.roles.push({ user_id: id, role: "editor" });
    s.roles.push({ user_id: id, role: "moderator" });
  }
  s.currentUserId = id;
  save();
  return user;
}

export function mockSignIn(email: string, _password: string) {
  const s = load();
  const user = s.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    throw new Error("등록되지 않은 이메일이에요. 먼저 회원가입을 해주세요.");
  }
  s.currentUserId = user.id;
  save();
  return user;
}

export function mockSignInDemoGoogle() {
  const s = load();
  let user = s.users.find((u) => u.email === "demo.google@lovetale.demo");
  if (!user) {
    user = {
      id: uid(),
      email: "demo.google@lovetale.demo",
      displayName: "Google Demo",
      passwordHint: "",
      createdAt: new Date().toISOString(),
    };
    const isFirstHuman = s.users.filter((u) => u.id !== "demo-author").length === 0;
    s.users.push(user);
    s.profiles.push({
      id: user.id,
      display_name: user.displayName,
      avatar_url: null,
      credits: 100,
      age_verified: false,
      is_subscribed: false,
      subscription_expires_at: null,
      created_at: user.createdAt,
    });
    if (isFirstHuman) {
      s.roles.push({ user_id: user.id, role: "admin" });
      s.roles.push({ user_id: user.id, role: "editor" });
      s.roles.push({ user_id: user.id, role: "moderator" });
    }
  }
  s.currentUserId = user.id;
  save();
  return user;
}

export function mockSignOut() {
  const s = load();
  s.currentUserId = null;
  save();
}

export function subscribeMockStore(cb: () => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = () => cb();
  window.addEventListener("mock-store-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("mock-store-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
