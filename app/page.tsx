import Link from "next/link";
import { getEnvWarning } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getIndexStatus } from "@/lib/index-store";
import { PRODUCT_SUBSET_SIZE } from "@/lib/csv";

export default async function HomePage() {
  const [status, envWarning] = await Promise.all([getIndexStatus(), Promise.resolve(getEnvWarning())]);

  return (
    <main className="page-grid">
      <section className="hero">
        <h2>MVP scope</h2>
        <p>
          Browse the CSV catalog locally, filter by brand/category/price, inspect normalized product
          records, and answer product questions with retrieved catalog evidence only. This MVP runs on
          the first {PRODUCT_SUBSET_SIZE} products from the CSV for faster indexing and testing.
        </p>
        <div className="button-row">
          <Link className="button" href="/products">
            Open Catalog
          </Link>
          <Link className="button-secondary" href="/chat">
            Open Chat
          </Link>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <h2>Index status</h2>
          <div className="stats-grid">
            <div className="stat">
              <strong>Index exists</strong>
              <span>{status.exists ? "Yes" : "No"}</span>
            </div>
            <div className="stat">
              <strong>Fresh against CSV</strong>
              <span>{status.isFresh ? "Yes" : "No"}</span>
            </div>
          </div>
          <div className="meta-row">
            <div className="muted">CSV modified: {formatDate(status.csvModifiedAt)}</div>
            <div className="muted">Index built: {formatDate(status.indexGeneratedAt)}</div>
          </div>
          {status.warning ? <p className="warning">{status.warning}</p> : null}
          {envWarning ? <p className="warning">{envWarning}</p> : null}
        </div>

        <div className="panel">
          <h2>Local workflow</h2>
          <p>1. Add `OPENAI_API_KEY` to `.env`.</p>
          <p>2. Run `npm run reindex` or use the button on the catalog page to index the 250-item subset.</p>
          <p>3. Search the catalog and ask questions on the chat page.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Example customer queries</h2>
        <div className="example-grid">
          <div className="detail-card">
            <strong>Price and category</strong>
            <p>Show me women&apos;s footwear under Rs. 500.</p>
          </div>
          <div className="detail-card">
            <strong>Specifications</strong>
            <p>Which products mention microfiber, pull-out, or sofa bed dimensions?</p>
          </div>
          <div className="detail-card">
            <strong>Brand comparison</strong>
            <p>What products from Alisha are in the catalog and what are their listed materials?</p>
          </div>
          <div className="detail-card">
            <strong>Unsupported info check</strong>
            <p>Do any of these products include warranty details in the catalog?</p>
          </div>
        </div>
      </section>
    </main>
  );
}
