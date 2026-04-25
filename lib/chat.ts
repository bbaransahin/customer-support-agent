import { retrieveRelevantDocuments } from "@/lib/retrieval";
import { getOpenAIClient } from "@/lib/openai";
import type { ChatResponsePayload, ChatTurn, RetrievedContext } from "@/lib/types";

const CHAT_MODEL = "gpt-4.1-mini";

export function buildChatMessages(history: ChatTurn[], context: RetrievedContext[]) {
  const evidence = context
    .map(
      (item, index) =>
        `Source ${index + 1}\nProduct: ${item.productName}\nSimilarity: ${item.score.toFixed(
          3,
        )}\nFacts:\n${item.summary}`,
    )
    .join("\n\n");

  return [
    {
      role: "system" as const,
      content:
        "You are a customer support assistant for a local catalog browser. Answer only from the supplied catalog evidence. Cite matching product names explicitly. If the evidence is insufficient, say that the catalog does not contain enough information. Do not invent warranty, delivery, policy, or availability details unless they appear in the evidence.",
    },
    {
      role: "system" as const,
      content: `Catalog evidence:\n${evidence}`,
    },
    ...history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
  ];
}

export async function answerCatalogQuestion(history: ChatTurn[]): Promise<ChatResponsePayload> {
  const latestUserTurn = [...history].reverse().find((turn) => turn.role === "user");
  if (!latestUserTurn) {
    throw new Error("A user message is required.");
  }

  const context = await retrieveRelevantDocuments(latestUserTurn.content, 5);
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: CHAT_MODEL,
    input: buildChatMessages(history, context),
  });

  const answer = response.output_text.trim();
  let citedProducts = context
    .filter((item) => answer.toLowerCase().includes(item.productName.toLowerCase()))
    .map((item) => item.productName);
  let finalAnswer = answer;

  if (citedProducts.length === 0 && context.length > 0) {
    citedProducts = context.slice(0, 3).map((item) => item.productName);
    finalAnswer = `${answer}\n\nCited products: ${citedProducts.join(", ")}`;
  }

  return {
    answer: finalAnswer,
    citedProducts: [...new Set(citedProducts)],
    contextSummary: context,
  };
}
