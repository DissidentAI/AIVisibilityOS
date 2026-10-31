"use client";
import { useEffect, useState } from "react";
import { Play, CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import { api, Modal, Field, money, friendly, type Translate } from "./shared";
import type { Project, State, Snapshot } from "@/lib/types";
import type { Provider, MeasurementMode } from "@/lib/providers";
export type CampaignInput = {
  projectId: string;
  providers: Provider[];
  samples: number;
  mode: MeasurementMode;
  expectedConfigHash?: string;
  intervalHours?: number;
  firstRunAt?: string;
};
type Estimate = {
  reservedMicros: number;
  responses: number;
  orgRemaining: number;
  installationRemaining: number;
  affordable: boolean;
  configHash: string;
  snapshot: Snapshot;
};
function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function CampaignDialog({
  project,
  state,
  t,
  busy,
  onClose,
  onSave,
  schedule = false,
  error = "",
}: {
  project: Project;
  state: State;
  t: Translate;
  busy: boolean;
  onClose: () => void;
  onSave: (data: CampaignInput) => void;
  schedule?: boolean;
  error?: string;
}) {
  const [providers, setProviders] = useState<Provider[]>(state.credentials.map((c) => c.provider));
  const [samples, setSamples] = useState(1),
    [mode, setMode] = useState<MeasurementMode>("baseline");
  const [estimate, setEstimate] = useState<Estimate | null>(null),
    [estimateError, setEstimateError] = useState("");
  const [interval, setInterval] = useState(168),
    [first, setFirst] = useState(localDateTime(new Date(Date.now() + 86400_000)));
  const config = JSON.stringify({ projectId: project.id, providers, samples, mode });
  const [estimatedConfig, setEstimatedConfig] = useState("");
  useEffect(() => {
    let active = true;
    setEstimate(null);
    setEstimateError("");
    if (providers.length)
      api<Estimate>("runs/estimate", "POST", JSON.parse(config))
        .then((e) => {
          if (active) {
            setEstimate(e);
            setEstimatedConfig(config);
          }
        })
        .catch((e) => {
          if (active) setEstimateError(e.message);
        });
    return () => {
      active = false;
    };
  }, [config]);
  const ready = estimate && estimatedConfig === config && estimate.affordable;
  return (
    <Modal
      title={
        schedule
          ? t("Planifier les mesures", "Schedule measurements")
          : t("Nouvelle campagne de mesure", "New measurement campaign")
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready)
            onSave({
              ...JSON.parse(config),
              expectedConfigHash: estimate.configHash,
              ...(schedule
                ? { intervalHours: interval, firstRunAt: new Date(first).toISOString() }
                : {}),
            });
        }}
      >
        <p className="muted">
          {project.name} · {project.queries.length}{" "}
          {t(
            "requêtes · une conversation neuve par réponse",
            "queries · a fresh conversation per response",
          )}
        </p>
        <Field label={t("Fournisseurs à interroger", "Providers to query")}>
          <div className="checkboxes">
            {(["openai", "gemini"] as const).map((pr) => (
              <label key={pr}>
                <input
                  type="checkbox"
                  checked={providers.includes(pr)}
                  disabled={!state.credentials.some((c) => c.provider === pr)}
                  onChange={(e) =>
                    setProviders(
                      e.target.checked ? [...providers, pr] : providers.filter((p) => p !== pr),
                    )
                  }
                />
                {pr === "openai" ? "OpenAI" : "Google Gemini"}
                {!state.credentials.some((c) => c.provider === pr) && (
                  <small>{t("Clé requise", "Key required")}</small>
                )}
              </label>
            ))}
          </div>
        </Field>
        <Field
          label={t("Mode de mesure", "Measurement mode")}
          hint={t(
            "Chaque mode conserve sa propre série historique.",
            "Each mode keeps its own historical series.",
          )}
        >
          <select value={mode} onChange={(e) => setMode(e.target.value as MeasurementMode)}>
            <option value="baseline">
              {t("API sans recherche web", "API without web search")}
            </option>
            <option value="web">
              {t("API avec recherche web et citations", "API with web search and citations")}
            </option>
          </select>
        </Field>
        <Field
          label={t("Échantillons par requête et fournisseur", "Samples per query and provider")}
        >
          <select value={samples} onChange={(e) => setSamples(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        {schedule && (
          <>
            <Field label={t("Fréquence", "Frequency")}>
              <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
                <option value="168">{t("Tous les 7 jours", "Every 7 days")}</option>
                <option value="24">{t("Toutes les 24 heures", "Every 24 hours")}</option>
              </select>
            </Field>
            <Field
              label={t("Première exécution", "First execution")}
              hint={`${t("Heure locale", "Local time")} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
            >
              <input
                type="datetime-local"
                required
                value={first}
                min={localDateTime(new Date(Date.now() + 60000))}
                onChange={(e) => setFirst(e.target.value)}
              />
            </Field>
            <p className="small muted">
              {t(
                "Les questions et paramètres sont figés à l’enregistrement. La cadence est fixe en UTC, y compris lors des changements d’heure. Un nouveau planning remplace celui du projet.",
                "Questions and parameters are frozen when saved. Cadence is fixed in UTC, including daylight saving changes. A new schedule replaces this project's schedule.",
              )}
            </p>
          </>
        )}
        <div className="estimate-box" aria-live="polite">
          {estimate && estimatedConfig === config ? (
            <>
              <strong>
                {estimate.responses} {t("réponses prévues", "planned responses")} ·{" "}
                {money(estimate.reservedMicros)}
              </strong>
              <span>
                {t("Réservation prudente par campagne", "Conservative reservation per campaign")}
              </span>
              <span>
                {t("Budget disponible", "Available budget")} :{" "}
                {money(Math.min(estimate.orgRemaining, estimate.installationRemaining))}
              </span>
              {schedule && (
                <span>
                  {t(
                    "Projection sur 31 jours, au tarif réservé",
                    "31-day projection at reserved rates",
                  )}{" "}
                  : {money(estimate.reservedMicros * Math.ceil((31 * 24) / interval))}
                </span>
              )}
              {!estimate.affordable && (
                <p className="error-text">{friendly("budget_exceeded", t)}</p>
              )}
            </>
          ) : (
            <span>
              {providers.length
                ? t("Calcul de l’estimation…", "Calculating estimate…")
                : t("Sélectionnez un fournisseur connecté.", "Select a connected provider.")}
            </span>
          )}
        </div>
        <p className="small muted">
          {t(
            "Maximum 1 200 tokens de sortie. Les frais de recherche sont inclus sans déduire les franchises fournisseur. Le coût final reste une estimation. Les échecs ne sont pas relancés automatiquement.",
            "Maximum 1,200 output tokens. Search fees are included without deducting provider free allowances. Final costs remain estimates. Failures are not retried automatically.",
          )}
        </p>
        {mode === "web" && (
          <p className="alert info">
            {t(
              "La recherche est demandée au fournisseur. Sa réalisation et ses citations sont enregistrées lorsqu’elles sont effectivement retournées.",
              "Search is requested from the provider. Its execution and citations are recorded when actually returned.",
            )}
          </p>
        )}
        {!state.workerOnline && (
          <p className="alert info">
            {t(
              "Le worker est arrêté : les campagnes attendront son démarrage.",
              "The worker is offline: campaigns will wait for it to start.",
            )}
          </p>
        )}
        {(estimateError || error) && (
          <p className="alert error" role="alert">
            {friendly(estimateError || error, t)}
          </p>
        )}
        <Button className="full" disabled={busy || !ready}>
          {schedule ? <CalendarClock size={15} /> : <Play size={15} />}
          {schedule
            ? t("Enregistrer le planning", "Save schedule")
            : t("Lancer les appels API", "Start API calls")}
        </Button>
      </form>
    </Modal>
  );
}
