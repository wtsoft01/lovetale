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
const url = env.SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
const email = env.FIRST_ADMIN_EMAIL || "admin@lovetale.org";

if (!url || !serviceRole) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceRole, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;

const user = listed.data.users.find((row) => row.email?.toLowerCase() === email.toLowerCase());
let roles = [];
if (user) {
  const roleResult = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleResult.error) throw roleResult.error;
  roles = (roleResult.data ?? []).map((row) => row.role).sort();
}

console.log(JSON.stringify({
  ok: true,
  userExists: Boolean(user),
  emailConfirmed: Boolean(user?.email_confirmed_at),
  roles,
}, null, 2));
