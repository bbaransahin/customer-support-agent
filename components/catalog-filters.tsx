import type { ProductFilters } from "@/lib/types";

type CatalogFiltersProps = {
  brands: string[];
  categories: string[];
  filters: ProductFilters;
};

export function CatalogFilters({ brands, categories, filters }: CatalogFiltersProps) {
  return (
    <form className="panel">
      <h2>Filters</h2>
      <div className="filters">
        <label className="field">
          <span className="label">Search</span>
          <input defaultValue={filters.query ?? ""} name="q" placeholder="Name, description, spec..." />
        </label>

        <label className="field">
          <span className="label">Brand</span>
          <select defaultValue={filters.brand ?? ""} name="brand">
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">Category</span>
          <select defaultValue={filters.category ?? ""} name="category">
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="price-row">
        <label className="field">
          <span className="label">Min price</span>
          <input defaultValue={filters.minPrice ?? ""} min={0} name="minPrice" type="number" />
        </label>

        <label className="field">
          <span className="label">Max price</span>
          <input defaultValue={filters.maxPrice ?? ""} min={0} name="maxPrice" type="number" />
        </label>
      </div>

      <div className="button-row">
        <button className="button" type="submit">
          Apply
        </button>
      </div>
    </form>
  );
}
