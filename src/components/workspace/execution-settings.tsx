"use client";
import { useState } from "react";
import { Gauge, Save } from "lucide-react";
import { PROVIDER_LABELS, modelConfiguration } from "@/lib/provider-config";
import type { ExecutionStatus } from "@/lib/execution-policy";
import { Button } from "../ui/button";
import { api, friendly, type Translate } from "./shared";

export function ExecutionSettings({
  rows,
  t,
  onSaved,
}: {
  rows: ExecutionStatus[];
  t: Translate;
  onSaved: () => Promise<void>;
}) {
  return (
    <section className="card execution-settings">
      <div className="card-heading">
        <div>
          <h2>{t("Vitesse des scans", "Scan speed")}</h2>
          <p>
            {t(
              "Appels parallèles, rythme régulé par modèle",
              "Parallel calls, paced for each model",
            )}
          </p>
        </div>
        <Gauge size={20} />
      </div>
      <p className="small muted">
        {t(
          "Les scans démarrent avec deux appels simultanés par modèle, puis accélèrent progressivement. Une marge de 15 % est conservée sur les plafonds de requêtes et de tokens. En cas de 429, le fournisseur est mis en pause et le parallélisme diminue.",
          "Scans start with two simultaneous calls per model, then gradually accelerate. A 15% margin is retained on request and token ceilings. A 429 pauses the provider and reduces parallelism.",
        )}
      </p>
      <p className="small muted">
        {t(
          "Ces valeurs sont des garde-fous locaux. Renseignez les quotas de votre console fournisseur pour utiliser la capacité de votre compte. Les autres applications utilisant le même compte, les quotas quotidiens et les limites des outils web peuvent encore provoquer une limitation.",
          "These are local guardrails. Enter the quotas from your provider console to use your account's capacity. Other apps sharing the account, daily quotas and web tool limits can still cause throttling.",
        )}
      </p>
      {rows.map((row) => (
        <ExecutionRow key={`${row.provider}:${row.model}`} row={row} t={t} onSaved={onSaved} />
      ))}
    </section>
  );
}
function ExecutionRow({
  row,
  t,
  onSaved,
}: {
  row: ExecutionStatus;
  t: Translate;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  return (
    <details className="execution-row">
      <summary>
        <span>
          <strong>{PROVIDER_LABELS[row.provider]}</strong>
          <small>{modelConfiguration(row.provider, row.model)?.name ?? row.model}</small>
        </span>
        <span className={`badge ${row.pausedUntil ? "" : "green"}`}>
          {row.pausedUntil
            ? t("Pause temporaire", "Temporary pause")
            : `${row.active} / ${row.adaptiveParallel} ${t("en cours", "running")}`}
        </span>
      </summary>
      {row.pausedUntil && (
        <p role="status" className="small">
          {t("Reprise possible après", "Eligible to resume after")}{" "}
          {new Date(row.pausedUntil).toLocaleString(t("fr-FR", "en-US"))}.{" "}
          {t("Les autres fournisseurs continuent.", "Other providers continue.")}
        </p>
      )}
      <form
        key={`${row.rpm}:${row.tpm}:${row.parallel}`}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          setError(false);
          const data = new FormData(event.currentTarget);
          try {
            await api("execution/limits", "POST", {
              provider: row.provider,
              model: row.model,
              rpm: Number(data.get("rpm")),
              tpm: Number(data.get("tpm")),
              parallel: Number(data.get("parallel")),
            });
            await onSaved();
            setMessage(t("Plafonds enregistrés.", "Limits saved."));
          } catch (e) {
            setError(true);
            setMessage(friendly(e instanceof Error ? e.message : "internal_error", t));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="execution-fields">
          <label>
            {t("Requêtes / minute", "Requests / minute")}
            <input
              name="rpm"
              type="number"
              min={1}
              max={100000}
              step={1}
              required
              defaultValue={row.rpm}
            />
          </label>
          <label>
            {t("Tokens / minute", "Tokens / minute")}
            <input
              name="tpm"
              type="number"
              min={1000}
              max={100000000}
              step={1}
              required
              defaultValue={row.tpm}
            />
          </label>
          <label>
            {t("Appels simultanés max.", "Max. simultaneous calls")}
            <input
              name="parallel"
              type="number"
              min={1}
              max={16}
              step={1}
              required
              defaultValue={row.parallel}
            />
          </label>
        </div>
        <p className="small muted">
          {row.configured
            ? t("Vos plafonds", "Your limits")
            : t("Valeurs de départ", "Starting values")}{" "}
          · {t("Rythme effectif maximal", "Effective maximum rate")} : {row.effectiveRpm} RPM ·{" "}
          {row.effectiveTpm.toLocaleString()} TPM.
        </p>
        <Button variant="outline" size="sm" disabled={busy}>
          <Save size={14} />
          {t("Enregistrer les plafonds", "Save limits")}
        </Button>
        {message && (
          <p className="small" role={error ? "alert" : "status"}>
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
