import { z } from "zod";
import {
  MODELS,
  OPENROUTER_MODEL_IDS,
  PROVIDERS,
  modelConfiguration,
  type Provider,
} from "./provider-config";

// Local starting guardrails, NOT claims about an account's entitlements. MiMo's
// published model quotas are 100 RPM / 10M TPM (2026-11-01); concurrency is not published.
export const EXECUTION_DEFAULTS: Record<Provider, { rpm: number; tpm: number; parallel: number }> =
  {
    openai: { rpm: 60, tpm: 200_000, parallel: 6 },
    gemini: { rpm: 10, tpm: 100_000, parallel: 4 },
    kimi: { rpm: 30, tpm: 240_000, parallel: 4 },
    openrouter: { rpm: 60, tpm: 300_000, parallel: 6 },
    mimo: { rpm: 100, tpm: 10_000_000, parallel: 8 },
  };
export const RATE_HEADROOM = 0.85;
export const executionPolicySchema = z
  .object({
    provider: z.enum(PROVIDERS),
    model: z.string().max(120),
    rpm: z.number().int().min(1).max(100_000),
    tpm: z.number().int().min(1_000).max(100_000_000),
    parallel: z.number().int().min(1).max(16),
  })
  .refine((p) => !!modelConfiguration(p.provider, p.model), {
    path: ["model"],
    message: "Unknown model",
  });
export type ExecutionPolicy = z.infer<typeof executionPolicySchema>;
export type ExecutionStatus = ExecutionPolicy & {
  active: number;
  adaptiveParallel: number;
  effectiveRpm: number;
  effectiveTpm: number;
  pausedUntil: string | null;
  configured: boolean;
};
export function executionModels() {
  return PROVIDERS.flatMap((provider) =>
    (provider === "openrouter" ? [...OPENROUTER_MODEL_IDS] : [MODELS[provider].id]).map(
      (model) => ({ provider, model }),
    ),
  );
}

export type RateFeedback = {
  retryAfterMs?: number;
  requestLimit?: number;
  tokenLimit?: number;
  remainingRequests?: number;
  remainingTokens?: number;
  resetRequestsMs?: number;
  resetTokensMs?: number;
  remainingProjectTokens?: number;
  resetProjectTokensMs?: number;
};
const YEAR = 365 * 86_400_000;
function nonnegative(value: string | null) {
  if (!value?.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1e12 ? number : undefined;
}
export function retryDelay(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const seconds = nonnegative(value);
  const delay = seconds == null ? Date.parse(value) - now : seconds * 1000;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(YEAR, Math.ceil(delay)) : undefined;
}
export function durationMs(value: string | null) {
  if (!value || !/^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/.test(value)) return undefined;
  let ms = 0;
  for (const [, n, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g))
    ms += Number(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return Math.min(YEAR, Math.ceil(ms));
}
/** Whitelist numeric scheduling hints only; never persist raw headers or upstream error text. */
export function rateFeedback(provider: Provider, headers: Headers, now = Date.now()): RateFeedback {
  const feedback: RateFeedback = { retryAfterMs: retryDelay(headers.get("retry-after"), now) };
  if (provider === "openai") {
    feedback.requestLimit = nonnegative(headers.get("x-ratelimit-limit-requests"));
    feedback.tokenLimit = nonnegative(headers.get("x-ratelimit-limit-tokens"));
    feedback.remainingRequests = nonnegative(headers.get("x-ratelimit-remaining-requests"));
    feedback.remainingTokens = nonnegative(headers.get("x-ratelimit-remaining-tokens"));
    feedback.resetRequestsMs = durationMs(headers.get("x-ratelimit-reset-requests"));
    feedback.resetTokensMs = durationMs(headers.get("x-ratelimit-reset-tokens"));
    feedback.remainingProjectTokens = nonnegative(
      headers.get("x-ratelimit-remaining-project-tokens"),
    );
    feedback.resetProjectTokensMs = durationMs(headers.get("x-ratelimit-reset-project-tokens"));
  }
  // Other providers' X-RateLimit-* can describe daily/platform limits. Do not
  // misinterpret them as RPM. Retry-After is the common documented contract.
  return Object.fromEntries(Object.entries(feedback).filter(([, value]) => value != null));
}

export function effectivePolicy(policy: ExecutionPolicy, observed?: RateFeedback | null) {
  return {
    rpm: Math.max(
      1,
      Math.floor(Math.min(policy.rpm, observed?.requestLimit ?? Infinity) * RATE_HEADROOM),
    ),
    tpm: Math.max(
      1,
      Math.floor(Math.min(policy.tpm, observed?.tokenLimit ?? Infinity) * RATE_HEADROOM),
    ),
  };
}
