"use client";
import { comparisonBrands } from "@/lib/brand-analysis";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { CampaignTimeline } from "./campaign-timeline";
import { evidenceRows, emptyEvidenceFilters } from "@/lib/evidence-navigation";
import { motion } from "motion/react";
import { useMotionPreferences } from "../ui/motion";
import type { Run, RunDetail } from "@/lib/types";
import { Empty, Field, type Translate } from "./shared";
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
export function Comparison({
  detail,
  t,
  onProofs,
}: {
  detail: RunDetail | null;
  t: Translate;
  onProofs: (brandId: string) => void;
}) {
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
          const n = evidenceRows(detail, { ...emptyEvidenceFilters, brandId: b.id }).length,
            p = (n / detail.run.valid) * 100;
          return (
            <div key={b.id} className="comparison-row">
              <div>
                <Button
                  className="comparison-proof"
                  variant="ghost"
                  size="sm"
                  onClick={() => onProofs(b.id)}
                >
                  <strong>{b.name}</strong>
                  <ArrowUpRight size={14} />
                </Button>
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
export function HistoryChart(props: {
  runs: Run[];
  detail: RunDetail | null;
  t: Translate;
  date: (s: string) => string;
}) {
  return <CampaignTimeline {...props} compact />;
}
