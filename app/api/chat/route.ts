import { NextResponse } from "next/server";
import { answerCatalogQuestionStream } from "@/lib/chat";
import { appendChatSessionLog, createChatSessionTimestamp } from "@/lib/chat-logging";
import { createEmptyConversationState } from "@/lib/conversation-state";
import type { ChatStreamEvent, ChatTurn, ConversationState } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      history?: ChatTurn[];
      state?: ConversationState;
      sessionStartedAt?: string;
    };
    const history = Array.isArray(body.history) ? body.history : [];
    const state = body.state ?? createEmptyConversationState();
    const sessionStartedAt = body.sessionStartedAt || createChatSessionTimestamp();

    await appendChatSessionLog({
      timestamp: new Date().toISOString(),
      sessionStartedAt,
      event: "request",
      history,
      state,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ChatStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          const response = await answerCatalogQuestionStream(
            history,
            state,
            (delta) => {
              send({
                type: "delta",
                delta,
              });
            },
          );

          send({
            type: "done",
            payload: response,
          });

          await appendChatSessionLog({
            timestamp: new Date().toISOString(),
            sessionStartedAt,
            event: "response",
            payload: response,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Chat request failed.";
          send({
            type: "error",
            error: message,
          });

          await appendChatSessionLog({
            timestamp: new Date().toISOString(),
            sessionStartedAt,
            event: "error",
            error: message,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chat request failed.",
      },
      { status: 500 },
    );
  }
}
