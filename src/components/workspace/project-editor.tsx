"use client";
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "../ui/button";
import { api, Field, Modal, friendly, type Translate } from "./shared";
import type { Project, State } from "@/lib/types";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  OPENROUTER_MODEL_IDS,
  type Provider,
  type OpenRouterModel,
} from "@/lib/provider-config";
import { projectSchema, projectIssues, projectIssueMessage } from "@/lib/project-validation";
import { AISuggestions, projectContext } from "./ai-suggestions";
export function ProjectEditor({
  project,
  state,
  t,
  onClose,
  onSaved,
}: {
  project: Project;
  state: State;
  t: Translate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [revision] = useState(project.revision ?? 1);
  const [fields, setFields] = useState({
    name: project.name,
    domain: project.domain,
    industry: project.industry,
    description: project.description ?? "",
    country: project.country,
    language: project.language,
  });
  const [competitors, setCompetitors] = useState(
    project.brands
      .filter((b) => !b.is_primary)
      .map((b) => ({ id: b.id as string | null, name: b.name, domain: b.domain })),
  );
  const [questions, setQuestions] = useState(project.queries.map((q) => q.text).join("\n"));
  const [settings, setSettings] = useState(
    project.scan_settings ?? {
      providers: state.credentials.map((c) => c.provider),
      samples: 1,
      mode: "baseline" as "baseline" | "web",
      openrouterModel: OPENROUTER_MODEL_IDS[0],
    },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const qs = questions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const context = {
    ...projectContext(project),
    ...fields,
    language: fields.language as "fr" | "en" | "zh-CN",
    questions: qs.slice(0, 50),
    competitors: competitors.map(({ name, domain }) => ({ name, domain })),
  };
  return (
    <Modal title={t("Modifier le projet et le scan", "Edit project and scan")} onClose={onClose}>
      <p className="small muted">
        {t(
          "Ces réglages sont sauvegardés dans votre espace et préparent vos prochains scans. Les réponses déjà collectées conservent leurs paramètres exacts. Pour modifier un planning existant, enregistrez aussi sa nouvelle configuration dans Planification.",
          "These settings are saved to your workspace for future scans. Collected responses retain their exact parameters. To update an existing schedule, also save its new configuration in Scheduling.",
        )}
      </p>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = {
            ...fields,
            competitors: competitors.map(({ name, domain }) => ({ name, domain })),
            queries: qs,
          };
          const checked = projectSchema.safeParse(data);
          if (!checked.success) {
            setError(
              projectIssues(checked.error)
                .map((i) => projectIssueMessage(i, t))
                .join(" "),
            );
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api(`projects/${project.id}`, "POST", {
              ...checked.data,
              revision,
              competitorIds: competitors.map((c) => c.id),
              scanSettings: settings,
            });
            onSaved();
          } catch (e) {
            setError(friendly((e as Error).message, t));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="campaign-fields">
          <section className="project-editor-section">
            <h3>{t("Votre activité", "Your business")}</h3>
            {(
              [
                ["name", t("Nom de votre marque", "Your brand name"), 100],
                ["domain", t("Domaine web", "Website domain"), 253],
                ["industry", t("Secteur d’activité", "Industry"), 120],
              ] as const
            ).map(([key, label, max]) => (
              <Field label={label} key={key}>
                <input
                  required
                  value={fields[key]}
                  maxLength={max}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                />
              </Field>
            ))}
            <Field
              label={t(
                "Description de l’activité et des clients",
                "Business and customer description",
              )}
            >
              <textarea
                rows={4}
                maxLength={2000}
                value={fields.description}
                onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <div className="form-grid">
              <Field label={t("Pays cible (contexte)", "Target country (context)")}>
                <input
                  value={fields.country}
                  pattern="[A-Z]{2}"
                  maxLength={2}
                  required
                  onChange={(e) =>
                    setFields((f) => ({ ...f, country: e.target.value.toUpperCase() }))
                  }
                />
              </Field>
              <Field label={t("Langue des réponses", "Response language")}>
                <select
                  value={fields.language}
                  onChange={(e) => setFields((f) => ({ ...f, language: e.target.value }))}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                </select>
              </Field>
            </div>
          </section>
          <section className="project-editor-section">
            <h3>{t("Concurrents", "Competitors")}</h3>
            {competitors.map((c, i) => (
              <div className="project-editor-row" key={c.id ?? `new-${i}`}>
                <input
                  aria-label={`${t("Nom", "Name")} ${i + 1}`}
                  value={c.name}
                  maxLength={100}
                  required
                  onChange={(e) =>
                    setCompetitors((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  aria-label={`${t("Domaine", "Domain")} ${i + 1}`}
                  value={c.domain}
                  maxLength={253}
                  required
                  onChange={(e) =>
                    setCompetitors((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("Retirer le concurrent", "Remove competitor")}
                  onClick={() => setCompetitors((cs) => cs.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={competitors.length >= 10}
              onClick={() => setCompetitors((cs) => [...cs, { id: null, name: "", domain: "" }])}
            >
              <Plus size={14} />
              {t("Ajouter un concurrent", "Add a competitor")}
            </Button>
            <AISuggestions
              context={context}
              projectId={project.id}
              providers={state.credentials.map((c) => c.provider)}
              t={t}
              kind="competitors"
              onCompetitor={(c) => {
                if (competitors.length < 10)
                  setCompetitors((cs) => [
                    ...cs,
                    { id: null, name: c.name, domain: c.domain ?? "" },
                  ]);
              }}
            />
          </section>
          <section className="project-editor-section">
            <h3>{t("Questions à surveiller", "Questions to track")}</h3>
            <Field
              label={t("Une question par ligne. 50 maximum.", "One question per line. Up to 50.")}
            >
              <textarea
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                rows={8}
                maxLength={50000}
                required
              />
            </Field>
            <p className="small muted">{qs.length}/50</p>
            <AISuggestions
              context={context}
              projectId={project.id}
              providers={state.credentials.map((c) => c.provider)}
              t={t}
              kind="questions"
              onQuestion={(q) =>
                setQuestions((old) =>
                  [...new Set([...old.split("\n").filter(Boolean), q])].join("\n"),
                )
              }
            />
          </section>
          <section className="project-editor-section">
            <h3>{t("Réglages du prochain scan", "Next scan settings")}</h3>
            <Field label={t("Fournisseurs à interroger", "Providers to query")}>
              <div className="checkboxes">
                {PROVIDERS.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={settings.providers.includes(p)}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          providers: e.target.checked
                            ? [...s.providers, p]
                            : s.providers.filter((x) => x !== p),
                        }))
                      }
                    />
                    {PROVIDER_LABELS[p]}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={t("Mode de mesure", "Measurement mode")}>
              <select
                value={settings.mode}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, mode: e.target.value as "baseline" | "web" }))
                }
              >
                <option value="baseline">
                  {t("API sans recherche web", "API without web search")}
                </option>
                <option value="web">{t("API avec recherche web", "API with web search")}</option>
              </select>
            </Field>
            <Field
              label={t("Échantillons par requête et fournisseur", "Samples per query and provider")}
            >
              <select
                value={settings.samples}
                onChange={(e) => setSettings((s) => ({ ...s, samples: Number(e.target.value) }))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            {settings.providers.includes("openrouter") && (
              <Field label={t("Modèle OpenRouter", "OpenRouter model")}>
                <select
                  value={settings.openrouterModel}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      openrouterModel: e.target.value as OpenRouterModel,
                    }))
                  }
                >
                  {OPENROUTER_MODEL_IDS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            )}
          </section>
          <div className="modal-actions">
            <Button disabled={busy}>
              <Save size={15} />
              {t("Enregistrer les modifications", "Save changes")}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
