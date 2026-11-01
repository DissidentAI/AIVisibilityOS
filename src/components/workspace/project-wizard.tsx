"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { motion } from "motion/react";
import { useMotionPreferences } from "../ui/motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { ApiError, Field, Modal, friendly, type Translate } from "./shared";
import {
  normalizeWebsiteDomain,
  projectDetailsSchema,
  projectCompetitorsSchema,
  projectSchema,
  projectIssues,
  projectIssueStep,
  projectIssueMessage,
  type ProjectIssue,
} from "@/lib/project-validation";
export function ProjectWizard({
  t,
  busy,
  onClose,
  onSave,
}: {
  t: Translate;
  busy: boolean;
  onClose: () => void;
  onSave: (data: unknown) => Promise<unknown>;
}) {
  const [step, setStep] = useState(1),
    [name, setName] = useState(""),
    [domain, setDomain] = useState(""),
    [industry, setIndustry] = useState(""),
    [country, setCountry] = useState("FR"),
    [language, setLanguage] = useState("fr"),
    [competitors, setCompetitors] = useState([
      { name: "", domain: "" },
      { name: "", domain: "" },
    ]),
    [questions, setQuestions] = useState("");
  const { reduced } = useMotionPreferences();
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step > 1) stepRef.current?.querySelector<HTMLInputElement>("input, textarea")?.focus();
  }, [step]);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [saveError, setSaveError] = useState("");
  function clearErrors() {
    if (issues.length) setIssues([]);
    if (saveError) setSaveError("");
  }
  const fieldError = (field: string) =>
    issues
      .filter(
        (issue) =>
          issue.field === field || (field === "queries" && issue.field.startsWith("queries.")),
      )
      .map((issue) => projectIssueMessage(issue, t))
      .join("\n");
  useEffect(() => {
    const first = issues[0];
    if (!first) return;
    const field = first.field.startsWith("queries") ? "queries" : first.field;
    const control = stepRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-project-field="${field}"]`,
    );
    control?.focus();
    control?.scrollIntoView({ block: "nearest" });
  }, [issues, step]);
  function suggest() {
    clearErrors();
    const topic = industry || t("ce secteur", "this sector");
    setQuestions(
      language === "fr"
        ? [
            `Quelles sont les meilleures solutions dans le secteur ${topic} en ${country} ?`,
            `Quels services recommandez-vous pour ${topic} ?`,
            `Quelles alternatives existent pour ${topic} ?`,
            `Comment choisir une solution pour ${topic} ?`,
            `Quels outils gratuits sont disponibles pour ${topic} ?`,
            `Quelles solutions de ${topic} sont les plus simples à utiliser ?`,
            `Quel comparatif des solutions de ${topic} pouvez-vous proposer ?`,
            `Quels services de ${topic} conviennent aux particuliers ?`,
            `Quels critères de fiabilité vérifier pour ${topic} ?`,
            `Quelles applications mobiles conseillez-vous pour ${topic} ?`,
          ].join("\n")
        : [
            `What are the best solutions for ${topic} in ${country}?`,
            `Which services do you recommend for ${topic}?`,
            `What alternatives are available for ${topic}?`,
            `How should I choose a solution for ${topic}?`,
            `Which free tools are available for ${topic}?`,
            `Which ${topic} solutions are easiest to use?`,
            `Can you compare solutions for ${topic}?`,
            `Which ${topic} services suit individuals?`,
            `What reliability criteria matter for ${topic}?`,
            `Which mobile apps do you recommend for ${topic}?`,
          ].join("\n"),
    );
  }
  const qs = questions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <Modal title={t("Créer un projet", "Create a project")} onClose={onClose}>
      <div className="wizard-steps">
        {[t("Marque", "Brand"), t("Concurrents", "Competitors"), t("Questions", "Questions")].map(
          (s, i) => (
            <span
              key={s}
              className={step >= i + 1 ? "current" : ""}
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <b>{i + 1}</b>
              {s}
            </span>
          ),
        )}
      </div>
      {(issues.length > 0 || saveError) && (
        <p className="alert error" role="alert">
          {saveError ||
            t(
              "Corrigez le champ indiqué ci-dessous. Vos saisies sont conservées.",
              "Correct the field shown below. Your entries have been kept.",
            )}
        </p>
      )}
      <form
        noValidate
        onChange={clearErrors}
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (busy) return;
          clearErrors();
          // Ignore only completely empty rows. Keep the mapping to the visible row for errors.
          const entered = competitors
            .map((value, index) => ({ value, index }))
            .filter(({ value }) => value.name.trim() || value.domain.trim());
          const data = {
            name,
            domain,
            industry,
            country,
            language,
            competitors: entered.map(({ value }) => value),
            queries: qs,
          };
          const showIssues = (errors: ProjectIssue[]) => {
            const mapped = errors.map((issue) => ({
              ...issue,
              field: issue.field.replace(
                /^competitors\.(\d+)\./,
                (_, index) => `competitors.${entered[Number(index)]?.index ?? index}.`,
              ),
            }));
            setIssues(mapped);
            if (mapped[0]) setStep(projectIssueStep(mapped[0]));
          };
          if (step === 1) {
            const result = projectDetailsSchema.safeParse(data);
            if (!result.success) return showIssues(projectIssues(result.error));
            setName(result.data.name);
            setDomain(result.data.domain);
            setIndustry(result.data.industry);
            setCountry(result.data.country);
            setStep(2);
          } else if (step === 2) {
            const result = projectCompetitorsSchema.safeParse(data);
            if (!result.success) return showIssues(projectIssues(result.error));
            setCompetitors((rows) =>
              rows.map((row, index) => {
                const position = entered.findIndex((entry) => entry.index === index);
                return position < 0 ? row : result.data.competitors[position];
              }),
            );
            setStep(3);
          } else {
            const result = projectSchema.safeParse(data);
            if (!result.success) return showIssues(projectIssues(result.error));
            try {
              await onSave(result.data);
            } catch (error) {
              if (error instanceof ApiError && error.issues.length) showIssues(error.issues);
              else
                setSaveError(
                  friendly(error instanceof Error ? error.message : "internal_error", t),
                );
            }
          }
        }}
      >
        <motion.div
          ref={stepRef}
          key={step}
          initial={reduced ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
        >
          {step === 1 && (
            <>
              <Field label={t("Nom de votre marque", "Your brand name")} error={fieldError("name")}>
                <input
                  data-project-field="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Karburo"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </Field>
              <Field
                label={t("Domaine web", "Website domain")}
                error={fieldError("domain")}
                hint={t(
                  "Vous pouvez coller une adresse complète : seul le domaine sera conservé.",
                  "You can paste a full website address: only the domain is saved.",
                )}
              >
                <input
                  data-project-field="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder={t(
                    "karburo.io ou https://karburo.io/fr-fr/",
                    "karburo.io or https://karburo.io/en/",
                  )}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={2048}
                  onBlur={() => {
                    const normalized = normalizeWebsiteDomain(domain);
                    if (normalized) setDomain(normalized);
                  }}
                  required
                />
              </Field>
              <Field label={t("Secteur d’activité", "Industry")} error={fieldError("industry")}>
                <input
                  data-project-field="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder={t("Comparaison des prix des carburants", "Fuel price comparison")}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>
              <div className="form-grid">
                <Field
                  label={t("Pays cible (contexte)", "Target country (context)")}
                  error={fieldError("country")}
                >
                  <input
                    data-project-field="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    pattern="[A-Z]{2}"
                    maxLength={2}
                    required
                  />
                </Field>
                <Field
                  label={t("Langue des réponses", "Response language")}
                  error={fieldError("language")}
                >
                  <select
                    data-project-field="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </Field>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p className="muted">
                {t(
                  "Ajoutez jusqu’à deux concurrents ici. Vous pourrez en ajouter d’autres ensuite. Les champs vides sont ignorés.",
                  "Add up to two competitors here. You can add more later. Empty rows are ignored.",
                )}
              </p>
              {competitors.map((c, i) => (
                <div className="competitor-form" key={i}>
                  <span className="section-kicker">
                    {t("CONCURRENT", "COMPETITOR")} 0{i + 1}
                  </span>
                  <Field label={t("Nom", "Name")} error={fieldError(`competitors.${i}.name`)}>
                    <input
                      data-project-field={`competitors.${i}.name`}
                      value={c.name}
                      required={!!c.domain}
                      minLength={2}
                      maxLength={100}
                      onChange={(e) =>
                        setCompetitors((prev) =>
                          prev.map((p, j) => (i === j ? { ...p, name: e.target.value } : p)),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={t("Domaine", "Domain")}
                    error={fieldError(`competitors.${i}.domain`)}
                    hint={t(
                      "Domaine ou URL complète du site du concurrent.",
                      "The competitor’s domain or full website address.",
                    )}
                  >
                    <input
                      data-project-field={`competitors.${i}.domain`}
                      value={c.domain}
                      required={!!c.name}
                      placeholder="example.com"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={2048}
                      onBlur={() => {
                        const normalized = normalizeWebsiteDomain(c.domain);
                        if (normalized)
                          setCompetitors((prev) =>
                            prev.map((p, j) => (i === j ? { ...p, domain: normalized } : p)),
                          );
                      }}
                      onChange={(e) =>
                        setCompetitors((prev) =>
                          prev.map((p, j) => (i === j ? { ...p, domain: e.target.value } : p)),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </>
          )}
          {step === 3 && (
            <>
              <div className="inline between">
                <p className="muted">
                  {t("Une question par ligne. 50 maximum.", "One question per line. Up to 50.")}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={suggest}>
                  <Sparkles size={14} />
                  {t("Proposer 10 questions", "Suggest 10 questions")}
                </Button>
              </div>
              <Field
                label={t("Questions à surveiller", "Questions to track")}
                error={fieldError("queries")}
                hint={t(
                  "Suggestions à adapter à vos clients. La marque n’est pas injectée dans les questions.",
                  "Adapt these suggestions to your customers. Your brand is not injected into the questions.",
                )}
              >
                <textarea
                  rows={10}
                  data-project-field="queries"
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  required
                  maxLength={50000}
                />
              </Field>
              <p className="small muted">
                {qs.length}/50 {t("questions", "questions")}
              </p>
            </>
          )}
        </motion.div>
        <div className="modal-actions">
          {step > 1 && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                clearErrors();
                setStep(step - 1);
              }}
            >
              {t("Retour", "Back")}
            </Button>
          )}
          <Button disabled={busy}>
            {step < 3 ? t("Continuer", "Continue") : t("Créer le projet", "Create project")}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
