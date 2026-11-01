"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import { Field, Modal, type Translate } from "./shared";
import type { Project, State } from "@/lib/types";
import { AISuggestions, projectContext } from "./ai-suggestions";
export function QuestionDialog({
  project,
  state,
  t,
  busy,
  onClose,
  onSave,
}: {
  project: Project;
  state: State;
  t: Translate;
  busy: boolean;
  onClose: () => void;
  onSave: (texts: string[]) => void;
}) {
  const [text, setText] = useState("");
  const texts = [
    ...new Set(
      text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const fresh = texts.filter((q) => !project.queries.some((old) => old.text === q));
  const invalid = texts.some((q) => q.length < 5 || q.length > 1000);
  return (
    <Modal title={t("Ajouter des questions", "Add questions")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (fresh.length && !invalid) onSave(texts);
        }}
      >
        <Field label={t("Questions à ajouter, une par ligne", "Questions to add, one per line")}>
          <textarea
            value={text}
            maxLength={50000}
            rows={7}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </Field>
        <p className="small muted" role="status">
          {fresh.length} {t("nouvelles questions", "new questions")} ·{" "}
          {project.queries.length + fresh.length}/50.{" "}
          {t("Les doublons sont ignorés.", "Duplicates are skipped.")}
        </p>
        {invalid && (
          <p className="alert error">
            {t(
              "Chaque question doit contenir de 5 à 1 000 caractères.",
              "Each question must contain 5 to 1,000 characters.",
            )}
          </p>
        )}
        <Button
          disabled={busy || !fresh.length || invalid || project.queries.length + fresh.length > 50}
        >
          {t("Ajouter les questions", "Add questions")}
        </Button>
      </form>
      <AISuggestions
        context={projectContext(project)}
        projectId={project.id}
        providers={state.credentials.map((c) => c.provider)}
        t={t}
        kind="questions"
        onQuestion={(q) =>
          setText((old) => [...new Set([...old.split("\n").filter(Boolean), q])].join("\n"))
        }
      />
    </Modal>
  );
}
export function CompetitorDialog({
  project,
  state,
  t,
  busy,
  onClose,
  onSave,
  hasMeasurements = false,
}: {
  project: Project;
  state: State;
  t: Translate;
  busy: boolean;
  onClose: () => void;
  onSave: (brand: { name: string; domain: string }) => void;
  hasMeasurements?: boolean;
}) {
  const [name, setName] = useState(""),
    [domain, setDomain] = useState("");
  return (
    <Modal title={t("Ajouter un concurrent", "Add a competitor")} onClose={onClose}>
      {hasMeasurements && (
        <p className="small muted">
          {t(
            "Ce concurrent sera recherché dans vos réponses enregistrées, sans appel IA. Les suggestions IA ci-dessous ne sont générées que si vous les demandez.",
            "This competitor will be checked in your saved answers without an AI call. AI suggestions below are generated only on request.",
            "系统将在已保存的回答中查找此竞争对手，无需 AI 调用。下方的 AI 建议仅在您主动请求时生成。",
          )}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, domain });
        }}
      >
        <Field label={t("Nom de la marque", "Brand name")}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={100}
            required
            autoComplete="off"
          />
        </Field>
        <Field label={t("Domaine", "Domain")}>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            placeholder="example.com"
          />
        </Field>
        <Button disabled={busy}>{t("Ajouter", "Add")}</Button>
      </form>
      <AISuggestions
        context={projectContext(project)}
        projectId={project.id}
        providers={state.credentials.map((c) => c.provider)}
        t={t}
        kind="competitors"
        filter={name}
        automatic={!hasMeasurements}
        onCompetitor={(c) => {
          setName(c.name);
          setDomain(c.domain ?? "");
        }}
      />
    </Modal>
  );
}
