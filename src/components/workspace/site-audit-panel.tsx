"use client";
import { TableScroll } from "./table-scroll";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Globe2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "../ui/button";
import { api, Empty, Field, Modal, friendly, money, type Translate } from "./shared";
import { AnswerContent } from "./answer-content";
import { auditLabel } from "./audit-labels";
import type { Project, State } from "@/lib/types";
import type { AuditDetail, AuditEstimate, listAudits } from "@/lib/site-audit/service";
import { AUDIT_LIMITS, type AuditPage } from "@/lib/site-audit/types";
import {
  OPENROUTER_MODEL_IDS,
  PROVIDER_LABELS,
  MODELS,
  type Provider,
} from "@/lib/provider-config";
type AuditList = Awaited<ReturnType<typeof listAudits>>;
export function SiteAuditPanel({
  project,
  state,
  t,
  date,
}: {
  project: Project;
  state: State;
  t: Translate;
  date: (value: string) => string;
}) {
  const [list, setList] = useState<AuditList>([]),
    [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [competitors, setCompetitors] = useState(
    project.brands
      .filter((b) => !b.is_primary)
      .slice(0, 3)
      .map((b) => b.id),
  );
  const [page, setPage] = useState<AuditPage | null>(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++request.current;
    const audits = await api<AuditList>(`audits?project=${project.id}`);
    const id = selected || audits[0]?.id;
    const data = id ? await api<AuditDetail>(`audits/${id}`) : null;
    if (seq !== request.current) return;
    setList(audits);
    setDetail(data);
    setLoading(false);
  }, [project.id, selected]);
  useEffect(() => {
    refresh().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
    const timer = setInterval(() => {
      if (!document.hidden) refresh().catch((e) => setError(e.message));
    }, 8000);
    return () => {
      request.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  const active = detail?.sites.some((s) => ["queued", "running"].includes(s.status));
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("audits", "POST", {
        projectId: project.id,
        maxPages,
        competitorIds: competitors,
      });
      setDetail(null);
      setSelected(result.id);
      setFilter("all");
      setSearch("");
      setOffset(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "internal_error");
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await api(`audits/${detail.audit.id}/cancel`, "POST");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "internal_error");
    } finally {
      setBusy(false);
    }
  }
  const pages = (detail?.pages ?? []).filter(
    (p) =>
      (filter === "all" || p.site_id === filter) &&
      `${p.url} ${p.facts?.title ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const start = Math.min(offset, Math.max(0, Math.ceil(pages.length / 20) - 1) * 20);
  return (
    <div className="site-audit-panel">
      <section className="card audit-intro">
        <span className="section-kicker">{t("DU SITE AUX PREUVES", "FROM SITE TO EVIDENCE")}</span>
        <h2>
          {t("Votre site, face à ses concurrents.", "Your website, alongside its competitors.")}
        </h2>
        <p className="muted">
          {t(
            "Explorez les pages publiques, comparez leur structure et demandez une synthèse IA appuyée sur les pages collectées.",
            "Explore public pages, compare their structure and request an AI synthesis grounded in the pages collected.",
          )}
        </p>
        {error && (
          <p className="alert error" role="alert">
            {friendly(error, t)}
          </p>
        )}
        <div className="audit-config">
          <Field label={t("Pages maximum par site", "Maximum pages per site")}>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              disabled={busy}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="audit-targets">
            <legend>
              {t(
                `Concurrents à comparer (${AUDIT_LIMITS.maxSites - 1} maximum)`,
                `Competitors to compare (up to ${AUDIT_LIMITS.maxSites - 1})`,
                `比较竞争对手（最多 ${AUDIT_LIMITS.maxSites - 1} 个）`,
              )}
            </legend>
            {!project.brands.some((b) => !b.is_primary) && (
              <p className="small muted">
                {t(
                  "Ajoutez des concurrents dans votre projet pour les comparer.",
                  "Add competitors to your project to compare them.",
                )}
              </p>
            )}
            {project.brands
              .filter((b) => !b.is_primary)
              .map((b) => (
                <label key={b.id}>
                  <input
                    type="checkbox"
                    checked={competitors.includes(b.id)}
                    disabled={
                      busy ||
                      (!competitors.includes(b.id) &&
                        competitors.length >= AUDIT_LIMITS.maxSites - 1)
                    }
                    onChange={(e) =>
                      setCompetitors((ids) =>
                        e.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id),
                      )
                    }
                  />
                  <span>
                    {b.name}
                    <small className="block muted">{b.domain}</small>
                  </span>
                </label>
              ))}
          </fieldset>
        </div>
        <div className="audit-actions">
          <Button onClick={create} disabled={busy || list.some((a) => a.active > 0)}>
            <Play size={15} />
            {t("Explorer les sites", "Crawl websites")}
          </Button>
          <span className="small muted">
            {maxPages * (competitors.length + 1)}{" "}
            {t(
              "pages maximum · sans appel IA à cette étape",
              "pages maximum · no AI call at this step",
            )}
          </span>
        </div>
        {!state.workerOnline && (
          <p className="alert">
            {t(
              "Le worker est hors ligne. L’exploration attendra son redémarrage.",
              "The worker is offline. The crawl will wait for it to restart.",
            )}
          </p>
        )}
        <details className="methodology">
          <summary>{t("Périmètre et méthode", "Scope and method")}</summary>
          <p>
            {t(
              "HTML public du domaine et de sa variante www, robots.txt et sitemaps. Jusqu’à 100 pages par site, profondeur 5, 20 minutes et 50 Mo par site ; au moins une seconde entre accès au même domaine. Les formulaires, pages privées, paramètres d’URL et documents non HTML sont exclus. Aucun JavaScript n’est exécuté. La couverture reste partielle si le site est bloqué, très grand ou dépend du JavaScript. Une exploration terminée ne garantit pas que toutes les pages du site ont été découvertes.",
              "Public HTML on the domain and its www variant, robots.txt and sitemaps. Up to 100 pages per site, depth 5, 20 minutes and 50 MB per site; at least one second between requests to the same domain. Forms, private pages, query URLs and non-HTML documents are excluded. JavaScript is not executed. Coverage remains partial for blocked, large or JavaScript-dependent sites. A completed crawl does not guarantee every page was discovered.",
            )}
          </p>
          <p>
            {t(
              "Les contrôles décrivent le HTML observé : aucun score SEO, classement IA, trafic ni Core Web Vitals n’est inventé. Une absence de canonical, noindex ou JSON-LD peut être volontaire. Comparez des couvertures similaires.",
              "Checks describe observed HTML: no SEO score, AI ranking, traffic or Core Web Vitals are invented. Missing canonical or JSON-LD, or noindex, may be intentional. Compare similar coverage.",
            )}
          </p>
        </details>
      </section>
      {loading && (
        <p className="muted" role="status">
          {t("Chargement de l’audit…", "Loading audit…")}
        </p>
      )}
      {!loading && !detail && (
        <Empty
          icon={<Globe2 size={24} />}
          title={t("L’audit commence par vos pages", "An audit starts with your pages")}
        >
          {t(
            "Lancez une exploration. Ses preuves seront conservées même si vous quittez cette page.",
            "Start a crawl. Its evidence will be kept even if you leave this page.",
          )}
        </Empty>
      )}
      {detail && (
        <>
          <div className="audit-actions audit-toolbar">
            <Field label={t("Audit sélectionné", "Selected audit")}>
              <select
                value={detail.audit.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setDetail(null);
                  setPage(null);
                  setFilter("all");
                  setOffset(0);
                }}
              >
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {date(a.created_at)} · {a.pages} {t("pages", "pages")}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              <RefreshCw size={14} />
              {t("Actualiser", "Refresh")}
            </Button>
            <a className="text-link" download href={`/api/audits/${detail.audit.id}/csv`}>
              <ArrowDownToLine size={14} />
              CSV
            </a>
            <a className="text-link" download href={`/api/audits/${detail.audit.id}/export`}>
              JSON
            </a>
            {(active || detail.analyses.some((a) => a.status === "queued")) && (
              <Button variant="outline" size="sm" onClick={stop} disabled={busy}>
                <Square size={13} />
                {t("Arrêter", "Stop")}
              </Button>
            )}
          </div>
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>{t("Comparaison des pages observées", "Comparison of observed pages")}</h2>
                <p>
                  {t(
                    "Chaque ratio utilise les pages HTML analysées du site concerné.",
                    "Each ratio uses the analyzed HTML pages of that site.",
                  )}
                </p>
              </div>
              {active && (
                <span className="badge" role="status">
                  {t("Exploration en cours", "Crawling")}
                </span>
              )}
            </div>
            <TableScroll label={t("Comparaison des pages", "Page comparison", "页面比较")} t={t}>
              <table className="audit-comparison">
                <thead>
                  <tr>
                    <th>{t("Contrôle", "Check")}</th>
                    {detail.comparison.map((s) => (
                      <th key={s.siteId}>
                        {s.target.name}
                        <small className="block muted">{s.target.domain}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>{t("Couverture", "Coverage")}</th>
                    {detail.comparison.map((s) => (
                      <td key={s.siteId}>
                        <b>{s.html}</b> {t("HTML analysées", "HTML analyzed")}
                        <small className="block muted">
                          {s.attempted}/{s.pageLimit} {t("pages tentées", "pages attempted")} ·{" "}
                          {s.discovered} {t("découvertes", "discovered")}
                        </small>
                        <span className="badge">{auditLabel(s.status, t)}</span>
                        {s.reason && (
                          <small className="block muted">{auditLabel(s.reason, t)}</small>
                        )}
                      </td>
                    ))}
                  </tr>
                  {(
                    [
                      ["withTitle", t("Avec un titre", "With a title")],
                      ["withDescription", t("Avec une description", "With a description")],
                      ["withH1", t("Avec un H1", "With an H1")],
                      ["withCanonical", t("Avec une canonical valide", "With a valid canonical")],
                      ["withJsonLd", t("Avec un type JSON-LD", "With a JSON-LD type")],
                      ["noindex", t("Directive noindex", "Noindex directive")],
                    ] as const
                  ).map(([key, label]) => (
                    <tr key={key}>
                      <th>{label}</th>
                      {detail.comparison.map((s) => (
                        <td key={s.siteId}>{s.html ? `${s[key]} / ${s.html}` : "—"}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th>{t("Images sans alt", "Images missing alt")}</th>
                    {detail.comparison.map((s) => (
                      <td key={s.siteId}>
                        {s.images ? `${s.imagesWithoutAlt} / ${s.images}` : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>{t("Cibles de liens en 404/410", "Link targets returning 404/410")}</th>
                    {detail.comparison.map((s) => (
                      <td key={s.siteId}>
                        {s.checkedLinkTargets
                          ? `${s.brokenLinks.length} / ${s.checkedLinkTargets}`
                          : "—"}
                        <small className="block muted">
                          {s.linkTargets - s.checkedLinkTargets} {t("non vérifiées", "not checked")}
                        </small>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </TableScroll>
            <div className="audit-observations">
              {detail.comparison.map((site) => (
                <details key={site.siteId}>
                  <summary>
                    {site.target.name} · {t("Constats et preuves", "Findings and evidence")}
                  </summary>
                  {site.issues.map((issue) => (
                    <p key={issue.code}>
                      <strong>{auditLabel(issue.code, t)}</strong> · {issue.pageIds.length}/
                      {site.html}
                      <span className="audit-evidence-links">
                        {issue.pageIds.slice(0, 5).map((id, i) => (
                          <button
                            className="text-link"
                            key={id}
                            onClick={() => setPage(detail.pages.find((p) => p.id === id) ?? null)}
                          >
                            {t("Page", "Page")} {i + 1}
                          </button>
                        ))}
                      </span>
                    </p>
                  ))}
                  {(
                    [
                      ["duplicateTitles", t("Titres identiques", "Identical titles")],
                      [
                        "duplicateDescriptions",
                        t("Descriptions identiques", "Identical descriptions"),
                      ],
                      [
                        "duplicateContent",
                        t("Textes principaux identiques", "Identical main text"),
                      ],
                    ] as const
                  ).map(
                    ([key, title]) =>
                      site[key].length > 0 && (
                        <div key={key}>
                          <h4>{title}</h4>
                          {site[key].map((group, i) => (
                            <p key={i}>
                              {group.pageIds.length} {t("pages", "pages")}
                              <span className="audit-evidence-links">
                                {group.pageIds.map((id, index) => (
                                  <button
                                    className="text-link"
                                    key={id}
                                    onClick={() =>
                                      setPage(detail.pages.find((p) => p.id === id) ?? null)
                                    }
                                  >
                                    {t("Preuve", "Evidence")} {index + 1}
                                  </button>
                                ))}
                              </span>
                            </p>
                          ))}
                        </div>
                      ),
                  )}
                  {site.brokenLinks.map((link) => (
                    <p key={link.url}>
                      <span className="block mono small">
                        {link.url} · HTTP {link.status}
                      </span>
                      <button
                        className="text-link"
                        onClick={() =>
                          setPage(detail.pages.find((p) => p.id === link.targetId) ?? null)
                        }
                      >
                        {t("Voir la cible testée", "Inspect tested target")}
                      </button>
                    </p>
                  ))}
                  <p className="small muted">
                    {t(
                      "Les ressemblances sont calculées sur le texte HTML extrait, pas sur le rendu visuel. Les liens externes ne sont pas testés.",
                      "Similarities are computed from extracted HTML text, not visual rendering. External links are not tested.",
                    )}
                  </p>
                </details>
              ))}
            </div>
          </section>
          <AuditSynthesisPanel
            key={detail.audit.id}
            detail={detail}
            state={state}
            t={t}
            date={date}
            onRefresh={refresh}
            onPage={setPage}
          />
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>{t("Pages et preuves techniques", "Pages and technical evidence")}</h2>
                <p>
                  {t(
                    "Retrouvez chaque URL, son état et les éléments réellement observés.",
                    "Inspect each URL, its status and the elements actually observed.",
                  )}
                </p>
              </div>
              <span className="badge">{pages.length}</span>
            </div>
            <div className="history-filters">
              <Field label={t("Site", "Website")}>
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="all">{t("Tous les sites", "All websites")}</option>
                  {detail.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.target.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("Rechercher une page", "Find a page")}>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="URL…"
                />
              </Field>
            </div>
            <TableScroll label={t("Pages et preuves", "Pages and evidence", "页面及证据")} t={t}>
              <table className="audit-pages">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>{t("HTTP / état", "HTTP / status")}</th>
                    <th>{t("Observations", "Observations")}</th>
                    <th>{t("Preuve", "Evidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.slice(start, start + 20).map((p) => (
                    <tr key={p.id}>
                      <td className="audit-url">
                        {p.facts?.title || p.url}
                        <small className="block muted">{p.url}</small>
                      </td>
                      <td>
                        {p.http_status ?? "—"}
                        {p.error_code && (
                          <small className="block muted">{auditLabel(p.error_code, t)}</small>
                        )}
                      </td>
                      <td>{p.facts?.issues.length ?? "—"}</td>
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => setPage(p)}>
                          <Search size={14} />
                          {t("Inspecter", "Inspect")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {pages.length > 20 && (
              <div className="history-pagination">
                <Button
                  variant="ghost"
                  disabled={start === 0}
                  onClick={() => setOffset(start - 20)}
                >
                  {t("Précédent", "Previous")}
                </Button>
                <span>
                  {start + 1}–{Math.min(start + 20, pages.length)} / {pages.length}
                </span>
                <Button
                  variant="ghost"
                  disabled={start + 20 >= pages.length}
                  onClick={() => setOffset(start + 20)}
                >
                  {t("Suivant", "Next")}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
      {page && (
        <Modal title={t("Preuve de page", "Page evidence")} onClose={() => setPage(null)} wide>
          <a
            className="text-link audit-url"
            href={page.final_url ?? page.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {page.final_url ?? page.url}
            <ArrowUpRight size={14} />
          </a>
          <p className="small muted">
            {date(page.fetched_at)} · HTTP {page.http_status ?? "—"} · {page.response_ms ?? "—"} ms{" "}
            {t("(requête, pas Core Web Vitals)", "(request, not Core Web Vitals)")}
          </p>
          {page.error_code && <p className="alert">{auditLabel(page.error_code, t)}</p>}
          {page.facts && (
            <>
              <h3>{page.facts.title || t("Sans titre", "Untitled")}</h3>
              <p>{page.facts.description}</p>
              <p className="small muted">
                {page.facts.wordCount}{" "}
                {t("mots approximatifs dans le HTML initial", "approximate words in initial HTML")}{" "}
                ·{" "}
                {page.facts.structuredTypes.join(", ") ||
                  t("Pas de type JSON-LD", "No JSON-LD type")}
              </p>
              <h4>{t("Extrait du contenu observé", "Observed content excerpt")}</h4>
              <blockquote>{page.facts.excerpt || "—"}</blockquote>
              <h4>{t("Structure des titres", "Heading structure")}</h4>
              <ul>
                {page.facts.headings.map((h, i) => (
                  <li key={i}>
                    H{h.level} · {h.text}
                  </li>
                ))}
              </ul>
              <h4>{t("Contrôles techniques", "Technical checks")}</h4>
              {page.facts.issues.map((i) => (
                <p key={i.code}>
                  <strong>{auditLabel(i.code, t)}</strong>
                  <small className="block muted mono">{i.evidence}</small>
                </p>
              ))}
              <details className="methodology">
                <summary>{t("Données extraites", "Extracted data")}</summary>
                <pre>{JSON.stringify(page.facts, null, 2)}</pre>
              </details>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function AuditSynthesisPanel({
  detail,
  state,
  t,
  date,
  onRefresh,
  onPage,
}: {
  detail: AuditDetail;
  state: State;
  t: Translate;
  date: (v: string) => string;
  onRefresh: () => Promise<void>;
  onPage: (page: AuditPage) => void;
}) {
  const [provider, setProvider] = useState<Provider>(state.credentials[0]?.provider ?? "openai");
  const [model, setModel] = useState<string>(MODELS.openrouter.id);
  const [quote, setQuote] = useState<AuditEstimate | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pending = detail.analyses.some((a) => ["queued", "running"].includes(a.status));
  const ready =
    detail.pages.some((p) => p.facts) &&
    !detail.sites.some((s) => ["queued", "running"].includes(s.status));
  async function submit(launch: boolean) {
    setBusy(true);
    setError("");
    try {
      const data = { provider, ...(provider === "openrouter" ? { openrouterModel: model } : {}) };
      if (launch && quote) {
        await api(`audits/${detail.audit.id}/ai`, "POST", {
          ...data,
          expectedQuoteHash: quote.quoteHash,
        });
        if (alive.current) {
          setQuote(null);
          await onRefresh();
        }
      } else {
        const result = await api<AuditEstimate>(
          `audits/${detail.audit.id}/ai/estimate`,
          "POST",
          data,
        );
        if (alive.current) setQuote(result);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "internal_error");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="card audit-synthesis">
      <div className="card-heading">
        <div>
          <span className="section-kicker">
            {t("INTERPRÉTER LES PREUVES", "INTERPRET EVIDENCE")}
          </span>
          <h2>{t("Synthèse comparative avec l’IA", "AI comparison synthesis")}</h2>
          <p>
            {t(
              "Une lecture argumentée des pages collectées, avec observations, hypothèses et actions à vérifier.",
              "An evidence-based reading of collected pages, with observations, hypotheses and actions to verify.",
            )}
          </p>
        </div>
        <Sparkles size={22} />
      </div>
      <div className="audit-synthesis-body">
        {!ready && (
          <p className="muted">
            {t(
              "La synthèse sera disponible à la fin de l’exploration, si des pages HTML ont été obtenues.",
              "Synthesis becomes available when crawling finishes, if HTML pages were obtained.",
            )}
          </p>
        )}
        <div className="audit-actions">
          <Field label={t("Fournisseur de la synthèse", "Synthesis provider")}>
            <select
              value={provider}
              disabled={busy || pending}
              onChange={(e) => {
                setProvider(e.target.value as Provider);
                setQuote(null);
              }}
            >
              {state.credentials.map((c) => (
                <option key={c.provider} value={c.provider}>
                  {PROVIDER_LABELS[c.provider]}
                </option>
              ))}
            </select>
          </Field>
          {provider === "openrouter" && (
            <Field label={t("Modèle de la synthèse", "Synthesis model")}>
              <select
                value={model}
                disabled={busy || pending}
                onChange={(e) => {
                  setModel(e.target.value);
                  setQuote(null);
                }}
              >
                {OPENROUTER_MODEL_IDS.map((id) => (
                  <option value={id} key={id}>
                    {id}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Button
            variant="outline"
            onClick={() => submit(false)}
            disabled={
              !ready || busy || pending || !state.credentials.some((c) => c.provider === provider)
            }
          >
            {t("Estimer la synthèse", "Estimate synthesis")}
          </Button>
        </div>
        {!state.credentials.length && (
          <p className="muted">
            {t("Connectez votre clé API dans Paramètres.", "Connect your API key in Settings.")}
          </p>
        )}
        {error && (
          <p className="alert error" role="alert">
            {friendly(error, t)}
          </p>
        )}
        {quote && (
          <div className="alert">
            <p>
              {t("Réserve de budget estimée", "Estimated budget reserve")} :{" "}
              <strong>{money(quote.reservedMicros)}</strong> · {quote.evidencePages}/
              {quote.attemptedPages}{" "}
              {t(
                "pages avec extraits transmis ; statistiques sur toutes les pages analysées",
                "pages with excerpts sent; statistics cover all analyzed pages",
              )}
            </p>
            <p className="small">
              {t(
                "Les extraits publics seront transmis au fournisseur choisi. Aucun appel n’est envoyé avant confirmation. Le coût final dépend de l’usage ; les appels incertains conservent leur réserve.",
                "Public excerpts will be sent to the selected provider. No call is sent before confirmation. Final cost depends on usage; uncertain calls keep their reserve.",
              )}
            </p>
            <Button onClick={() => submit(true)} disabled={busy || pending || !quote.affordable}>
              <Sparkles size={15} />
              {t("Lancer la synthèse IA", "Start AI synthesis")}
            </Button>
            {!quote.affordable && <p>{friendly("budget_exceeded", t)}</p>}
          </div>
        )}
        {pending && (
          <p className="alert" role="status">
            {t(
              "Synthèse en attente ou en cours. Elle partage les plafonds API de vos scans.",
              "Synthesis queued or running. It shares your scans' API rate limits.",
            )}
          </p>
        )}
        {detail.analyses.map((analysis) => (
          <article key={analysis.id} className="audit-ai-result">
            <p className="small muted">
              {PROVIDER_LABELS[analysis.provider]} · {analysis.returned_model ?? analysis.model} ·{" "}
              {analysis.channel} · {date(analysis.created_at)} ·{" "}
              {analysis.cost_micros == null
                ? t("Coût non connu", "Cost unknown")
                : money(analysis.cost_micros)}
            </p>
            {analysis.error_code && (
              <p className="alert error">{friendly(analysis.error_code, t)}</p>
            )}
            {analysis.synthesis && (
              <>
                <p className="alert">
                  {t(
                    "Interprétation générée par une IA : vérifiez les pages citées. Les références sont contrôlées, pas la véracité de chaque interprétation.",
                    "AI-generated interpretation: verify the cited pages. References are validated, not the truth of each interpretation.",
                  )}
                </p>
                <p>{analysis.synthesis.summary}</p>
                {analysis.synthesis.findings.map((f, i) => (
                  <div key={i} className="audit-finding">
                    <span className="badge">{auditLabel(f.priority, t)}</span>
                    <h3>{f.title}</h3>
                    <p>
                      <b>{t("Observation proposée", "Proposed observation")} · </b>
                      {f.observation}
                    </p>
                    <p>
                      <b>{t("Hypothèse", "Hypothesis")} · </b>
                      {f.hypothesis}
                    </p>
                    <p>
                      <b>{t("Action suggérée", "Suggested action")} · </b>
                      {f.action}
                    </p>
                    <div className="audit-evidence-links">
                      {f.evidenceIds.map((id, index) => {
                        const page = detail.pages.find((p) => p.id === id);
                        return (
                          page && (
                            <button key={id} className="text-link" onClick={() => onPage(page)}>
                              {t("Vérifier la page", "Verify page")} {index + 1}
                              <ArrowUpRight size={13} />
                            </button>
                          )
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
            {analysis.answer && (
              <details className="methodology">
                <summary>
                  {t(
                    "Copier ou exporter la réponse IA originale",
                    "Copy or export the original AI response",
                  )}
                </summary>
                <AnswerContent
                  text={analysis.answer}
                  links={[]}
                  provider={analysis.provider}
                  id={analysis.id}
                  t={t}
                />
                <details>
                  <summary>
                    {t("Requête, paramètres et consommation", "Request, parameters and usage")}
                  </summary>
                  <pre>
                    {JSON.stringify(
                      {
                        requestedModel: analysis.model,
                        returnedModel: analysis.returned_model,
                        requestId: analysis.request_id,
                        inputTokens: analysis.input_tokens,
                        outputTokens: analysis.output_tokens,
                        parameters: analysis.parameters,
                        system: analysis.snapshot.system,
                        evidence: analysis.snapshot.queries[0]?.text,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
