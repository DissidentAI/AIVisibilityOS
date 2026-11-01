"use client";
import { TableScroll } from "./table-scroll";
import { useState, useEffect } from "react";
import { comparisonBrands, comparisonScope } from "@/lib/brand-analysis";
import {
  evidenceRows,
  evidenceHash,
  proofTarget,
  emptyEvidenceFilters,
  type EvidenceFilters,
} from "@/lib/evidence-navigation";
import { CopyLink } from "./copy-link";
import { ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import type { RunDetail, ResponseRecord } from "@/lib/types";
import { PROVIDER_LABELS } from "@/lib/provider-config";
import { canRetry, failedStatuses, responseError } from "@/lib/run-insights";
import { Button } from "../ui/button";
import { Empty, Field, friendly, money, type Translate } from "./shared";

export function HistoryPanel({
  detail,
  t,
  date,
  status,
  onOpen,
  onRetry,
  onRun,
  onSettings,
  retryDisabled = false,
  filters,
  onFilters,
}: {
  detail: RunDetail | null;
  t: Translate;
  date: (v: string) => string;
  status: (v: string) => string;
  onOpen: (r: ResponseRecord) => void;
  onRetry: (ids: string[]) => void;
  onRun: (id: string) => void;
  onSettings: () => void;
  retryDisabled?: boolean;
  filters: EvidenceFilters;
  onFilters: (filters: EvidenceFilters) => void;
}) {
  const { search, provider, status: state } = filters;
  const setSearch = (search: string) => onFilters({ ...filters, search });
  const setProvider = (provider: string) =>
    onFilters({ ...filters, provider: provider as EvidenceFilters["provider"] });
  const setState = (status: string) =>
    onFilters({ ...filters, status: status as EvidenceFilters["status"] });
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [filters]);
  const rows = detail ? evidenceRows(detail, filters) : [];
  const eligible = rows.filter(canRetry);
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const diagnoses = new Map<string, { response: ResponseRecord; count: number }>();
  for (const r of rows.filter((r) => failedStatuses.includes(r.status))) {
    const key = `${r.provider}:${responseError(r)}`;
    const group = diagnoses.get(key);
    if (group) group.count++;
    else diagnoses.set(key, { response: r, count: 1 });
  }
  return (
    <section className="card history-panel">
      <div className="card-heading">
        <div>
          <span className="section-kicker">{t("LE REGISTRE", "THE LEDGER")}</span>
          <h2>{t("Journal des réponses", "Response ledger")}</h2>
          <p>
            {t(
              "Chaque résultat garde sa question, sa date et sa preuve.",
              "Every result keeps its question, date and evidence.",
            )}
          </p>
        </div>
        <span className="badge">
          {detail?.responses.length ?? 0} {t("exécutions", "executions")}
        </span>
      </div>
      {!detail ? (
        <Empty title={t("Votre historique est vide", "Your history is empty")}>
          {t(
            "La première campagne apparaîtra ici dès son lancement.",
            "Your first campaign will appear here as soon as it starts.",
          )}
        </Empty>
      ) : (
        <>
          <div className="proof-context">
            <Field label={t("Marque mentionnée", "Mentioned brand", "提及的品牌")}>
              <select
                value={filters.brandId}
                onChange={(e) => onFilters({ ...filters, brandId: e.target.value })}
              >
                <option value="">{t("Toutes les marques", "All brands", "所有品牌")}</option>
                {comparisonBrands(detail).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
                {filters.brandId &&
                  !comparisonBrands(detail).some((b) => b.id === filters.brandId) && (
                    <option value={filters.brandId}>
                      {t(
                        "Marque indisponible dans ce périmètre",
                        "Brand unavailable in this scope",
                        "此范围内无该品牌",
                      )}
                    </option>
                  )}
              </select>
            </Field>
            <Field label={t("Question exacte", "Exact question", "确切问题")}>
              <select
                value={filters.queryId}
                onChange={(e) => onFilters({ ...filters, queryId: e.target.value })}
              >
                <option value="">{t("Toutes les questions", "All questions", "所有问题")}</option>
                {detail.run.snapshot.queries.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text}
                  </option>
                ))}
                {filters.queryId &&
                  !detail.run.snapshot.queries.some((q) => q.id === filters.queryId) && (
                    <option value={filters.queryId}>
                      {t("Question non mesurée", "Question not measured", "未测量的问题")}
                    </option>
                  )}
              </select>
            </Field>
          </div>
          {filters.brandId && (
            <p className="small muted">
              {t(
                "Seules les réponses valides mentionnant explicitement cette marque sont affichées.",
                "Only valid answers explicitly mentioning this brand are shown.",
                "仅显示明确提及此品牌的有效回答。",
              )}
            </p>
          )}
          <div className="history-filters">
            <Field label={t("Rechercher dans les réponses", "Search responses")}>
              <input
                type="search"
                maxLength={200}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder={t(
                  "Question, modèle ou code d’erreur…",
                  "Question, model or error code…",
                )}
              />
            </Field>
            <Field label={t("Fournisseur", "Provider")}>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">{t("Tous les fournisseurs", "All providers")}</option>
                {detail.run.snapshot.providers.map((pr) => (
                  <option key={pr} value={pr}>
                    {PROVIDER_LABELS[pr]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Statut", "Status")}>
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">{t("Tous les statuts", "All statuses")}</option>
                <option value="failed">
                  {t("Échecs et interruptions", "Failures and interruptions")}
                </option>
                <option value="succeeded">{t("Réponses valides", "Valid responses")}</option>
                <option value="pending">{t("En attente et en cours", "Queued and running")}</option>
              </select>
            </Field>
          </div>
          {diagnoses.size > 0 && (
            <details className="failure-diagnostics" open>
              <summary>
                {t("Comprendre les incidents", "Understand the issues")} ·{" "}
                {rows.filter((r) => failedStatuses.includes(r.status)).length}
              </summary>
              <ul>
                {[...diagnoses].map(([key, { response, count }]) => (
                  <li key={key}>
                    <span className="badge red">
                      {count} · {PROVIDER_LABELS[response.provider]}
                    </span>
                    <p>{friendly(responseError(response), t)}</p>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" onClick={onSettings}>
                {t("Gérer les connexions API", "Manage API connections")}
                <ArrowRight size={14} />
              </Button>
            </details>
          )}
          <div className="history-results">
            <span className="small muted" role="status">
              {rows.length} / {detail.responses.length}{" "}
              {t("réponses affichées", "matching responses")}
            </span>
            <CopyLink
              hash={evidenceHash(
                proofTarget(detail.run.project_id, detail.run.id, comparisonScope(detail), filters),
              )}
              t={t}
            />
            {rows.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onFilters(emptyEvidenceFilters)}>
                {t("Effacer les filtres", "Clear filters", "清除筛选条件")}
              </Button>
            )}
            {eligible.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={detail.run.pending > 0 || retryDisabled}
                onClick={() => onRetry(eligible.map((r) => r.id))}
              >
                <RotateCcw size={14} />
                {t(
                  eligible.length === 1
                    ? "Réessayer l’échec affiché"
                    : `Réessayer les ${eligible.length} échecs affichés`,
                  eligible.length === 1
                    ? "Retry the matching failure"
                    : `Retry ${eligible.length} matching failures`,
                  `重试 ${eligible.length} 个匹配的失败项`,
                )}
              </Button>
            )}
          </div>
          {!rows.length ? (
            <Empty
              icon={<Search size={22} />}
              title={t("Aucun résultat avec ces filtres", "No results with these filters")}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  onFilters(emptyEvidenceFilters);
                  setPage(0);
                }}
              >
                {t("Effacer les filtres", "Clear filters")}
              </Button>
            </Empty>
          ) : (
            <TableScroll label={t("Journal des réponses", "Response ledger", "回答记录")} t={t}>
              <table className="response-table">
                <thead>
                  <tr>
                    <th>{t("Question", "Question")}</th>
                    <th>{t("Fournisseur", "Provider")}</th>
                    <th>{t("Statut", "Status")}</th>
                    <th>{t("Coût estimé", "Est. cost")}</th>
                    <th>
                      <span className="sr-only">{t("Actions", "Actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(currentPage * 25, currentPage * 25 + 25).map((r) => (
                    <tr key={r.id}>
                      <td className="question-cell">
                        {r.query_text}
                        <small className="block muted">
                          #{r.sample} ·{" "}
                          {r.finished_at ? date(r.finished_at) : t("En attente", "Pending")}
                        </small>
                      </td>
                      <td>
                        {PROVIDER_LABELS[r.provider]}
                        <small className="block muted mono">{r.returned_model || r.model}</small>
                      </td>
                      <td>
                        <span
                          className={`badge ${r.status === "succeeded" ? "green" : failedStatuses.includes(r.status) ? "red" : ""}`}
                        >
                          {status(r.status)}
                        </span>
                        {(r.attempt ?? 1) > 1 && (
                          <small className="block muted">
                            {t("Tentative", "Attempt")} {r.attempt}
                          </small>
                        )}
                      </td>
                      <td data-label={t("Coût estimé", "Est. cost")}>
                        {r.cost_micros == null ? "—" : money(r.cost_micros)}
                      </td>
                      <td>
                        <div className="response-actions">
                          <Button variant="ghost" size="sm" onClick={() => onOpen(r)}>
                            {t("Ouvrir", "Open")}
                            <ArrowRight size={13} />
                          </Button>
                          {r.retry_run_id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRun(r.retry_run_id!)}
                            >
                              {t("Voir la reprise", "View retry")}
                            </Button>
                          ) : (
                            canRetry(r) && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={detail.run.pending > 0 || retryDisabled}
                                onClick={() => onRetry([r.id])}
                              >
                                <RotateCcw size={13} />
                                {t("Réessayer", "Retry")}
                              </Button>
                            )
                          )}
                          {(detail.previousAttempts ?? []).some((p) => p.slot_id === r.slot_id) && (
                            <details className="attempt-history">
                              <summary>{t("Tentatives précédentes", "Previous attempts")}</summary>
                              {(detail.previousAttempts ?? [])
                                .filter((p) => p.slot_id === r.slot_id)
                                .map((p) => (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    key={p.id}
                                    onClick={() => onOpen(p)}
                                  >
                                    {t("Tentative", "Attempt")} {p.attempt ?? 1} ·{" "}
                                    {status(p.status)}
                                  </Button>
                                ))}
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          {pageCount > 1 && (
            <nav
              className="history-pagination"
              aria-label={t("Pages de réponses", "Response pages")}
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={16} />
                {t("Précédent", "Previous")}
              </Button>
              <span className="small muted">
                {currentPage + 1} / {pageCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage + 1 === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                {t("Suivant", "Next")}
                <ChevronRight size={16} />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
