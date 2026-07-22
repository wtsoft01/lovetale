import { supabase } from "@/integrations/supabase/client";

export const lovable = {
  auth: {
    async signInWithOAuth(provider: string, opts?: { redirect_uri?: string }) {
      if (provider !== "google") {
        return {
          redirected: false,
          error: { message: `Unsupported OAuth provider: ${provider}` },
        };
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin,
        },
      });

      return { redirected: Boolean(data.url), error };
    },
  },
};
