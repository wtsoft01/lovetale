import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

function readEnvFile(filePath) {
  const env = {};
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

function requireValue(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

const projectRef = process.argv[2] ?? "grpjivnbyzlpoonfzfjx";
const secrets = readEnvFile(".supabase-secrets.local.txt");
const accessToken = requireValue(secrets, "SUPABASE_ACCESS_TOKEN");
const dbPassword = requireValue(secrets, "SUPABASE_DB_PASSWORD");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const outDir = path.join("cloudzy-db-dumps", stamp);
mkdirSync(outDir, { recursive: true });

const cliEnv = { SUPABASE_ACCESS_TOKEN: accessToken };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const supabase = ["--yes", "supabase@latest"];

await run(npx, [...supabase, "link", "--project-ref", projectRef, "--password", dbPassword, "--yes"], cliEnv);
await run(npx, [...supabase, "db", "dump", "--linked", "--password", dbPassword, "--role-only", "-f", path.join(outDir, "roles.sql")], cliEnv);
await run(npx, [...supabase, "db", "dump", "--linked", "--password", dbPassword, "-f", path.join(outDir, "schema.sql")], cliEnv);
await run(npx, [...supabase, "db", "dump", "--linked", "--password", dbPassword, "--use-copy", "--data-only", "-f", path.join(outDir, "data.sql")], cliEnv);

console.log(`DUMP_DIR=${outDir}`);
