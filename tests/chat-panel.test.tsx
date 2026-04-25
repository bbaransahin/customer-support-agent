import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/chat-panel";

describe("ChatPanel", () => {
  it("shows the assistant answer and retrieved citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "Alpha Sofa is listed with microfiber upholstery.\n\nCited products: Alpha Sofa",
        citedProducts: ["Alpha Sofa"],
        contextSummary: [
          {
            productId: "1",
            productName: "Alpha Sofa",
            score: 0.91,
            summary: "Microfiber sofa bed",
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<ChatPanel />);

    fireEvent.change(screen.getByPlaceholderText(/which products mention/i), {
      target: { value: "Do you have microfiber sofas?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/microfiber upholstery/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("Alpha Sofa").length).toBeGreaterThan(0);
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
