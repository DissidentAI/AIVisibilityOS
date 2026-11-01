"use client";
import { comparisonBrands, type BrandScope } from "@/lib/brand-analysis";
import type { RunDetail } from "@/lib/types";
import { Field, type Translate } from "./shared";

export function BrandScopeControl({
  scope,
  onChange,
  detail,
  t,
}: {
  scope: BrandScope;
  onChange: (scope: BrandScope) => void;
  detail: RunDetail | null;
  t: Translate;
}) {
  return (
    <section
      className="brand-scope-panel"
      aria-label={t("Périmètre de comparaison", "Comparison scope", "比较范围")}
    >
      <Field label={t("Marques à comparer", "Brands to compare", "要比较的品牌")}>
        <select value={scope} onChange={(e) => onChange(e.target.value as BrandScope)}>
          <option value="current">
            {t("Concurrents actuels", "Current competitors", "当前竞争对手")}
          </option>
          <option value="original">{t("Marques d’origine", "Original brands", "原始品牌")}</option>
        </select>
      </Field>
      <div>
        <span className="badge green">
          {t("0 appel IA supplémentaire", "0 additional AI calls", "无需额外 AI 调用")}
        </span>
        <p className="small muted" role="status">
          {scope === "current"
            ? t(
                "Les noms et domaines actuels sont recherchés dans les réponses déjà collectées. Les textes, dates, coûts et résultats d’origine restent conservés.",
                "Current names and domains are checked against previously collected answers. Original text, dates, costs and results are preserved.",
                "在已收集的回答中查找当前名称和域名。原文、日期、费用及原始结果保持不变。",
              )
            : t(
                "Cette vue retrouve les marques et les mentions enregistrées lors de la collecte, même si vous les avez modifiées ou retirées depuis.",
                "This view shows the brands and mentions saved during collection, even if you have since edited or removed them.",
                "此视图显示采集时保存的品牌和提及，即使之后已修改或移除品牌。",
              )}
          {detail &&
            ` ${comparisonBrands(detail).length} ${t("marques", "brands", "个品牌")} · n = ${detail.run.valid}.`}
        </p>
      </div>
    </section>
  );
}
