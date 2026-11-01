import { sql } from "../db/client";
import { decryptSecret } from "./security";
import {
  callProvider,
  MODELS,
  modelConfiguration,
  requestOptions,
  SEARCH_PRICING,
  ProviderError,
  type Provider,
  type ProviderResult,
} from "./providers";
import { detectMentions } from "./measurement";
import type { Snapshot } from "./types";
import { snapshotJson } from "./snapshot-json";
export type Job = {
  id: string;
  org_id: string;
  run_id: string;
  query_text: string;
  provider: Provider;
  model: string;
  snapshot: Snapshot;
};
export async function claimJob(): Promise<Job | undefined> {
  // Pending reservations remain counted across months. Once attempted, charge the
  // reservation to the UTC month of the attempt, not the month it was queued.
  const [job] = await sql<Job[]>`
    with next_job as (
      select id from ai_responses where status='queued'
      order by created_at, id for update skip locked limit 1
    ), claimed as (
      update ai_responses set status='running', started_at=now()
      where id in (select id from next_job) returning *
    ), accounting_period as (
      update usage_records set created_at=now()
      where response_id in (select id from claimed) returning id
    )
    select c.*, r.snapshot from claimed c
    join measurement_runs r on r.id=c.run_id and r.org_id=c.org_id
  `;
  return job;
}
export async function settleJob(job: Job, result: ProviderResult | null, errorCode: string | null) {
  await sql.begin(async (tx) => {
    const [existing] =
      await tx`select status from ai_responses where id=${job.id} and org_id=${job.org_id} for update`;
    if (!existing || existing.status !== "running") return;
    const pricing = job.snapshot.pricing.models as typeof MODELS;
    const searchPricing = (job.snapshot.pricing.search ?? SEARCH_PRICING) as typeof SEARCH_PRICING;
    const search = searchPricing[job.provider as keyof typeof SEARCH_PRICING];
    const searchCost =
      job.snapshot.parameters.search === true && result?.grounding
        ? result.grounding.toolCalls *
          (search.toolMicros + search.contentTokens * pricing[job.provider].input)
        : 0;
    const reported = job.provider === "openrouter" ? result?.reportedCostMicros : null;
    const cachedInput = job.provider === "kimi" ? (result?.cachedInput ?? 0) : 0;
    const cost =
      reported != null
        ? reported
        : result?.input != null &&
            result?.output != null &&
            (job.snapshot.parameters.search !== true || result.grounding != null)
          ? Math.ceil(
              (result.input - cachedInput) * pricing[job.provider].input +
                cachedInput * (pricing[job.provider].cachedInput ?? pricing[job.provider].input) +
                result.output * pricing[job.provider].output +
                searchCost,
            )
          : null;
    await tx`update ai_responses set status=${result?.status ?? "failed"}, answer=${result?.text ?? null}, returned_model=${result?.model ?? null}, raw=${result ? JSON.stringify(result.raw) : null}::jsonb, grounding=${result?.grounding ? JSON.stringify(result.grounding) : null}::jsonb, request_id=${result?.requestId ?? null}, input_tokens=${result?.input ?? null}, output_tokens=${result?.output ?? null}, cost_micros=${cost}, error_code=${errorCode ?? (result?.status === "invalid" ? "incomplete_or_refused" : null)}, finished_at=now() where id=${job.id} and org_id=${job.org_id}`;
    if (result)
      await tx`update ai_responses set parameters=parameters || ${JSON.stringify({
        execution: {
          servingProvider: result.servingProvider ?? null,
          costSource:
            reported != null ? "provider_reported" : cost != null ? "token_estimate" : "unknown",
        },
      })}::jsonb where id=${job.id} and org_id=${job.org_id}`;
    if (cost != null)
      await tx`update usage_records set amount_micros=${cost}, kind='estimated' where response_id=${job.id} and org_id=${job.org_id}`;
    else
      await tx`update usage_records set kind='uncertain' where response_id=${job.id} and org_id=${job.org_id}`;
    if (result?.status === "succeeded") {
      for (const m of detectMentions(result.text, job.snapshot.brands))
        await tx`insert into brand_mentions (org_id,response_id,brand_id,brand_name,excerpt,matched_alias,sentiment) values (${job.org_id},${job.id},${m.brandId},${m.brandName},${m.excerpt},${m.matchedAlias},${m.sentiment})`;
      for (const c of result.citations)
        await tx`insert into citations (org_id,response_id,url,domain,title,provenance) values (${job.org_id},${job.id},${c.url},${c.domain},${c.title},${c.provenance})`;
    }
  });
}
export async function workOnce(adapter: typeof callProvider = callProvider) {
  const job = await claimJob();
  if (!job) return false;
  let result: ProviderResult | null = null,
    error: string | null = null;
  try {
    const [credential] =
      await sql`select encrypted_key from credentials where org_id=${job.org_id} and provider=${job.provider}`;
    if (!credential) throw new ProviderError("credentials_missing");
    const model = modelConfiguration(job.provider, job.model);
    if (!model) throw new ProviderError("model_configuration_changed");
    const frozen = (
      job.snapshot.parameters.providers as
        Record<string, { endpoint: string; request: unknown }> | undefined
    )?.[job.provider];
    if (
      frozen &&
      (frozen.endpoint !== model.endpoint ||
        snapshotJson(frozen.request) !==
          snapshotJson(
            requestOptions(
              job.provider,
              job.snapshot.parameters.search === true ? "web" : "baseline",
              model,
            ),
          ))
    )
      throw new ProviderError("model_configuration_changed");
    const key = decryptSecret(credential.encrypted_key, `${job.org_id}:${job.provider}`);
    result = await adapter(
      job.provider,
      key,
      job.query_text,
      job.snapshot.system,
      job.snapshot.parameters.search === true ? "web" : "baseline",
      job.model,
    );
  } catch (e) {
    error = e instanceof ProviderError ? e.code : "execution_failed";
  }
  await settleJob(job, result, error);
  return true;
}
export async function maintenance() {
  await sql.begin(async (tx) => {
    const expired =
      await tx`update ai_responses set status='uncertain',error_code='worker_interrupted_no_automatic_retry',finished_at=now() where status='running' and started_at < now() - interval '2 minutes' returning id`;
    for (const row of expired)
      await tx`update usage_records set kind='uncertain' where response_id=${row.id}`;
    await tx`delete from sessions where expires_at < now()`;
    await tx`delete from rate_limits where expires_at < now()`;
    const days = Number(process.env.RETENTION_DAYS ?? 365);
    if (!Number.isInteger(days) || days < 1 || days > 3650)
      throw new Error("invalid_retention_days");
    await tx`delete from reports where created_at < now() - ${days} * interval '1 day'`;
    await tx`delete from schedule_events where created_at < now() - ${days} * interval '1 day'`;
    // Retain usage accounting separately; queued/running jobs are never purged.
    await tx`delete from measurement_runs r where r.created_at < now() - ${days} * interval '1 day' and not exists(select 1 from ai_responses a where a.run_id=r.id and a.status in ('queued','running'))`;
    await tx`delete from usage_records where created_at < now() - ${Math.max(62, days)} * interval '1 day' and kind <> 'reserved'`;
  });
}
