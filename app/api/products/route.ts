import { NextRequest, NextResponse } from "next/server";
import { queryProducts } from "@/lib/retrieval";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");

  const result = await queryProducts(
    {
      query: params.get("q") ?? undefined,
      brand: params.get("brand") ?? undefined,
      category: params.get("category") ?? undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    },
    Number.isFinite(page) ? page : 1,
    Number.isFinite(pageSize) ? pageSize : 20,
  );

  return NextResponse.json(result);
}
