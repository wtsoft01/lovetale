// Demo-mode stub for the Lovable integration helper. Mirrors only the
// surface the app touches: lovable.auth.signInWithOAuth.
import { mockSignInDemoGoogle } from "@/lib/_mock/store";

export const lovable = {
  auth: {
    async signInWithOAuth(_provider: string, _opts?: { redirect_uri?: string }) {
      mockSignInDemoGoogle();
      return { redirected: false, error: null as { message?: string } | null };
    },
  },
};
