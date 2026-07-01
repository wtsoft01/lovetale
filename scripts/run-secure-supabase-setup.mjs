import { spawn } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";

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

const secretsPath = ".supabase-secrets.local.txt";
const secrets = readEnvFile(secretsPath);
const accessToken = requireSecret(secrets, "SUPABASE_ACCESS_TOKEN");
const dbPassword = requireSecret(secrets, "SUPABASE_DB_PASSWORD");
const firstAdminPassword = requireSecret(secrets, "FIRST_ADMIN_PASSWORD");

if (!accessToken.startsWith("sbp_")) throw new Error("SUPABASE_ACCESS_TOKEN must start with sbp_");

const cliEnv = { SUPABASE_ACCESS_TOKEN: accessToken };

try {
  console.log("Linking Supabase project...");
  await run("npx", ["supabase", "link", "--project-ref", "grpjivnbyzlpoonfzfjx"], {
    env: cliEnv,
    input: `${dbPassword}\n`,
  });

  console.log("Pushing Supabase migrations...");
  await run("npx", ["supabase", "db", "push", "--linked", "--include-all", "--yes"], {
    env: cliEnv,
  });

  console.log("Bootstrapping first admin...");
  await run("node", [".\\scripts\\bootstrap-first-admin.mjs"], {
    input: `${firstAdminPassword}\n`,
  });

  unlinkSync(secretsPath);
  console.log("Secure setup complete. Local secrets file deleted.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
