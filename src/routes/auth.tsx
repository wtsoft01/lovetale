import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getStaffAccess } from "@/lib/staff-access";
import { isSuperAdminEmail } from "@/lib/staff-auth";
import { BrandLogo } from "@/components/brand-logo";

type PasswordLoginPayload = {
  ok?: boolean;
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string | null;
  };
  message?: string;
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "로그인 | Lovetale" },
      { name: "description", content: "Lovetale에 로그인하거나 계정을 생성합니다." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      getStaffAccess({ userId: session.user.id, accessToken: session.access_token, email: session.user.email ?? undefined })
        .then((r) => navigate({ to: r.hasAny ? "/admin" : "/" }))
        .catch(() => navigate({ to: "/" }));
    }
  }, [session, loading, navigate]);

  async function bootstrapFirstAdmin(userId: string, userEmail: string) {
    await fetch("/api/public/bootstrap-admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, email: userEmail }),
    }).catch(() => null);
  }

  function shouldRetryThroughSameOrigin(error: unknown) {
    const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
    return message.includes("failed to fetch") || message.includes("network") || message.includes("fetch");
  }

  async function signInThroughSameOrigin(normalizedEmail: string) {
    const response = await fetch("/api/auth/password-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as PasswordLoginPayload;

    if (!response.ok || !payload.access_token || !payload.refresh_token) {
      throw new Error(payload.message ?? "로그인에 실패했습니다.");
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
    if (error) throw error;

    return {
      session: data.session,
      user: data.user ?? {
        id: payload.user?.id ?? "",
        email: payload.user?.email ?? normalizedEmail,
      },
    };
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    setBusy(true);
    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null = null;
    let error: unknown = null;
    try {
      const result = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      data = result.data;
      error = result.error;
    } catch (caught) {
      error = caught;
    }

    if (error && shouldRetryThroughSameOrigin(error)) {
      try {
        data = await signInThroughSameOrigin(normalizedEmail);
        error = null;
      } catch (caught) {
        error = caught;
      }
    }

    setBusy(false);
    if (error) {
      toast.error(String((error as { message?: unknown })?.message ?? "로그인에 실패했습니다."));
      return;
    }
    const user = data?.user;
    if (!user?.id) {
      toast.error("로그인 세션을 확인할 수 없습니다.");
      return;
    }
    if (isSuperAdminEmail(user.email)) {
      await bootstrapFirstAdmin(user.id, user.email);
    }
    toast.success("로그인 완료");
    router.invalidate();
    const role = await getStaffAccess({
      userId: user.id,
      accessToken: data.session?.access_token,
      email: user.email ?? undefined,
    }).catch(() => null);
    navigate({ to: role?.hasAny ? "/admin" : "/" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    setBusy(true);
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { display_name: displayName || normalizedEmail.split("@")[0] },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (isSuperAdminEmail(data.user?.email)) {
      await bootstrapFirstAdmin(data.user.id, data.user.email ?? normalizedEmail);
    }
    toast.success("계정이 만들어졌어. 바로 로그인할 수 있어.");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <Link to="/" className="inline-flex items-center justify-center">
          <BrandLogo className="h-11 w-[158px]" />
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">계정으로 시작합니다.</p>
      </div>

      <Tabs defaultValue="signin" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">로그인</TabsTrigger>
          <TabsTrigger value="signup">회원가입</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-6 space-y-4">
          <form onSubmit={signIn} className="space-y-3">
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="이메일"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="admin@lovetale.org 또는 staff@lovetale.org"
              required
            />
            <Field
              icon={<Lock className="h-4 w-4" />}
              label="비밀번호"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="비밀번호"
              required
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "로그인"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup" className="mt-6 space-y-4">
          <form onSubmit={signUp} className="space-y-3">
            <Field
              label="표시명"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              placeholder="이름"
            />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="이메일"
              type="email"
              value={email}
              onChange={setEmail}
              required
            />
            <Field
              icon={<Lock className="h-4 w-4" />}
              label="비밀번호"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "계정 만들기"}
            </Button>
          </form>
          <p className="text-center text-[11px] text-muted-foreground">계속 진행하려면 약관과 정책에 동의해줘.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
}: {
  icon?: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={icon ? "pl-9" : ""}
        />
      </div>
    </div>
  );
}
