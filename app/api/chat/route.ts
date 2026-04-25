import { NextResponse } from "next/server";
import { answerCatalogQuestion } from "@/lib/chat";
import type { ChatTurn } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { history?: ChatTurn[] };
    const history = Array.isArray(body.history) ? body.history : [];
    const response = await answerCatalogQuestion(history);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chat request failed.",
      },
      { status: 500 },
    );
  }
}
