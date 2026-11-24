import path from "node:path";

/** Absolute path of the repository root (apps/server/src/lib → ../../../..). */
export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
