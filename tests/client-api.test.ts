import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/lib/client-api";

afterEach(() => vi.unstubAllGlobals());
describe("browser API request lifecycle", () => {
  it("cancels reads on page exit without an automatic retry", async () => {
    const page = new EventTarget();
    vi.stubGlobal("window", page);
    const fetch = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = api("runs");
    const check = expect(result).rejects.toMatchObject({ name: "AbortError" });
    page.dispatchEvent(new Event("pagehide"));
    await check;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not cancel or replay an already submitted mutation on page exit", async () => {
    const page = new EventTarget();
    vi.stubGlobal("window", page);
    const fetch = vi.fn(async (_url, options) => {
      page.dispatchEvent(new Event("pagehide"));
      expect(options.signal.aborted).toBe(false);
      return Response.json({ id: "saved" });
    });
    vi.stubGlobal("fetch", fetch);
    expect(await api("runs", "POST", { projectId: "test" })).toEqual({ id: "saved" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("forwards cancellation when a component is replaced", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        options.signal.throwIfAborted();
      }),
    );
    await expect(api("state", "GET", undefined, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("keeps actionable server errors and handles non-JSON proxy failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ error: "budget_exceeded" }, { status: 409 }))
        .mockResolvedValueOnce(new Response("<html>Proxy error</html>", { status: 502 })),
    );
    await expect(api("runs", "POST", {})).rejects.toThrow("budget_exceeded");
    await expect(api("state")).rejects.toThrow("invalid_server_response");
  });
  it("reports a network error without exposing raw transport details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Fetch internal transport information")),
    );
    await expect(api("state")).rejects.toEqual(new ApiError("network_unavailable"));
  });
});
