"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createEmptyConversationState } from "@/lib/conversation-state";
import type { ChatResponsePayload, ChatStreamEvent, ChatTurn, ConversationState, ProductMatch } from "@/lib/types";

type Message = ChatTurn & {
  responseType?: ChatResponsePayload["responseType"];
  products?: ProductMatch[];
};

export function ChatPanel() {
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState>(
    createEmptyConversationState(),
  );

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) return;

    chatLog.scrollTo({
      top: chatLog.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    const assistantMessageIndex = nextMessages.length;
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
          history: nextMessages.map(({ role, content: body }) => ({
            role,
            content: body,
          })),
          state: conversationState,
          sessionStartedAt,
        }),
      });

      const contentType = response.headers?.get?.("content-type") ?? "";

      if (response.body && contentType.includes("text/event-stream")) {
        setMessages([
          ...nextMessages,
          {
            role: "assistant",
            content: "",
            products: [],
            responseType: "answer",
          },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalPayload: ChatResponsePayload | null = null;

        const applyAssistantDelta = (delta: string) => {
          setMessages((currentMessages) =>
            currentMessages.map((message, index) =>
              index === assistantMessageIndex
                ? {
                    ...message,
                    content: message.content + delta,
                  }
                : message,
            ),
          );
        };

        const applyCompletedPayload = (payload: ChatResponsePayload) => {
          setMessages((currentMessages) =>
            currentMessages.map((message, index) =>
              index === assistantMessageIndex
                ? {
                    ...message,
                    role: "assistant",
                    content: payload.message,
                    responseType: payload.responseType,
                    products: payload.products,
                  }
                : message,
            ),
          );
          setConversationState(payload.state);
        };

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });

          let boundaryIndex = buffer.indexOf("\n\n");
          while (boundaryIndex >= 0) {
            const rawEvent = buffer.slice(0, boundaryIndex).trim();
            buffer = buffer.slice(boundaryIndex + 2);

            if (rawEvent) {
              const data = rawEvent
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");

              if (data) {
                const event = JSON.parse(data) as ChatStreamEvent;
                if (event.type === "delta") {
                  applyAssistantDelta(event.delta);
                }

                if (event.type === "done") {
                  finalPayload = event.payload;
                  applyCompletedPayload(event.payload);
                }

                if (event.type === "error") {
                  throw new Error(event.error);
                }
              }
            }

            boundaryIndex = buffer.indexOf("\n\n");
          }

          if (done) {
            break;
          }
        }

        if (!finalPayload) {
          throw new Error(response.ok ? "Chat stream ended before completion." : "Chat request failed.");
        }

        return;
      }

      const payload = (await response.json()) as ChatResponsePayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Chat request failed.");
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: payload.message,
          responseType: payload.responseType,
          products: payload.products,
        },
      ]);
      setConversationState(payload.state);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Chat request failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="chat-shell">
      <section className="panel">
        <h2>Support conversation</h2>
        <div className="chat-log" ref={chatLogRef}>
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
              {message.role === "assistant" && message.products?.length ? (
                <div className="page-grid">
                  {message.products.map((product) => (
                    <div className="detail-card" key={product.id}>
                      <strong>{product.name}</strong>
                      <p>{product.brand}</p>
                      <p>{product.category}</p>
                      <p>{typeof product.price === "number" ? `Rs. ${product.price}` : "Price not listed"}</p>
                    </div>
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
              onKeyDown={handleInputKeyDown}
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
    </div>
  );
}
