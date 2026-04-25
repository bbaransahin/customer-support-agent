import { NextResponse } from "next/server";
import { answerCatalogQuestionStream } from "@/lib/chat";
import { createEmptyConversationState } from "@/lib/conversation-state";
import type { ChatStreamEvent, ChatTurn, ConversationState } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { history?: ChatTurn[]; state?: ConversationState };
    const history = Array.isArray(body.history) ? body.history : [];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ChatStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          const response = await answerCatalogQuestionStream(
            history,
            body.state ?? createEmptyConversationState(),
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
        } catch (error) {
          send({
            type: "error",
            error: error instanceof Error ? error.message : "Chat request failed.",
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
