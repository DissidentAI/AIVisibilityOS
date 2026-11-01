import { comparisonSignature } from "./measurement";
import { sameMeasurementConfiguration, type BrandScope } from "./brand-analysis";
import { snapshotJson } from "./snapshot-json";
import type { ResponseRecord, Run } from "./types";

export type HistoryResponse = Pick<
  ResponseRecord,
  | "id"
  | "query_text"
  | "provider"
  | "returned_model"
  | "parameters"
  | "status"
  | "answer"
  | "attempt"
>;
export type HistoryReason =
  | "incomplete"
  | "retried"
  | "missing_model"
  | "unknown_route"
  | "questions"
  | "models"
  | "mode"
  | "samples"
  | "locale"
  | "brands"
  | "configuration"
  | "returned_models"
  | "reference_ineligible";
export function sampleReasons(rows: HistoryResponse[]): HistoryReason[] {
  const reasons: HistoryReason[] = [];
  if (!rows.length || rows.some((r) => r.status !== "succeeded")) reasons.push("incomplete");
  if (rows.some((r) => !!r.parameters?.retry || (r.attempt ?? 1) > 1)) reasons.push("retried");
  if (rows.some((r) => r.status === "succeeded" && !r.returned_model))
    reasons.push("missing_model");
  if (
    rows.some(
      (r) =>
        r.status === "succeeded" &&
        r.provider === "openrouter" &&
        !(
          r.parameters?.execution &&
          typeof r.parameters.execution === "object" &&
          typeof (r.parameters.execution as Record<string, unknown>).servingProvider === "string" &&
          String((r.parameters.execution as Record<string, unknown>).servingProvider).trim()
        ),
    )
  )
    reasons.push("unknown_route");
  return reasons;
}
export function historyReasons(
  run: Run,
  rows: HistoryResponse[],
  reference: Run,
  referenceRows: HistoryResponse[],
  scope: BrandScope,
): HistoryReason[] {
  const reasons = sampleReasons(rows);
  if (sampleReasons(referenceRows).length) reasons.push("reference_ineligible");
  if (!sameMeasurementConfiguration(run, reference, scope)) {
    const a = run.snapshot,
      b = reference.snapshot;
    const differs = (x: unknown, y: unknown) => snapshotJson(x) !== snapshotJson(y);
    const configurationReasons: HistoryReason[] = [];
    if (differs(a.queries, b.queries)) configurationReasons.push("questions");
    if (differs(a.providers, b.providers) || differs(a.models, b.models))
      configurationReasons.push("models");
    if (!!a.parameters.search !== !!b.parameters.search) configurationReasons.push("mode");
    if (a.samples !== b.samples) configurationReasons.push("samples");
    if (a.project.language !== b.project.language || a.project.country !== b.project.country)
      configurationReasons.push("locale");
    if (scope === "original" && differs(a.brands, b.brands)) configurationReasons.push("brands");
    reasons.push(
      ...(configurationReasons.length ? configurationReasons : ["configuration" as const]),
    );
  }
  const signature = comparisonSignature(rows),
    refSignature = comparisonSignature(referenceRows);
  if (
    signature &&
    refSignature &&
    signature !== refSignature &&
    !reasons.includes("questions") &&
    !reasons.includes("models") &&
    !reasons.includes("samples")
  )
    reasons.push("returned_models");
  return [...new Set(reasons)];
}
export type HistoryEntry = {
  id: string;
  createdAt: string;
  total: number;
  valid: number;
  failed: number;
  pending: number;
  mentioned: number;
  rate: number | null;
  reasons: HistoryReason[];
  models: Record<string, string>;
  web: boolean;
};
export type CampaignHistory = {
  referenceId: string;
  referenceReasons: HistoryReason[];
  scope: BrandScope;
  total: number;
  offset: number;
  limit: number;
  entries: HistoryEntry[];
};
