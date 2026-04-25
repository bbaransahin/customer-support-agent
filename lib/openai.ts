import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return cachedClient;
}

export async function getEmbeddingBatch(input: string[], model: string) {
  const client = getOpenAIClient();
  const batchSize = 200;
  const vectors: number[][] = [];

  for (let index = 0; index < input.length; index += batchSize) {
    const chunk = input.slice(index, index + batchSize);
    const response = await client.embeddings.create({
      model,
      input: chunk,
    });

    vectors.push(...response.data.map((item) => item.embedding));
  }

  return vectors;
}
