import robotsParser from "robots-parser";
import {
  AUDIT_AGENT,
  AUDIT_LIMITS,
  type AuditPage,
  type AuditSite,
  type CrawlState,
  type RobotsEvidence,
} from "./types";
import {
  CrawlError,
  fetchPublicResource,
  siteUrl,
  type CrawlFetcher,
  type CrawlResource,
} from "./network";
import { crawlableUrl, extractPage, sitemapEntries } from "./extract";
import { retryDelay } from "../execution-policy";

export function initialCrawlState(domain: string): CrawlState {
  const root = `https://${domain}/`;
  return {
    queue: [{ url: root, depth: 0 }],
    discovered: [root],
    robots: [],
    sitemaps: [],
    initialized: false,
    limits: [],
    requests: 0,
    bytes: 0,
    nextAt: null,
  };
}
export type CrawlStep = {
  state: CrawlState;
  page?: Omit<AuditPage, "id" | "org_id" | "site_id">;
  status: AuditSite["status"];
  reason: string | null;
};
export type CrawlRuntime = {
  fetcher?: CrawlFetcher;
  check: () => Promise<void>;
  pace: (domain: string, delayMs: number) => Promise<void>;
  pause: (domain: string, delayMs: number) => Promise<void>;
  now?: () => number;
};
/** One durable page at a time. Network access is provided by the SSRF-protected fetcher;
 * tests inject synthetic responses into isolated databases, never production fixtures.
 */
export async function crawlSiteStep(
  site: AuditSite,
  pages: AuditPage[],
  runtime: CrawlRuntime,
): Promise<CrawlStep> {
  const fetcher = runtime.fetcher ?? fetchPublicResource,
    now = runtime.now ?? Date.now;
  const state = structuredClone(site.state),
    domain = site.target.domain;
  const domainKey = domain.replace(/^www\./, "").toLowerCase();
  const done = (status: AuditSite["status"], reason: string | null = null): CrawlStep => ({
    state,
    status,
    reason,
  });
  const current = async () => {
    await runtime.check();
    if (
      site.started_at &&
      now() - new Date(site.started_at).getTime() >= AUDIT_LIMITS.siteDurationMs
    )
      throw new CrawlError("audit_time_limit");
    if (state.bytes + AUDIT_LIMITS.maxBytes > AUDIT_LIMITS.maxSiteBytes)
      throw new CrawlError("audit_byte_limit");
  };
  const noteResource = async (response: CrawlResource) => {
    state.bytes += response.bytes;
    if ([429, 503].includes(response.status)) {
      await runtime.pause(
        domainKey,
        Math.max(60_000, retryDelay(response.headers["retry-after"] ?? null, now()) ?? 0),
      );
      throw new CrawlError("site_rate_limited");
    }
  };
  const robotsFor = async (origin: string) => {
    let record = state.robots.find((r) => r.origin === origin);
    if (!record) {
      const robotsUrl = new URL("/robots.txt", origin).href;
      record = {
        origin,
        url: robotsUrl,
        status: null,
        body: "",
        error: null,
        fetchedAt: new Date(now()).toISOString(),
      } satisfies RobotsEvidence;
      state.robots.push(record);
      try {
        const response = await fetcher(robotsUrl, domain, async () => {
          await current();
          await runtime.pace(domainKey, AUDIT_LIMITS.minimumDelayMs);
          await current();
          state.requests++;
        });
        record.status = response.status;
        await noteResource(response);
        if (response.status === 200) {
          if (
            response.body.length > 64_000 ||
            /<html|<!doctype\s+html/i.test(response.body) ||
            response.body.split(/\r?\n/).some((line) => line.length > 2048)
          )
            throw new CrawlError("robots_invalid");
          record.body = response.body;
        } else if (![404, 410].includes(response.status))
          throw new CrawlError("robots_unavailable");
      } catch (e) {
        record.error = e instanceof CrawlError ? e.code : "robots_unavailable";
        if (record.error === "audit_cancelled" || record.error === "audit_lease_lost") throw e;
      }
    }
    if (record.error) throw new CrawlError(record.error);
    const rules = robotsParser(new URL("/robots.txt", origin).href, record.body);
    const delay = Math.max(
      AUDIT_LIMITS.minimumDelayMs,
      (rules.getCrawlDelay(AUDIT_AGENT) ?? 0) * 1000,
    );
    // Do not bypass a site's unusually slow crawl policy to complete a bounded audit.
    if (!Number.isFinite(delay) || delay > 10_000) throw new CrawlError("crawl_delay_limit");
    return { rules, delay };
  };
  const get = (url: string) =>
    fetcher(url, domain, async (hop) => {
      await current();
      const { rules, delay } = await robotsFor(hop.origin);
      if (rules.isAllowed(hop.href, AUDIT_AGENT) !== true)
        throw new CrawlError("robots_disallowed");
      await runtime.pace(domainKey, delay);
      await current();
      state.requests++;
    });
  function discover(url: string, depth: number) {
    if (state.discovered.includes(url)) return;
    if (state.discovered.length >= AUDIT_LIMITS.maxDiscovered) {
      if (!state.limits.includes("discovery_limit")) state.limits.push("discovery_limit");
      return;
    }
    state.discovered.push(url);
    if (depth > AUDIT_LIMITS.maxDepth) {
      if (!state.limits.includes("depth_limit")) state.limits.push("depth_limit");
      return;
    }
    state.queue.push({ url, depth });
  }
  try {
    await current();
    if (pages.length >= site.max_pages) return done("partial", "page_limit");
    if (!state.initialized) {
      const origin = new URL(`https://${domain}`).origin;
      const { rules } = await robotsFor(origin);
      const maps = (
        rules.getSitemaps().length ? rules.getSitemaps() : [new URL("/sitemap.xml", origin).href]
      ).slice(0, AUDIT_LIMITS.maxSitemaps);
      const seen = new Set<string>();
      while (maps.length && seen.size < AUDIT_LIMITS.maxSitemaps) {
        const proposed = maps.shift()!;
        let url: string;
        try {
          url = siteUrl(proposed, domain).href;
        } catch {
          continue;
        }
        if (seen.has(url)) continue;
        seen.add(url);
        const entry = { url, status: null as number | null, error: null as string | null, urls: 0 };
        state.sitemaps.push(entry);
        try {
          const response = await get(url);
          entry.status = response.status;
          await noteResource(response);
          if (response.status !== 200) {
            entry.error = `http_${response.status}`;
            continue;
          }
          if (!/<(?:[a-z]+:)?(?:urlset|sitemapindex)\b/i.test(response.body))
            throw new CrawlError("sitemap_invalid");
          const parsed = sitemapEntries(response.body, response.url, domain);
          entry.urls = parsed.urls.length;
          if (parsed.index) maps.push(...parsed.urls.slice(0, AUDIT_LIMITS.maxSitemaps));
          else for (const link of parsed.urls) discover(link, 1);
        } catch (e) {
          entry.error = e instanceof CrawlError ? e.code : "sitemap_invalid";
          if (
            [
              "site_rate_limited",
              "audit_cancelled",
              "audit_lease_lost",
              "audit_time_limit",
              "audit_byte_limit",
            ].includes(entry.error)
          )
            throw e;
        }
      }
      if (maps.length) state.limits.push("sitemap_limit");
      state.initialized = true;
    }
    // Redirect aliases already fetched do not consume another page slot.
    while (
      state.queue.length &&
      pages.some((p) => p.url === state.queue[0].url || p.final_url === state.queue[0].url)
    )
      state.queue.shift();
    const entry = state.queue.shift();
    if (!entry)
      return done(
        state.limits.length || pages.some((p) => p.error_code) ? "partial" : "completed",
        state.limits[0] ?? (pages.some((p) => p.error_code) ? "unavailable_pages" : null),
      );
    const page: NonNullable<CrawlStep["page"]> = {
      url: entry.url,
      final_url: null,
      depth: entry.depth,
      http_status: null,
      error_code: null,
      response_ms: null,
      bytes: 0,
      fetched_at: new Date(now()).toISOString(),
      facts: null,
    };
    try {
      const response = await get(entry.url);
      page.final_url = response.url;
      page.http_status = response.status;
      page.response_ms = response.elapsedMs;
      page.bytes = response.bytes;
      await noteResource(response);
      if (response.status < 200 || response.status >= 300)
        page.error_code = `http_${response.status}`;
      else if (
        !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
          response.headers["content-type"] ?? "",
        )
      )
        page.error_code = "not_html";
      else {
        page.facts = extractPage(response, domain);
        for (const link of page.facts.internalLinks) {
          const accepted = crawlableUrl(link, response.url, domain);
          if (accepted) discover(accepted, entry.depth + 1);
        }
      }
    } catch (e) {
      page.error_code = e instanceof CrawlError ? e.code : "fetch_failed";
      if (["audit_cancelled", "audit_lease_lost"].includes(page.error_code)) throw e;
      if (
        ["site_rate_limited", "crawl_delay_limit", "audit_time_limit", "audit_byte_limit"].includes(
          page.error_code,
        )
      )
        return { ...done("partial", page.error_code), page };
    }
    const exhausted = pages.length + 1 >= site.max_pages && state.queue.length > 0;
    const complete = state.queue.length === 0;
    return {
      state,
      page,
      status: exhausted
        ? "partial"
        : complete
          ? page.error_code || pages.some((p) => p.error_code) || state.limits.length
            ? "partial"
            : "completed"
          : "running",
      reason: exhausted
        ? "page_limit"
        : complete
          ? (state.limits[0] ??
            (page.error_code || pages.some((p) => p.error_code) ? "unavailable_pages" : null))
          : null,
    };
  } catch (error) {
    const code = error instanceof CrawlError ? error.code : "crawl_failed";
    if (["audit_cancelled", "audit_lease_lost"].includes(code)) throw error;
    return done(pages.some((p) => p.facts) ? "partial" : "blocked", code);
  }
}
