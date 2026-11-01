import { z } from "zod";
import { PROVIDERS } from "./provider-config";
import { brandScopeSchema, comparisonBrands, type BrandScope } from "./brand-analysis";
import type { RunDetail } from "./types";

export const evidenceFilterSchema = z.object({
  brandId: z.union([z.literal(""), z.uuid()]).default(""),
  queryId: z.union([z.literal(""), z.uuid()]).default(""),
  provider: z.enum(["all", ...PROVIDERS]).default("all"),
  status: z.enum(["all", "succeeded", "failed", "pending"]).default("all"),
  search: z.string().max(200).default(""),
});
export type EvidenceFilters = z.infer<typeof evidenceFilterSchema>;
export const emptyEvidenceFilters: EvidenceFilters = {
  brandId: "",
  queryId: "",
  provider: "all",
  status: "all",
  search: "",
};
const targetSchema = z.object({
  projectId: z.uuid(),
  runId: z.uuid(),
  scope: brandScopeSchema,
  responseId: z.uuid().optional(),
  filters: evidenceFilterSchema,
});
export type EvidenceTarget = z.infer<typeof targetSchema>;
export function evidenceHash(target: EvidenceTarget) {
  const p = targetSchema.parse(target);
  const params = new URLSearchParams({ project: p.projectId, run: p.runId, scope: p.scope });
  if (p.responseId) params.set("response", p.responseId);
  for (const [key, value] of Object.entries(p.filters))
    if (value !== emptyEvidenceFilters[key as keyof EvidenceFilters]) params.set(key, value);
  return `#evidence?${params}`;
}
export function readEvidenceHash(hash: string): EvidenceTarget | null {
  if (!hash.startsWith("#evidence?")) return null;
  const p = new URLSearchParams(hash.slice(10));
  const result = targetSchema.safeParse({
    projectId: p.get("project"),
    runId: p.get("run"),
    scope: p.get("scope") ?? "original",
    responseId: p.get("response") ?? undefined,
    filters: Object.fromEntries(
      Object.keys(emptyEvidenceFilters).flatMap((key) => (p.has(key) ? [[key, p.get(key)]] : [])),
    ),
  });
  return result.success ? result.data : null;
}
export function evidenceRows(detail: RunDetail, filters: EvidenceFilters) {
  const question = filters.queryId
    ? detail.run.snapshot.queries.find((q) => q.id === filters.queryId)
    : null;
  if (filters.queryId && !question) return [];
  if (filters.brandId && !comparisonBrands(detail).some((b) => b.id === filters.brandId)) return [];
  const mentions = new Set(
    detail.mentions.filter((m) => m.brand_id === filters.brandId).map((m) => m.response_id),
  );
  return detail.responses.filter(
    (r) =>
      (!question || r.query_text === question.text) &&
      (!filters.brandId || (r.status === "succeeded" && mentions.has(r.id))) &&
      (filters.provider === "all" || r.provider === filters.provider) &&
      (filters.status === "all" ||
        (filters.status === "failed"
          ? ["failed", "invalid", "uncertain"].includes(r.status)
          : filters.status === "pending"
            ? ["queued", "running"].includes(r.status)
            : r.status === filters.status)) &&
      (!filters.search.trim() ||
        `${r.query_text} ${r.model} ${r.error_code ?? ""} ${r.answer ?? ""}`
          .toLocaleLowerCase()
          .includes(filters.search.trim().toLocaleLowerCase())),
  );
}
export function proofTarget(
  projectId: string,
  runId: string,
  scope: BrandScope,
  filters: Partial<EvidenceFilters> = {},
): EvidenceTarget {
  return { projectId, runId, scope, filters: { ...emptyEvidenceFilters, ...filters } };
}
