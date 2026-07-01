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
const roles = ["admin", "editor", "moderator"];

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
if (!user) throw new Error("Super admin user was not found");

const rows = roles.map((role) => ({ user_id: user.id, role }));
const upserted = await supabase.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
if (upserted.error) throw upserted.error;

console.log(JSON.stringify({ ok: true, email, roles }, null, 2));
