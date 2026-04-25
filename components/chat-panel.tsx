"use client";

import { FormEvent, useState } from "react";
import type { ChatResponsePayload, ChatTurn } from "@/lib/types";

type Message = ChatTurn & {
  citedProducts?: string[];
};

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ChatResponsePayload["contextSummary"]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          history: nextMessages.map(({ role, content: body }) => ({ role, content: body })),
        }),
      });

      const payload = (await response.json()) as ChatResponsePayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Chat request failed.");
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: payload.answer,
          citedProducts: payload.citedProducts,
        },
      ]);
      setContext(payload.contextSummary);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Chat request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-shell">
      <section className="panel">
        <h2>Support conversation</h2>
        <div className="chat-log">
          {messages.length === 0 ? (
            <div className="muted">
              Ask about products, brands, categories, price points, or listed specifications.
            </div>
          ) : null}

          {messages.map((message, index) => (
            <article
              className={`message ${message.role === "assistant" ? "assistant" : "user"}`}
              key={`${message.role}-${index}`}
            >
              <header>
                <strong>{message.role === "assistant" ? "Support agent" : "You"}</strong>
              </header>
              <p>{message.content}</p>
              {message.citedProducts?.length ? (
                <div className="chat-citations">
                  {message.citedProducts.map((product) => (
                    <span className="chip" key={product}>
                      {product}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <form className="page-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span className="label">Question</span>
            <textarea
              onChange={(event) => setInput(event.target.value)}
              placeholder="Which products mention microfiber or sofa bed dimensions?"
              rows={4}
              value={input}
            />
          </label>
          <div className="button-row">
            <button className="button" disabled={loading} type="submit">
              {loading ? "Thinking..." : "Send"}
            </button>
            {error ? <span className="warning">{error}</span> : null}
          </div>
        </form>
      </section>

      <aside className="panel">
        <h2>Retrieved context</h2>
        {context.length === 0 ? (
          <p className="muted">The latest answer has not retrieved any local evidence yet.</p>
        ) : (
          <div className="page-grid">
            {context.map((item) => (
              <div className="detail-card" key={`${item.productId}-${item.productName}`}>
                <strong>{item.productName}</strong>
                <p>Similarity: {item.score.toFixed(3)}</p>
                <p>{item.summary}</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
