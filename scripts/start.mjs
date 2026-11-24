// Production-like local run: the server also serves the built web app (npm run build first).
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const child = spawn(process.execPath, ["apps/server/src/index.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});
child.on("exit", (code) => process.exit(code ?? 1));
