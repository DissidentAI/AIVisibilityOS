"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, FileSearch } from "lucide-react";
import {
  ACTION_STATUSES,
  type ActionFields,
  type GeoAction,
  type GeoActionSummary,
} from "@/lib/geo-actions";
import { comparisonScope } from "@/lib/brand-analysis";
import type { Project, RunDetail } from "@/lib/types";
import { PROVIDER_LABELS } from "@/lib/provider-config";
import { Button } from "../ui/button";
import { GroundedAnswer } from "./grounded-answer";
import { api, isAborted, Field, Modal, friendly, type Translate } from "./shared";

export function actionStatusLabel(value: ActionFields["status"], t: Translate) {
  const labels = {
    to_review: ["À vérifier", "To review", "待核实"],
    planned: ["Prévu", "Planned", "已计划"],
    in_progress: ["En cours", "In progress", "进行中"],
    published: ["Publié", "Published", "已发布"],
  } as const;
  const [fr, en, zh] = labels[value];
  return t(fr, en, zh);
}
export function GeoActionsPanel({
  project,
  detail,
  t,
  date,
  draftQueryId,
  onDraftClose,
}: {
  project: Project;
  detail: RunDetail | null;
  t: Translate;
  date: (s: string) => string;
  draftQueryId: string | null;
  onDraftClose: () => void;
}) {
  const [actions, setActions] = useState<GeoActionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<GeoAction | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<GeoAction | null>(null);
  const [opening, setOpening] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    const c = new AbortController();
    api<GeoActionSummary[]>(`projects/${project.id}/actions`, "GET", undefined, c.signal)
      .then(setActions)
      .catch((e) => {
        if (!isAborted(e)) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [project.id, refresh]);
  const questions =
    detail?.run.snapshot.queries.filter((q) =>
      detail.responses.some((r) => r.query_text === q.text && r.status === "succeeded"),
    ) ?? [];
  const shown = actions.filter((a) => !filter || a.status === filter);
  const draft = draftQueryId ?? creating;
  const close = () => {
    setEditing(null);
    setCreating(null);
    onDraftClose();
  };
  async function open(id: string, mode: "edit" | "evidence") {
    setOpening(true);
    setError("");
    try {
      const value = await api<GeoAction>(`actions/${id}`);
      if (mode === "edit") setEditing(value);
      else setEvidence(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  return (
    <section className="card geo-actions-panel">
      <div className="card-heading">
        <div>
          <span className="section-kicker">
            {t("VOTRE PLAN D’ACTION", "YOUR ACTION PLAN", "行动计划")}
          </span>
          <h2>{t("Actions GEO suivies", "Tracked GEO actions", "GEO 行动跟踪")}</h2>
          <p>
            {t(
              "Chaque action conserve les réponses et les mentions observées à sa création.",
              "Each action preserves the answers and mentions observed when it was created.",
              "每项行动保留创建时观察到的回答和提及。",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!questions.length || opening}
          onClick={() => setCreating(questions[0].id)}
        >
          <Plus size={14} />
          {t("Créer une action", "Create action", "创建行动")}
        </Button>
      </div>
      {error && (
        <div role="alert" className="alert error">
          <p>{friendly(error, t)}</p>
          <Button variant="ghost" onClick={() => setRefresh((n) => n + 1)}>
            {t("Recharger", "Reload", "重新加载")}
          </Button>
        </div>
      )}
      <div className="action-list-content">
        <Field label={t("État des actions", "Action status", "行动状态")}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t("Tous les états", "All statuses", "所有状态")}</option>
            {ACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {actionStatusLabel(status, t)}
              </option>
            ))}
          </select>
        </Field>
        {loading ? (
          <p role="status">{t("Chargement des actions…", "Loading actions…", "正在加载行动…")}</p>
        ) : !shown.length ? (
          <p className="muted">
            {t(
              "Aucune action dans cette vue. Partez d’une question mesurée ou d’une opportunité ci-dessous.",
              "No actions in this view. Start from a measured question or an opportunity below.",
              "此视图中没有行动。请从已测量的问题或下方机会开始。",
            )}
          </p>
        ) : (
          <ul className="action-list">
            {shown.map((action) => (
              <li key={action.id}>
                <div>
                  <span className="badge">{actionStatusLabel(action.status, t)}</span>
                  <h3>{action.title}</h3>
                  <p className="small muted">{action.query}</p>
                  <p className="small">
                    {action.owner && (
                      <span>
                        {t("Responsable", "Owner", "负责人")}: {action.owner} ·{" "}
                      </span>
                    )}
                    {action.due_date && (
                      <span>
                        {t("Échéance", "Due", "截止日期")}: {action.due_date} ·{" "}
                      </span>
                    )}
                    {action.evidence_count}{" "}
                    {t("preuves archivées", "archived answers", "条已存档回答")}
                  </p>
                  {action.target_url && (
                    <a
                      className="text-link"
                      href={action.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("Page concernée", "Target page", "目标页面")}
                    </a>
                  )}
                </div>
                <div className="action-buttons">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    onClick={() => open(action.id, "edit")}
                  >
                    <Pencil size={14} />
                    {t("Modifier l’action", "Edit action", "编辑行动")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={opening}
                    onClick={() => open(action.id, "evidence")}
                  >
                    <FileSearch size={14} />
                    {t("Preuves archivées", "Archived evidence", "存档证据")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">
          {t(
            "Les actions et leurs preuves suivent la durée de conservation configurée. Les notes sont votre rédaction ; une publication ne garantit pas un gain de visibilité.",
            "Actions and their evidence follow the configured retention period. Notes are your own writing; publication does not guarantee improved visibility.",
            "行动及其证据遵循配置的保留期限。备注由您撰写；发布内容不保证可见度提升。",
          )}
        </p>
      </div>
      {(editing || draft) && (
        <ActionDialog
          key={editing?.id ?? draft!}
          action={editing}
          projectId={project.id}
          detail={detail}
          queryId={draft}
          t={t}
          onClose={close}
          onSaved={() => {
            close();
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {evidence && (
        <Modal
          wide
          title={t("Preuves archivées de l’action", "Action’s archived evidence", "行动的存档证据")}
          onClose={() => setEvidence(null)}
        >
          <h3>{evidence.title}</h3>
          <p>{evidence.evidence.query}</p>
          <p className="small muted">
            {t("Collecte", "Collected", "收集时间")}: {date(evidence.evidence.campaignDate)} ·{" "}
            {t("Archivage", "Archived", "存档时间")}: {date(evidence.evidence.capturedAt)} ·{" "}
            {evidence.evidence.methodology}
          </p>
          <p className="small muted">
            {t("Périmètre à l’archivage", "Scope at archival", "存档时的范围")}:{" "}
            {evidence.evidence.scope === "current"
              ? t("Marques alors configurées", "Brands configured at that time", "当时配置的品牌")
              : t("Marques d’origine", "Original brands", "原始品牌")}{" "}
            · n={evidence.evidence.valid} · {evidence.evidence.failed}{" "}
            {t("échecs exclus", "excluded failures", "项失败已排除")} · {evidence.evidence.pending}{" "}
            {t("en attente à l’archivage", "pending at archival", "项在存档时待处理")}
          </p>
          <ul>
            {evidence.evidence.brands.map((brand) => (
              <li key={brand.id}>
                {brand.name}:{" "}
                {
                  new Set(
                    evidence.evidence.mentions
                      .filter((m) => m.brand_id === brand.id)
                      .map((m) => m.response_id),
                  ).size
                }
                /{evidence.evidence.valid}
              </li>
            ))}
          </ul>
          {evidence.evidence.responses.map((response) => (
            <details className="archived-answer" key={response.id}>
              <summary>
                {PROVIDER_LABELS[response.provider]} · {response.returned_model || response.model} ·
                #{response.sample} · {response.finished_at ? date(response.finished_at) : "—"}
              </summary>
              <GroundedAnswer
                response={response}
                citations={evidence.evidence.citations.filter((c) => c.response_id === response.id)}
                t={t}
              />
              {evidence.evidence.mentions
                .filter((m) => m.response_id === response.id)
                .map((m) => (
                  <blockquote key={m.brand_id}>
                    <strong>{m.brand_name}</strong>
                    <p>{m.excerpt}</p>
                  </blockquote>
                ))}
            </details>
          ))}
          <details className="methodology">
            <summary>
              {t("Paramètres et traçabilité", "Parameters & provenance", "参数与来源")}
            </summary>
            <pre>
              {JSON.stringify(
                {
                  campaignId: evidence.evidence.campaignId,
                  configHash: evidence.evidence.configHash,
                  system: evidence.evidence.system,
                  responses: evidence.evidence.responses.map((r) => ({
                    id: r.id,
                    channel: r.channel,
                    parameters: r.parameters,
                    requestedModel: r.model,
                    returnedModel: r.returned_model,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </details>
        </Modal>
      )}
    </section>
  );
}
function ActionDialog({
  action,
  projectId,
  detail,
  queryId,
  t,
  onClose,
  onSaved,
}: {
  action: GeoAction | null;
  projectId: string;
  detail: RunDetail | null;
  queryId: string | null;
  t: Translate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const questions =
    detail?.run.snapshot.queries.filter((q) =>
      detail.responses.some((r) => r.query_text === q.text && r.status === "succeeded"),
    ) ?? [];
  const [question, setQuestion] = useState(queryId ?? questions[0]?.id ?? "");
  const [requestId] = useState(() => crypto.randomUUID());
  const [value, setValue] = useState<ActionFields>({
    title: action?.title ?? questions.find((q) => q.id === question)?.text.slice(0, 200) ?? "",
    status: action?.status ?? "to_review",
    owner: action?.owner ?? "",
    dueDate: action?.due_date ?? null,
    targetUrl: action?.target_url ?? "",
    notes: action?.notes ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Modal
      title={
        action
          ? t("Modifier l’action GEO", "Edit GEO action", "编辑 GEO 行动")
          : t("Créer une action GEO", "Create GEO action", "创建 GEO 行动")
      }
      onClose={onClose}
    >
      {error && (
        <p className="alert error" role="alert">
          {friendly(error, t)}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (action)
              await api(`actions/${action.id}`, "POST", { ...value, version: action.version });
            else if (detail)
              await api(`projects/${projectId}/actions`, "POST", {
                ...value,
                runId: detail.run.id,
                queryId: question,
                scope: comparisonScope(detail),
                requestId,
              });
            else throw Error("action_evidence_required");
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!action && (
          <Field label={t("Question de référence", "Reference question", "参考问题")}>
            <select value={question} required onChange={(e) => setQuestion(e.target.value)}>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.text}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t("Titre de l’action", "Action title", "行动标题")}>
          <input
            required
            minLength={3}
            maxLength={200}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label={t("Statut de l’action", "Action status", "行动状态")}>
            <select
              value={value.status}
              onChange={(e) =>
                setValue({ ...value, status: e.target.value as ActionFields["status"] })
              }
            >
              {ACTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {actionStatusLabel(status, t)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t("Responsable", "Owner", "负责人")}
            hint={t(
              "Nom libre, sans envoi de notification.",
              "Free-text name; no notification is sent.",
              "自由填写姓名，不发送通知。",
            )}
          >
            <input
              maxLength={120}
              value={value.owner}
              onChange={(e) => setValue({ ...value, owner: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t("Échéance", "Due date", "截止日期")}>
          <input
            type="date"
            value={value.dueDate ?? ""}
            onChange={(e) => setValue({ ...value, dueDate: e.target.value || null })}
          />
        </Field>
        <Field label={t("URL de la page concernée", "Target page URL", "目标页面网址")}>
          <input
            type="url"
            maxLength={2048}
            value={value.targetUrl}
            onChange={(e) => setValue({ ...value, targetUrl: e.target.value })}
          />
        </Field>
        <Field label={t("Notes et hypothèses", "Notes and hypotheses", "备注和假设")}>
          <textarea
            rows={4}
            maxLength={5000}
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </Field>
        <p className="small muted">
          {t(
            "Les réponses valides de la question sont conservées comme preuves de départ. Aucun appel IA n’est lancé.",
            "Valid answers to the question are preserved as baseline evidence. No AI call is made.",
            "该问题的有效回答将作为初始证据保存，不会发起 AI 调用。",
          )}
        </p>
        <Button disabled={busy || (!action && !question)}>
          {t("Enregistrer l’action", "Save action", "保存行动")}
        </Button>
        {action && (
          <div className="action-delete">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmDelete(!confirmDelete)}
            >
              {t("Supprimer cette action", "Delete this action", "删除此行动")}
            </Button>
            {confirmDelete && (
              <>
                <p>
                  {t(
                    "Cette suppression retire aussi la copie des preuves de l’action. Les réponses de la campagne restent conservées selon leur durée habituelle.",
                    "This also deletes the action’s evidence copy. Campaign answers retain their usual retention policy.",
                    "删除将同时移除此行动的证据副本。测量回答仍遵循原有保留策略。",
                  )}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`actions/${action.id}`, "DELETE", { version: action.version });
                      onSaved();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("Confirmer la suppression", "Confirm deletion", "确认删除")}
                </Button>
              </>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
