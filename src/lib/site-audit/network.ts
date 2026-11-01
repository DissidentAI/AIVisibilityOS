import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import ipaddr from "ipaddr.js";
import { safePublicUrl } from "../public-url";
import { AUDIT_AGENT, AUDIT_LIMITS } from "./types";

export class CrawlError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function publicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    if (ip.range() !== "unicast") return false;
    return (
      ip.kind() === "ipv4" || (ip as ipaddr.IPv6).match(ipaddr.parse("2000::") as ipaddr.IPv6, 3)
    );
  } catch {
    return false;
  }
}
export function siteUrl(value: string, domain: string): URL {
  const url = safePublicUrl(value);
  const base = domain.replace(/^www\./, "").toLowerCase();
  if (!url || url.href.length > 2048 || ![base, `www.${base}`].includes(url.hostname.toLowerCase()))
    throw new CrawlError("url_outside_site");
  if (/[\\\u0000-\u001f\u007f]/.test(value)) throw new CrawlError("invalid_public_url");
  url.hash = "";
  return url;
}
export async function resolvePublicHost(hostname: string, resolve = lookup) {
  const addresses = await resolve(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new CrawlError("private_network_blocked");
  // Prefer IPv4 when available, but never re-resolve at connection time.
  return addresses.find((a) => a.family === 4) ?? addresses[0];
}
export type CrawlResource = {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  elapsedMs: number;
};
export type CrawlFetcher = (
  value: string,
  domain: string,
  beforeHop?: (url: URL) => Promise<void>,
) => Promise<CrawlResource>;
function retainedHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    ["content-type", "content-encoding", "location", "x-robots-tag", "retry-after"].flatMap(
      (key) => {
        const value = headers[key];
        return value == null
          ? []
          : [[key, (Array.isArray(value) ? value.join(", ") : value).slice(0, 2048)]];
      },
    ),
  );
}
async function pinnedGet(url: URL, deadline: number, byteLimit: number) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), Math.max(1, deadline - Date.now()));
  try {
    const address = await Promise.race([
      resolvePublicHost(url.hostname),
      new Promise<never>((_, reject) =>
        abort.signal.addEventListener("abort", () => reject(new CrawlError("fetch_timeout")), {
          once: true,
        }),
      ),
    ]);
    if (abort.signal.aborted) throw new CrawlError("fetch_timeout");
    return await new Promise<{ status: number; headers: Record<string, string>; data: Buffer }>(
      (resolve, reject) => {
        const secure = url.protocol === "https:";
        const req = (secure ? httpsRequest : httpRequest)(
          {
            protocol: url.protocol,
            hostname: address.address,
            family: address.family,
            port: secure ? 443 : 80,
            method: "GET",
            path: url.pathname + url.search,
            agent: false,
            signal: abort.signal,
            maxHeaderSize: 16_384,
            ...(secure
              ? {
                  servername: url.hostname,
                  rejectUnauthorized: true,
                  checkServerIdentity: (
                    _host: string,
                    cert: Parameters<typeof checkServerIdentity>[1],
                  ) => checkServerIdentity(url.hostname, cert),
                }
              : {}),
            headers: {
              Host: url.host,
              "User-Agent": `${AUDIT_AGENT}/1.0 (+https://github.com/DissidentAI/AIVisibilityOS)`,
              Accept: "text/html, application/xhtml+xml, application/xml, text/plain;q=0.8",
              "Accept-Encoding": "identity",
              Connection: "close",
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            let length = 0;
            response.on("data", (chunk: Buffer) => {
              length += chunk.length;
              if (length > byteLimit) {
                req.destroy(new CrawlError("page_too_large"));
                return;
              }
              chunks.push(chunk);
            });
            response.on("error", reject);
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                headers: retainedHeaders(response.headers),
                data: Buffer.concat(chunks),
              }),
            );
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
  } catch (error) {
    if (error instanceof CrawlError) throw error;
    throw new CrawlError(abort.signal.aborted ? "fetch_timeout" : "fetch_failed");
  } finally {
    clearTimeout(timeout);
  }
}
/** Bounded public GET, explicit IP pinning, TLS hostname verification and revalidation
 * at every redirect. No cookies, browser execution, proxy, credential or arbitrary port.
 */
export const fetchPublicResource: CrawlFetcher = async (value, domain, beforeHop) => {
  const started = Date.now();
  let deadline = started + AUDIT_LIMITS.resourceTimeoutMs,
    received = 0;
  let url = siteUrl(value, domain);
  const visited = new Set<string>();
  for (let hop = 0; hop <= 5; hop++) {
    if (visited.has(url.href)) throw new CrawlError("redirect_loop");
    visited.add(url.href);
    const before = Date.now();
    await beforeHop?.(url);
    deadline += Date.now() - before; // Exclude deliberate robots checks and politeness waits.
    if (Date.now() >= deadline) throw new CrawlError("fetch_timeout");
    const response = await pinnedGet(url, deadline, AUDIT_LIMITS.maxBytes - received);
    const priorBytes = received;
    received += response.data.length;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location) throw new CrawlError("invalid_redirect");
      try {
        url = siteUrl(new URL(response.headers.location, url).href, domain);
      } catch (error) {
        if (error instanceof CrawlError) throw error;
        throw new CrawlError("invalid_redirect");
      }
      continue;
    }
    let data = response.data;
    const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
    try {
      const options = { maxOutputLength: Math.max(1, AUDIT_LIMITS.maxBytes - priorBytes) };
      if (
        encoding === "gzip" ||
        (url.pathname.endsWith(".gz") && data[0] === 0x1f && data[1] === 0x8b)
      )
        data = gunzipSync(data, options);
      else if (encoding === "deflate") data = inflateSync(data, options);
      else if (encoding === "br") data = brotliDecompressSync(data, options);
      else if (encoding && encoding !== "identity") throw new CrawlError("unsupported_encoding");
    } catch {
      throw new CrawlError("invalid_or_oversized_encoding");
    }
    if (data.length + priorBytes > AUDIT_LIMITS.maxBytes) throw new CrawlError("page_too_large");
    return {
      url: url.href,
      status: response.status,
      headers: response.headers,
      body: data.toString("utf8"),
      bytes: priorBytes + Math.max(data.length, response.data.length),
      elapsedMs: Date.now() - started,
    };
  }
  throw new CrawlError("too_many_redirects");
};
