import { createFileRoute } from "@tanstack/react-router";

function envValue(name: string): string {
  return (process.env[name] ?? "").trim();
}

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

export const Route = createFileRoute("/api/auth/password-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const email = String(body.email ?? "").trim();
        const password = String(body.password ?? "");

        if (!email || !password) {
          return jsonError("이메일과 비밀번호를 입력해 주세요.");
        }

        const supabaseUrl = envValue("SUPABASE_URL") || envValue("VITE_SUPABASE_URL");
        const publishableKey =
          envValue("SUPABASE_PUBLISHABLE_KEY") || envValue("VITE_SUPABASE_PUBLISHABLE_KEY");

        if (!supabaseUrl || !publishableKey) {
          return jsonError("로그인 서버 설정이 누락되었습니다.", 500);
        }

        const authUrl = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`;
        const response = await fetch(authUrl, {
          method: "POST",
          headers: {
            apikey: publishableKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        }).catch((error) => {
          console.error("[api/auth/password-login] fetch failed", error);
          return null;
        });

        if (!response) {
          return jsonError("로그인 서버에 연결할 수 없습니다.", 502);
        }

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          const message =
            typeof payload.msg === "string"
              ? payload.msg
              : typeof payload.message === "string"
                ? payload.message
                : "로그인에 실패했습니다.";
          return jsonError(message, response.status === 400 ? 401 : response.status);
        }

        return Response.json(
          {
            ok: true,
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            expires_in: payload.expires_in,
            token_type: payload.token_type,
            user: payload.user,
          },
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      },
    },
  },
});
