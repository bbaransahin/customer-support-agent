import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ChatResponsePayload, ChatTurn, ConversationState } from "@/lib/types";

type ChatLogEntry =
  | {
      timestamp: string;
      sessionStartedAt: string;
      event: "request";
      history: ChatTurn[];
      state: ConversationState;
    }
  | {
      timestamp: string;
      sessionStartedAt: string;
      event: "response";
      payload: ChatResponsePayload;
    }
  | {
      timestamp: string;
      sessionStartedAt: string;
      event: "error";
      error: string;
    };

function sanitizeTimestampForFilename(value: string) {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

export function createChatSessionTimestamp() {
  return new Date().toISOString();
}

export function getChatSessionLogPath(sessionStartedAt: string) {
  return path.join(process.cwd(), "chat-logs", `${sanitizeTimestampForFilename(sessionStartedAt)}.jsonl`);
}

export async function appendChatSessionLog(entry: ChatLogEntry) {
  await mkdir(path.dirname(getChatSessionLogPath(entry.sessionStartedAt)), { recursive: true });
  await appendFile(getChatSessionLogPath(entry.sessionStartedAt), `${JSON.stringify(entry)}\n`, "utf8");
}
