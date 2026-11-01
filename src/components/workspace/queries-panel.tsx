"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUpRight, Pencil } from "lucide-react";
import type { Project, RunDetail, User } from "@/lib/types";
import { comparisonBrands } from "@/lib/brand-analysis";
import {
  QUERY_INTENTS,
  QUERY_PRIORITIES,
  filterQueries,
  emptyQueryFilters,
  queryFilterSchema,
  type QueryFilters,
  type QueryMetadata,
  type QueryView,
} from "@/lib/query-organization";
import { accountStorageKey, readBrowserValue, saveBrowserValue } from "@/lib/browser-storage";
import { api, isAborted, Field, Modal, friendly, type Translate } from "./shared";
import { TableScroll } from "./table-scroll";
import { Button } from "../ui/button";

export function intentLabel(value: QueryMetadata["intent"], t: Translate) {
  const labels = {
    unspecified: ["Non précisée", "Unspecified", "未指定"],
    discovery: ["Découverte", "Discovery", "发现"],
    comparison: ["Comparaison", "Comparison", "比较"],
    purchase: ["Achat", "Purchase", "购买"],
    support: ["Assistance", "Support", "支持"],
  } as const;
  const [fr, en, zh] = labels[value];
  return t(fr, en, zh);
}
export function priorityLabel(value: QueryMetadata["priority"], t: Translate) {
  const labels = {
    low: ["Faible", "Low", "低"],
    normal: ["Normale", "Normal", "普通"],
    high: ["Haute", "High", "高"],
  } as const;
  const [fr, en, zh] = labels[value];
  return t(fr, en, zh);
}
export function QueriesPanel({
  project,
  user,
  detail,
  t,
  onAdd,
  onRefresh,
  onProofs,
  onDelete,
}: {
  project: Project;
  user: User;
  detail: RunDetail | null;
  t: Translate;
  onAdd: () => void;
  onRefresh: () => Promise<void>;
  onProofs: (queryId: string, brandId?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filters, setFilters] = useState<QueryFilters>(emptyQueryFilters);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [views, setViews] = useState<QueryView[]>([]);
  const [viewName, setViewName] = useState("");
  const [viewId, setViewId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = accountStorageKey("question-filters", user, project.id);
  useEffect(() => {
    setFilters(readBrowserValue(key, queryFilterSchema).value ?? emptyQueryFilters);
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready) saveBrowserValue(key, filters, queryFilterSchema);
  }, [key, filters, ready]);
  useEffect(() => {
    const c = new AbortController();
    api<QueryView[]>(`projects/${project.id}/query-views`, "GET", undefined, c.signal)
      .then(setViews)
      .catch((e) => {
        if (!isAborted(e)) setError(e.message);
      });
    return () => c.abort();
  }, [project.id]);
  const rows = filterQueries(project.queries, filters);
  const themes = [...new Set(project.queries.map((q) => q.theme ?? ""))].sort((a, b) =>
    a.localeCompare(b),
  );
  const groups = [...new Set(rows.map((q) => q.theme ?? ""))].sort((a, b) => a.localeCompare(b));
  const selectedIds = selected.filter((id) => project.queries.some((q) => q.id === id));
  const primary = detail && comparisonBrands(detail).find((b) => b.is_primary);
  const changeFilters = (next: QueryFilters) => {
    setFilters(next);
    setViewId("");
  };
  async function saveView() {
    setBusy(true);
    setError("");
    try {
      const view = await api<QueryView>(`projects/${project.id}/query-views`, "POST", {
        name: viewName,
        filters,
      });
      setViews((current) => [...current.filter((v) => v.id !== view.id), view]);
      setViewId(view.id);
      setViewName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card queries-panel">
      <div className="card-heading">
        <div>
          <h2>{t("Les questions de vos clients", "Your customers’ questions", "客户的问题")}</h2>
          <p>
            {project.queries.length}/50{" "}
            {t("requêtes configurées", "configured queries", "个已配置问题")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus size={14} />
          {t("Ajouter", "Add", "添加")}
        </Button>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {friendly(error, t)}
        </p>
      )}
      <div className="query-organization">
        <div className="query-filters">
          <Field label={t("Rechercher une question", "Search questions", "搜索问题")}>
            <input
              type="search"
              maxLength={200}
              value={filters.search}
              onChange={(e) => changeFilters({ ...filters, search: e.target.value })}
            />
          </Field>
          <Field label={t("Thème", "Theme", "主题")}>
            <select
              value={JSON.stringify(filters.theme)}
              onChange={(e) =>
                changeFilters({ ...filters, theme: JSON.parse(e.target.value) as string | null })
              }
            >
              <option value="null">{t("Tous les thèmes", "All themes", "所有主题")}</option>
              {themes.map((theme) => (
                <option key={theme} value={JSON.stringify(theme)}>
                  {theme || t("Sans thème", "No theme", "无主题")}
                </option>
              ))}
              {filters.theme !== null && !themes.includes(filters.theme) && (
                <option value={JSON.stringify(filters.theme)}>
                  {filters.theme || t("Sans thème", "No theme", "无主题")}
                </option>
              )}
            </select>
          </Field>
          <Field label={t("Intention", "Intent", "意图")}>
            <select
              value={filters.intent ?? ""}
              onChange={(e) =>
                changeFilters({
                  ...filters,
                  intent: (e.target.value as QueryFilters["intent"]) || null,
                })
              }
            >
              <option value="">{t("Toutes les intentions", "All intents", "所有意图")}</option>
              {QUERY_INTENTS.map((intent) => (
                <option key={intent} value={intent}>
                  {intentLabel(intent, t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Priorité", "Priority", "优先级")}>
            <select
              value={filters.priority ?? ""}
              onChange={(e) =>
                changeFilters({
                  ...filters,
                  priority: (e.target.value as QueryFilters["priority"]) || null,
                })
              }
            >
              <option value="">{t("Toutes les priorités", "All priorities", "所有优先级")}</option>
              {QUERY_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority, t)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="saved-views">
          <Field label={t("Vues enregistrées", "Saved views", "保存的视图")}>
            <select
              value={viewId}
              onChange={(e) => {
                setViewId(e.target.value);
                const v = views.find((v) => v.id === e.target.value);
                if (v) setFilters(v.filters);
              }}
            >
              <option value="">{t("Vue personnalisée", "Custom view", "自定义视图")}</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveView();
            }}
            className="view-save-form"
          >
            <Field label={t("Nom de la vue", "View name", "视图名称")}>
              <input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <Button size="sm" variant="outline" disabled={busy || !viewName.trim()}>
              {t("Enregistrer la vue", "Save view", "保存视图")}
            </Button>
          </form>
          {viewId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`query-views/${viewId}`, "DELETE");
                  setViews((vs) => vs.filter((v) => v.id !== viewId));
                  setViewId("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Retirer cette vue", "Remove this view", "删除此视图")}
            </Button>
          )}
        </div>
        <div className="query-bulk-bar">
          <label className="touch-check">
            <input
              type="checkbox"
              checked={!!rows.length && rows.every((q) => selectedIds.includes(q.id))}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...new Set([...selectedIds, ...rows.map((q) => q.id)])]
                    : selectedIds.filter((id) => !rows.some((q) => q.id === id)),
                )
              }
            />
            {t(
              "Sélectionner les questions affichées",
              "Select displayed questions",
              "选择显示的问题",
            )}
          </label>
          <span className="small muted">
            {rows.length}/{project.queries.length} · {selectedIds.length}{" "}
            {t("sélectionnées", "selected", "已选择")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedIds.length}
            onClick={() => setEditing(selectedIds)}
          >
            {t("Organiser la sélection", "Organize selection", "整理所选问题")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => changeFilters(emptyQueryFilters)}>
            {t("Effacer les filtres", "Clear filters", "清除筛选条件")}
          </Button>
        </div>
      </div>
      {!rows.length && (
        <p className="card-note">
          {t(
            "Aucune question ne correspond à ces filtres.",
            "No questions match these filters.",
            "没有符合筛选条件的问题。",
          )}
        </p>
      )}
      {groups.map((theme) => (
        <section key={theme} className="query-group">
          <h3>
            {theme || t("Sans thème", "No theme", "无主题")}{" "}
            <span className="badge">{rows.filter((q) => (q.theme ?? "") === theme).length}</span>
          </h3>
          <TableScroll
            label={`${t("Questions du thème", "Questions in theme", "主题中的问题")} ${theme || t("Sans thème", "No theme", "无主题")}`}
            t={t}
          >
            <table className="stacked-table">
              <thead>
                <tr>
                  <th>{t("Question", "Question", "问题")}</th>
                  <th>{t("Organisation", "Organization", "分类")}</th>
                  <th>{t("Échantillon valide", "Valid sample", "有效样本")}</th>
                  <th>{t("Présence de la marque", "Brand presence", "品牌出现")}</th>
                  <th>
                    <span className="sr-only">{t("Actions", "Actions", "操作")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((q) => (q.theme ?? "") === theme)
                  .map((q) => {
                    const measured = detail?.run.snapshot.queries.find((s) => s.text === q.text);
                    const valid =
                      detail?.responses.filter(
                        (r) => r.query_text === q.text && r.status === "succeeded",
                      ) ?? [];
                    const ids = new Set(valid.map((r) => r.id));
                    const n = new Set(
                      detail?.mentions
                        .filter((m) => ids.has(m.response_id) && m.brand_id === primary?.id)
                        .map((m) => m.response_id),
                    ).size;
                    return (
                      <tr key={q.id}>
                        <td className="question-cell stacked-title">
                          <label className="touch-check">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(q.id)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selectedIds, q.id]
                                    : selectedIds.filter((id) => id !== q.id),
                                )
                              }
                            />
                            {q.text}
                          </label>
                        </td>
                        <td data-label={t("Organisation", "Organization", "分类")}>
                          <span className="badge">{intentLabel(q.intent ?? "unspecified", t)}</span>
                          <span className="badge">{priorityLabel(q.priority ?? "normal", t)}</span>
                        </td>
                        <td data-label={t("Échantillon valide", "Valid sample", "有效样本")}>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!measured}
                            onClick={() => measured && onProofs(measured.id)}
                          >
                            {valid.length}{" "}
                            {t(
                              valid.length === 1 ? "preuve" : "preuves",
                              valid.length === 1 ? "answer" : "answers",
                              "条回答",
                            )}
                            <ArrowUpRight size={14} />
                          </Button>
                        </td>
                        <td data-label={t("Présence de la marque", "Brand presence", "品牌出现")}>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!measured || !primary || !valid.length}
                            onClick={() => measured && primary && onProofs(measured.id, primary.id)}
                          >
                            {valid.length ? `${n} / ${valid.length}` : "—"}
                            <ArrowUpRight size={14} />
                          </Button>
                        </td>
                        <td className="stacked-actions">
                          <Button variant="ghost" size="sm" onClick={() => setEditing([q.id])}>
                            <Pencil size={14} />
                            {t("Organiser", "Organize", "整理")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("Retirer la requête", "Remove query", "删除问题")}
                            onClick={() => onDelete(q.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ))}
      <p className="card-note">
        {t(
          "Les thèmes, intentions et priorités organisent votre travail. Ils ne modifient ni les questions envoyées ni les indicateurs des campagnes passées. Les preuves affichées concernent la campagne sélectionnée.",
          "Themes, intents and priorities organize your work. They do not change submitted questions or past campaign metrics. Evidence refers to the selected campaign.",
          "主题、意图和优先级仅用于整理工作，不会更改已发送的问题或历史指标。显示的证据来自所选测量。",
        )}
      </p>
      {editing && (
        <QueryOrganizationDialog
          project={project}
          ids={editing}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await onRefresh();
            setSelected([]);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
function QueryOrganizationDialog({
  project,
  ids,
  t,
  onClose,
  onSaved,
}: {
  project: Project;
  ids: string[];
  t: Translate;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const first = project.queries.find((q) => q.id === ids[0]);
  const [revision] = useState(project.revision);
  const [patch, setPatch] = useState<QueryMetadata>({
    theme: first?.theme ?? "",
    intent: first?.intent ?? "unspecified",
    priority: first?.priority ?? "normal",
  });
  const [enabled, setEnabled] = useState({
    theme: ids.length === 1,
    intent: ids.length === 1,
    priority: ids.length === 1,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t("Organiser les questions", "Organize questions", "整理问题")} onClose={onClose}>
      <p>
        {t(
          `${ids.length} question(s) sélectionnée(s). Seuls les champs cochés seront modifiés.`,
          `${ids.length} selected question(s). Only checked fields will change.`,
          `已选择 ${ids.length} 个问题。仅更改勾选的字段。`,
        )}
      </p>
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
            await api(`projects/${project.id}/query-organization`, "POST", {
              ids,
              revision,
              patch: Object.fromEntries(
                Object.entries(patch).filter(([key]) => enabled[key as keyof QueryMetadata]),
              ),
            });
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="touch-check">
          <input
            type="checkbox"
            checked={enabled.theme}
            onChange={(e) => setEnabled({ ...enabled, theme: e.target.checked })}
          />
          {t("Modifier le thème", "Change theme", "更改主题")}
        </label>
        <Field
          label={t("Thème à appliquer", "Theme to apply", "要应用的主题")}
          hint={t(
            "Un champ vide retire le thème.",
            "An empty field clears the theme.",
            "留空可移除主题。",
          )}
        >
          <input
            disabled={!enabled.theme}
            maxLength={80}
            value={patch.theme}
            onChange={(e) => setPatch({ ...patch, theme: e.target.value })}
            list="query-themes"
          />
        </Field>
        <datalist id="query-themes">
          {[...new Set(project.queries.map((q) => q.theme).filter(Boolean))].map((theme) => (
            <option key={theme} value={theme} />
          ))}
        </datalist>
        <label className="touch-check">
          <input
            type="checkbox"
            checked={enabled.intent}
            onChange={(e) => setEnabled({ ...enabled, intent: e.target.checked })}
          />
          {t("Modifier l’intention", "Change intent", "更改意图")}
        </label>
        <Field label={t("Intention à appliquer", "Intent to apply", "要应用的意图")}>
          <select
            disabled={!enabled.intent}
            value={patch.intent}
            onChange={(e) =>
              setPatch({ ...patch, intent: e.target.value as QueryMetadata["intent"] })
            }
          >
            {QUERY_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {intentLabel(intent, t)}
              </option>
            ))}
          </select>
        </Field>
        <label className="touch-check">
          <input
            type="checkbox"
            checked={enabled.priority}
            onChange={(e) => setEnabled({ ...enabled, priority: e.target.checked })}
          />
          {t("Modifier la priorité", "Change priority", "更改优先级")}
        </label>
        <Field label={t("Priorité à appliquer", "Priority to apply", "要应用的优先级")}>
          <select
            disabled={!enabled.priority}
            value={patch.priority}
            onChange={(e) =>
              setPatch({ ...patch, priority: e.target.value as QueryMetadata["priority"] })
            }
          >
            {QUERY_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel(priority, t)}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={busy || !Object.values(enabled).some(Boolean)}>
          {t("Enregistrer l’organisation", "Save organization", "保存分类")}
        </Button>
      </form>
    </Modal>
  );
}
