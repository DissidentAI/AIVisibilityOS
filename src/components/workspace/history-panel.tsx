"use client";
import { useState } from "react";
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
}) {
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("all");
  const [state, setState] = useState("all");
  const [page, setPage] = useState(0);
  const rows = (detail?.responses ?? []).filter(
    (r) =>
      (!search.trim() ||
        `${r.query_text} ${r.model} ${r.error_code ?? ""}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase())) &&
      (provider === "all" || r.provider === provider) &&
      (state === "all" ||
        (state === "failed"
          ? failedStatuses.includes(r.status)
          : state === "pending"
            ? ["queued", "running"].includes(r.status)
            : r.status === state)),
  );
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
          <div className="history-filters">
            <Field label={t("Rechercher dans les réponses", "Search responses")}>
              <input
                type="search"
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
                  setSearch("");
                  setProvider("all");
                  setState("all");
                  setPage(0);
                }}
              >
                {t("Effacer les filtres", "Clear filters")}
              </Button>
            </Empty>
          ) : (
            <div className="table-wrap">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
