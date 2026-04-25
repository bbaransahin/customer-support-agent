import { buildProductDocument, normalizeProductRow, parseCategoryTrail, parseSpecifications } from "@/lib/csv";

describe("csv normalization", () => {
  it("cleans category trails", () => {
    expect(
      parseCategoryTrail(
        `["Furniture >> Living Room Furniture >> Sofa Beds & Futons >> FabHomeDecor Fabric Double Sofa Bed (Finish Colo..."]`,
      ),
    ).toEqual([
      "Furniture",
      "Living Room Furniture",
      "Sofa Beds & Futons",
      "FabHomeDecor Fabric Double Sofa Bed (Finish Colo",
    ]);
  });

  it("extracts keyed and unkeyed specifications", () => {
    expect(
      parseSpecifications(
        `{"product_specification"=>[{"key"=>"Color", "value"=>"Red"}, {"value"=>"One Pair Of Shoes"}]}`,
      ),
    ).toEqual([
      { key: "Color", value: "Red" },
      { key: "Notes", value: "One Pair Of Shoes" },
    ]);
  });

  it("normalizes a row into a retrieval-friendly product record", () => {
    const product = normalizeProductRow({
      uniq_id: "u1",
      pid: "p1",
      product_name: "AW Bellies",
      brand: "AW",
      product_url: "http://example.test/p1",
      product_category_tree: `["Footwear >> Women's Footwear >> Ballerinas >> AW Bellies"]`,
      retail_price: "999",
      discounted_price: "499",
      image: `["http://image-1"]`,
      description: "Material: Synthetic Lifestyle: Casual",
      product_rating: "No rating available",
      overall_rating: "No rating available",
      product_specifications:
        `{"product_specification"=>[{"key"=>"Color", "value"=>"Red"}, {"key"=>"Heel Height", "value"=>"1 inch"}]}`,
    });

    expect(product.primaryCategory).toBe("Footwear");
    expect(product.searchText).toContain("casual");

    const document = buildProductDocument(product);
    expect(document.summary).toContain("AW Bellies");
    expect(document.summary).toContain("Brand: AW");
  });
});
