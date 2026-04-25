import type { Route } from "next";
import Link from "next/link";

type PaginationProps = {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
};

function makeHref(searchParams: Record<string, string | undefined>, page: number): Route {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/products?${params.toString()}` as Route;
}

export function Pagination({ page, totalPages, searchParams }: PaginationProps) {
  return (
    <div className="panel">
      <div className="button-row">
        <Link
          aria-disabled={page <= 1}
          className="button-secondary"
          href={makeHref(searchParams, Math.max(1, page - 1))}
        >
          Previous
        </Link>
        <span className="muted">
          Page {page} of {totalPages}
        </span>
        <Link
          aria-disabled={page >= totalPages}
          className="button-secondary"
          href={makeHref(searchParams, Math.min(totalPages, page + 1))}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
