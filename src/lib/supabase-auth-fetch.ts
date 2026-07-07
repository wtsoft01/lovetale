import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const REFRESH_MARGIN_SECONDS = 90;

function shouldRefreshSession(session: Session | null) {
  const expiresAt = Number(session?.expires_at ?? 0);
  return Boolean(session?.refresh_token && expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + REFRESH_MARGIN_SECONDS);
}

async function refreshAccessToken() {
  const { data: current } = await supabase.auth.getSession();
  const { data, error } = await supabase.auth.refreshSession(current.session ?? undefined);
  if (error) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");

  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

export async function getFreshAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);

  let session = data.session ?? null;
  if (shouldRefreshSession(session)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession(session);
    if (refreshError) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
    session = refreshed.session ?? null;
  }

  const token = session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return token;
}

export async function fetchWithSupabaseAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getFreshAccessToken()}`);

  let response = await fetch(input, { ...init, headers });
  if (response.status !== 401) return response;

  try {
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${await refreshAccessToken()}`);
    response = await fetch(input, { ...init, headers: retryHeaders });
  } catch {
    // Let the original 401 response surface through the existing per-API error parser.
  }

  return response;
}
