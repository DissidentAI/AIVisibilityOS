"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { RetryEstimate } from "@/lib/retries";
import type { RunDetail } from "@/lib/types";
import { PROVIDER_LABELS } from "@/lib/provider-config";
import { Button } from "../ui/button";
import { api, friendly, Modal, money, type Translate } from "./shared";

export function RetryDialog({
  detail,
  responseIds,
  workerOnline,
  t,
  onClose,
  onCreated,
}: {
  detail: RunDetail;
  responseIds: string[];
  workerOnline: boolean;
  t: Translate;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [estimate, setEstimate] = useState<RetryEstimate | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "checking" | "launching">("idle");
  const active = useRef(true);
  const submitted = useRef(false);
  useEffect(() => {
    active.current = true;
    api<RetryEstimate>(`runs/${detail.run.id}/retry/estimate`, "POST", { responseIds })
      .then((e) => {
        if (active.current) setEstimate(e);
      })
      .catch((e) => {
        if (active.current) setError(e.message);
      });
    return () => {
      active.current = false;
    };
  }, [detail.run.id, responseIds]);
  async function launch() {
    if (!estimate?.affordable || submitted.current) return;
    submitted.current = true;
    setPhase("checking");
    setError("");
    try {
      for (const provider of estimate.providers) {
        await api("credentials/check", "POST", { provider });
        if (!active.current) return;
      }
      setPhase("launching");
      const result = await api<{ id: string }>(`runs/${detail.run.id}/retry`, "POST", {
        responseIds: estimate.responseIds,
        expectedQuoteHash: estimate.quoteHash,
      });
      // A committed launch remains visible even if the dialog was closed in flight.
      onCreated(result.id);
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : "internal_error");
    } finally {
      if (active.current) {
        setPhase("idle");
        submitted.current = false;
      }
    }
  }
  return (
    <Modal
      title={t("Réessayer les échecs", "Retry failed responses")}
      onClose={onClose}
      onCloseStart={() => {
        active.current = false;
      }}
    >
      <p className="muted">
        {t(
          "Une nouvelle tentative conserve les questions, modèles et paramètres d’origine. Les anciennes réponses et leurs coûts restent dans l’historique.",
          "A new attempt keeps the original questions, models and settings. Earlier responses and their costs stay in history.",
        )}
      </p>
      <div className="estimate-box" aria-live="polite">
        {estimate ? (
          <>
            <strong>
              {estimate.responses}{" "}
              {estimate.responses === 1
                ? t("appel à réessayer", "call to retry")
                : t("appels à réessayer", "calls to retry")}{" "}
              · {money(estimate.reservedMicros)}
            </strong>
            <span>
              {t("Réservation prudente supplémentaire", "Additional conservative reservation")}
            </span>
            <span>{estimate.providers.map((pr) => PROVIDER_LABELS[pr]).join(" · ")}</span>
            <span>
              {estimate.mode === "web"
                ? t("Avec recherche web", "With web search")
                : t("Sans recherche web", "Without web search")}
            </span>
            <span>
              {t("Budget disponible", "Available budget")} :{" "}
              {money(Math.min(estimate.orgRemaining, estimate.installationRemaining))}
            </span>
          </>
        ) : (
          <span>
            {error
              ? t("Estimation indisponible", "Estimate unavailable")
              : t("Calcul de l’estimation…", "Calculating estimate…")}
          </span>
        )}
      </div>
      {!!estimate?.uncertain && (
        <p className="alert info">
          {t(
            `Tentatives au coût inconnu ou interrompues : ${estimate.uncertain}. Elles peuvent déjà avoir été facturées. Leur réservation reste comptée.`,
            `Attempts with unknown cost or interrupted status: ${estimate.uncertain}. They may already have been billed. Their reservation remains counted.`,
          )}
        </p>
      )}
      {estimate?.providers.includes("mimo") && estimate.mode === "web" && (
        <p className="alert info">
          {t(
            "Si MiMo refusait Web Search, activez le plugin dans votre console Xiaomi avant de réessayer. La reprise conserve le mode web.",
            "If MiMo rejected Web Search, enable the plugin in your Xiaomi console before retrying. Retrying keeps web mode.",
          )}
        </p>
      )}
      {!workerOnline && (
        <p className="alert info">
          {t(
            "Le worker est arrêté : la reprise attendra son démarrage.",
            "The worker is offline: retries will wait for it to start.",
          )}
        </p>
      )}
      <p className="small muted">
        {t(
          "Les clés sont vérifiées avant le lancement. Une reprise reste un échantillon sélectionné après échec, exclu des comparaisons historiques automatiques. La réservation est une estimation, pas un plafond de facture fournisseur.",
          "Keys are checked before launch. A retry is a sample selected after failure, excluded from automatic historical comparisons. The reservation is an estimate, not a provider invoice cap.",
        )}
      </p>
      {(error || (estimate && !estimate.affordable)) && (
        <p className="alert error" role="alert">
          {friendly(error || "budget_exceeded", t)}
        </p>
      )}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose} disabled={phase !== "idle"}>
          {t("Annuler", "Cancel")}
        </Button>
        <Button disabled={!estimate?.affordable || phase !== "idle"} onClick={launch}>
          <RotateCcw size={16} />
          {phase === "checking"
            ? t("Vérification des clés…", "Checking keys…")
            : phase === "launching"
              ? t("Mise en file…", "Queuing…")
              : t("Confirmer la reprise", "Confirm retry")}
        </Button>
      </div>
    </Modal>
  );
}
