import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/chat-panel";

describe("ChatPanel", () => {
  it("shows structured assistant results without debug details by default", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "delta",
              delta: "I found 1 ",
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              payload: {
                message: "I found 1 matching product.",
                intent: "search",
                responseType: "search_results",
                products: [
                  {
                    id: "1",
                    name: "Alpha Sofa",
                    brand: "FabHomeDecor",
                    category: "Furniture",
                    price: 22000,
                    confidence: 1,
                  },
                ],
                state: {
                  activeProductIds: ["1"],
                  candidateProductIds: ["1"],
                  lastIntent: "search",
                  lastAppliedFilters: { query: "sofa" },
                  pendingClarification: null,
                },
                debugContext: {
                  retrievalStrategy: "structured_search",
                  retrievedContext: [],
                  appliedFilters: { query: "sofa" },
                  resolvedProductIds: ["1"],
                },
              },
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body,
      headers: {
        get: (name: string) => (name === "content-type" ? "text/event-stream" : null),
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel />);

    fireEvent.change(screen.getByPlaceholderText(/which products mention/i), {
      target: { value: "Do you have microfiber sofas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/i found 1 matching product/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Alpha Sofa")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /chat debug/i })).not.toBeInTheDocument();
  });

  it("surfaces request failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "No index available. Run reindex first." }),
    }));

    render(<ChatPanel />);
    fireEvent.change(screen.getByPlaceholderText(/which products mention/i), {
      target: { value: "Which products are under 500?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/no index available/i)).toBeInTheDocument();
    });
  });
});
