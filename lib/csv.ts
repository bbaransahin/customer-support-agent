import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { ProductRecord, ProductSpecification } from "@/lib/types";

type CsvRow = {
  uniq_id?: string;
  product_url?: string;
  product_name?: string;
  product_category_tree?: string;
  pid?: string;
  retail_price?: string;
  discounted_price?: string;
  image?: string;
  description?: string;
  product_rating?: string;
  overall_rating?: string;
  brand?: string;
  product_specifications?: string;
};

export const DEFAULT_CSV_PATH = path.join(
  process.cwd(),
  "flipkart_com-ecommerce_sample.csv",
);
export const PRODUCT_SUBSET_SIZE = 250;

const csvCache = new Map<string, ProductRecord[]>();

export async function loadProductsFromCsv(csvPath = DEFAULT_CSV_PATH) {
  const cached = csvCache.get(csvPath);
  if (cached) return cached;

  const source = await fs.readFile(csvPath, "utf8");
  const rows = parse(source, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as CsvRow[];

  const products = rows.slice(0, PRODUCT_SUBSET_SIZE).map(normalizeProductRow);
  csvCache.set(csvPath, products);
  return products;
}

export function normalizeProductRow(row: CsvRow): ProductRecord {
  const name = cleanText(row.product_name);
  const brand = cleanText(row.brand) || "Unknown";
  const categoryTrail = parseCategoryTrail(row.product_category_tree);
  const specifications = parseSpecifications(row.product_specifications);
  const description = cleanDescription(row.description);
  const images = parseStringArray(row.image);
  const pid = cleanText(row.pid);
  const uniqId = cleanText(row.uniq_id);
  const id = pid || uniqId || slugify(name || "product");
  const primaryCategory = categoryTrail[0] || "Uncategorized";
  const searchText = [
    name,
    brand,
    primaryCategory,
    categoryTrail.join(" "),
    description,
    specifications.map((spec) => `${spec.key} ${spec.value}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id,
    pid,
    uniqId,
    name,
    brand,
    retailPrice: parsePrice(row.retail_price),
    discountedPrice: parsePrice(row.discounted_price),
    description,
    categoryTrail,
    primaryCategory,
    rating: cleanText(row.product_rating) || "No rating available",
    overallRating: cleanText(row.overall_rating) || "No rating available",
    productUrl: cleanText(row.product_url),
    images,
    specifications,
    searchText,
  };
}

export function buildProductDocument(product: ProductRecord) {
  const priceLine = describePrice(product.retailPrice, product.discountedPrice);
  const specs = product.specifications
    .slice(0, 16)
    .map((item) => `${item.key}: ${item.value}`)
    .join("; ");

  const summary = [
    product.name,
    `Brand: ${product.brand}`,
    `Category: ${product.categoryTrail.join(" > ") || product.primaryCategory}`,
    priceLine,
    product.description,
    specs && `Specifications: ${specs}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: product.id,
    productId: product.id,
    productName: product.name,
    brand: product.brand,
    category: product.primaryCategory,
    text: summary,
    summary: truncate(summary, 420),
  };
}

export function parseCategoryTrail(raw?: string) {
  const list = parseStringArray(raw);
  const first = list[0] ?? "";
  return first
    .split(">>")
    .map((part) => cleanText(part))
    .filter(Boolean)
    .map((part) => part.replace(/\.\.\.$/, ""));
}

export function parseSpecifications(raw?: string): ProductSpecification[] {
  const value = cleanText(raw);
  if (!value) return [];

  const matches = [...value.matchAll(/"key"=>"([^"]+)"\s*,\s*"value"=>"([^"]+)"/g)];
  const keyed = matches.map((match) => ({
    key: cleanText(match[1]),
    value: cleanText(match[2]),
  }));

  const valueless = [...value.matchAll(/\{"value"=>"([^"]+)"\}/g)].map((match) => ({
    key: "Notes",
    value: cleanText(match[1]),
  }));

  return [...keyed, ...valueless].filter((item) => item.value);
}

export function parseStringArray(raw?: string) {
  const value = cleanText(raw);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => cleanText(String(item))).filter(Boolean);
    }
  } catch {
    // Fall through to a permissive parser for malformed strings.
  }

  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/","|", "|",\s*"/)
    .map((item) => cleanText(item.replace(/^"+|"+$/g, "")))
    .filter(Boolean);
}

export function parsePrice(raw?: string) {
  const value = cleanText(raw);
  if (!value) return null;
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function describePrice(retailPrice: number | null, discountedPrice: number | null) {
  if (retailPrice && discountedPrice) {
    return `Retail price: Rs. ${retailPrice}; Discounted price: Rs. ${discountedPrice}`;
  }
  if (discountedPrice) return `Discounted price: Rs. ${discountedPrice}`;
  if (retailPrice) return `Retail price: Rs. ${retailPrice}`;
  return "";
}

export function cleanDescription(raw?: string) {
  return cleanText(raw).replace(/\s+/g, " ");
}

export function cleanText(value?: string) {
  return (value ?? "")
    .replace(/^"+|"+$/g, "")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
