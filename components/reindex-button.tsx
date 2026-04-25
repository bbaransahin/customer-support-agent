"use client";

import { useState } from "react";

export function ReindexButton() {
  const [state, setState] = useState<{
    kind: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ kind: "idle" });
  const isLoading = state.kind === "loading";

  async function handleClick() {
    setState({ kind: "loading", message: "Rebuilding local embeddings index..." });

    try {
      const response = await fetch("/api/reindex", {
        method: "POST",
      });
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Reindex failed.");
      }

      setState({ kind: "success", message: payload.message ?? "Index rebuilt." });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Reindex failed.",
      });
    }
  }

  return (
    <div className="button-row">
      <button className="button reindex-button" type="button" onClick={handleClick} disabled={isLoading}>
        {isLoading ? (
          <>
            <span aria-hidden="true" className="spinner" />
            Reindexing subset...
          </>
        ) : (
          "Rebuild index"
        )}
      </button>
      {state.kind === "success" ? <span className="success">{state.message}</span> : null}
      {state.kind === "error" ? <span className="warning">{state.message}</span> : null}
    </div>
  );
}
