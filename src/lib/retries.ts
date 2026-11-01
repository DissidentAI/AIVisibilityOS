import { z } from "zod";
import type { TransactionSql } from "postgres";
import { sql } from "../db/client";
import { AppError } from "./errors";
import { digest } from "./security";
import { snapshotJson } from "./snapshot-json";
import { reserveMicros, modelConfiguration } from "./providers";
import { assertSnapshotAvailable, budgetStatus, enqueueSnapshot, uuidSchema } from "./service";
import type { Run, ResponseRecord, Snapshot, User } from "./types";
import { campaignFor } from "./campaigns";

const selectionSchema = z.object({
  responseIds: z.array(z.uuid()).min(1).max(1250).optional(),
});
const launchSchema = selectionSchema.extend({
  expectedQuoteHash: z.string().regex(/^[a-f0-9]{64}$/),
});

// Reuse the frozen methodology, never today's editable project or a provider fallback.
async function prepare(tx: TransactionSql, user: User, runId: string, ids?: string[]) {
  uuidSchema.parse(runId);
  const run = await campaignFor(tx, user, runId);
  runId = run.id;
  const responses = await tx<(ResponseRecord & { retried: boolean })[]>`
    select a.*, exists(select 1 from response_retries r where r.source_response_id=a.id and r.org_id=a.org_id) as retried
    from ai_responses a join measurement_runs parent on parent.id=a.run_id and parent.org_id=a.org_id where coalesce(parent.campaign_id,parent.id)=${runId} and a.org_id=${user.org_id} order by a.id`;
  const requested = ids ? new Set(ids) : null;
  if (
    requested &&
    (requested.size !== ids!.length || ids!.some((id) => !responses.some((r) => r.id === id)))
  )
    throw new AppError("not_found", 404);
  const selected = responses.filter((r) =>
    requested
      ? requested.has(r.id)
      : ["failed", "invalid", "uncertain"].includes(r.status) && !r.retried,
  );
  if (!selected.length) throw new AppError("retry_nothing_to_retry", 409);
  if (selected.some((r) => !["failed", "invalid", "uncertain"].includes(r.status)))
    throw new AppError("retry_not_failed", 409);
  if (selected.some((r) => r.retried)) throw new AppError("retry_already_created", 409);
  const snapshot: Snapshot = structuredClone(run.snapshot);
  snapshot.providers = snapshot.providers.filter((pr) => selected.some((r) => r.provider === pr));
  snapshot.models = Object.fromEntries(snapshot.providers.map((pr) => [pr, snapshot.models[pr]]));
  snapshot.queries = snapshot.queries.filter((q) => selected.some((r) => r.query_text === q.text));
  snapshot.parameters.retry = { sourceRunId: runId, sourceResponseIds: selected.map((r) => r.id) };
  assertSnapshotAvailable(snapshot);
  const tasks = selected.map((r) => ({
    queryText: r.query_text,
    provider: r.provider,
    sample: r.sample,
    sourceResponseId: r.id,
  }));
  const reservedMicros = tasks.reduce(
    (sum, task) =>
      sum +
      reserveMicros(
        task.provider,
        task.queryText,
        snapshot.system,
        snapshot.parameters.search === true ? "web" : "baseline",
        modelConfiguration(task.provider, snapshot.models[task.provider]),
      ),
    0,
  );
  const budget = await budgetStatus(tx, user);
  const quote = {
    sourceRunId: runId,
    responseIds: selected.map((r) => r.id),
    providers: snapshot.providers,
    responses: selected.length,
    uncertain: selected.filter((r) => r.status === "uncertain" || r.cost_micros === null).length,
    reservedMicros,
    ...budget,
    affordable: reservedMicros <= Math.min(budget.orgRemaining, budget.installationRemaining),
    quoteHash: digest(snapshotJson({ snapshot, tasks })),
    mode: snapshot.parameters.search === true ? "web" : "baseline",
  };
  return { run, snapshot, tasks, quote };
}
export async function estimateRetry(user: User, runId: string, data: unknown) {
  const p = selectionSchema.parse(data);
  return sql.begin(async (tx) => (await prepare(tx, user, runId, p.responseIds)).quote);
}
export type RetryEstimate = Awaited<ReturnType<typeof estimateRetry>>;
export async function createRetry(user: User, runId: string, data: unknown) {
  const p = launchSchema.parse(data);
  return sql.begin(async (tx) => {
    // Serializes retries with manual campaigns, schedules and project deletion.
    await tx`select pg_advisory_xact_lock(824762)`;
    const { run, snapshot, tasks, quote } = await prepare(tx, user, runId, p.responseIds);
    if (quote.quoteHash !== p.expectedQuoteHash) throw new AppError("configuration_changed", 409);
    return enqueueSnapshot(tx, user, run.project_id, snapshot, tasks, run.id);
  });
}
