import { NextResponse } from "next/server";
import { buildEmbeddingIndex } from "@/lib/retrieval";

export async function POST() {
  try {
    const index = await buildEmbeddingIndex();
    return NextResponse.json({
      message: `Indexed ${index.metadata.productCount} products at ${index.metadata.generatedAt}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rebuild index.",
      },
      { status: 500 },
    );
  }
}
