"use client";
import { useEffect, useRef, useState } from "react";
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
  onConnect,
  requestedProvider,
  initialSettings,
}: {
  project: Project;
  state: State;
  t: Translate;
  busy: boolean;
  onClose: () => void;
  onSave: (data: CampaignInput) => void;
  schedule?: boolean;
  error?: string;
  onConnect?: (provider: Provider) => void;
  requestedProvider?: Provider;
  initialSettings?: Partial<CampaignInput>;
}) {
  const [providers, setProviders] = useState<Provider[]>(state.credentials.map((c) => c.provider));
  const [samples, setSamples] = useState(1),
    [mode, setMode] = useState<MeasurementMode>("baseline");
  const [openrouterModel, setOpenrouterModel] = useState<OpenRouterModel>(OPENROUTER_MODEL_IDS[0]);
  const storageKey = accountStorageKey("campaign", state.user, project.id);
  const [hydratedKey, setHydratedKey] = useState("");
  const [savedLocally, setSavedLocally] = useState(true);
  const [checking, setChecking] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hydrated = hydratedKey === storageKey;
  useEffect(() => {
    const { value: localValue, available } = readBrowserValue(storageKey, campaignPreferenceSchema);
    const value =
      initialSettings ??
      (localValue?.serverRevision === (project.revision ?? 1)
        ? localValue
        : (project.scan_settings ?? localValue));
    if (value) {
      const selected = (value.providers ?? []).filter((pr) =>
        state.credentials.some((c) => c.provider === pr),
      );
      if (
        requestedProvider &&
        state.credentials.some((c) => c.provider === requestedProvider) &&
        !selected.includes(requestedProvider)
      )
        selected.push(requestedProvider);
      setProviders(selected);
      setSamples(value.samples ?? 1);
      setMode(
        value.mode === "web" && selected.some((pr) => !supportsWebSearch(pr))
          ? "baseline"
          : (value.mode ?? "baseline"),
      );
      setOpenrouterModel(value.openrouterModel ?? OPENROUTER_MODEL_IDS[0]);
      if (initialSettings?.intervalHours) setInterval(initialSettings.intervalHours);
      if (initialSettings?.firstRunAt)
        setFirst(localDateTime(new Date(initialSettings.firstRunAt)));
    }
    setSavedLocally(available);
    setHydratedKey(storageKey);
  }, [storageKey]);
  useEffect(() => {
    if (hydrated)
      setSavedLocally(
        saveBrowserValue(
          storageKey,
          { providers, samples, mode, openrouterModel, serverRevision: project.revision ?? 1 },
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
      onCloseStart={() => {
        mounted.current = false;
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready || checking) return;
          setChecking(true);
          setConnectionError("");
          try {
            // Authenticate without generating text before starting a paid campaign.
            for (const provider of providers) {
              await api("credentials/check", "POST", { provider });
              if (!mounted.current) return;
            }
            onSave({
              ...JSON.parse(config),
              expectedConfigHash: estimate.configHash,
              ...(schedule
                ? { intervalHours: interval, firstRunAt: new Date(first).toISOString() }
                : {}),
            });
          } catch (error) {
            if (mounted.current)
              setConnectionError(error instanceof Error ? error.message : "internal_error");
          } finally {
            if (mounted.current) setChecking(false);
          }
        }}
      >
        <fieldset className="campaign-fields" disabled={busy || checking}>
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
                  "Enregistrez ces réglages pour les retrouver sur vos appareils. Les choix temporaires restent mémorisés ici.",
                  "Save these settings to use them across devices. Temporary choices are remembered here.",
                )
              : t(
                  "Ce navigateur bloque la mémorisation de vos choix.",
                  "This browser blocks saving your choices.",
                )}
          </p>
          <Field label={t("Fournisseurs à interroger", "Providers to query")}>
            <div className="checkboxes">
              {PROVIDERS.map((pr) => (
                <label
                  key={pr}
                  className={`provider-choice ${providers.includes(pr) ? "is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={providers.includes(pr)}
                    disabled={busy || checking}
                    aria-label={PROVIDER_LABELS[pr]}
                    onChange={(e) => {
                      setConnectionError("");
                      if (!state.credentials.some((c) => c.provider === pr)) {
                        if (onConnect) onConnect(pr);
                        else setConnectionError("credentials_required");
                        return;
                      }
                      const checked = e.target.checked;
                      setProviders((current) =>
                        checked ? [...current, pr] : current.filter((p) => p !== pr),
                      );
                    }}
                  />
                  {PROVIDER_LABELS[pr]}
                  {!state.credentials.some((c) => c.provider === pr) && (
                    <small>{t("Connecter une clé", "Connect a key")}</small>
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
              <option value="web">
                {t("API avec recherche web et citations", "API with web search and citations")}
              </option>
            </select>
          </Field>
          {providers.includes("mimo") && mode === "web" && (
            <div className="alert info">
              <strong>{t("MiMo : activation web requise", "MiMo: web activation required")}</strong>
              <p>
                {t(
                  "Une clé valide ne suffit pas : activez le plugin Web Search dans votre console Xiaomi pour ce mode. Sinon, vous pouvez mesurer les réponses sans recherche web.",
                  "A valid key is not enough: activate the Web Search plugin in your Xiaomi console for this mode. Otherwise, you can measure responses without web search.",
                )}
              </p>
              <a
                className="text-link"
                href="https://platform.xiaomimimo.com/"
                target="_blank"
                rel="noreferrer"
              >
                {t("Ouvrir la console Xiaomi", "Open Xiaomi console")}
              </a>
              <Button
                type="button"
                variant="outline"
                className="full"
                onClick={() => {
                  setMode("baseline");
                  setConnectionError("");
                }}
              >
                {t("Passer en mode sans recherche web", "Switch to mode without web search")}
              </Button>
            </div>
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
              "Sortie limitée à 1 200 tokens par génération, ou 8 192 pour Kimi. En mode web, la réservation prévoit le contexte de recherche et jusqu’à deux générations OpenRouter. Le coût final dépend de l’usage retourné ; ce n’est pas un plafond de facture fournisseur. Taxes et frais de recharge exclus.",
              "Output is limited to 1,200 tokens per generation, or 8,192 for Kimi. Web reservations include retrieval context and up to two OpenRouter generations. Final cost depends on reported usage; this is not a provider invoice cap. Taxes and credit purchase fees are excluded.",
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
          {(connectionError || estimateError || error) && (
            <p className="alert error" role="alert">
              {friendly(connectionError || estimateError || error, t)}
            </p>
          )}
          {!schedule && (
            <Button
              type="button"
              variant="outline"
              className="full"
              disabled={busy || checking}
              onClick={async () => {
                setChecking(true);
                setConnectionError("");
                try {
                  await api(`projects/${project.id}/scan-settings`, "POST", {
                    providers,
                    samples,
                    mode,
                    openrouterModel,
                  });
                  onClose();
                } catch (e) {
                  if (mounted.current) setConnectionError((e as Error).message);
                } finally {
                  if (mounted.current) setChecking(false);
                }
              }}
            >
              {t("Enregistrer sans lancer", "Save without launching")}
            </Button>
          )}
          <Button className="full" disabled={busy || checking || !ready}>
            {schedule ? <CalendarClock size={15} /> : <Play size={15} />}
            {checking
              ? t("Vérification des clés…", "Checking API keys…")
              : schedule
                ? t("Enregistrer le planning", "Save schedule")
                : t("Lancer les appels API", "Start API calls")}
          </Button>
        </fieldset>
      </form>
    </Modal>
  );
}
