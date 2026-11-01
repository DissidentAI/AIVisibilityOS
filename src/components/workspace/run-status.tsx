import { ArrowUpRight, RotateCcw } from "lucide-react";
import type { RunDetail } from "@/lib/types";
import { canRetry, retrySource } from "@/lib/run-insights";
import { Button } from "../ui/button";
import type { Translate } from "./shared";
import type { ExecutionStatus } from "@/lib/execution-policy";
import { PROVIDER_LABELS } from "@/lib/provider-config";

export function RunStatus({
  detail,
  t,
  onRetry,
  onRun,
  execution = [],
}: {
  detail: RunDetail;
  t: Translate;
  onRetry: (ids: string[]) => void;
  onRun: (id: string) => void;
  execution?: ExecutionStatus[];
}) {
  const { total, valid, pending, failed } = detail.run;
  const ids = detail.responses.filter(canRetry).map((r) => r.id);
  const source = retrySource(detail);
  const running = detail.responses.filter((r) => r.status === "running").length;
  const pauses = execution.filter(
    (s) =>
      s.pausedUntil &&
      new Date(s.pausedUntil).getTime() > Date.now() &&
      detail.responses.some(
        (r) => r.status === "queued" && r.provider === s.provider && r.model === s.model,
      ),
  );
  return (
    <section className="run-status" aria-label={t("État de la campagne", "Campaign status")}>
      <div className="run-status-heading">
        <div>
          <span className="section-kicker">
            {source
              ? t("TENTATIVE DE REPRISE", "RETRY ATTEMPT")
              : t("COLLECTE DES PREUVES", "EVIDENCE COLLECTION")}
          </span>
          <h2>
            {pending
              ? t("La mesure est en cours", "Measurement in progress")
              : failed
                ? t("Campagne terminée avec incidents", "Campaign completed with issues")
                : t("La campagne est terminée", "Campaign completed")}
          </h2>
        </div>
        {ids.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => onRetry(ids)} disabled={pending > 0}>
            <RotateCcw size={15} />
            {t(
              `Réessayer ${ids.length} ${ids.length === 1 ? "échec" : "échecs"}`,
              `Retry ${ids.length} ${ids.length === 1 ? "failure" : "failures"}`,
            )}
          </Button>
        )}
      </div>
      <div
        className="run-progress"
        role="progressbar"
        aria-label={t("Réponses traitées", "Processed responses")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={total - pending}
        aria-valuetext={`${total - pending} / ${total}`}
      >
        <span
          className="progress-valid"
          style={{ width: `${total ? (valid / total) * 100 : 0}%` }}
        />
        <span
          className="progress-failed"
          style={{ width: `${total ? (failed / total) * 100 : 0}%` }}
        />
      </div>
      <div className="run-status-counts">
        <span>
          <b>{valid}</b> {t("valides", "valid")}
        </span>
        <span>
          <b>{failed}</b> {t("non exploitables", "unusable")}
        </span>
        <span>
          <b>{running}</b> {t("en cours", "running")}
        </span>
        <span>
          <b>{Math.max(0, pending - running)}</b> {t("en attente", "queued")}
        </span>
        <span>
          <b>{total}</b> {t("prévues", "planned")}
        </span>
      </div>
      {pauses.map((pause) => (
        <p key={`${pause.provider}:${pause.model}`} className="small muted" role="status">
          {PROVIDER_LABELS[pause.provider]} ·{" "}
          {t("Pause de régulation jusqu’à", "Rate-limit pause until")}{" "}
          {new Date(pause.pausedUntil!).toLocaleString(t("fr-FR", "en-US"))}.{" "}
          {t(
            "Les réponses en attente seront lancées progressivement.",
            "Queued responses will be started gradually.",
          )}
        </p>
      ))}
      {failed > 0 && (
        <p className="small muted">
          {t(
            "Les échecs sont exclus du taux de mention. Une campagne partielle ne décrit que les réponses effectivement obtenues.",
            "Failures are excluded from the mention rate. A partial campaign describes only the responses actually obtained.",
          )}
        </p>
      )}
      {source && (
        <div className="retry-provenance">
          <p className="small muted">
            {t(
              "Reprise ciblée : échantillon sélectionné après échec, exclu des tendances automatiques.",
              "Targeted retry: a sample selected after failure, excluded from automatic trends.",
            )}
          </p>
          <Button variant="ghost" size="sm" onClick={() => onRun(source)}>
            {t("Campagne d’origine", "Original campaign")}
            <ArrowUpRight size={14} />
          </Button>
        </div>
      )}
    </section>
  );
}
