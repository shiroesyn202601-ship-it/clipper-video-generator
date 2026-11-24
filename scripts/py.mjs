// Runs the project venv Python with the given arguments (cross-platform).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const candidates = [
  path.join(root, ".venv", "Scripts", "python.exe"),
  path.join(root, ".venv", "bin", "python"),
];
const python = candidates.find((candidate) => existsSync(candidate));
if (!python) {
  console.error("Python venv not found. Follow SETUP.md step 3 to create .venv.");
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
