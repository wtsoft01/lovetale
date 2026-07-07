import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getFreshAccessToken } from "@/lib/supabase-auth-fetch";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      await getFreshAccessToken();
    } catch {
      throw redirect({ to: "/auth" });
    }

    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data.user;
    if (!user) throw redirect({ to: "/auth" });
    return { user: { id: user.id, email: user.email } };
  },
  component: () => <Outlet />,
});
