import { createEmptyConversationState } from "@/lib/conversation-state";
import { answerCatalogQuestion } from "@/lib/chat";
import type { ProductRecord, RetrievedContext } from "@/lib/types";

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
    specifications: [
      { key: "Material", value: "Microfiber" },
      { key: "Color", value: "Grey" },
    ],
    searchText: "alpha sofa fabhomedecor furniture microfiber grey",
  },
  {
    id: "2",
    pid: "2",
    uniqId: "u2",
    name: "Beta Sofa",
    brand: "FabHomeDecor",
    retailPrice: 26000,
    discountedPrice: 18000,
    description: "Compact fabric sofa",
    categoryTrail: ["Furniture", "Living Room Furniture"],
    primaryCategory: "Furniture",
    rating: "4",
    overallRating: "4",
    productUrl: "",
    images: [],
    specifications: [{ key: "Material", value: "Fabric" }],
    searchText: "beta sofa fabhomedecor furniture fabric",
  },
  {
    id: "3",
    pid: "3",
    uniqId: "u3",
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
    searchText: "red flats aw footwear casual ballerinas women red",
  },
];

const retrievalMocks = vi.hoisted(() => ({
  getCatalogSource: vi.fn(),
  getProductsByIds: vi.fn(),
  resolveProductsByReference: vi.fn(),
  retrieveRelevantDocuments: vi.fn(),
  structuredSearchProducts: vi.fn(),
  toProductMatch: vi.fn(),
  pickConfidentDocuments: vi.fn(),
}));

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/retrieval", () => ({
  getCatalogSource: retrievalMocks.getCatalogSource,
  getProductsByIds: retrievalMocks.getProductsByIds,
  pickConfidentDocuments: retrievalMocks.pickConfidentDocuments,
  resolveProductsByReference: retrievalMocks.resolveProductsByReference,
  retrieveRelevantDocuments: retrievalMocks.retrieveRelevantDocuments,
  structuredSearchProducts: retrievalMocks.structuredSearchProducts,
  toProductMatch: retrievalMocks.toProductMatch,
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({
    responses: {
      create: openAiMocks.create,
    },
  }),
}));

describe("chat orchestration", () => {
  beforeEach(() => {
    retrievalMocks.getCatalogSource.mockResolvedValue(products);
    retrievalMocks.getProductsByIds.mockImplementation(async (ids: string[]) =>
      products.filter((product) => ids.includes(product.id)),
    );
    retrievalMocks.resolveProductsByReference.mockImplementation(async (reference: string) => {
      const matches = products
        .filter((product) => product.name.toLowerCase().includes(reference.toLowerCase()))
        .map((product) => ({
          product,
          confidence: product.name === "Alpha Sofa" ? 0.98 : 0.95,
        }));
      return matches;
    });
    retrievalMocks.retrieveRelevantDocuments.mockResolvedValue([]);
    retrievalMocks.structuredSearchProducts.mockResolvedValue([]);
    retrievalMocks.toProductMatch.mockImplementation((product: ProductRecord, confidence = 1) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.primaryCategory,
      price: product.discountedPrice ?? product.retailPrice,
      confidence,
    }));
    retrievalMocks.pickConfidentDocuments.mockImplementation((results: RetrievedContext[]) => results);
    openAiMocks.create.mockResolvedValue({
      output_text: "Alpha Sofa mentions microfiber upholstery in the catalog.",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured search results for product discovery questions", async () => {
    retrievalMocks.structuredSearchProducts.mockResolvedValue([products[0], products[1]]);

    const response = await answerCatalogQuestion(
      [{ role: "user", content: "Show me sofas under 25000" }],
      createEmptyConversationState(),
    );

    expect(response.intent).toBe("search");
    expect(response.responseType).toBe("search_results");
    expect(response.products).toHaveLength(2);
    expect(response.state.candidateProductIds).toEqual(["1", "2"]);
    expect(response.state.lastAppliedFilters?.maxPrice).toBe(25000);
  });

  it("answers product-detail follow-ups from active state", async () => {
    const response = await answerCatalogQuestion(
      [{ role: "user", content: "What is its price?" }],
      {
        ...createEmptyConversationState(),
        activeProductIds: ["1"],
        candidateProductIds: ["1", "2"],
      },
    );

    expect(response.intent).toBe("detail_lookup");
    expect(response.responseType).toBe("answer");
    expect(response.message).toContain("Alpha Sofa");
    expect(response.message).toContain("Rs. 22000");
    expect(response.state.activeProductIds).toEqual(["1"]);
  });

  it("compares products from candidate ordinals", async () => {
    const response = await answerCatalogQuestion(
      [{ role: "user", content: "Compare the first and second products" }],
      {
        ...createEmptyConversationState(),
        candidateProductIds: ["1", "2"],
      },
    );

    expect(response.intent).toBe("compare");
    expect(response.responseType).toBe("comparison");
    expect(response.products.map((product) => product.id)).toEqual(["1", "2"]);
    expect(response.message).toContain("Comparing Alpha Sofa and Beta Sofa");
  });

  it("asks for clarification when a singular follow-up refers to multiple candidates", async () => {
    const response = await answerCatalogQuestion(
      [{ role: "user", content: "What is its material?" }],
      {
        ...createEmptyConversationState(),
        candidateProductIds: ["1", "2"],
      },
    );

    expect(response.responseType).toBe("clarification");
    expect(response.state.pendingClarification?.reason).toBe("ambiguous_product");
  });

  it("uses semantic retrieval for catalog QA questions", async () => {
    const retrievedContext: RetrievedContext[] = [
      {
        productId: "1",
        productName: "Alpha Sofa",
        score: 0.82,
        summary: "Material: Microfiber",
      },
    ];
    retrievalMocks.retrieveRelevantDocuments.mockResolvedValue(retrievedContext);

    const response = await answerCatalogQuestion(
      [{ role: "user", content: "Which product mentions microfiber?" }],
      createEmptyConversationState(),
    );

    expect(response.intent).toBe("catalog_qa");
    expect(response.responseType).toBe("answer");
    expect(response.debugContext.retrievalStrategy).toBe("semantic_catalog");
    expect(response.debugContext.retrievedContext).toEqual(retrievedContext);
    expect(response.message).toContain("microfiber upholstery");
  });

  it("falls back to streamed deltas when the completed event has no output_text", async () => {
    const retrievedContext: RetrievedContext[] = [
      {
        productId: "1",
        productName: "Alpha Sofa",
        score: 0.82,
        summary: "Material: Microfiber",
      },
    ];
    retrievalMocks.retrieveRelevantDocuments.mockResolvedValue(retrievedContext);
    openAiMocks.create.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "response.output_text.delta",
          delta: "Alpha Sofa ",
        };
        yield {
          type: "response.output_text.delta",
          delta: "mentions microfiber.",
        };
        yield {
          type: "response.completed",
          response: {},
        };
      },
    });

    const response = await answerCatalogQuestion(
      [{ role: "user", content: "Are there any pet related products?" }],
      createEmptyConversationState(),
    );

    expect(response.intent).toBe("catalog_qa");
    expect(response.responseType).toBe("answer");
    expect(response.message).toBe("Alpha Sofa mentions microfiber.");
  });

  it("reuses prior search filters for cheaper follow-ups", async () => {
    retrievalMocks.structuredSearchProducts.mockResolvedValue([products[1]]);

    const response = await answerCatalogQuestion(
      [{ role: "user", content: "Show cheaper ones" }],
      {
        ...createEmptyConversationState(),
        lastIntent: "search",
        lastAppliedFilters: { category: "Furniture", maxPrice: 22000 },
        activeProductIds: ["1"],
        candidateProductIds: ["1", "2"],
      },
    );

    expect(response.intent).toBe("search");
    expect(response.state.lastAppliedFilters?.category).toBe("Furniture");
    expect(response.state.lastAppliedFilters?.maxPrice).toBe(21999);
  });
});
