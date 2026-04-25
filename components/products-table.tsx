import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { ProductRecord } from "@/lib/types";

type ProductsTableProps = {
  products: ProductRecord[];
};

export function ProductsTable({ products }: ProductsTableProps) {
  return (
    <div className="panel table-wrap">
      <h2>Results</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Price</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <Link href={`/products/${product.id}`}>{product.name}</Link>
              </td>
              <td>{product.brand}</td>
              <td>{product.primaryCategory}</td>
              <td>{formatPrice(product.discountedPrice ?? product.retailPrice)}</td>
              <td>{product.overallRating}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
