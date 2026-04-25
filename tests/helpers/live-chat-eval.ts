import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { answerCatalogQuestion } from "@/lib/chat";
import { createEmptyConversationState } from "@/lib/conversation-state";
import type { ChatIntent, ChatResponsePayload, ChatResponseType, ChatTurn, ConversationState } from "@/lib/types";

export type LiveChatAssertion = {
  label: string;
  run: (response: ChatResponsePayload) => string | null;
};

export type LiveChatEvalCase = {
  name: string;
  history: ChatTurn[];
  state?: ConversationState;
  expectedIntent: ChatIntent;
  expectedResponseType: ChatResponseType;
  requiredMentions?: string[];
  forbiddenMentions?: string[];
  minimumProductCount?: number;
  expectedResolvedProductIds?: string[];
  expectedRetrievalStrategy?: ChatResponsePayload["debugContext"]["retrievalStrategy"];
  customAssertions?: LiveChatAssertion[];
};

export type LiveChatAssertionResult = {
  label: string;
  passed: boolean;
  details: string | null;
};

export type LiveChatEvalResult = {
  caseName: string;
  prompt: string;
  passed: boolean;
  assertions: LiveChatAssertionResult[];
  response: ChatResponsePayload;
};

export const LIVE_CHAT_REPORT_PATH = path.join(process.cwd(), "test-results", "chat-live-report.json");

export async function evaluateLiveChatCase(testCase: LiveChatEvalCase): Promise<LiveChatEvalResult> {
  const response = await answerCatalogQuestion(
    testCase.history,
    testCase.state ?? createEmptyConversationState(),
  );

  const assertions: LiveChatAssertionResult[] = [
    expectIntent(testCase.expectedIntent, response),
    expectResponseType(testCase.expectedResponseType, response),
    expectRequiredMentions(testCase.requiredMentions ?? [], response),
    expectForbiddenMentions(testCase.forbiddenMentions ?? [], response),
    expectMinimumProductCount(testCase.minimumProductCount, response),
    expectResolvedProductIds(testCase.expectedResolvedProductIds, response),
    expectRetrievalStrategy(testCase.expectedRetrievalStrategy, response),
    ...(testCase.customAssertions ?? []).map((assertion) => {
      const details = assertion.run(response);
      return {
        label: assertion.label,
        passed: details === null,
        details,
      };
    }),
  ].filter((assertion) => assertion.label.length > 0);

  return {
    caseName: testCase.name,
    prompt: testCase.history.at(-1)?.content ?? "",
    passed: assertions.every((assertion) => assertion.passed),
    assertions,
    response,
  };
}

export async function writeLiveChatReport(results: LiveChatEvalResult[]) {
  await mkdir(path.dirname(LIVE_CHAT_REPORT_PATH), { recursive: true });
  await writeFile(
    LIVE_CHAT_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        passed: results.every((result) => result.passed),
        totalCases: results.length,
        passedCases: results.filter((result) => result.passed).length,
        failedCases: results.filter((result) => !result.passed).length,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function expectIntent(expectedIntent: ChatIntent, response: ChatResponsePayload): LiveChatAssertionResult {
  return buildAssertionResult(
    "intent matches expected value",
    response.intent === expectedIntent
      ? null
      : `Expected intent "${expectedIntent}" but received "${response.intent}".`,
  );
}

function expectResponseType(
  expectedResponseType: ChatResponseType,
  response: ChatResponsePayload,
): LiveChatAssertionResult {
  return buildAssertionResult(
    "response type matches expected value",
    response.responseType === expectedResponseType
      ? null
      : `Expected response type "${expectedResponseType}" but received "${response.responseType}".`,
  );
}

function expectRequiredMentions(
  requiredMentions: string[],
  response: ChatResponsePayload,
): LiveChatAssertionResult {
  if (requiredMentions.length === 0) {
    return buildAssertionResult("", null);
  }

  const haystack = normalizeText(response.message);
  const missingMentions = requiredMentions.filter((mention) => !haystack.includes(normalizeText(mention)));

  return buildAssertionResult(
    "message includes required mentions",
    missingMentions.length === 0 ? null : `Missing required mentions: ${missingMentions.join(", ")}.`,
  );
}

function expectForbiddenMentions(
  forbiddenMentions: string[],
  response: ChatResponsePayload,
): LiveChatAssertionResult {
  if (forbiddenMentions.length === 0) {
    return buildAssertionResult("", null);
  }

  const haystack = normalizeText(response.message);
  const foundMentions = forbiddenMentions.filter((mention) => haystack.includes(normalizeText(mention)));

  return buildAssertionResult(
    "message omits forbidden mentions",
    foundMentions.length === 0 ? null : `Found forbidden mentions: ${foundMentions.join(", ")}.`,
  );
}

function expectMinimumProductCount(
  minimumProductCount: number | undefined,
  response: ChatResponsePayload,
): LiveChatAssertionResult {
  if (typeof minimumProductCount !== "number") {
    return buildAssertionResult("", null);
  }

  return buildAssertionResult(
    "returned product count meets minimum",
    response.products.length >= minimumProductCount
      ? null
      : `Expected at least ${minimumProductCount} products but received ${response.products.length}.`,
  );
}

function expectResolvedProductIds(
  expectedResolvedProductIds: string[] | undefined,
  response: ChatResponsePayload,
): LiveChatAssertionResult {
  if (!expectedResolvedProductIds || expectedResolvedProductIds.length === 0) {
    return buildAssertionResult("", null);
  }

  const resolvedIds = new Set(response.debugContext.resolvedProductIds);
  const missingIds = expectedResolvedProductIds.filter((id) => !resolvedIds.has(id));

  return buildAssertionResult(
    "resolved product ids include expected ids",
    missingIds.length === 0 ? null : `Missing resolved product ids: ${missingIds.join(", ")}.`,
  );
}

function expectRetrievalStrategy(
  expectedRetrievalStrategy: ChatResponsePayload["debugContext"]["retrievalStrategy"] | undefined,
  response: ChatResponsePayload,
): LiveChatAssertionResult {
  if (!expectedRetrievalStrategy) {
    return buildAssertionResult("", null);
  }

  return buildAssertionResult(
    "retrieval strategy matches expected value",
    response.debugContext.retrievalStrategy === expectedRetrievalStrategy
      ? null
      : `Expected retrieval strategy "${expectedRetrievalStrategy}" but received "${response.debugContext.retrievalStrategy}".`,
  );
}

function buildAssertionResult(label: string, details: string | null): LiveChatAssertionResult {
  return {
    label,
    passed: details === null,
    details,
  };
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
