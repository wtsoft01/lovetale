import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function readEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...readEnvFile(".env.local"), ...process.env };
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const email = process.argv[2] ?? "admin@lovetale.org";
const password = process.argv[3] ?? "";
if (!email || !password) throw new Error("email/password required");

const result = await supabase.auth.signInWithPassword({ email, password });
console.log(JSON.stringify({
  ok: !result.error,
  error: result.error?.message ?? null,
  user: result.data.user?.email ?? null,
  session: Boolean(result.data.session),
}, null, 2));
