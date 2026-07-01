import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MyProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  is_subscribed: boolean;
  subscription_expires_at: string | null;
  age_verified: boolean;
  created_at: string;
  updated_at: string;
};

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as any).userId as string;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, credits, is_subscribed, subscription_expires_at, age_verified, created_at, updated_at")
      .eq("id", userId)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("프로필을 찾을 수 없습니다.");
    return data as MyProfile;
  });

export const verifyAge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { confirm: boolean })
  .handler(async ({ data, context }) => {
    if (!data?.confirm) throw new Error("성인 인증 동의가 필요합니다.");
    const userId = (context as any).userId as string;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ age_verified: true, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
