import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("chat logging", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "chat-logs-"));
    vi.stubEnv("PWD", tempDir);
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes jsonl entries into a file named after the session start timestamp", async () => {
    const { appendChatSessionLog, getChatSessionLogPath } = await import("@/lib/chat-logging");
    const sessionStartedAt = "2026-04-25T10:11:12.345Z";

    await appendChatSessionLog({
      timestamp: "2026-04-25T10:11:12.400Z",
      sessionStartedAt,
      event: "error",
      error: "Chat request failed.",
    });

    const logPath = getChatSessionLogPath(sessionStartedAt);
    expect(path.basename(logPath)).toBe("2026-04-25T10-11-12-345Z.jsonl");

    const content = await readFile(logPath, "utf8");
    expect(content).toContain("\"sessionStartedAt\":\"2026-04-25T10:11:12.345Z\"");
    expect(content).toContain("\"event\":\"error\"");
  });
});
