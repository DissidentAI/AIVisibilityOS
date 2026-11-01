"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Plus, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button";
import { api, Field, friendly, money, type Translate } from "./shared";
import { PROVIDER_LABELS, type Provider } from "@/lib/provider-config";
import type { SuggestionContext, Suggestions } from "@/lib/suggestion-validation";
import type { Project, State } from "@/lib/types";
export function projectContext(project: Project): SuggestionContext {
  return {
    name: project.name,
    domain: project.domain,
    industry: project.industry,
    description: project.description ?? "",
    country: project.country,
    language: ["en", "zh-CN"].includes(project.language)
      ? (project.language as "en" | "zh-CN")
      : "fr",
    questions: project.queries.map((q) => q.text),
    competitors: project.brands
      .filter((b) => !b.is_primary)
      .map((b) => ({ name: b.name, domain: b.domain })),
  };
}
type Result = {
  id: string;
  status: string;
  result: Suggestions | null;
  provider: Provider;
  model: string;
  returned_model: string | null;
  created_at: string;
  cost_micros: number | null;
  error_code: string | null;
};
export function AISuggestions({
  context,
  projectId,
  providers,
  t,
  kind,
  filter = "",
  automatic = false,
  onQuestion,
  onCompetitor,
}: {
  context: SuggestionContext;
  projectId?: string;
  providers: Provider[];
  t: Translate;
  kind: "questions" | "competitors";
  filter?: string;
  automatic?: boolean;
  onQuestion?: (text: string) => void;
  onCompetitor?: (value: Suggestions["competitors"][number]) => void;
}) {
  const [provider, setProvider] = useState<Provider | "">(providers[0] ?? "");
  const [job, setJob] = useState<Result | null>(null),
    [id, setId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    started = useRef(false);
  const contextRef = useRef(context);
  contextRef.current = context;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function generate() {
    if (!provider || busy) return;
    setBusy(true);
    setError("");
    setJob(null);
    setId("");
    try {
      const result = await api<{ id: string }>("suggestions", "POST", {
        projectId,
        provider,
        context: contextRef.current,
      });
      if (alive.current) setId(result.id);
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    if (!automatic || started.current || !provider || context.industry.trim().length < 2) return;
    const timer = setTimeout(() => {
      started.current = true;
      void generate();
    }, 700);
    return () => clearTimeout(timer);
  }, [automatic, provider, context.industry]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<Result>(`suggestions/${id}`);
        if (!active) return;
        setJob(result);
        if (["queued", "running"].includes(result.status)) timer = setTimeout(poll, 2000);
        else {
          setBusy(false);
          if (result.status !== "succeeded") setError(result.error_code || "suggestions_invalid");
        }
      } catch (e) {
        if (active) {
          setBusy(false);
          setError((e as Error).message);
        }
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);
  const competitors = (job?.result?.competitors ?? []).filter(
    (c) =>
      !filter.trim() ||
      `${c.name} ${c.domain ?? ""} ${c.reason}`
        .toLocaleLowerCase()
        .includes(filter.trim().toLocaleLowerCase()),
  );
  return (
    <section className="suggestion-panel" aria-label={t("Suggestions IA", "AI suggestions")}>
      <div className="suggestion-heading">
        <div>
          <span className="section-kicker">
            {t("ASSISTANT DE RECHERCHE", "RESEARCH ASSISTANT")}
          </span>
          <h3>
            {kind === "questions"
              ? t(
                  "De meilleures questions, adaptées à votre activité",
                  "Better questions for your business",
                )
              : t("Découvrez d’autres concurrents pertinents", "Discover relevant competitors")}
          </h3>
        </div>
        <Sparkles size={20} />
      </div>
      <p className="small muted">
        {t(
          "À partir de votre description, de votre pays et de vos questions. Suggestions à vérifier avant de les ajouter. La génération utilise votre clé API et votre budget ; les résultats sont mémorisés 30 jours.",
          "Based on your description, country and questions. Review suggestions before adding them. Generation uses your API key and budget; results are cached for 30 days.",
        )}
      </p>
      {providers.length ? (
        <div className="suggestion-controls">
          <Field label={t("IA pour les suggestions", "Suggestion provider")}>
            <select
              value={provider}
              disabled={busy}
              onChange={(e) => {
                setProvider(e.target.value as Provider);
                setJob(null);
                setId("");
              }}
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !provider || context.industry.trim().length < 2}
            onClick={generate}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{" "}
            {busy
              ? t("Génération en cours…", "Generating…")
              : t("Générer avec l’IA", "Generate with AI")}
          </Button>
        </div>
      ) : (
        <p className="small">
          {t(
            "Connectez une clé API dans Paramètres pour activer les suggestions.",
            "Connect an API key in Settings to enable suggestions.",
          )}
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {friendly(error, t)}
        </p>
      )}
      {busy && (
        <p role="status" className="small muted">
          {t(
            "La tâche continue même si vous fermez cette fenêtre. Rouvrez-la pour retrouver le résultat mémorisé.",
            "The task continues if you close this window. Reopen it to retrieve the cached result.",
          )}
        </p>
      )}
      {job?.result && (
        <>
          <div className="suggestion-list">
            {kind === "questions"
              ? job.result.questions
                  .filter((q) => !context.questions.includes(q))
                  .map((q) => (
                    <button
                      className="suggestion-item"
                      type="button"
                      key={q}
                      onClick={() => onQuestion?.(q)}
                    >
                      <span>{q}</span>
                      <Plus size={15} />
                    </button>
                  ))
              : competitors
                  .filter(
                    (c) =>
                      !context.competitors.some(
                        (b) => b.name.toLocaleLowerCase() === c.name.toLocaleLowerCase(),
                      ),
                  )
                  .map((c) => (
                    <button
                      className="suggestion-item"
                      type="button"
                      key={c.name}
                      onClick={() => onCompetitor?.(c)}
                    >
                      <span>
                        <strong>{c.name}</strong>
                        <small>
                          {c.domain || t("Domaine à renseigner", "Domain needed")} · {c.reason}
                        </small>
                      </span>
                      <Plus size={15} />
                    </button>
                  ))}
          </div>
          {kind === "competitors" && !competitors.length && (
            <p className="small muted">
              {t(
                "Aucune proposition correspondante. Vous pouvez saisir un concurrent librement.",
                "No matching suggestion. You can enter a competitor manually.",
              )}
            </p>
          )}
          <p className="small muted">
            {PROVIDER_LABELS[job.provider]} · {job.returned_model || job.model} ·{" "}
            {new Date(job.created_at).toLocaleDateString(t("fr-FR", "en-GB"))} ·{" "}
            {job.cost_micros == null ? t("Coût inconnu", "Unknown cost") : money(job.cost_micros)} ·{" "}
            {t("Propositions non vérifiées", "Unverified proposals")}
          </p>
        </>
      )}
    </section>
  );
}
