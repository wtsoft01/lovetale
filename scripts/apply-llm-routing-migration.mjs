import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function readEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function requireSecret(secrets, key) {
  const value = secrets[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function run(command, args, { env = {}, input = "" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
      env: { ...process.env, ...env },
    });
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

const secrets = readEnvFile(".supabase-secrets.local.txt");
const accessToken = requireSecret(secrets, "SUPABASE_ACCESS_TOKEN");
const dbPassword = requireSecret(secrets, "SUPABASE_DB_PASSWORD");

if (!accessToken.startsWith("sbp_")) throw new Error("SUPABASE_ACCESS_TOKEN must start with sbp_");

await run("npx", ["supabase", "link", "--project-ref", "grpjivnbyzlpoonfzfjx"], {
  env: { SUPABASE_ACCESS_TOKEN: accessToken },
  input: `${dbPassword}\n`,
});

await run("npx", ["supabase", "db", "query", "--linked", "--file", "supabase/llm-routing-apply.sql"], {
  env: { SUPABASE_ACCESS_TOKEN: accessToken },
});

console.log("LLM routing migration applied.");
