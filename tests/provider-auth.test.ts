import { afterEach, describe, expect, test, vi } from "vitest";
import { verifyProviderCredential } from "../src/lib/provider-auth";
import { PROVIDERS } from "../src/lib/provider-config";
describe("read-only provider credential checks", () => {
  afterEach(() => vi.restoreAllMocks());
  test("all providers use fixed official endpoints and generate no text", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response('{"data":[]}'));
    for (const provider of PROVIDERS) {
      expect((await verifyProviderCredential(provider, "synthetic-private-key")).valid).toBe(true);
    }
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/models",
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      "https://api.moonshot.ai/v1/models",
      "https://openrouter.ai/api/v1/key",
      "https://api.xiaomimimo.com/v1/models",
    ]);
    for (const [, options] of fetch.mock.calls) {
      expect(options).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
      expect(options?.body).toBeUndefined();
    }
  });
  test("a rejected Kimi key produces an actionable code without leaking the provider payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Invalid key synthetic-private-key", { status: 401 }),
    );
    await expect(verifyProviderCredential("kimi", "synthetic-private-key")).rejects.toThrow(
      "provider_auth_rejected_kimi",
    );
  });
  test("permission, rate limit and network failures are not reported as a valid key", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(verifyProviderCredential("mimo", "synthetic-private-key")).rejects.toThrow(
      "provider_access_denied_mimo",
    );
    fetch.mockResolvedValueOnce(new Response("retry", { status: 429 }));
    await expect(verifyProviderCredential("openrouter", "synthetic-private-key")).rejects.toThrow(
      "provider_check_unavailable_openrouter",
    );
    fetch.mockRejectedValueOnce(new Error("network detail with synthetic-private-key"));
    await expect(verifyProviderCredential("kimi", "synthetic-private-key")).rejects.toThrow(
      "provider_check_unavailable_kimi",
    );
  });
});
