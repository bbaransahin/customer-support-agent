import fs from "node:fs/promises";
import { buildProductDocument, loadProductsFromCsv, PRODUCT_SUBSET_SIZE } from "@/lib/csv";
import { getEmbeddingBatch } from "@/lib/openai";
import { readIndex, writeIndex } from "@/lib/index-store";
import type {
  EmbeddingIndex,
  ProductMatch,
  ProductFilters,
  ProductListResult,
  ProductRecord,
  RetrievedContext,
} from "@/lib/types";

export const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_PAGE_SIZE = 20;

export async function buildEmbeddingIndex() {
  const products = await loadProductsFromCsv();
  const documents = products.map(buildProductDocument);
  const csvStat = await fs.stat("flipkart_com-ecommerce_sample.csv");
  const vectors = await getEmbeddingBatch(
    documents.map((doc) => doc.text),
    EMBEDDING_MODEL,
  );

  if (vectors.length !== documents.length) {
    throw new Error("Embedding count did not match document count.");
  }

  const index: EmbeddingIndex = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceCsvPath: "flipkart_com-ecommerce_sample.csv",
      sourceCsvMtimeMs: csvStat.mtimeMs,
      model: EMBEDDING_MODEL,
      dimensions: vectors[0]?.length ?? 0,
      productCount: products.length,
      documentCount: documents.length,
    },
    products,
    documents: documents.map((doc, indexValue) => ({
      ...doc,
      embedding: vectors[indexValue] ?? [],
    })),
  };

  await writeIndex(index);
  return index;
}

export function getSubsetLabel() {
  return `first ${PRODUCT_SUBSET_SIZE} CSV rows`;
}

export async function getCatalogSource() {
  const index = await readIndex();
  if (index) return index.products;
  return loadProductsFromCsv();
}

export async function queryProducts(
  filters: ProductFilters,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<ProductListResult> {
  const products = await getCatalogSource();
  const filtered = filterProducts(products, filters);
  const start = Math.max(page - 1, 0) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return {
    items,
    total: filtered.length,
    page,
    pageSize,
    totalPages,
    availableBrands: uniqueSorted(products.map((product) => product.brand)),
    availableCategories: uniqueSorted(products.map((product) => product.primaryCategory)),
  };
}

export async function getProductById(id: string) {
  const products = await getCatalogSource();
  return products.find((product) => product.id === id || product.pid === id) ?? null;
}

export async function getProductsByIds(ids: string[]) {
  const idSet = new Set(ids);
  const products = await getCatalogSource();
  return products.filter((product) => idSet.has(product.id) || idSet.has(product.pid));
}

export function filterProducts(products: ProductRecord[], filters: ProductFilters) {
  const query = filters.query?.trim().toLowerCase();

  return products.filter((product) => {
    if (query && !matchesSearchQuery(product.searchText, query)) return false;
    if (filters.brand && product.brand !== filters.brand) return false;
    if (filters.category && product.primaryCategory !== filters.category) return false;

    const price = product.discountedPrice ?? product.retailPrice;
    if (typeof filters.minPrice === "number" && (price === null || price < filters.minPrice)) {
      return false;
    }
    if (typeof filters.maxPrice === "number" && (price === null || price > filters.maxPrice)) {
      return false;
    }
    return true;
  });
}

export async function structuredSearchProducts(
  filters: ProductFilters,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<ProductRecord[]> {
  const products = await getCatalogSource();
  return filterProducts(products, filters).slice(0, pageSize);
}

export async function resolveProductsByReference(reference: string, limit = 5) {
  const normalizedReference = normalizeForMatch(reference);
  if (!normalizedReference) return [];

  const products = await getCatalogSource();
  const scored = products
    .map((product) => ({
      product,
      confidence: scoreProductReferenceMatch(product, normalizedReference),
    }))
    .filter((item) => item.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, limit);

  return scored.map(({ product, confidence }) => ({
    product,
    confidence,
  }));
}

export async function retrieveRelevantDocuments(question: string, topK = 5): Promise<RetrievedContext[]> {
  const index = await readIndex();
  if (!index) {
    throw new Error("No index available. Run reindex first.");
  }

  const [queryEmbedding] = await getEmbeddingBatch([question], index.metadata.model);
  return searchRelevantDocuments(index, queryEmbedding, topK);
}

export function searchRelevantDocuments(index: EmbeddingIndex, queryEmbedding: number[], topK = 5) {
  return index.documents
    .map((doc) => ({
      productId: doc.productId,
      productName: doc.productName,
      summary: doc.summary,
      score: cosineSimilarity(queryEmbedding, doc.embedding),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export function pickConfidentDocuments(results: RetrievedContext[], minimumScore = 0.2) {
  return results.filter((item) => item.score >= minimumScore);
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function matchesSearchQuery(searchText: string, query: string) {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.every((token) => {
    if (searchText.includes(token)) return true;
    if (token.endsWith("s") && searchText.includes(token.slice(0, -1))) return true;
    return false;
  });
}

export function toProductMatch(product: ProductRecord, confidence = 1): ProductMatch {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.primaryCategory,
    price: product.discountedPrice ?? product.retailPrice,
    confidence,
  };
}

function scoreProductReferenceMatch(product: ProductRecord, reference: string) {
  const idValues = [product.id, product.pid, product.uniqId]
    .map((value) => normalizeForMatch(value))
    .filter(Boolean);
  if (idValues.some((value) => value === reference)) return 1;

  const productName = normalizeForMatch(product.name);
  if (productName === reference) return 0.98;
  if (productName.includes(reference)) return 0.92;
  if (reference.includes(productName)) return 0.9;

  const brand = normalizeForMatch(product.brand);
  if (brand && reference === brand) return 0.5;
  if (brand && reference.includes(brand) && productName.split(" ").every((part) => reference.includes(part))) {
    return 0.86;
  }

  return 0;
}

function normalizeForMatch(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
