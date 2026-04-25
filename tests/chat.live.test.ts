// @vitest-environment node

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { getIndexStatus } from "@/lib/index-store";
import { LIVE_CHAT_REPORT_PATH, evaluateLiveChatCase, writeLiveChatReport } from "@/tests/helpers/live-chat-eval";
import { liveChatCases } from "@/tests/fixtures/chat-live-cases";

const describeLive = process.env.RUN_LIVE_MODEL_EVALS === "1" ? describe : describe.skip;
const reportResults: Awaited<ReturnType<typeof evaluateLiveChatCase>>[] = [];

describeLive("live chat model evaluations", () => {
  beforeAll(async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for live model evaluations.");
    }

    const indexStatus = await getIndexStatus();
    if (!indexStatus.exists) {
      throw new Error("Live model evaluations require a local retrieval index. Run `npm run reindex` first.");
    }

    if (!indexStatus.isFresh) {
      throw new Error("Live model evaluations require a fresh retrieval index. Run `npm run reindex` first.");
    }
  });

  afterAll(async () => {
    if (reportResults.length > 0) {
      await writeLiveChatReport(reportResults);
    }
  });

  for (const testCase of liveChatCases) {
    it(
      `${testCase.name}`,
      async () => {
        const result = await evaluateLiveChatCase(testCase);
        reportResults.push(result);

        expect(result.passed, `See ${LIVE_CHAT_REPORT_PATH} for the assertion breakdown.`).toBe(true);
      },
      60_000,
    );
  }
});
