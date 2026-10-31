"use client";
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
import { api, Empty, type Translate } from "./shared";
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
  if (!detail || !detail.run.valid)
    return (
      <Empty title={t("Pas encore de comparaison", "No comparison yet")}>
        {t(
          "Les marques seront comparées sur le même ensemble de réponses valides.",
          "Brands will be compared using the same set of valid responses.",
        )}
      </Empty>
    );
  return (
    <div className="comparison">
      {detail.run.snapshot.brands.map((b) => {
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
  useEffect(() => {
    let cancelled = false;
    const matches = runs
      .filter(
        (r) => r.config_hash === detail?.run.config_hash && r.pending === 0 && r.valid === r.total,
      )
      .slice(0, 20)
      .reverse();
    Promise.all(
      matches.map(async (r) => {
        const d = await api<RunDetail>(`runs/${r.id}`),
          b = d.run.snapshot.brands.find((b) => b.is_primary),
          n = new Set(d.mentions.filter((m) => m.brand_id === b?.id).map((m) => m.response_id))
            .size;
        return {
          date: r.created_at,
          rate: mentionRate(n, d.run.valid).rate,
          n: d.run.valid,
          signature: comparisonSignature(d.responses),
        };
      }),
    )
      .then((p) => {
        if (!cancelled)
          setPoints((previous) => {
            const next = p
              .filter(
                (point) =>
                  point.signature !== null &&
                  point.signature === comparisonSignature(detail?.responses ?? []),
              )
              .map(({ date, rate, n }) => ({ date, rate, n }));
            // Preserve chart data identity when polling returns the same measurements.
            return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
          });
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [runs, detail]);
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
