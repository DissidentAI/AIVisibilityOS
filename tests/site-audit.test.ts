import { test, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { extractPage, crawlableUrl, sitemapEntries } from "../src/lib/site-audit/extract";
import { crawlSiteStep, initialCrawlState } from "../src/lib/site-audit/crawler";
import { compareSites } from "../src/lib/site-audit/analysis";
import { evidencePrompt, parseSynthesis } from "../src/lib/site-audit/ai-evidence";
import type { AuditPage, AuditSite } from "../src/lib/site-audit/types";
import { CrawlError, type CrawlResource, type CrawlFetcher } from "../src/lib/site-audit/network";
const html = `<!doctype html><html lang="fr"><head><title>Fixture technique</title><meta name="description" content="Description réelle dans la fixture"><link rel="canonical" href="/"><script type="application/ld+json">{"@type":"Organization"}</script></head><body><main><h1>Titre de fixture</h1><p>Un texte de test synthétique avec des preuves à examiner pour une analyse comparative de pages publiques.</p><a href="/about">À propos</a><img src="a.png"><img src="b.png" alt=""></main></body></html>`;
const resource = (body = html, url = "https://audit.example/", status = 200): CrawlResource => ({
  body,
  url,
  status,
  headers: { "content-type": "text/html" },
  bytes: Buffer.byteLength(body),
  elapsedMs: 12,
});
function site(): AuditSite {
  return {
    id: randomUUID(),
    audit_id: randomUUID(),
    org_id: randomUUID(),
    target: { brandId: randomUUID(), name: "Fixture", domain: "audit.example", primary: true },
    status: "running",
    reason: null,
    state: initialCrawlState("audit.example"),
    max_pages: 10,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null,
    lease_token: randomUUID(),
    lease_until: null,
  };
}
function page(s: AuditSite, body = html, url = "https://audit.example/"): AuditPage {
  return {
    id: randomUUID(),
    org_id: s.org_id,
    site_id: s.id,
    url,
    final_url: url,
    depth: 0,
    http_status: 200,
    error_code: null,
    response_ms: 12,
    bytes: 100,
    fetched_at: new Date().toISOString(),
    facts: extractPage(resource(body, url), s.target.domain),
  };
}
function fixture(responses: Record<string, CrawlResource>): {
  fetcher: CrawlFetcher;
  requests: string[];
} {
  const requests: string[] = [];
  return {
    requests,
    fetcher: async (url, _domain, before) => {
      await before?.(new URL(url));
      requests.push(url);
      return responses[url] ?? resource("", url, 404);
    },
  };
}
const runtime = () => ({
  check: vi.fn(async () => {}),
  pace: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
});
test("HTML evidence counts actual metadata and preserves limited page text without executing scripts", () => {
  const facts = extractPage(resource(html), "audit.example");
  expect(facts).toMatchObject({
    title: "Fixture technique",
    language: "fr",
    h1Count: 1,
    canonical: "https://audit.example/",
    structuredTypes: ["Organization"],
    images: 2,
    imagesWithoutAlt: 1,
  });
  expect(facts.internalLinks).toEqual(["https://audit.example/about"]);
  expect(facts.excerpt).not.toContain("@type");
  const invalid = extractPage(
    {
      ...resource(
        `<title>A</title><meta name="robots" content="noindex"><h1>A</h1><h1>B</h1><script type="application/ld+json">invalid</script>`,
      ),
      headers: { "x-robots-tag": "nofollow" },
    },
    "audit.example",
  );
  expect(invalid).toMatchObject({ noindex: true, h1Count: 2, invalidJsonLd: 1 });
  expect(invalid.issues.map((i) => i.code)).toContain("invalid_json_ld");
});
test("discovery filters action/query traps and handles namespaced sitemaps without entities", () => {
  for (const path of ["/login", "/cart/a", "/x.pdf", "/?page=2", "https://other.example/"])
    expect(crawlableUrl(path, "https://audit.example/", "audit.example")).toBeNull();
  expect(
    crawlableUrl("/about?utm_source=x#heading", "https://audit.example/", "audit.example"),
  ).toBe("https://audit.example/about");
  expect(
    sitemapEntries(
      `<s:urlset xmlns:s="https://www.sitemaps.org/schemas/sitemap/0.9"><s:url><s:loc>https://audit.example/about</s:loc></s:url></s:urlset>`,
      "https://audit.example/sitemap.xml",
      "audit.example",
    ).urls,
  ).toEqual(["https://audit.example/about"]);
  expect(() =>
    sitemapEntries(
      '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><urlset/>',
      "https://audit.example/",
      "audit.example",
    ),
  ).toThrow("unsafe_sitemap_xml");
});
test("crawl persists progress, respects robots for each page and never counts blocked pages as HTML", async () => {
  const s = site(),
    r = runtime();
  const f = fixture({
    "https://audit.example/robots.txt": resource(
      "User-agent: *\nDisallow: /about\nCrawl-delay: 2",
      "https://audit.example/robots.txt",
    ),
    "https://audit.example/": resource(),
  });
  const first = await crawlSiteStep(s, [], { ...r, fetcher: f.fetcher });
  expect(first.page?.facts?.title).toBe("Fixture technique");
  expect(first.status).toBe("running");
  const firstPage = { ...first.page!, id: randomUUID(), org_id: s.org_id, site_id: s.id };
  const second = await crawlSiteStep({ ...s, state: first.state }, [firstPage], {
    ...r,
    fetcher: f.fetcher,
  });
  expect(second.page?.error_code).toBe("robots_disallowed");
  expect(second.page?.facts).toBeNull();
  expect(second.status).toBe("partial");
  expect(f.requests).not.toContain("https://audit.example/about");
  expect(f.requests.filter((u) => u.endsWith("robots.txt"))).toHaveLength(1);
  expect(r.pace).toHaveBeenCalledWith("audit.example", 2000);
});
test("unavailable robots fail closed, 404 allows crawl, rate limits pause the host", async () => {
  for (const status of [403, 503]) {
    const f = fixture({
        "https://audit.example/robots.txt": resource(
          "",
          "https://audit.example/robots.txt",
          status,
        ),
      }),
      r = runtime();
    const result = await crawlSiteStep(site(), [], { ...r, fetcher: f.fetcher });
    expect(result.status).toBe("blocked");
    expect(f.requests).toHaveLength(1);
    if (status === 503) expect(r.pause).toHaveBeenCalledWith("audit.example", 60_000);
  }
  const f = fixture({ "https://audit.example/": resource("<title>Allowed</title>") });
  expect(
    (await crawlSiteStep(site(), [], { ...runtime(), fetcher: f.fetcher })).page?.facts?.title,
  ).toBe("Allowed");
});
test("page, duration, robots delay and cancellation bounds are enforced", async () => {
  const s = site(),
    f = fixture({ "https://audit.example/": resource() });
  expect(
    (await crawlSiteStep({ ...s, max_pages: 1 }, [], { ...runtime(), fetcher: f.fetcher })).reason,
  ).toBe("page_limit");
  const limited = fixture({
    "https://audit.example/robots.txt": resource(
      "User-agent: *\nCrawl-delay: 30",
      "https://audit.example/robots.txt",
    ),
  });
  expect((await crawlSiteStep(s, [], { ...runtime(), fetcher: limited.fetcher })).reason).toBe(
    "crawl_delay_limit",
  );
  const stale = { ...s, started_at: new Date(Date.now() - 21 * 60_000).toISOString() };
  expect((await crawlSiteStep(stale, [], { ...runtime(), fetcher: f.fetcher })).reason).toBe(
    "audit_time_limit",
  );
  await expect(
    crawlSiteStep(s, [], {
      ...runtime(),
      check: async () => {
        throw new CrawlError("audit_cancelled");
      },
      fetcher: f.fetcher,
    }),
  ).rejects.toThrow("audit_cancelled");
});
test("comparisons use observed denominators and only classify verified 404/410 links as broken", () => {
  const s = site(),
    p = page(s),
    duplicate = page(s, html, "https://audit.example/duplicate");
  const missing = {
    ...page(s, html, "https://audit.example/about"),
    facts: null,
    http_status: 404,
    error_code: "http_404",
  };
  const [result] = compareSites([s], [p, duplicate, missing]);
  expect(result).toMatchObject({
    html: 2,
    attempted: 3,
    withTitle: 2,
    unavailable: 1,
    checkedLinkTargets: 1,
  });
  expect(result.duplicateTitles[0].pageIds).toHaveLength(2);
  expect(result.brokenLinks[0]).toMatchObject({ targetId: missing.id, status: 404 });
  expect(
    compareSites([s], [p, { ...missing, http_status: null, error_code: "fetch_timeout" }])[0]
      .brokenLinks,
  ).toEqual([]);
});
test("AI corpus is bounded, covers each site, and rejects fabricated page references", () => {
  const s = site(),
    p = page(s),
    another = { ...site(), target: { ...s.target, primary: false, name: "Other" } },
    p2 = page(another);
  const corpus = evidencePrompt([s, another], [p, p2]);
  expect(corpus.evidenceIds).toContain(p.id);
  expect(corpus.evidenceIds).toContain(p2.id);
  const output = {
    summary: "Synthetic summary",
    findings: [
      {
        title: "Review",
        observation: "Missing alt attribute",
        evidenceIds: [p.id],
        hypothesis: "Verify decorative intent",
        action: "Review the image",
        priority: "medium",
      },
    ],
  };
  expect(parseSynthesis(JSON.stringify(output), corpus.evidenceIds)).not.toBeNull();
  expect(parseSynthesis(JSON.stringify(output), [])).toBeNull();
  const many = Array.from({ length: 400 }, (_, index) => ({
    ...p,
    id: randomUUID(),
    url: `https://audit.example/${index}`,
  }));
  const large = evidencePrompt([s], many);
  expect(Buffer.byteLength(large.query)).toBeLessThan(32_000);
  expect(large.evidenceIds.length).toBeLessThan(400);
  expect(parseSynthesis("not JSON", corpus.evidenceIds)).toBeNull();
});
