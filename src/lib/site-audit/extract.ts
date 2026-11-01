import { load } from "cheerio";
import { createHash } from "node:crypto";
import { safePublicUrl } from "../public-url";
import { siteUrl, type CrawlResource } from "./network";
import type { PageFacts, PageIssue } from "./types";
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
export function crawlableUrl(value: string, base: string, domain: string) {
  try {
    const url = siteUrl(new URL(value, base).href, domain);
    // Avoid faceted navigation, session/action links and unbounded query calendars.
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_.+|gclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
    if (
      url.search ||
      /\.(?:pdf|zip|gz|xml|json|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|css|js|mp[34]|mov|exe|dmg)$/i.test(
        url.pathname,
      )
    )
      return null;
    if (
      /(?:^|\/)(?:wp-admin|wp-login\.php|login|logout|signout|signin|cart|checkout|account|admin|api|search|cdn-cgi)(?:\/|$)/i.test(
        url.pathname,
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function extractPage(resource: CrawlResource, domain: string): PageFacts {
  const $ = load(resource.body);
  const issues: PageIssue[] = [];
  const add = (code: string, severity: PageIssue["severity"], evidence: string) =>
    issues.push({ code, severity, evidence: evidence.slice(0, 300) });
  const title = compact($("title").first().text()).slice(0, 500);
  const description = compact($("meta[name='description' i]").first().attr("content") ?? "").slice(
    0,
    1000,
  );
  const language = ($("html").attr("lang") ?? "").slice(0, 60);
  const canonicalRaw = $("link[rel~='canonical' i]").first().attr("href");
  let canonical: string | null = null;
  if (canonicalRaw) {
    try {
      canonical = safePublicUrl(new URL(canonicalRaw, resource.url).href)?.href ?? null;
    } catch {}
  }
  const robots = [
    $("meta[name='robots' i]")
      .map((_, e) => $(e).attr("content") ?? "")
      .get()
      .join(", "),
    resource.headers["x-robots-tag"] ?? "",
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 2000);
  const noindex = /(?:^|[\s,:])(?:noindex|none)(?:$|[\s,])/i.test(robots);
  const h1Count = $("h1").length;
  const headings = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .slice(0, 40)
    .map((e) => ({ level: Number(e.tagName.slice(1)), text: compact($(e).text()).slice(0, 200) }));
  const internalLinks = new Set<string>(),
    externalLinks = new Set<string>();
  $("a[href]")
    .slice(0, 2000)
    .each((_, e) => {
      const href = $(e).attr("href") ?? "";
      const local = crawlableUrl(href, resource.url, domain);
      if (local) internalLinks.add(local);
      else {
        try {
          const external = safePublicUrl(new URL(href, resource.url).href);
          if (external && external.hostname.replace(/^www\./, "") !== domain.replace(/^www\./, ""))
            externalLinks.add(external.href);
        } catch {}
      }
    });
  const structuredTypes = new Set<string>();
  let invalidJsonLd = 0;
  $("script[type='application/ld+json' i]")
    .slice(0, 40)
    .each((_, e) => {
      try {
        const value = JSON.parse($(e).text());
        let visited = 0;
        const walk = (object: unknown, depth: number) => {
          if (++visited > 2048 || depth > 32 || !object || typeof object !== "object") return;
          if (Array.isArray(object)) {
            for (const child of object) walk(child, depth + 1);
            return;
          }
          const record = object as Record<string, unknown>,
            type = record["@type"];
          for (const item of Array.isArray(type) ? type : [type])
            if (typeof item === "string") structuredTypes.add(item.slice(0, 100));
          for (const child of Object.values(record)) walk(child, depth + 1);
        };
        walk(value, 0);
      } catch {
        invalidJsonLd++;
      }
    });
  const images = $("img").length,
    imagesWithoutAlt = $("img:not([alt])").length;
  const content = (
    $("main").first().length
      ? $("main").first()
      : $("article").first().length
        ? $("article").first()
        : $("body")
  ).clone();
  content
    .find("script,style,noscript,nav,header,footer,aside,form,[hidden],[aria-hidden='true']")
    .remove();
  content.find("p,div,li,section,br,h1,h2,h3,h4,h5,h6").append(" ");
  const text = compact(content.text());
  const wordCount = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  if (!title) add("missing_title", "warning", "title: absent");
  if ($("title").length > 1)
    add("multiple_titles", "warning", `${$("title").length} title elements`);
  if (!description) add("missing_description", "info", "meta description: absent");
  if (h1Count === 0) add("missing_h1", "warning", "h1: 0");
  if (h1Count > 1) add("multiple_h1", "info", `h1: ${h1Count}`);
  if (!language) add("missing_language", "warning", "html lang: absent");
  if (!canonical)
    add(
      canonicalRaw ? "invalid_canonical" : "missing_canonical",
      "info",
      canonicalRaw ?? "canonical: absent",
    );
  else if (new URL(canonical).hostname.replace(/^www\./, "") !== domain.replace(/^www\./, ""))
    add("external_canonical", "warning", canonical);
  if (noindex) add("noindex", "info", robots);
  if (invalidJsonLd) add("invalid_json_ld", "warning", `${invalidJsonLd} invalid JSON-LD blocks`);
  if (!structuredTypes.size)
    add(
      "no_json_ld",
      "info",
      "No JSON-LD type found; other structured data formats are not checked.",
    );
  if (imagesWithoutAlt)
    add(
      "images_without_alt",
      "warning",
      `${imagesWithoutAlt} / ${images} img elements without an alt attribute`,
    );
  if (wordCount < 100)
    add(
      "little_initial_text",
      "info",
      `${wordCount} approximate words in initial HTML; JavaScript was not executed`,
    );
  if (resource.status >= 400) add("http_error", "error", `HTTP ${resource.status}`);
  return {
    title,
    description,
    language,
    canonical,
    noindex,
    robots,
    headings,
    h1Count,
    wordCount,
    excerpt: text.slice(0, 1600),
    contentHash: createHash("sha256").update(text).digest("hex"),
    structuredTypes: [...structuredTypes].slice(0, 40),
    invalidJsonLd,
    images,
    imagesWithoutAlt,
    internalLinks: [...internalLinks].slice(0, 500),
    externalLinkCount: externalLinks.size,
    issues,
  };
}
export function sitemapEntries(body: string, base: string, domain: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new Error("unsafe_sitemap_xml");
  const $ = load(body, { xml: true });
  const index = $("*")
    .toArray()
    .some((e) => "tagName" in e && e.tagName.split(":").pop() === "sitemapindex");
  const urls: string[] = [];
  $("*")
    .filter((_, e) => "tagName" in e && e.tagName.split(":").pop() === "loc")
    .slice(0, 5000)
    .each((_, el) => {
      try {
        const url = siteUrl(new URL($(el).text().trim(), base).href, domain);
        const accepted = index ? url.href : crawlableUrl(url.href, base, domain);
        if (accepted) urls.push(accepted);
      } catch {}
    });
  return { index, urls: [...new Set(urls)].slice(0, 1000) };
}
