import { buildPromptEvidence, cosineSimilarity, filterProducts, searchRelevantDocuments, toDebugRetrievedContext } from "@/lib/retrieval";
import type { EmbeddingIndex, ProductRecord } from "@/lib/types";

const products: ProductRecord[] = [
  {
    id: "1",
    pid: "1",
    uniqId: "u1",
    name: "Alpha Sofa",
    brand: "FabHomeDecor",
    retailPrice: 30000,
    discountedPrice: 22000,
    description: "Microfiber sofa bed",
    categoryTrail: ["Furniture", "Living Room Furniture"],
    primaryCategory: "Furniture",
    rating: "4",
    overallRating: "4",
    productUrl: "",
    images: [],
    specifications: [{ key: "Material", value: "Microfiber" }],
    searchText: "alpha sofa fabhomedecor furniture microfiber",
  },
  {
    id: "2",
    pid: "2",
    uniqId: "u2",
    name: "Red Flats",
    brand: "AW",
    retailPrice: 999,
    discountedPrice: 499,
    description: "Casual ballerinas",
    categoryTrail: ["Footwear"],
    primaryCategory: "Footwear",
    rating: "3",
    overallRating: "3",
    productUrl: "",
    images: [],
    specifications: [{ key: "Color", value: "Red" }],
    searchText: "red flats aw footwear casual ballerinas",
  },
];

describe("retrieval utilities", () => {
  it("filters by query, brand, category, and price", () => {
    expect(
      filterProducts(products, {
        query: "microfiber",
        brand: "FabHomeDecor",
        category: "Furniture",
        minPrice: 20000,
        maxPrice: 23000,
      }),
    ).toHaveLength(1);
  });

  it("matches pluralized query tokens against catalog search text", () => {
    expect(
      filterProducts(products, {
        query: "sofas",
      }),
    ).toHaveLength(1);
  });

  it("scores vectors with cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns the most relevant documents first", () => {
    const index: EmbeddingIndex = {
      metadata: {
        generatedAt: new Date().toISOString(),
        sourceCsvPath: "catalog.csv",
        sourceCsvMtimeMs: 1,
        model: "test",
        dimensions: 2,
        productCount: 2,
        documentCount: 2,
      },
      products,
      documents: [
        {
          id: "1",
          productId: "1",
          productName: "Alpha Sofa",
          brand: "FabHomeDecor",
          category: "Furniture",
          text: "Alpha Sofa Microfiber",
          summary: "Microfiber sofa bed",
          embedding: [0.9, 0.1],
        },
        {
          id: "2",
          productId: "2",
          productName: "Red Flats",
          brand: "AW",
          category: "Footwear",
          text: "Red Flats",
          summary: "Casual ballerinas",
          embedding: [0.1, 0.9],
        },
      ],
    };

    const results = searchRelevantDocuments(index, [1, 0], 1);
    expect(results[0]?.productName).toBe("Alpha Sofa");
    expect(results[0]?.summary).toBe("Microfiber sofa bed");
    expect(results[0]?.evidenceText).toBe("Alpha Sofa Microfiber");
  });

  it("builds longer prompt evidence while preserving tail facts", () => {
    const text = `${"A".repeat(900)}\nWarranty: 6 months domestic warranty`;

    const evidence = buildPromptEvidence(text, 240);

    expect(evidence.length).toBeLessThanOrEqual(240);
    expect(evidence).toContain("Warranty: 6 months domestic warranty");
    expect(evidence).toContain("[...]");
  });

  it("surfaces question-matching evidence snippets for prompt assembly", () => {
    const text = `${"Intro ".repeat(80)}Warranty Summary 6 Months Domestic Warranty${" Tail".repeat(80)}`;

    const evidence = buildPromptEvidence(text, 260, "Which product mentions a 6 months domestic warranty?");

    expect(evidence).toContain("6 Months Domestic Warranty");
  });

  it("keeps debug retrieval context compact", () => {
    const debugContext = toDebugRetrievedContext([
      {
        productId: "1",
        productName: "Alpha Sofa",
        score: 0.91,
        summary: "Microfiber sofa bed",
        evidenceText: "Longer prompt-facing evidence",
      },
    ]);

    expect(debugContext).toEqual([
      {
        productId: "1",
        productName: "Alpha Sofa",
        score: 0.91,
        summary: "Microfiber sofa bed",
      },
    ]);
  });
});
