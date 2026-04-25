export type ProductSpecification = {
  key: string;
  value: string;
};

export type ProductRecord = {
  id: string;
  pid: string;
  uniqId: string;
  name: string;
  brand: string;
  retailPrice: number | null;
  discountedPrice: number | null;
  description: string;
  categoryTrail: string[];
  primaryCategory: string;
  rating: string;
  overallRating: string;
  productUrl: string;
  images: string[];
  specifications: ProductSpecification[];
  searchText: string;
};

export type RetrievalDocument = {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  category: string;
  text: string;
  summary: string;
  embedding: number[];
};

export type IndexMetadata = {
  generatedAt: string;
  sourceCsvPath: string;
  sourceCsvMtimeMs: number;
  model: string;
  dimensions: number;
  productCount: number;
  documentCount: number;
};

export type EmbeddingIndex = {
  metadata: IndexMetadata;
  products: ProductRecord[];
  documents: RetrievalDocument[];
};

export type ProductFilters = {
  query?: string;
  brand?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type ProductListResult = {
  items: ProductRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableBrands: string[];
  availableCategories: string[];
};

export type RetrievedContext = {
  productId: string;
  productName: string;
  score: number;
  summary: string;
};

export type ChatIntent =
  | "search"
  | "detail_lookup"
  | "compare"
  | "catalog_qa"
  | "clarify";

export type ChatResponseType =
  | "answer"
  | "search_results"
  | "comparison"
  | "clarification"
  | "no_match";

export type ProductMatch = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number | null;
  confidence: number;
};

export type PendingClarification = {
  reason: "ambiguous_product" | "missing_product" | "missing_comparison_set";
  message: string;
  candidateProductIds: string[];
};

export type ConversationState = {
  activeProductIds: string[];
  candidateProductIds: string[];
  lastIntent: ChatIntent | null;
  lastAppliedFilters: ProductFilters | null;
  pendingClarification: PendingClarification | null;
};

export type ChatDebugContext = {
  retrievalStrategy:
    | "structured_search"
    | "state_resolution"
    | "semantic_catalog"
    | "clarification"
    | "fallback";
  retrievedContext: RetrievedContext[];
  appliedFilters: ProductFilters | null;
  resolvedProductIds: string[];
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponsePayload = {
  message: string;
  intent: ChatIntent;
  responseType: ChatResponseType;
  products: ProductMatch[];
  state: ConversationState;
  debugContext: ChatDebugContext;
};

export type IndexStatus = {
  exists: boolean;
  isFresh: boolean;
  csvModifiedAt: string;
  indexGeneratedAt: string | null;
  warning: string | null;
};
