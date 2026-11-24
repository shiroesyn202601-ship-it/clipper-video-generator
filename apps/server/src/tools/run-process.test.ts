import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProcessError, runProcess } from "./run-process.ts";

const node = process.execPath;

describe("runProcess", () => {
  it("captures stdout lines", async () => {
    const lines: string[] = [];
    const result = await runProcess({
      command: node,
      args: ["-e", "console.log('a'); console.log('b')"],
      onStdoutLine: (line) => lines.push(line),
    });
    expect(result.exitCode).toBe(0);
    expect(lines).toEqual(["a", "b"]);
  });

  it("passes arguments literally without a shell", async () => {
    const tricky = "x; echo injected && $(whoami)";
    const result = await runProcess({
      command: node,
      args: ["-e", "console.log(process.argv[1])", tricky],
    });
    expect(result.stdout.trim()).toBe(tricky);
  });

  it("rejects with exit code and stderr tail on failure", async () => {
    const error = await runProcess({
      command: node,
      args: ["-e", "console.error('boom'); process.exit(3)"],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProcessError);
    expect((error as ProcessError).exitCode).toBe(3);
    expect((error as ProcessError).stderrTail).toContain("boom");
  });

  it("reports a missing command", async () => {
    const error = await runProcess({
      command: "definitely-not-a-real-command-xyz",
      args: [],
    }).catch((caught: unknown) => caught);
    expect((error as ProcessError).code).toBe("PROCESS_NOT_FOUND");
  });

  it("stops the process when aborted", async () => {
    const controller = new AbortController();
    const pending = runProcess({
      command: node,
      args: ["-e", "setTimeout(() => {}, 60000)"],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 200);
    const error = await pending.catch((caught: unknown) => caught);
    expect((error as ProcessError).code).toBe("PROCESS_CANCELLED");
  });

  it("writes output to the log file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "clipper-test-"));
    const logFile = path.join(dir, "logs", "stage.log");
    await runProcess({ command: node, args: ["-e", "console.log('logged')"], logFile });
    expect(await readFile(logFile, "utf8")).toContain("logged");
  });
});
