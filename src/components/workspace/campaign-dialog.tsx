"use client";
import { useEffect, useState } from "react";
import { Play, CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import { api, Modal, Field, money, friendly, type Translate } from "./shared";
import type { Project, State, Snapshot } from "@/lib/types";
import type { Provider, MeasurementMode } from "@/lib/providers";
import {
  accountStorageKey,
  campaignPreferenceSchema,
  readBrowserValue,
  saveBrowserValue,
} from "@/lib/browser-storage";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  OPENROUTER_MODEL_IDS,
  OPENROUTER_MODELS,
  supportsWebSearch,
  type OpenRouterModel,
} from "@/lib/provider-config";
export type CampaignInput = {
  projectId: string;
  providers: Provider[];
  samples: number;
  mode: MeasurementMode;
  openrouterModel?: OpenRouterModel;
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
  const [openrouterModel, setOpenrouterModel] = useState<OpenRouterModel>(OPENROUTER_MODEL_IDS[0]);
  const storageKey = accountStorageKey("campaign", state.user, project.id);
  const [hydratedKey, setHydratedKey] = useState("");
  const [savedLocally, setSavedLocally] = useState(true);
  const hydrated = hydratedKey === storageKey;
  useEffect(() => {
    const { value, available } = readBrowserValue(storageKey, campaignPreferenceSchema);
    if (value) {
      const selected = value.providers.filter((pr) =>
        state.credentials.some((c) => c.provider === pr),
      );
      setProviders(selected);
      setSamples(value.samples);
      setMode(
        value.mode === "web" && selected.some((pr) => !supportsWebSearch(pr))
          ? "baseline"
          : value.mode,
      );
      setOpenrouterModel(value.openrouterModel);
    }
    setSavedLocally(available);
    setHydratedKey(storageKey);
  }, [storageKey]);
  useEffect(() => {
    if (hydrated)
      setSavedLocally(
        saveBrowserValue(
          storageKey,
          { providers, samples, mode, openrouterModel },
          campaignPreferenceSchema,
        ),
      );
  }, [storageKey, hydrated, providers, samples, mode, openrouterModel]);
  const [estimate, setEstimate] = useState<Estimate | null>(null),
    [estimateError, setEstimateError] = useState("");
  const [interval, setInterval] = useState(168),
    [first, setFirst] = useState(localDateTime(new Date(Date.now() + 86400_000)));
  const config = JSON.stringify({
    projectId: project.id,
    providers,
    samples,
    mode,
    openrouterModel,
  });
  const [estimatedConfig, setEstimatedConfig] = useState("");
  useEffect(() => {
    let active = true;
    setEstimate(null);
    setEstimateError("");
    if (hydrated && providers.length)
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
  }, [config, hydrated]);
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
        <p className="small muted" role="status">
          {savedLocally
            ? t(
                "Vos choix sont mémorisés sur cet appareil.",
                "Your choices are remembered on this device.",
              )
            : t(
                "Ce navigateur bloque la mémorisation de vos choix.",
                "This browser blocks saving your choices.",
              )}
        </p>
        <Field label={t("Fournisseurs à interroger", "Providers to query")}>
          <div className="checkboxes">
            {PROVIDERS.map((pr) => (
              <label key={pr}>
                <input
                  type="checkbox"
                  checked={providers.includes(pr)}
                  disabled={
                    !state.credentials.some((c) => c.provider === pr) ||
                    (mode === "web" && !supportsWebSearch(pr))
                  }
                  onChange={(e) =>
                    setProviders(
                      e.target.checked ? [...providers, pr] : providers.filter((p) => p !== pr),
                    )
                  }
                />
                {PROVIDER_LABELS[pr]}
                {!state.credentials.some((c) => c.provider === pr) && (
                  <small>{t("Clé requise", "Key required")}</small>
                )}
              </label>
            ))}
          </div>
        </Field>
        {providers.includes("openrouter") && (
          <Field
            label={t("Modèle via OpenRouter", "Model via OpenRouter")}
            hint={t(
              "Le modèle choisi est conservé dans chaque mesure. Le fournisseur d’exécution est enregistré lorsqu’OpenRouter le retourne.",
              "Each measurement keeps the selected model. The serving provider is recorded when OpenRouter returns it.",
            )}
          >
            <select
              value={openrouterModel}
              onChange={(e) => setOpenrouterModel(e.target.value as OpenRouterModel)}
            >
              {OPENROUTER_MODEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {OPENROUTER_MODELS[id].name} · {id}
                </option>
              ))}
            </select>
          </Field>
        )}
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
            <option value="web" disabled={providers.some((pr) => !supportsWebSearch(pr))}>
              {t("API avec recherche web et citations", "API with web search and citations")}
            </option>
          </select>
        </Field>
        {providers.some((pr) => !supportsWebSearch(pr)) && (
          <p className="small muted">
            {t(
              "Kimi et OpenRouter sont disponibles en mode API sans recherche web. Aucune citation n’est déduite du texte généré.",
              "Kimi and OpenRouter support API mode without web search. Generated links are not treated as citations.",
            )}
          </p>
        )}
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
            "Maximum 1 200 tokens de sortie, ou 8 192 pour Kimi (raisonnement inclus). Les frais de recherche sont inclus ; les taxes et frais de recharge sont exclus. Les coûts retournés par OpenRouter sont conservés. Les échecs ne sont pas relancés automatiquement.",
            "Up to 1,200 output tokens, or 8,192 for Kimi (including reasoning). Search fees are included; taxes and credit purchase fees are excluded. OpenRouter-reported costs are retained. Failures are not retried automatically.",
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
