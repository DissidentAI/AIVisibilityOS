import type { CrawlFetcher } from "../../src/lib/site-audit/network";
import type { callProvider } from "../../src/lib/providers";
export const auditFixtureFetcher: CrawlFetcher = async (value, _domain, beforeHop) => {
  const url = new URL(value);
  if (!url.hostname.endsWith(".example"))
    throw new Error("Only reserved fixture domains are supported");
  await beforeHop?.(url);
  const body =
    url.pathname === "/robots.txt"
      ? "User-agent: *\nDisallow: /private\nCrawl-delay: 1"
      : url.pathname === "/sitemap.xml"
        ? `<urlset><url><loc>${url.origin}/about</loc></url></urlset>`
        : url.pathname === "/missing"
          ? "Not found in synthetic fixture"
          : `<!doctype html><html lang="fr"><title>TEST SYNTHÉTIQUE — ${url.pathname === "/" ? "Accueil" : "À propos"}</title><body><main><h1>Test d’audit ${url.hostname}</h1><p>Ces pages de test sont générées uniquement dans une base isolée. Elles ne constituent pas des mesures de production ni des données provenant de sites réels.</p><a href="/about">Présentation</a><a href="/missing">Lien à vérifier</a><a href="/private">Page interdite</a><img src="test.png"></main></body></html>`;
  return {
    url: url.href,
    status: url.pathname === "/missing" ? 404 : 200,
    headers: {
      "content-type": url.pathname.endsWith(".txt")
        ? "text/plain"
        : url.pathname.endsWith(".xml")
          ? "application/xml"
          : "text/html",
    },
    body,
    bytes: Buffer.byteLength(body),
    elapsedMs: 10,
  };
};
export const auditFixtureModel: typeof callProvider = async (provider, _key, query) => {
  const data = JSON.parse(query);
  return {
    status: "succeeded",
    text: JSON.stringify({
      summary: "TEST SYNTHÉTIQUE — comparaison des pages de test.",
      findings: [
        {
          title: "Vérifier les textes alternatifs",
          observation: "Un attribut alt est absent dans cette fixture.",
          evidenceIds: [data.evidence[0].pageId],
          hypothesis: "L’image pourrait être informative ; cela reste à vérifier.",
          action: "Vérifier le rôle de cette image avant d’ajouter un texte alternatif.",
          priority: "medium",
        },
      ],
    }),
    model: `fixture-${provider}`,
    input: 100,
    output: 80,
    requestId: "audit-synthetic-fixture",
    raw: { syntheticFixture: true },
    citations: [],
  };
};
