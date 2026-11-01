"use client";
import {
  comparisonBrands,
  comparisonScope,
  sameBrandAnalysis,
  sameMeasurementConfiguration,
} from "@/lib/brand-analysis";
import { useEffect, useState, type ReactNode } from "react";
import { Activity } from "lucide-react";
import { motion } from "motion/react";
import { useMotionPreferences } from "../ui/motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { comparisonSignature, mentionRate } from "@/lib/measurement";
import type { Run, RunDetail } from "@/lib/types";
import { api, Empty, Field, isAborted, type Translate } from "./shared";
import { Button } from "../ui/button";
export function Metric({
  label,
  value,
  sub,
  note,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  note: string;
  icon: ReactNode;
}) {
  const { reduced } = useMotionPreferences();
  return (
    <div className="metric card">
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <motion.div
        className="metric-value"
        key={value}
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {value}
      </motion.div>
      <p>{sub}</p>
      <small>{note}</small>
    </div>
  );
}
export function Comparison({ detail, t }: { detail: RunDetail | null; t: Translate }) {
  const { reduced } = useMotionPreferences();
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(""), [detail?.run.id]);
  if (!detail || !detail.run.valid)
    return (
      <Empty title={t("Pas encore de comparaison", "No comparison yet")}>
        {t(
          "Les marques seront comparées sur le même ensemble de réponses valides.",
          "Brands will be compared using the same set of valid responses.",
        )}
      </Empty>
    );
  const brands = [...comparisonBrands(detail)].sort(
    (a, b) => Number(!!b.is_primary) - Number(!!a.is_primary),
  );
  const matching = brands.filter((b) =>
    `${b.name} ${b.domain}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className="comparison">
      {brands.length > 10 && (
        <Field
          label={t(
            "Rechercher une marque dans la comparaison",
            "Search brands in this comparison",
            "在比较中搜索品牌",
          )}
        >
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      )}
      {brands.length > 10 && (
        <p className="small muted" role="status">
          {matching.length}/{brands.length} {t("marques affichées", "brands shown", "个品牌已显示")}
        </p>
      )}
      <div
        className={
          brands.length > 10 ? "comparison-list comparison-list-scroll" : "comparison-list"
        }
        tabIndex={brands.length > 10 ? 0 : undefined}
        role="region"
        aria-label={t("Comparaison des marques", "Brand comparison", "品牌比较")}
      >
        {matching.map((b) => {
          const n = new Set(
              detail.mentions.filter((m) => m.brand_id === b.id).map((m) => m.response_id),
            ).size,
            p = (n / detail.run.valid) * 100;
          return (
            <div key={b.id} className="comparison-row">
              <div>
                <strong>{b.name}</strong>
                {b.is_primary && <span className="you">{t("VOUS", "YOU")}</span>}
                <span className="grow" />
                <span>
                  {n} / {detail.run.valid}
                  <b>{p.toFixed(1)}%</b>
                </span>
              </div>
              <div className="bar-track">
                <motion.div
                  className={b.is_primary ? "bar-primary" : "bar-competitor"}
                  initial={reduced ? false : { width: "0%" }}
                  animate={{ width: `${p}%` }}
                  transition={{ duration: reduced ? 0 : 0.85 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {!matching.length && (
        <p className="small muted">
          {t(
            "Aucune marque ne correspond à cette recherche.",
            "No brands match this search.",
            "没有符合搜索条件的品牌。",
          )}
        </p>
      )}
      <p className="small muted">
        n = {detail.run.valid} ·{" "}
        {t(
          "Une réponse peut mentionner plusieurs marques.",
          "One response can mention several brands.",
        )}
      </p>
    </div>
  );
}
export function HistoryChart({
  runs,
  detail,
  t,
  date,
}: {
  runs: Run[];
  detail: RunDetail | null;
  t: Translate;
  date: (s: string) => string;
}) {
  const { reduced } = useMotionPreferences();
  const [points, setPoints] = useState<{ date: string; rate: number | null; n: number }[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setFailed(false);
    const matches = runs
      .filter(
        (r) =>
          detail &&
          sameMeasurementConfiguration(r, detail.run, comparisonScope(detail)) &&
          r.pending === 0 &&
          r.valid === r.total,
      )
      .slice(0, 20)
      .reverse();
    Promise.all(
      matches.map(async (r) => {
        const d = await api<RunDetail>(
            `runs/${r.id}?brandScope=${detail ? comparisonScope(detail) : "original"}`,
            "GET",
            undefined,
            controller.signal,
          ),
          b = comparisonBrands(d).find((b) => b.is_primary),
          n = new Set(d.mentions.filter((m) => m.brand_id === b?.id).map((m) => m.response_id))
            .size;
        return {
          date: r.created_at,
          rate: mentionRate(n, d.run.valid).rate,
          n: d.run.valid,
          signature: comparisonSignature(d.responses),
          sameAnalysis: !!detail && sameBrandAnalysis(d, detail),
        };
      }),
    )
      .then((p) => {
        if (!cancelled)
          setPoints((previous) => {
            const next = p
              .filter(
                (point) =>
                  point.sameAnalysis &&
                  point.signature !== null &&
                  point.signature === comparisonSignature(detail?.responses ?? []),
              )
              .map(({ date, rate, n }) => ({ date, rate, n }));
            // Preserve chart data identity when polling returns the same measurements.
            return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
          });
      })
      .catch((e) => {
        if (!cancelled && !isAborted(e)) {
          setPoints([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runs, detail, retry]);
  if (failed)
    return (
      <div className="empty" role="status">
        <p>
          {t(
            "Le graphique n’a pas pu être chargé.",
            "The chart could not be loaded.",
            "无法加载图表。",
          )}
        </p>
        <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
          {t("Réessayer", "Try again", "重试")}
        </Button>
      </div>
    );
  if (!points.length)
    return (
      <Empty
        icon={<Activity size={24} />}
        title={t("Aucune campagne comparable", "No comparable campaigns yet")}
      >
        {t(
          "L’évolution nécessite des campagnes entièrement valides et des identifiants de modèles retournés identiques.",
          "History requires fully valid campaigns with identical returned model identifiers.",
        )}
      </Empty>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={points} margin={{ top: 15, right: 20, left: -15, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => new Date(d).toLocaleDateString()}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(v) => date(String(v))}
            formatter={(v, _n, p) => [
              `${Number(v).toFixed(1)}% · n=${p.payload.n}`,
              t("Mentions", "Mentions"),
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
            dot={{ r: 4, fill: "var(--accent)" }}
            connectNulls={false}
            isAnimationActive={!reduced}
            animationDuration={800}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="small muted chart-note">
        {t(
          "20 dernières campagnes comparables au maximum. Aucune tendance certaine déduite d’un point isolé.",
          "Up to 20 comparable campaigns. An isolated point does not establish a trend.",
        )}
      </p>
    </div>
  );
}
