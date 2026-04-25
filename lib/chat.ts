import { getOpenAIClient } from "@/lib/openai";
import { createEmptyConversationState } from "@/lib/conversation-state";
import {
  getCatalogSource,
  getProductsByIds,
  pickConfidentDocuments,
  resolveProductsByReference,
  retrieveRelevantDocuments,
  structuredSearchProducts,
  toProductMatch,
} from "@/lib/retrieval";
import type {
  ChatIntent,
  ChatResponsePayload,
  ChatTurn,
  ConversationState,
  PendingClarification,
  ProductFilters,
  ProductMatch,
  ProductRecord,
  RetrievedContext,
} from "@/lib/types";

const CHAT_MODEL = "gpt-4.1-mini";
const SEMANTIC_MATCH_THRESHOLD = 0.2;
const SEARCH_RESULT_LIMIT = 5;
const STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "any",
  "are",
  "around",
  "between",
  "can",
  "catalog",
  "compare",
  "details",
  "do",
  "find",
  "for",
  "have",
  "i",
  "in",
  "is",
  "it",
  "its",
  "listed",
  "looking",
  "me",
  "need",
  "of",
  "on",
  "ones",
  "product",
  "products",
  "search",
  "show",
  "some",
  "tell",
  "than",
  "that",
  "the",
  "them",
  "these",
  "this",
  "those",
  "under",
  "what",
  "which",
  "with",
]);

type RequestedAttribute =
  | "price"
  | "brand"
  | "category"
  | "description"
  | "rating"
  | "specifications"
  | "color"
  | "material";

type TurnAnalysis = {
  latestUserMessage: string;
  intent: ChatIntent;
  filters: ProductFilters;
  mentionedReferences: string[];
  requestedAttributes: RequestedAttribute[];
  ordinalIndexes: number[];
  shouldReuseLastFilters: boolean;
  shouldFindCheaper: boolean;
};

type StreamTextCallback = (delta: string) => Promise<void> | void;

function normalizeOutputText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function answerCatalogQuestion(
  history: ChatTurn[],
  state: ConversationState = createEmptyConversationState(),
): Promise<ChatResponsePayload> {
  return answerCatalogQuestionStream(history, state);
}

export async function answerCatalogQuestionStream(
  history: ChatTurn[],
  state: ConversationState = createEmptyConversationState(),
  onDelta?: StreamTextCallback,
): Promise<ChatResponsePayload> {
  const latestUserTurn = [...history].reverse().find((turn) => turn.role === "user");
  if (!latestUserTurn) {
    throw new Error("A user message is required.");
  }

  const catalog = await getCatalogSource();
  const analysis = analyzeTurn(latestUserTurn.content, state, catalog);

  if (analysis.intent === "search") {
    const response = await handleSearchIntent(analysis, state, catalog);
    await streamMessageText(response.message, onDelta);
    return response;
  }

  if (analysis.intent === "detail_lookup") {
    const response = await handleDetailIntent(analysis, state, catalog);
    await streamMessageText(response.message, onDelta);
    return response;
  }

  if (analysis.intent === "compare") {
    const response = await handleCompareIntent(analysis, state, catalog);
    await streamMessageText(response.message, onDelta);
    return response;
  }

  if (analysis.intent === "clarify") {
    const response = buildClarificationResponse("clarify", state, {
      reason: "ambiguous_product",
      message: "I need a more specific product reference. Name the product or refer to a result position like first or second.",
      candidateProductIds: state.candidateProductIds,
    });
    await streamMessageText(response.message, onDelta);
    return response;
  }

  return handleCatalogQaIntentStream(history, analysis, state, onDelta);
}

function analyzeTurn(
  message: string,
  state: ConversationState,
  catalog: ProductRecord[],
): TurnAnalysis {
  const normalizedMessage = normalizeForMatch(message);
  const ordinalIndexes = extractOrdinalIndexes(normalizedMessage);
  const requestedAttributes = extractRequestedAttributes(normalizedMessage);
  const mentionedReferences = extractMentionedReferences(message, catalog);
  const shouldFindCheaper = /\bcheaper\b|\blower priced\b|\bless expensive\b/.test(normalizedMessage);
  const shouldReuseLastFilters = /\bthose\b|\bthese\b|\bsimilar\b|\bmore\b|\bcheaper\b|\bones\b/.test(
    normalizedMessage,
  );

  const hasCompareLanguage =
    /\bcompare\b|\bdifference\b|\bversus\b|\bvs\b|\bwhich is better\b/.test(normalizedMessage);
  const hasSearchLanguage =
    /\bshow\b|\bfind\b|\bsearch\b|\blooking for\b|\blooking\b|\bneed\b|\bunder\b|\bover\b|\bbetween\b/.test(
      normalizedMessage,
    );
  const hasProductReference =
    mentionedReferences.length > 0 ||
    ordinalIndexes.length > 0 ||
    /\bit\b|\bits\b|\bthis product\b|\bthat product\b|\bthe first\b|\bthe second\b/.test(
      normalizedMessage,
    );
  const likelyDetailQuestion =
    requestedAttributes.length > 0 ||
    /\btell me about\b|\bdetails\b|\bspecifications\b|\bprice\b|\brating\b|\bbrand\b|\bmaterial\b|\bcolor\b/.test(
      normalizedMessage,
    );

  let intent: ChatIntent = "catalog_qa";
  if (hasCompareLanguage) {
    intent = "compare";
  } else if (hasProductReference && likelyDetailQuestion) {
    intent = "detail_lookup";
  } else if (shouldReuseLastFilters && state.lastIntent === "search") {
    intent = "search";
  } else if (hasSearchLanguage) {
    intent = "search";
  } else if (hasProductReference) {
    intent = state.candidateProductIds.length > 1 ? "clarify" : "detail_lookup";
  }

  return {
    latestUserMessage: message,
    intent,
    filters: extractFilters(message, catalog),
    mentionedReferences,
    requestedAttributes,
    ordinalIndexes,
    shouldReuseLastFilters,
    shouldFindCheaper,
  };
}

async function handleSearchIntent(
  analysis: TurnAnalysis,
  state: ConversationState,
  catalog: ProductRecord[],
): Promise<ChatResponsePayload> {
  const filters = buildSearchFilters(analysis, state, catalog);
  let products = await structuredSearchProducts(filters, SEARCH_RESULT_LIMIT);
  let retrievalStrategy: ChatResponsePayload["debugContext"]["retrievalStrategy"] = "structured_search";
  let retrievedContext: RetrievedContext[] = [];

  if (products.length === 0 && filters.query) {
    const semanticMatches = pickConfidentDocuments(
      await retrieveRelevantDocuments(filters.query, SEARCH_RESULT_LIMIT),
      SEMANTIC_MATCH_THRESHOLD,
    );
    retrievedContext = semanticMatches;
    const fallbackProducts = await getProductsByIds(semanticMatches.map((item) => item.productId));
    products = fallbackProducts.slice(0, SEARCH_RESULT_LIMIT);
    retrievalStrategy = semanticMatches.length > 0 ? "semantic_catalog" : "structured_search";
  }

  if (products.length === 0) {
    const nextState = {
      ...state,
      activeProductIds: [],
      candidateProductIds: [],
      lastIntent: "search" as const,
      lastAppliedFilters: filters,
      pendingClarification: null,
    };

    return {
      message: "I couldn’t find catalog products that match that search.",
      intent: "search",
      responseType: "no_match",
      products: [],
      state: nextState,
      debugContext: {
        retrievalStrategy,
        retrievedContext,
        appliedFilters: filters,
        resolvedProductIds: [],
      },
    };
  }

  const productMatches = products.map((product) => toProductMatch(product, 1));
  const nextState = {
    ...state,
    activeProductIds: products.length === 1 ? [products[0].id] : [],
    candidateProductIds: products.map((product) => product.id),
    lastIntent: "search" as const,
    lastAppliedFilters: filters,
    pendingClarification: null,
  };

  return {
    message: buildSearchResultsMessage(productMatches, filters),
    intent: "search",
    responseType: "search_results",
    products: productMatches,
    state: nextState,
    debugContext: {
      retrievalStrategy,
      retrievedContext,
      appliedFilters: filters,
      resolvedProductIds: products.map((product) => product.id),
    },
  };
}

async function handleDetailIntent(
  analysis: TurnAnalysis,
  state: ConversationState,
  catalog: ProductRecord[],
): Promise<ChatResponsePayload> {
  const resolved = await resolveProductsForTurn(analysis, state, catalog, 1);
  if (resolved.status === "clarify") {
    return buildClarificationResponse(
      "detail_lookup",
      state,
      resolved.pendingClarification as PendingClarification,
    );
  }

  const product = resolved.products[0];
  if (!product) {
    return buildClarificationResponse("detail_lookup", state, {
      reason: "missing_product" as const,
      message: "I’m not sure which product you mean. Name the product or refer to a result position like first or second.",
      candidateProductIds: state.candidateProductIds,
    });
  }

  const message = buildDetailMessage(product, analysis.requestedAttributes);
  const productMatch = toProductMatch(product, resolved.confidence);
  const nextState = {
    ...state,
    activeProductIds: [product.id],
    candidateProductIds:
      state.candidateProductIds.length > 0 ? state.candidateProductIds : [product.id],
    lastIntent: "detail_lookup" as const,
    pendingClarification: null,
  };

  return {
    message,
    intent: "detail_lookup",
    responseType: "answer",
    products: [productMatch],
    state: nextState,
    debugContext: {
      retrievalStrategy: "state_resolution",
      retrievedContext: [],
      appliedFilters: state.lastAppliedFilters,
      resolvedProductIds: [product.id],
    },
  };
}

async function handleCompareIntent(
  analysis: TurnAnalysis,
  state: ConversationState,
  catalog: ProductRecord[],
): Promise<ChatResponsePayload> {
  const resolved = await resolveProductsForTurn(analysis, state, catalog, 2);
  if (resolved.status === "clarify") {
    return buildClarificationResponse(
      "compare",
      state,
      resolved.pendingClarification as PendingClarification,
    );
  }

  if (resolved.products.length < 2) {
    return buildClarificationResponse("compare", state, {
      reason: "missing_comparison_set" as const,
      message: "I need at least two products to compare. Name them explicitly or ask me to compare the first two results.",
      candidateProductIds: state.candidateProductIds,
    });
  }

  const products = resolved.products.slice(0, 2);
  const nextState = {
    ...state,
    activeProductIds: products.map((product) => product.id),
    candidateProductIds:
      state.candidateProductIds.length > 0
        ? state.candidateProductIds
        : products.map((product) => product.id),
    lastIntent: "compare" as const,
    pendingClarification: null,
  };

  return {
    message: buildComparisonMessage(products),
    intent: "compare",
    responseType: "comparison",
    products: products.map((product) => toProductMatch(product, resolved.confidence)),
    state: nextState,
    debugContext: {
      retrievalStrategy: "state_resolution",
      retrievedContext: [],
      appliedFilters: state.lastAppliedFilters,
      resolvedProductIds: products.map((product) => product.id),
    },
  };
}

async function handleCatalogQaIntentStream(
  history: ChatTurn[],
  analysis: TurnAnalysis,
  state: ConversationState,
  onDelta?: StreamTextCallback,
): Promise<ChatResponsePayload> {
  const retrievedContext = pickConfidentDocuments(
    await retrieveRelevantDocuments(analysis.latestUserMessage, SEARCH_RESULT_LIMIT),
    SEMANTIC_MATCH_THRESHOLD,
  );

  if (retrievedContext.length === 0) {
    const nextState = {
      ...state,
      activeProductIds: [],
      candidateProductIds: [],
      lastIntent: "catalog_qa" as const,
      pendingClarification: null,
    };

    const response = {
      message: "The catalog does not contain enough information to answer that confidently.",
      intent: "catalog_qa",
      responseType: "no_match",
      products: [],
      state: nextState,
      debugContext: {
        retrievalStrategy: "semantic_catalog",
        retrievedContext,
        appliedFilters: null,
        resolvedProductIds: [],
      },
    };
    await streamMessageText(response.message, onDelta);
    return response;
  }

  const products = await getProductsByIds(retrievedContext.map((item) => item.productId));
  const client = getOpenAIClient();
  const stream = await client.responses.create({
    model: CHAT_MODEL,
    input: buildCatalogQaMessages(history, analysis.latestUserMessage, retrievedContext),
    stream: true,
  });

  if (!Symbol.asyncIterator || !(Symbol.asyncIterator in stream)) {
    const message = "output_text" in stream ? normalizeOutputText(stream.output_text) : "";
    if (!message) {
      throw new Error("The model returned an empty response.");
    }

    return {
      message,
      intent: "catalog_qa",
      responseType: "answer",
      products: products.map((product) => toProductMatch(product, 1)),
      state: {
        ...state,
        activeProductIds: products.length === 1 ? [products[0].id] : [],
        candidateProductIds: products.map((product) => product.id),
        lastIntent: "catalog_qa" as const,
        pendingClarification: null,
      },
      debugContext: {
        retrievalStrategy: "semantic_catalog",
        retrievedContext,
        appliedFilters: null,
        resolvedProductIds: products.map((product) => product.id),
      },
    };
  }

  let streamedMessage = "";
  let completedMessage = "";

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      streamedMessage += event.delta;
      await onDelta?.(event.delta);
    }

    if (event.type === "response.completed") {
      completedMessage = normalizeOutputText(event.response.output_text);
    }

    if (event.type === "response.failed") {
      throw new Error("The model could not complete the response.");
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  const message = completedMessage || streamedMessage.trim();
  if (!message) {
    throw new Error("The model returned an empty response.");
  }

  const nextState = {
    ...state,
    activeProductIds: products.length === 1 ? [products[0].id] : [],
    candidateProductIds: products.map((product) => product.id),
    lastIntent: "catalog_qa" as const,
    pendingClarification: null,
  };

  return {
    message,
    intent: "catalog_qa",
    responseType: "answer",
    products: products.map((product) => toProductMatch(product, 1)),
    state: nextState,
    debugContext: {
      retrievalStrategy: "semantic_catalog",
      retrievedContext,
      appliedFilters: null,
      resolvedProductIds: products.map((product) => product.id),
    },
  };
}

function buildCatalogQaMessages(
  history: ChatTurn[],
  latestUserMessage: string,
  context: RetrievedContext[],
) {
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
    ...history.slice(0, -1).map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    {
      role: "user" as const,
      content: latestUserMessage,
    },
  ];
}

async function streamMessageText(message: string, onDelta?: StreamTextCallback) {
  if (!onDelta || !message) {
    return;
  }

  const chunks = message.match(/\S+\s*/g) ?? [message];
  for (const chunk of chunks) {
    await onDelta(chunk);
  }
}

function buildSearchFilters(
  analysis: TurnAnalysis,
  state: ConversationState,
  catalog: ProductRecord[],
): ProductFilters {
  let filters: ProductFilters = { ...analysis.filters };

  if (analysis.shouldReuseLastFilters && state.lastAppliedFilters) {
    filters = {
      ...state.lastAppliedFilters,
      ...pickDefinedFilters(filters),
      query: filters.query || state.lastAppliedFilters.query,
    };
  }

  if (analysis.shouldFindCheaper) {
    const anchorIds = state.activeProductIds.length > 0 ? state.activeProductIds : state.candidateProductIds;
    const anchorProducts = catalog.filter((product) => anchorIds.includes(product.id));
    const anchorPrices = anchorProducts
      .map((product) => product.discountedPrice ?? product.retailPrice)
      .filter((price): price is number => typeof price === "number");
    const maxComparablePrice =
      anchorPrices.length > 0 ? Math.min(...anchorPrices) - 1 : filters.maxPrice;

    filters = {
      ...filters,
      maxPrice: typeof maxComparablePrice === "number" ? maxComparablePrice : filters.maxPrice,
    };
  }

  return filters;
}

async function resolveProductsForTurn(
  analysis: TurnAnalysis,
  state: ConversationState,
  _catalog: ProductRecord[],
  minimumProducts: number,
) {
  if (analysis.ordinalIndexes.length > 0 && state.candidateProductIds.length > 0) {
    const candidates = await getProductsByIds(
      analysis.ordinalIndexes
        .map((index) => state.candidateProductIds[index])
        .filter((id): id is string => Boolean(id)),
    );
    if (candidates.length >= minimumProducts) {
      return {
        status: "resolved" as const,
        products: candidates,
        confidence: 1,
      };
    }
  }

  if (analysis.mentionedReferences.length > 0) {
    const uniqueProducts = new Map<string, ProductRecord>();
    let highestConfidence = 0;

    for (const reference of analysis.mentionedReferences) {
      const matches = await resolveProductsByReference(reference, SEARCH_RESULT_LIMIT);
      if (matches.length > 1 && matches[0].confidence - matches[1].confidence < 0.08) {
        return {
          status: "clarify" as const,
          pendingClarification: {
            reason: "ambiguous_product" as const,
            message: `I found multiple products that could match "${reference}". Tell me the exact product name or pick one from the latest results.`,
            candidateProductIds: matches.map((item) => item.product.id),
          },
        };
      }

      const topMatch = matches[0];
      if (topMatch) {
        uniqueProducts.set(topMatch.product.id, topMatch.product);
        highestConfidence = Math.max(highestConfidence, topMatch.confidence);
      }
    }

    if (uniqueProducts.size >= minimumProducts) {
      return {
        status: "resolved" as const,
        products: [...uniqueProducts.values()],
        confidence: highestConfidence || 1,
      };
    }
  }

  if (state.activeProductIds.length >= minimumProducts) {
    return {
      status: "resolved" as const,
      products: await getProductsByIds(state.activeProductIds.slice(0, minimumProducts)),
      confidence: 1,
    };
  }

  if (minimumProducts > 1 && state.candidateProductIds.length >= minimumProducts) {
    return {
      status: "resolved" as const,
      products: await getProductsByIds(state.candidateProductIds.slice(0, minimumProducts)),
      confidence: 1,
    };
  }

  const pronounRefersToProduct =
    /\bit\b|\bits\b|\bthis product\b|\bthat product\b|\bthe product\b/.test(
      normalizeForMatch(analysis.latestUserMessage),
    );
  if (pronounRefersToProduct && state.candidateProductIds.length > 1) {
    return {
      status: "clarify" as const,
      pendingClarification: {
        reason: "ambiguous_product" as const,
        message: "I need you to pick one product from the current results. You can say first, second, or name the product.",
        candidateProductIds: state.candidateProductIds,
      },
    };
  }

  return {
    status: "clarify" as const,
    pendingClarification: {
      reason: minimumProducts > 1 ? "missing_comparison_set" : "missing_product",
      message:
        minimumProducts > 1
          ? "I need at least two products to compare. Name them or refer to positions from the latest results."
          : "I’m not sure which product you mean yet. Name the product or refer to a result position like first or second.",
      candidateProductIds: state.candidateProductIds,
    },
  };
}

function buildClarificationResponse(
  intent: ChatIntent,
  state: ConversationState,
  pendingClarification: PendingClarification,
): ChatResponsePayload {
  return {
    message: pendingClarification.message,
    intent,
    responseType: "clarification",
    products: [],
    state: {
      ...state,
      lastIntent: intent,
      pendingClarification,
    },
    debugContext: {
      retrievalStrategy: "clarification",
      retrievedContext: [],
      appliedFilters: state.lastAppliedFilters,
      resolvedProductIds: [],
    },
  };
}

function buildSearchResultsMessage(products: ProductMatch[], filters: ProductFilters) {
  const filterParts = [
    filters.brand && `brand ${filters.brand}`,
    filters.category && `category ${filters.category}`,
    typeof filters.minPrice === "number" && `min price Rs. ${filters.minPrice}`,
    typeof filters.maxPrice === "number" && `max price Rs. ${filters.maxPrice}`,
    filters.query && `matching "${filters.query}"`,
  ].filter(Boolean);

  const intro =
    filterParts.length > 0
      ? `I found ${products.length} matching products for ${filterParts.join(", ")}.`
      : `I found ${products.length} matching products.`;

  const lines = products.map(
    (product, index) =>
      `${index + 1}. ${product.name} (${product.brand})${product.price ? ` - Rs. ${product.price}` : ""}`,
  );

  return [intro, ...lines].join("\n");
}

function buildDetailMessage(product: ProductRecord, attributes: RequestedAttribute[]) {
  if (attributes.length === 0) {
    return [
      `${product.name} is listed under ${product.primaryCategory} from ${product.brand}.`,
      product.discountedPrice || product.retailPrice
        ? `Price: Rs. ${product.discountedPrice ?? product.retailPrice}.`
        : "Price is not listed in the catalog.",
      product.description ? `Description: ${product.description}` : "No description is listed.",
    ].join(" ");
  }

  const lines = attributes.map((attribute) => describeProductAttribute(product, attribute));
  return [`Here are the details for ${product.name}:`, ...lines].join("\n");
}

function buildComparisonMessage(products: ProductRecord[]) {
  const [left, right] = products;
  const leftPrice = left.discountedPrice ?? left.retailPrice;
  const rightPrice = right.discountedPrice ?? right.retailPrice;
  const cheaperProduct =
    typeof leftPrice === "number" && typeof rightPrice === "number"
      ? leftPrice < rightPrice
        ? `${left.name} is cheaper.`
        : rightPrice < leftPrice
          ? `${right.name} is cheaper.`
          : "They are listed at the same price."
      : "At least one product is missing a listed price.";

  return [
    `Comparing ${left.name} and ${right.name}:`,
    `${left.name}: brand ${left.brand}, category ${left.primaryCategory}, price ${formatPriceLine(leftPrice)}.`,
    `${right.name}: brand ${right.brand}, category ${right.primaryCategory}, price ${formatPriceLine(rightPrice)}.`,
    cheaperProduct,
  ].join("\n");
}

function describeProductAttribute(product: ProductRecord, attribute: RequestedAttribute) {
  if (attribute === "price") {
    const price = product.discountedPrice ?? product.retailPrice;
    return price ? `Price: Rs. ${price}.` : "Price is not listed in the catalog.";
  }

  if (attribute === "brand") {
    return `Brand: ${product.brand}.`;
  }

  if (attribute === "category") {
    return `Category: ${product.categoryTrail.join(" > ") || product.primaryCategory}.`;
  }

  if (attribute === "description") {
    return product.description ? `Description: ${product.description}` : "No description is listed.";
  }

  if (attribute === "rating") {
    return `Ratings: product ${product.rating}; overall ${product.overallRating}.`;
  }

  if (attribute === "color") {
    const colorSpec = findSpecificationValue(product, "color");
    return colorSpec ? `Color: ${colorSpec}.` : "Color is not listed in the catalog.";
  }

  if (attribute === "material") {
    const materialSpec = findSpecificationValue(product, "material");
    return materialSpec ? `Material: ${materialSpec}.` : "Material is not listed in the catalog.";
  }

  const specificationSummary = product.specifications
    .slice(0, 6)
    .map((specification) => `${specification.key}: ${specification.value}`)
    .join("; ");

  return specificationSummary
    ? `Specifications: ${specificationSummary}.`
    : "Specifications are not listed in the catalog.";
}

function extractRequestedAttributes(message: string): RequestedAttribute[] {
  const attributes: RequestedAttribute[] = [];
  const checks: Array<[RequestedAttribute, RegExp]> = [
    ["price", /\bprice\b|\bcost\b|\bhow much\b/],
    ["brand", /\bbrand\b/],
    ["category", /\bcategory\b|\btype\b/],
    ["description", /\bdescription\b|\bdescribe\b|\babout\b|\bdetails\b/],
    ["rating", /\brating\b|\breview\b/],
    ["specifications", /\bspec\b|\bspecification\b|\bfeature\b|\bdimension\b/],
    ["color", /\bcolor\b|\bcolour\b/],
    ["material", /\bmaterial\b|\bfabric\b|\bmicrofiber\b|\bleather\b|\bwood\b/],
  ];

  for (const [attribute, pattern] of checks) {
    if (pattern.test(message)) {
      attributes.push(attribute);
    }
  }

  return [...new Set(attributes)];
}

function extractMentionedReferences(message: string, catalog: ProductRecord[]) {
  const normalizedMessage = normalizeForMatch(message);
  const references = new Set<string>();

  for (const product of catalog) {
    const normalizedName = normalizeForMatch(product.name);
    if (normalizedName && normalizedMessage.includes(normalizedName)) {
      references.add(product.name);
    }
  }

  const quotedReferences = message.match(/"([^"]+)"/g) ?? [];
  for (const reference of quotedReferences) {
    references.add(reference.replace(/^"|"$/g, ""));
  }

  return [...references];
}

function extractFilters(message: string, catalog: ProductRecord[]): ProductFilters {
  const normalizedMessage = normalizeForMatch(message);
  const brands = uniqueSorted(catalog.map((product) => product.brand));
  const categories = uniqueSorted(catalog.map((product) => product.primaryCategory));

  const brand = brands.find((item) => normalizedMessage.includes(normalizeForMatch(item)));
  const category = categories.find((item) => normalizedMessage.includes(normalizeForMatch(item)));
  const betweenMatch = normalizedMessage.match(/\bbetween\s+(\d+)\s+and\s+(\d+)\b/);
  const underMatch = normalizedMessage.match(/\b(?:under|below|less than|max(?:imum)?)\s+(\d+)\b/);
  const overMatch = normalizedMessage.match(/\b(?:over|above|more than|min(?:imum)?|at least)\s+(\d+)\b/);

  let minPrice = overMatch ? Number(overMatch[1]) : undefined;
  let maxPrice = underMatch ? Number(underMatch[1]) : undefined;
  if (betweenMatch) {
    minPrice = Number(betweenMatch[1]);
    maxPrice = Number(betweenMatch[2]);
  }

  const query = normalizedMessage
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))
    .filter((token) => !(brand && normalizeForMatch(brand).split(" ").includes(token)))
    .filter((token) => !(category && normalizeForMatch(category).split(" ").includes(token)))
    .filter((token) => !/^\d+$/.test(token))
    .slice(0, 6)
    .join(" ");

  return {
    query: query || undefined,
    brand,
    category,
    minPrice,
    maxPrice,
  };
}

function pickDefinedFilters(filters: ProductFilters): ProductFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as ProductFilters;
}

function extractOrdinalIndexes(message: string) {
  const ordinals: Array<[RegExp, number]> = [
    [/\bfirst\b|\b1st\b/, 0],
    [/\bsecond\b|\b2nd\b/, 1],
    [/\bthird\b|\b3rd\b/, 2],
    [/\bfourth\b|\b4th\b/, 3],
  ];

  return ordinals.filter(([pattern]) => pattern.test(message)).map(([, index]) => index);
}

function findSpecificationValue(product: ProductRecord, key: string) {
  const normalizedKey = normalizeForMatch(key);
  return product.specifications.find((item) => normalizeForMatch(item.key).includes(normalizedKey))
    ?.value;
}

function formatPriceLine(price: number | null) {
  return typeof price === "number" ? `Rs. ${price}` : "not listed";
}

function normalizeForMatch(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
