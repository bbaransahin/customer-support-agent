import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/chat-panel";

describe("ChatPanel", () => {
  let scrollToMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollToMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    expect(screen.queryByText(/confidence:/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        body: expect.stringContaining("\"sessionStartedAt\""),
      }),
    );
  });

  it("does not show chat debug details in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
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
                    confidence: 0.987,
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
                  retrievalStrategy: "semantic_catalog",
                  retrievedContext: [
                    {
                      productId: "1",
                      productName: "Alpha Sofa",
                      score: 0.912,
                      summary: "Microfiber sofa with compact dimensions.",
                    },
                  ],
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

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body,
      headers: {
        get: (name: string) => (name === "content-type" ? "text/event-stream" : null),
      },
    }));

    render(<ChatPanel />);

    fireEvent.change(screen.getByPlaceholderText(/which products mention/i), {
      target: { value: "Do you have microfiber sofas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/i found 1 matching product/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: /chat debug/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/similarity:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/microfiber sofa with compact dimensions/i)).not.toBeInTheDocument();
  });

  it("keeps semantic and structured debug text out of the chat UI", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
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

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body,
      headers: {
        get: (name: string) => (name === "content-type" ? "text/event-stream" : null),
      },
    }));

    render(<ChatPanel />);

    fireEvent.change(screen.getByPlaceholderText(/which products mention/i), {
      target: { value: "Show me sofas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/i found 1 matching product/i)).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/used structured catalog search results without semantic evidence snippets/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/did not use semantic catalog evidence/i)).not.toBeInTheDocument();
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

  it("submits on enter and preserves shift-enter for new lines", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: "Here is the answer.",
        responseType: "answer",
        products: [],
        state: {
          activeProductIds: [],
          candidateProductIds: [],
          lastIntent: "answer",
          lastAppliedFilters: {},
          pendingClarification: null,
        },
      }),
      headers: {
        get: () => "application/json",
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel />);

    const input = screen.getByPlaceholderText(/which products mention/i);
    fireEvent.change(input, {
      target: { value: "Which products are under 500?" },
    });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(input, {
      target: { value: "Line 1" },
    });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("scrolls to the latest message after submit and during streaming", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "delta",
              delta: "First chunk",
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "delta",
              delta: " second chunk",
            })}\n\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              payload: {
                message: "First chunk second chunk",
                responseType: "answer",
                products: [],
                state: {
                  activeProductIds: [],
                  candidateProductIds: [],
                  lastIntent: "answer",
                  lastAppliedFilters: {},
                  pendingClarification: null,
                },
              },
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body,
      headers: {
        get: (name: string) => (name === "content-type" ? "text/event-stream" : null),
      },
    }));

    render(<ChatPanel />);

    fireEvent.change(screen.getByPlaceholderText(/which products mention/i), {
      target: { value: "Stream a reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/first chunk second chunk/i)).toBeInTheDocument();
    });

    expect(scrollToMock).toHaveBeenCalled();
  });
});
