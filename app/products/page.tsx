import { CatalogFilters } from "@/components/catalog-filters";
import { Pagination } from "@/components/pagination";
import { ProductsTable } from "@/components/products-table";
import { ReindexButton } from "@/components/reindex-button";
import { PRODUCT_SUBSET_SIZE } from "@/lib/csv";
import { getEnvWarning } from "@/lib/env";
import { getIndexStatus } from "@/lib/index-store";
import { queryProducts } from "@/lib/retrieval";

type ProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = parseNumber(params.page) ?? 1;
  const filters = {
    query: typeof params.q === "string" ? params.q : undefined,
    brand: typeof params.brand === "string" ? params.brand : undefined,
    category: typeof params.category === "string" ? params.category : undefined,
    minPrice: parseNumber(params.minPrice),
    maxPrice: parseNumber(params.maxPrice),
  };

  const [result, status] = await Promise.all([queryProducts(filters, page), getIndexStatus()]);
  const envWarning = getEnvWarning();

  return (
    <main className="page-grid">
      <section className="hero">
        <h2>Catalog</h2>
        <p>
          Read-only product browser with local search, filters, detail inspection, and index
          management. This screen uses a {PRODUCT_SUBSET_SIZE}-item CSV subset for faster iteration.
        </p>
        {status.warning ? <p className="warning">{status.warning}</p> : null}
        {envWarning ? <p className="warning">{envWarning}</p> : null}
        <ReindexButton />
      </section>

      <CatalogFilters
        brands={result.availableBrands}
        categories={result.availableCategories}
        filters={filters}
      />

      <section className="panel">
        <h2>Matches</h2>
        <p>
          Showing {result.items.length} of {result.total} matching products.
        </p>
      </section>

      <ProductsTable products={result.items} />
      <Pagination
        page={result.page}
        searchParams={{
          q: filters.query,
          brand: filters.brand,
          category: filters.category,
          minPrice: filters.minPrice?.toString(),
          maxPrice: filters.maxPrice?.toString(),
        }}
        totalPages={result.totalPages}
      />
    </main>
  );
}
