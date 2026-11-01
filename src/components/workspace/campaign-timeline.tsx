"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { comparisonScope } from "@/lib/brand-analysis";
import type { CampaignHistory, HistoryReason } from "@/lib/history-comparison";
import type { Run, RunDetail } from "@/lib/types";
import { api, isAborted, Empty, friendly, type Translate } from "./shared";
import { Button } from "../ui/button";
import { useMotionPreferences } from "../ui/motion";

export function historyReasonLabel(reason: HistoryReason, t: Translate) {
  const labels: Record<HistoryReason, [string, string, string]> = {
    incomplete: [
      "Campagne partielle ou sans réponse valide",
      "Partial campaign or no valid answers",
      "测量未完成或无有效回答",
    ],
    retried: [
      "Reprises effectuées à des dates différentes",
      "Retries collected at different times",
      "重试在不同时间收集",
    ],
    missing_model: [
      "Modèle retourné non communiqué",
      "Returned model not reported",
      "未提供实际模型",
    ],
    unknown_route: [
      "Fournisseur d’exécution OpenRouter inconnu",
      "Unknown OpenRouter serving provider",
      "OpenRouter 实际供应商未知",
    ],
    questions: ["Questions différentes", "Different questions", "问题不同"],
    models: [
      "Modèles ou fournisseurs demandés différents",
      "Different requested models or providers",
      "请求的模型或供应商不同",
    ],
    mode: ["Mode de recherche web différent", "Different web search mode", "网络搜索模式不同"],
    samples: ["Nombre d’échantillons différent", "Different sample count", "样本数量不同"],
    locale: [
      "Langue ou pays de contexte différent",
      "Different language or country context",
      "语言或国家上下文不同",
    ],
    brands: ["Marques d’origine différentes", "Different original brands", "原始品牌不同"],
    configuration: [
      "Autres paramètres de collecte différents",
      "Other collection parameters differ",
      "其他收集参数不同",
    ],
    returned_models: [
      "Modèles retournés ou routage différents",
      "Different returned models or routing",
      "实际模型或路由不同",
    ],
    reference_ineligible: [
      "La campagne de référence ne permet pas une comparaison",
      "The reference campaign is not eligible for comparison",
      "参考测量不符合比较条件",
    ],
  };
  return t(...labels[reason]);
}
export function CampaignTimeline({
  detail,
  runs,
  t,
  date,
  onRun,
  compact = false,
}: {
  detail: RunDetail | null;
  runs: Run[];
  t: Translate;
  date: (s: string) => string;
  onRun?: (id: string) => void;
  compact?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<CampaignHistory | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { reduced } = useMotionPreferences();
  const id = detail?.run.id,
    projectId = detail?.run.project_id;
  const scope = detail ? comparisonScope(detail) : "original";
  const revision = JSON.stringify(
    runs.map((r) => [r.id, r.last_activity_at, r.valid, r.pending, r.failed]),
  );
  useEffect(() => setOffset(0), [id, scope]);
  useEffect(() => {
    setData(null);
    setError("");
    if (!id || !projectId) return;
    const controller = new AbortController();
    api<CampaignHistory>(
      `projects/${projectId}/history?reference=${id}&scope=${scope}&offset=${offset}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!isAborted(e)) setError(e.message);
      });
    return () => controller.abort();
  }, [id, projectId, scope, offset, retry, revision, detail?.brandAnalysis?.brandSetHash]);
  if (!detail)
    return compact ? (
      <Empty
        title={t("Aucune campagne comparable", "No comparable campaigns yet", "尚无可比较的测量")}
      >
        {t(
          "Lancez une première campagne pour consulter son historique.",
          "Run a first campaign to view its history.",
          "运行首次测量以查看历史记录。",
        )}
      </Empty>
    ) : null;
  const points = (data?.entries ?? [])
    .filter((e) => e.reasons.length === 0)
    .slice()
    .reverse();
  return (
    <section
      className={compact ? "campaign-timeline" : "card campaign-timeline"}
      aria-label={t("Comparabilité des campagnes", "Campaign comparability", "测量可比性")}
    >
      {!compact && (
        <div className="card-heading">
          <div>
            <h2>{t("Comprendre l’évolution", "Understand changes", "理解变化")}</h2>
            <p>
              {t(
                "La campagne affichée sert de référence. Chaque exclusion est expliquée.",
                "The selected campaign is the reference. Every exclusion is explained.",
                "以当前测量为参考，并解释每项排除原因。",
              )}
            </p>
          </div>
        </div>
      )}
      {error ? (
        <div className="alert error" role="alert">
          <p>{friendly(error, t)}</p>
          <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
            {t("Réessayer", "Try again", "重试")}
          </Button>
        </div>
      ) : !data ? (
        <p role="status" className="muted">
          {t("Chargement de l’historique…", "Loading history…", "正在加载历史记录…")}
        </p>
      ) : (
        <>
          {data.referenceReasons.length > 0 && (
            <div className="alert">
              <strong>
                {t("Référence non comparable", "Reference not comparable", "参考测量不可比较")}
              </strong>
              <ul>
                {data.referenceReasons.map((reason) => (
                  <li key={reason}>{historyReasonLabel(reason, t)}</li>
                ))}
              </ul>
              <p>
                {t(
                  "Les réponses restent consultables. Choisissez une campagne complète sans reprise pour tracer une évolution comparable.",
                  "The answers remain available. Select a complete campaign without retries to chart comparable changes.",
                  "回答仍可查看。请选择完整且未经重试的测量来绘制可比变化。",
                )}
              </p>
            </div>
          )}
          {points.length > 0 ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={points} margin={{ top: 15, right: 20, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="createdAt"
                    tickFormatter={(value) => date(String(value))}
                    tick={{ fontSize: 10, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={(value) => date(String(value))}
                    formatter={(value, _name, props) => [
                      `${Number(value).toFixed(1)}% · ${props.payload.mentioned}/${props.payload.valid}`,
                      t("Mentions", "Mentions", "提及"),
                    ]}
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Line
                    dataKey="rate"
                    type="linear"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={!reduced}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted">
              {t(
                "Aucune campagne comparable sur cette page.",
                "No comparable campaign on this page.",
                "本页无可比较的测量。",
              )}
            </p>
          )}
          <p className="small muted" role="status">
            {t(
              `${points.length} campagne(s) comparable(s) sur les ${data.entries.length} examinées ici.`,
              `${points.length} comparable campaign(s) out of ${data.entries.length} examined here.`,
              `本页检查的 ${data.entries.length} 次测量中有 ${points.length} 次可比较。`,
            )}{" "}
            {t(
              "Un point isolé ne démontre pas une tendance.",
              "A single point does not establish a trend.",
              "单个数据点不能证明趋势。",
            )}
          </p>
          <details className="timeline-details" open={!compact}>
            <summary>
              {t(
                "Campagnes incluses et exclues",
                "Included and excluded campaigns",
                "纳入和排除的测量",
              )}
            </summary>
            <ul className="timeline-list">
              {data.entries.map((entry) => (
                <li key={entry.id} className="timeline-entry">
                  <div>
                    <strong>{date(entry.createdAt)}</strong>{" "}
                    {entry.id === data.referenceId && (
                      <span className="badge">{t("Référence", "Reference", "参考")}</span>
                    )}
                    <small className="block muted">
                      {Object.values(entry.models).join(" · ")} ·{" "}
                      {entry.web
                        ? t("Avec recherche web", "With web search", "含网络搜索")
                        : t("Sans recherche web", "Without web search", "不含网络搜索")}
                    </small>
                  </div>
                  <div className="timeline-sample">
                    <strong>{entry.rate == null ? "—" : `${entry.rate.toFixed(1)}%`}</strong>
                    <small>
                      {entry.mentioned}/{entry.valid}{" "}
                      {t("réponses valides", "valid answers", "有效回答")} · {entry.failed}{" "}
                      {t("échecs", "failures", "失败")} · {entry.pending}{" "}
                      {t("en attente", "pending", "待处理")}
                    </small>
                  </div>
                  {entry.reasons.length ? (
                    <ul className="timeline-reasons">
                      {entry.reasons.map((reason) => (
                        <li key={reason}>{historyReasonLabel(reason, t)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="badge green">{t("Comparable", "Comparable", "可比较")}</span>
                  )}
                  {onRun && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={entry.id === detail.run.id}
                      onClick={() => onRun(entry.id)}
                    >
                      {t("Afficher cette campagne", "View this campaign", "查看此测量")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <nav
            className="history-pagination"
            aria-label={t("Pages de campagnes", "Campaign pages", "测量分页")}
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - data.limit))}
            >
              <ChevronLeft size={16} />
              {t("Précédent", "Previous", "上一页")}
            </Button>
            <span className="small muted">
              {data.entries.length ? offset + 1 : 0}–{offset + data.entries.length} / {data.total}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={offset + data.limit >= data.total}
              onClick={() => setOffset(offset + data.limit)}
            >
              {t("Suivant", "Next", "下一页")}
              <ChevronRight size={16} />
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
