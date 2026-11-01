import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { gzipSync } from "node:zlib";
import type { IncomingMessage, RequestOptions } from "node:http";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:http", () => ({ request: mocks.request }));
import {
  fetchPublicResource,
  publicAddress,
  resolvePublicHost,
  siteUrl,
} from "../src/lib/site-audit/network";
type Reply = { status: number; body?: Buffer | string; headers?: Record<string, string> };
let replies: Reply[];
beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  replies = [
    {
      status: 200,
      body: "<h1>Public fixture</h1>",
      headers: { "content-type": "text/html", "set-cookie": "must-not-be-retained" },
    },
  ];
  mocks.request
    .mockReset()
    .mockImplementation((options: RequestOptions, callback: (res: IncomingMessage) => void) => {
      const request = Object.assign(new EventEmitter(), {
        end() {
          queueMicrotask(() => {
            const reply = replies.shift()!;
            const res = Object.assign(new EventEmitter(), {
              statusCode: reply.status,
              headers: reply.headers ?? {},
            });
            callback(res as unknown as IncomingMessage);
            res.emit("data", Buffer.from(reply.body ?? ""));
            res.emit("end");
          });
        },
        destroy(error: Error) {
          request.emit("error", error);
          return request;
        },
      });
      options.signal?.addEventListener("abort", () => request.emit("error", new Error("aborted")), {
        once: true,
      });
      return request;
    });
});
afterEach(() => vi.useRealTimers());
test("IP classification rejects private, mapped, tunnel and reserved ranges", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
    "64:ff9b::7f00:1",
    "garbage",
  ])
    expect(publicAddress(ip), ip).toBe(false);
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
});
test("URL allowlist is exact and mixed DNS answers fail closed", async () => {
  for (const value of [
    "http://127.0.0.1/",
    "https://audit.example.evil.com/",
    "https://sub.audit.example/",
    "https://audit.example:444/",
    "https://user:pass@audit.example/",
    "file:///etc/passwd",
    "http://2130706433/",
    "https://audit.example/\nadmin",
  ])
    expect(() => siteUrl(value, "audit.example")).toThrow();
  expect(siteUrl("https://www.audit.example/a#b", "audit.example").href).toBe(
    "https://www.audit.example/a",
  );
  mocks.lookup.mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
    { address: "::1", family: 6 },
  ]);
  await expect(resolvePublicHost("audit.example")).rejects.toThrow("private_network_blocked");
  await expect(fetchPublicResource("https://audit.example/", "audit.example")).rejects.toThrow(
    "private_network_blocked",
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
test("transport pins validated IP and retains TLS hostname verification without cookies", async () => {
  const result = await fetchPublicResource("https://audit.example/a", "audit.example");
  expect(result.body).toContain("Public fixture");
  const options = mocks.request.mock.calls[0][0];
  expect(options).toMatchObject({
    hostname: "8.8.8.8",
    servername: "audit.example",
    rejectUnauthorized: true,
    port: 443,
    path: "/a",
    agent: false,
  });
  expect(options.checkServerIdentity).toBeTypeOf("function");
  expect(options.headers.Host).toBe("audit.example");
  expect(options.headers.Cookie).toBeUndefined();
  expect(result.headers["set-cookie"]).toBeUndefined();
});
test("redirects recheck DNS and scope before the next connection", async () => {
  replies = [{ status: 302, headers: { location: "https://www.audit.example/next" } }];
  mocks.lookup
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
    .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
  await expect(fetchPublicResource("https://audit.example/", "audit.example")).rejects.toThrow(
    "private_network_blocked",
  );
  expect(mocks.request).toHaveBeenCalledTimes(1);
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  replies = [{ status: 302, headers: { location: "https://evil.example/" } }];
  await expect(fetchPublicResource("https://audit.example/", "audit.example")).rejects.toThrow(
    "url_outside_site",
  );
  expect(mocks.request).toHaveBeenCalledTimes(2);
});
test("wire, decompression and redirect limits stop oversized resources", async () => {
  replies = [{ status: 200, body: Buffer.alloc(1_500_001) }];
  await expect(fetchPublicResource("https://audit.example/", "audit.example")).rejects.toThrow(
    "page_too_large",
  );
  replies = [
    {
      status: 200,
      headers: { "content-encoding": "gzip" },
      body: gzipSync(Buffer.alloc(2_000_000)),
    },
  ];
  await expect(fetchPublicResource("https://audit.example/", "audit.example")).rejects.toThrow(
    "invalid_or_oversized_encoding",
  );
  replies = [{ status: 302, headers: { location: "/" } }];
  await expect(fetchPublicResource("https://audit.example/", "audit.example")).rejects.toThrow(
    "redirect_loop",
  );
});
test("DNS stalls are bounded and a rejected before-hop hook sends no request", async () => {
  await expect(
    fetchPublicResource("https://audit.example/", "audit.example", async () => {
      throw new Error("cancelled");
    }),
  ).rejects.toThrow("cancelled");
  expect(mocks.request).not.toHaveBeenCalled();
  vi.useFakeTimers();
  mocks.lookup.mockImplementation(() => new Promise(() => {}));
  const pending = expect(
    fetchPublicResource("https://audit.example/", "audit.example"),
  ).rejects.toThrow("fetch_timeout");
  await vi.advanceTimersByTimeAsync(12_001);
  await pending;
  expect(mocks.request).not.toHaveBeenCalled();
});
