// Runs the local server and the Vite dev server side by side.
// Uses plain Node (no extra dependency) and stops both when one exits.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");

const processes = [
  {
    name: "server",
    color: "\x1b[36m",
    args: [
      "--watch-path=apps/server/src",
      "--watch-path=packages/shared/src",
      "apps/server/src/index.ts",
    ],
    cwd: root,
  },
  { name: "web", color: "\x1b[35m", args: [viteBin], cwd: path.join(root, "apps/web") },
];

const children = processes.map(({ name, color, args, cwd }) => {
  const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = `${color}[${name}]\x1b[0m `;
  const forward = (stream, target) =>
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/))
        if (line) target.write(prefix + line + "\n");
    });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with code ${code}\n`);
    shutdown(code ?? 1);
  });
  return child;
});

let isShuttingDown = false;
function shutdown(code) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
