import { describe, expect, test } from "vitest";
import {
  durationMs,
  effectivePolicy,
  executionPolicySchema,
  rateFeedback,
  retryDelay,
} from "../src/lib/execution-policy";
import { MODELS } from "../src/lib/provider-config";
describe("rate-limit scheduling hints", () => {
  test("parses documented durations and Retry-After without accepting arbitrary headers", () => {
    expect(durationMs("6m0s")).toBe(360000);
    expect(durationMs("1.5s250ms")).toBe(1750);
    expect(durationMs("arbitrary")).toBeUndefined();
    expect(retryDelay("120")).toBe(120000);
    expect(retryDelay("Sun, 01 Nov 2026 10:02:00 GMT", Date.parse("2026-11-01T10:00:00Z"))).toBe(
      120000,
    );
    expect(retryDelay("-5")).toBeUndefined();
    expect(
      rateFeedback(
        "openai",
        new Headers({
          authorization: "secret",
          "x-ratelimit-limit-requests": "100",
          "x-ratelimit-remaining-tokens": "0",
          "x-ratelimit-reset-tokens": "2m",
        }),
      ),
    ).toEqual({ requestLimit: 100, remainingTokens: 0, resetTokensMs: 120000 });
    expect(
      rateFeedback("openrouter", new Headers({ "x-ratelimit-limit": "50", "retry-after": "90" })),
    ).toEqual({ retryAfterMs: 90000 });
  });
  test("uses headroom, lower observed limits, validated known models and bounded settings", () => {
    const p = {
      provider: "mimo" as const,
      model: MODELS.mimo.id,
      rpm: 100,
      tpm: 10000000,
      parallel: 8,
    };
    expect(effectivePolicy(p)).toEqual({ rpm: 85, tpm: 8500000 });
    expect(effectivePolicy(p, { requestLimit: 20, tokenLimit: 10000 })).toEqual({
      rpm: 17,
      tpm: 8500,
    });
    expect(executionPolicySchema.safeParse(p).success).toBe(true);
    expect(executionPolicySchema.safeParse({ ...p, parallel: 1000 }).success).toBe(false);
    expect(executionPolicySchema.safeParse({ ...p, model: "unverified" }).success).toBe(false);
  });
});
