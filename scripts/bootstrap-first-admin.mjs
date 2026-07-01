import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { stdin } from "node:process";

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

async function readStdin() {
  if (stdin.isTTY) {
    return await new Promise((resolve) => {
      let value = "";
      process.stdout.write("Admin password: ");
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        for (const char of chunk) {
          if (char === "\u0003") process.exit(130);
          if (char === "\r" || char === "\n") {
            stdin.setRawMode(false);
            process.stdout.write("\n");
            resolve(value);
            return;
          }
          if (char === "\u0008" || char === "\u007f") {
            value = value.slice(0, -1);
            return;
          }
          value += char;
        }
      });
    });
  }

  let out = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) out += chunk;
  return out.trim();
}

const env = { ...readEnvFile(".env.local"), ...process.env };
const url = env.SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
const email = env.FIRST_ADMIN_EMAIL || "admin@lovetale.org";
const password = await readStdin();

if (!url || !serviceRole) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!password) throw new Error("Admin password was not provided on stdin");

const supabase = createClient(url, serviceRole, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

let action = "created";
let userId = null;
const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "Lovetale Admin" },
});

if (created.error) {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find((row) => row.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw created.error;
  userId = user.id;
  const updated = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { ...(user.user_metadata ?? {}), display_name: user.user_metadata?.display_name ?? "Lovetale Admin" },
  });
  if (updated.error) throw updated.error;
  action = "updated";
} else {
  userId = created.data.user.id;
}

const roles = ["admin", "editor", "moderator"].map((role) => ({ user_id: userId, role }));
const roleResult = await supabase.from("user_roles").upsert(roles, { onConflict: "user_id,role" });
if (roleResult.error) throw roleResult.error;

console.log(JSON.stringify({ ok: true, action, email, userId, roles: roles.map((row) => row.role) }));
