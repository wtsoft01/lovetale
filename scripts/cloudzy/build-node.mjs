import { spawnSync } from "node:child_process";

const viteBin =
  process.platform === "win32"
    ? "node_modules\\.bin\\vite.cmd"
    : "node_modules/.bin/vite";

const result = spawnSync(viteBin, ["build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NITRO_PRESET: "node-server",
  },
});

process.exit(result.status ?? 1);
