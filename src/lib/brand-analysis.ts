import { z } from "zod";
import { createMentionDetector, METHODOLOGY, type Brand } from "./measurement";
import { snapshotJson } from "./snapshot-json";
import type { Mention, ResponseRecord, Run, RunDetail } from "./types";

export const brandScopeSchema = z.enum(["original", "current"]);
export type BrandScope = z.infer<typeof brandScopeSchema>;

export function comparisonBrands(detail: RunDetail) {
  return detail.brandAnalysis?.brands ?? detail.run.snapshot.brands;
}
export function comparisonScope(detail: RunDetail): BrandScope {
  return detail.brandAnalysis?.scope ?? "original";
}
export function brandSetSignature(brands: Brand[]) {
  return snapshotJson(
    brands
      .map(({ id, name, domain, is_primary }) => ({ id, name, domain, is_primary: !!is_primary }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/** Only the tracked brand set may differ. Prompts, questions, models and sampling must match. */
export function sameMeasurementConfiguration(a: Run, b: Run, scope: BrandScope) {
  return (
    a.project_id === b.project_id &&
    (scope === "original"
      ? a.config_hash === b.config_hash
      : snapshotJson({ ...a.snapshot, brands: [] }) === snapshotJson({ ...b.snapshot, brands: [] }))
  );
}
export function sameBrandAnalysis(a: RunDetail, b: RunDetail) {
  return (
    comparisonScope(a) === comparisonScope(b) &&
    (a.brandAnalysis?.methodology ?? a.run.snapshot.methodology) ===
      (b.brandAnalysis?.methodology ?? b.run.snapshot.methodology) &&
    brandSetSignature(comparisonBrands(a)) === brandSetSignature(comparisonBrands(b))
  );
}

/** A read-only interpretation of saved text. Never enqueue work or overwrite historical evidence. */
export function analyzeStoredBrands(
  detail: RunDetail,
  brands: Brand[],
  brandSetHash: string,
  evaluatedAt = new Date().toISOString(),
): RunDetail {
  const detect = createMentionDetector(brands);
  const mentionsFor = (rows: ResponseRecord[]): Mention[] =>
    rows.flatMap((r) =>
      r.status === "succeeded" && r.answer
        ? detect(r.answer).map((m) => ({
            response_id: r.id,
            brand_id: m.brandId,
            brand_name: m.brandName,
            excerpt: m.excerpt,
            matched_alias: m.matchedAlias,
            sentiment: m.sentiment,
          }))
        : [],
    );
  return {
    ...detail,
    mentions: mentionsFor(detail.responses),
    previousMentions: mentionsFor(detail.previousAttempts ?? []),
    brandAnalysis: {
      scope: "current",
      methodology: METHODOLOGY,
      evaluatedAt,
      brandSetHash,
      brands: brands.map((b) => ({ ...b })),
    },
  };
}
