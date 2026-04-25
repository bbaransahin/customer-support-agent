import type { ChatDebugContext, ConversationState } from "@/lib/types";

export function createEmptyConversationState(): ConversationState {
  return {
    activeProductIds: [],
    candidateProductIds: [],
    lastIntent: null,
    lastAppliedFilters: null,
    pendingClarification: null,
  };
}

export function createEmptyDebugContext(): ChatDebugContext {
  return {
    retrievalStrategy: "fallback",
    retrievedContext: [],
    appliedFilters: null,
    resolvedProductIds: [],
  };
}
