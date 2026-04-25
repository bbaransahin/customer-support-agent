import { createEmptyConversationState } from "@/lib/conversation-state";
import type { LiveChatEvalCase } from "@/tests/helpers/live-chat-eval";

const SOFA_ID = "SBEEH3QGU7MFYJFY";
const SHORTS_ID = "SRTEH2FF9KEDEFGF";

export const liveChatCases: LiveChatEvalCase[] = [
  {
    name: "search returns matching sofa products under a price ceiling",
    history: [{ role: "user", content: "Show me sofas under 25000" }],
    expectedIntent: "search",
    expectedResponseType: "search_results",
    requiredMentions: ["FabHomeDecor Fabric Double Sofa Bed", "Rs. 22646"],
    minimumProductCount: 1,
    expectedRetrievalStrategy: "structured_search",
    customAssertions: [
      {
        label: "all returned products stay within the requested max price",
        run: (response) =>
          response.products.every((product) => typeof product.price === "number" && product.price <= 25000)
            ? null
            : "At least one returned product exceeded the requested max price of Rs. 25000.",
      },
    ],
  },
  {
    name: "detail lookup resolves the active product material",
    history: [{ role: "user", content: "What is its material?" }],
    state: {
      ...createEmptyConversationState(),
      activeProductIds: [SOFA_ID],
      candidateProductIds: [SOFA_ID],
    },
    expectedIntent: "detail_lookup",
    expectedResponseType: "answer",
    requiredMentions: ["FabHomeDecor Fabric Double Sofa Bed", "Material: Microfiber"],
    expectedResolvedProductIds: [SOFA_ID],
    expectedRetrievalStrategy: "state_resolution",
  },
  {
    name: "comparison uses candidate positions from conversation state",
    history: [{ role: "user", content: "Compare the first and second products" }],
    state: {
      ...createEmptyConversationState(),
      candidateProductIds: [SOFA_ID, SHORTS_ID],
    },
    expectedIntent: "compare",
    expectedResponseType: "comparison",
    requiredMentions: [
      "FabHomeDecor Fabric Double Sofa Bed",
      "Alisha Solid Women's Cycling Shorts",
      "Alisha Solid Women's Cycling Shorts is cheaper",
    ],
    expectedResolvedProductIds: [SOFA_ID, SHORTS_ID],
    expectedRetrievalStrategy: "state_resolution",
  },
  {
    name: "catalog qa cites the microfiber sofa from retrieved evidence",
    history: [{ role: "user", content: "Which product mentions microfiber?" }],
    expectedIntent: "catalog_qa",
    expectedResponseType: "answer",
    requiredMentions: ["FabHomeDecor Fabric Double Sofa Bed", "microfiber"],
    forbiddenMentions: ["delivery policy", "refund policy"],
    minimumProductCount: 1,
    expectedResolvedProductIds: [SOFA_ID],
    expectedRetrievalStrategy: "semantic_catalog",
  },
  {
    name: "catalog qa answers the 6 month domestic warranty question without inventing a longer term",
    history: [{ role: "user", content: "Which product mentions a 6 months domestic warranty?" }],
    expectedIntent: "catalog_qa",
    expectedResponseType: "answer",
    requiredMentions: ["FabHomeDecor Fabric Double Sofa Bed", "6 months"],
    forbiddenMentions: ["lifetime warranty", "2 year warranty"],
    minimumProductCount: 1,
    expectedResolvedProductIds: [SOFA_ID],
    expectedRetrievalStrategy: "semantic_catalog",
  },
  {
    name: "search no-match stays grounded when filters eliminate all results",
    history: [{ role: "user", content: "Show me furniture under 100" }],
    expectedIntent: "search",
    expectedResponseType: "no_match",
    requiredMentions: ["couldn’t find catalog products"],
    expectedRetrievalStrategy: "structured_search",
    customAssertions: [
      {
        label: "empty search no-match returns no products",
        run: (response) =>
          response.products.length === 0 ? null : "Expected no products in the no-match response.",
      },
    ],
  },
];
