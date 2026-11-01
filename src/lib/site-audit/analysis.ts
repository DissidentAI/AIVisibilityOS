import type { AuditPage, AuditSite } from "./types";

/** All denominators are observed pages, never an estimate of a site's size. */
export function compareSites(sites: AuditSite[], pages: AuditPage[]) {
  return sites.map((site) => {
    const attempts = pages.filter((p) => p.site_id === site.id);
    const html = attempts.filter((p) => p.facts);
    const byUrl = new Map<string, AuditPage>();
    for (const p of attempts) {
      byUrl.set(p.url, p);
      if (p.final_url) byUrl.set(p.final_url, p);
    }
    const links = new Map<string, { url: string; sourceIds: string[] }>();
    for (const page of html)
      for (const url of page.facts!.internalLinks) {
        const existing = links.get(url);
        if (existing) existing.sourceIds.push(page.id);
        else links.set(url, { url, sourceIds: [page.id] });
      }
    const checkedLinks = [...links.values()].filter((l) => byUrl.get(l.url)?.http_status != null);
    // Only a fetched 404/410 supports a broken-link claim. Robots, timeouts and
    // authorization refusals are unavailable evidence, not broken pages.
    const brokenLinks = checkedLinks
      .filter((l) => [404, 410].includes(byUrl.get(l.url)!.http_status!))
      .map((l) => ({
        ...l,
        targetId: byUrl.get(l.url)!.id,
        status: byUrl.get(l.url)!.http_status!,
      }));
    const duplicates = (key: "title" | "description" | "contentHash") => {
      const groups = new Map<string, string[]>();
      for (const p of html) {
        if (key === "contentHash" && p.facts!.wordCount < 20) continue;
        const value = p.facts![key].trim().toLowerCase();
        if (!value) continue;
        groups.set(value, [...(groups.get(value) ?? []), p.id]);
      }
      return [...groups.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([value, pageIds]) => ({ value: value.slice(0, 300), pageIds }));
    };
    const count = (predicate: (p: AuditPage) => boolean) => html.filter(predicate).length;
    const issues = new Map<string, { code: string; severity: string; pageIds: string[] }>();
    for (const p of html)
      for (const issue of p.facts!.issues) {
        const group = issues.get(issue.code);
        if (group) group.pageIds.push(p.id);
        else
          issues.set(issue.code, { code: issue.code, severity: issue.severity, pageIds: [p.id] });
      }
    return {
      siteId: site.id,
      target: site.target,
      status: site.status,
      reason: site.reason,
      attempted: attempts.length,
      html: html.length,
      discovered: site.state.discovered.length,
      remaining: site.state.queue.length,
      pageLimit: site.max_pages,
      unavailable: attempts.filter((p) => !p.facts).length,
      withTitle: count((p) => !!p.facts!.title),
      withDescription: count((p) => !!p.facts!.description),
      withH1: count((p) => p.facts!.h1Count > 0),
      withCanonical: count((p) => !!p.facts!.canonical),
      withJsonLd: count((p) => p.facts!.structuredTypes.length > 0),
      noindex: count((p) => p.facts!.noindex),
      initialWords: html.reduce((n, p) => n + p.facts!.wordCount, 0),
      structuredTypes: [...new Set(html.flatMap((p) => p.facts!.structuredTypes))].sort(),
      images: html.reduce((n, p) => n + p.facts!.images, 0),
      imagesWithoutAlt: html.reduce((n, p) => n + p.facts!.imagesWithoutAlt, 0),
      linkTargets: links.size,
      checkedLinkTargets: checkedLinks.length,
      brokenLinks,
      duplicateTitles: duplicates("title"),
      duplicateDescriptions: duplicates("description"),
      duplicateContent: duplicates("contentHash"),
      issues: [...issues.values()],
    };
  });
}
export type SiteComparison = ReturnType<typeof compareSites>[number];
