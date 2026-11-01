"use client";
import type { ReactNode } from "react";
import type { ResponseRecord, Citation } from "@/lib/types";
import type { Translate } from "./shared";
export function GroundedAnswer({
  response,
  citations,
  t,
}: {
  response: ResponseRecord;
  citations: Citation[];
  t: Translate;
}) {
  const text = response.answer ?? "",
    links = (response.grounding?.links ?? [])
      .filter((l) => l.end >= 0 && l.end <= text.length)
      .sort((a, b) => a.end - b.end);
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const [i, l] of links.entries()) {
    nodes.push(text.slice(offset, l.end));
    nodes.push(
      <a
        key={i}
        href={l.url}
        target="_blank"
        rel="noreferrer"
        title={l.title}
        className="citation-marker"
      >
        [{i + 1}]
      </a>,
    );
    offset = l.end;
  }
  nodes.push(text.slice(offset));
  return (
    <>
      {response.parameters.search === true && (
        <p className="small muted">
          {response.grounding?.searched
            ? t(
                "Recherche web observée dans les métadonnées fournisseur.",
                "Web search observed in provider metadata.",
              )
            : t(
                "Recherche demandée ; aucune recherche confirmée dans les métadonnées disponibles.",
                "Search requested; no search confirmed in available metadata.",
              )}
        </p>
      )}
      <div className="answer">
        {text ? nodes : t("Aucune réponse disponible.", "No response available.")}
      </div>
      {!!citations.length && (
        <div className="evidence-sources">
          <strong>{t("Sources retournées", "Returned sources")}</strong>
          {citations.map((c, i) => (
            <a key={i} className="text-link" href={c.url} target="_blank" rel="noreferrer">
              {c.title || c.domain}
            </a>
          ))}
        </div>
      )}
      {!!response.grounding?.sources?.length && (
        <div className="evidence-sources">
          <strong>{t("Pages trouvées par la recherche", "Pages returned by search")}</strong>
          <p className="small muted">
            {t(
              "Ces pages ne sont pas comptées comme des citations de la réponse.",
              "These pages are not counted as answer citations.",
            )}
          </p>
          {response.grounding.sources.map((source, i) => (
            <a key={i} className="text-link" href={source.url} target="_blank" rel="noreferrer">
              {source.title || source.domain}
            </a>
          ))}
        </div>
      )}
      {response.grounding?.searchEntryHtml && (
        <iframe
          className="search-suggestions"
          title="Google Search suggestions"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.google.com https://www.gstatic.com; base-uri 'none'; form-action 'none'"><base target="_blank">${response.grounding.searchEntryHtml}`}
        />
      )}
    </>
  );
}
