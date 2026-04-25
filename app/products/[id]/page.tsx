import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { getProductById } from "@/lib/retrieval";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    return (
      <main className="page-grid">
        <section className="panel">
          <h2>Product not found</h2>
          <Link className="button-secondary" href="/products">
            Back to catalog
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-grid">
      <section className="hero">
        <h2>{product.name}</h2>
        <div className="chip-row">
          <span className="chip">{product.brand}</span>
          <span className="chip">{product.primaryCategory}</span>
          <span className="chip">{formatPrice(product.discountedPrice ?? product.retailPrice)}</span>
        </div>
      </section>

      <section className="detail-grid">
        <div className="detail-card">
          <strong>Description</strong>
          <p>{product.description || "No description available."}</p>
        </div>
        <div className="detail-card">
          <strong>Ratings</strong>
          <p>Product rating: {product.rating}</p>
          <p>Overall rating: {product.overallRating}</p>
        </div>
        <div className="detail-card">
          <strong>Category trail</strong>
          <p>{product.categoryTrail.join(" > ")}</p>
        </div>
        <div className="detail-card">
          <strong>Links and IDs</strong>
          <p>PID: {product.pid || "N/A"}</p>
          <p>Unique ID: {product.uniqId || "N/A"}</p>
          {product.productUrl ? (
            <a className="button-secondary" href={product.productUrl} rel="noreferrer" target="_blank">
              Open source listing
            </a>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Specifications</h2>
        {product.specifications.length === 0 ? (
          <p className="muted">No structured specifications available.</p>
        ) : (
          <div className="spec-list">
            {product.specifications.map((specification, index) => (
              <div className="spec-item" key={`${specification.key}-${index}`}>
                <strong>{specification.key}</strong>
                <span>{specification.value}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
