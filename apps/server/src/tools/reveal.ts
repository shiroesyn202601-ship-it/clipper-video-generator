import { spawn } from "node:child_process";

/**
 * Opens a folder in the OS file manager. Fire-and-forget: file managers return odd exit codes
 * (explorer.exe exits 1 on success), so the result is not awaited or checked.
 */
export function revealInFileManager(directory: string): void {
  const command =
    process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [directory], { detached: true, stdio: "ignore", windowsHide: false });
  child.on("error", () => undefined);
  child.unref();
}
