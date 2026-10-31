"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Field, Modal, type Translate } from "./shared";
export function ProjectWizard({
  t,
  busy,
  onClose,
  onSave,
}: {
  t: Translate;
  busy: boolean;
  onClose: () => void;
  onSave: (data: unknown) => void;
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
  function suggest() {
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
            <span key={s} className={step === i + 1 ? "current" : ""}>
              <b>{i + 1}</b>
              {s}
            </span>
          ),
        )}
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (step < 3) setStep(step + 1);
          else
            onSave({
              name,
              domain,
              industry,
              country,
              language,
              competitors: competitors.filter((c) => c.name.trim() && c.domain.trim()),
              queries: qs,
            });
        }}
      >
        {step === 1 && (
          <>
            <Field label={t("Nom de votre marque", "Your brand name")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Karburo"
                required
                minLength={2}
                maxLength={100}
              />
            </Field>
            <Field label={t("Domaine web", "Website domain")}>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="votre-marque.fr"
                required
              />
            </Field>
            <Field label={t("Secteur d’activité", "Industry")}>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder={t("Comparaison des prix des carburants", "Fuel price comparison")}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <div className="form-grid">
              <Field label={t("Pays cible (contexte)", "Target country (context)")}>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  pattern="[A-Z]{2}"
                  maxLength={2}
                  required
                />
              </Field>
              <Field label={t("Langue des réponses", "Response language")}>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
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
                <Field label={t("Nom", "Name")}>
                  <input
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
                <Field label={t("Domaine", "Domain")}>
                  <input
                    value={c.domain}
                    required={!!c.name}
                    placeholder="example.com"
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
              hint={t(
                "Suggestions à adapter à vos clients. La marque n’est pas injectée dans les questions.",
                "Adapt these suggestions to your customers. Your brand is not injected into the questions.",
              )}
            >
              <textarea
                rows={10}
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
        <div className="modal-actions">
          {step > 1 && (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              {t("Retour", "Back")}
            </Button>
          )}
          <Button disabled={busy || (step === 3 && (!qs.length || qs.length > 50))}>
            {step < 3 ? t("Continuer", "Continue") : t("Créer le projet", "Create project")}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
