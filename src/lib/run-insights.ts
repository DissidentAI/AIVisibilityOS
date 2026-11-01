import type { ResponseRecord, RunDetail } from "./types";
import { comparisonBrands } from "./brand-analysis";
export function allAttempts(detail: RunDetail) {
  return [...detail.responses, ...(detail.previousAttempts ?? [])];
}

export const failedStatuses = ["failed", "invalid", "uncertain"];
export function canRetry(response: ResponseRecord) {
  return failedStatuses.includes(response.status) && !response.retry_run_id;
}
export function costSummary(responses: ResponseRecord[]) {
  const known = responses.filter((r) => r.cost_micros !== null);
  return {
    total: known.length ? known.reduce((sum, r) => sum + r.cost_micros!, 0) : null,
    known: known.length,
    unknown: responses.filter(
      (r) => r.cost_micros === null && !["queued", "running"].includes(r.status),
    ).length,
    pending: responses.filter((r) => ["queued", "running"].includes(r.status)).length,
  };
}
export function responseError(response: ResponseRecord) {
  if (response.error_code === "provider_http_401")
    return `provider_auth_rejected_${response.provider}`;
  if (response.provider === "mimo" && response.error_code === "provider_http_400")
    return "mimo_http_400";
  return response.error_code ?? "execution_failed";
}
export function retrySource(detail: RunDetail) {
  const retry = detail.run.snapshot.parameters.retry;
  if (!retry || typeof retry !== "object") return null;
  const id = (retry as Record<string, unknown>).sourceRunId;
  return typeof id === "string" ? id : null;
}
// Descriptive editorial leads, not a causal SEO audit or an AI-generated recommendation.
export function editorialOpportunities(detail: RunDetail) {
  const brands = comparisonBrands(detail);
  const primary = brands.find((b) => b.is_primary);
  if (!primary) return [];
  return detail.run.snapshot.queries.flatMap((query) => {
    const valid = detail.responses.filter(
      (r) => r.query_text === query.text && r.status === "succeeded",
    );
    const idsFor = (brandId: string) =>
      new Set(
        detail.mentions
          .filter((m) => m.brand_id === brandId && valid.some((r) => r.id === m.response_id))
          .map((m) => m.response_id),
      );
    const own = idsFor(primary.id);
    const competitors = brands
      .filter((b) => !b.is_primary)
      .map((b) => ({ brand: b, ids: idsFor(b.id) }))
      .sort((a, b) => b.ids.size - a.ids.size || a.brand.name.localeCompare(b.brand.name));
    const competitor = competitors[0];
    if (!valid.length || !competitor || competitor.ids.size <= own.size) return [];
    const evidence = valid.filter((r) => competitor.ids.has(r.id) && !own.has(r.id));
    const domains = [
      ...new Set(
        detail.citations
          .filter((c) => evidence.some((r) => r.id === c.response_id))
          .map((c) => c.domain),
      ),
    ].sort();
    return [
      {
        query: query.text,
        primary: primary.name,
        own: own.size,
        competitor: competitor.brand.name,
        competitorCount: competitor.ids.size,
        valid: valid.length,
        evidence,
        domains,
      },
    ];
  });
}
