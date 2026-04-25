import { buildChatMessages } from "@/lib/chat";

describe("chat grounding", () => {
  it("includes strict evidence instructions and retrieved sources", () => {
    const messages = buildChatMessages(
      [{ role: "user", content: "What are the dimensions?" }],
      [
        {
          productId: "1",
          productName: "Alpha Sofa",
          score: 0.91,
          summary: "Width: 1905 mm; Depth: 939 mm",
        },
      ],
    );

    expect(messages[0]?.content).toContain("Answer only from the supplied catalog evidence");
    expect(messages[1]?.content).toContain("Alpha Sofa");
    expect(messages[1]?.content).toContain("Width: 1905 mm");
  });
});
