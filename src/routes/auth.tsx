import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { getStaffAccess } from "@/lib/staff-access";

const FIRST_ADMIN_EMAIL = "admin@lovetale.org";

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

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const user = data.user;
    if (user?.email?.trim().toLowerCase() === FIRST_ADMIN_EMAIL) {
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
    if (data.user?.email?.trim().toLowerCase() === FIRST_ADMIN_EMAIL) {
      await bootstrapFirstAdmin(data.user.id, data.user.email ?? normalizedEmail);
    }
    toast.success("계정이 만들어졌어. 메일을 확인해줘.");
  }

  async function google() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message ?? "Google 로그인 실패");
      return;
    }
    if (result.redirected) return;
    router.invalidate();
    const { data } = await supabase.auth.getSession();
    const role = await getStaffAccess({
      userId: data.session?.user.id,
      accessToken: data.session?.access_token,
      email: data.session?.user.email ?? undefined,
    }).catch(() => null);
    navigate({ to: role?.hasAny ? "/admin" : "/" });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight">
          Lovetale
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
              placeholder="admin@lovetale.org"
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
          <Divider />
          <GoogleButton onClick={google} disabled={busy} />
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
          <Divider />
          <GoogleButton onClick={google} disabled={busy} />
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

function Divider() {
  return (
    <div className="relative my-2">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
        <span className="bg-background px-2 text-muted-foreground">또는</span>
      </div>
    </div>
  );
}

function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={disabled} className="w-full">
      <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.4 0-9.9-3.4-11.5-8.1l-6.5 5C9.5 39.7 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"/>
      </svg>
      Google로 계속하기
    </Button>
  );
}
