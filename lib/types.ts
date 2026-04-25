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

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponsePayload = {
  answer: string;
  citedProducts: string[];
  contextSummary: RetrievedContext[];
};

export type IndexStatus = {
  exists: boolean;
  isFresh: boolean;
  csvModifiedAt: string;
  indexGeneratedAt: string | null;
  warning: string | null;
};
