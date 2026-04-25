import { buildEmbeddingIndex } from "@/lib/retrieval";

async function main() {
  const index = await buildEmbeddingIndex();
  console.log(
    `Indexed ${index.metadata.productCount} products with ${index.metadata.documentCount} documents.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
