import { parseSuggestions } from "./suggestion-validation";
import { sql } from "../db/client";
import { jobTable, usageColumn } from "./api-work";
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
import { requestEndpoint } from "./provider-config";
import { claimRegulatedJob, recordExecutionFeedback } from "./execution-control";
import type { RateFeedback } from "./execution-policy";
import { parseSynthesis } from "./site-audit/ai-evidence";
export type Job = {
  kind?: "measurement" | "site_audit" | "assistant";
  created_at?: string;
  rate_tokens?: number;
  id: string;
  org_id: string;
  run_id: string;
  query_text: string;
  provider: Provider;
  model: string;
  snapshot: Snapshot;
};
export async function claimJob(
  options: { unregulatedTestOnly?: boolean } = {},
): Promise<Job | undefined> {
  if (!options.unregulatedTestOnly) return claimRegulatedJob();
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
    throw new Error("Unregulated claims are restricted to isolated test databases");
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
  if (job) return job;
  const [auditJob] = await sql<Job[]>`with next_job as (
    select id from audit_ai_jobs where status='queued' order by created_at,id for update skip locked limit 1
  ), claimed as (
    update audit_ai_jobs set status='running',started_at=now() where id in(select id from next_job) returning *
  ), accounting_period as (
    update usage_records set created_at=now() where audit_ai_id in(select id from claimed) returning id
  ) select claimed.*,audit_id as run_id,'site_audit' as kind from claimed`;
  if (auditJob) return auditJob;
  const [assistant] = await sql<
    Job[]
  >`with next_job as(select id from assistant_jobs where status='queued' order by created_at,id for update skip locked limit 1),
    claimed as(update assistant_jobs set status='running',started_at=now() where id in(select id from next_job) returning *),
    accounting_period as(update usage_records set created_at=now() where assistant_id in(select id from claimed) returning id)
    select claimed.*,id as run_id,'assistant' as kind from claimed`;
  return assistant;
}
export async function settleJob(job: Job, result: ProviderResult | null, errorCode: string | null) {
  if (
    job.kind === "site_audit" &&
    result?.status === "succeeded" &&
    !parseSynthesis(result.text, (job.snapshot.parameters.auditEvidenceIds as string[]) ?? [])
  ) {
    result = { ...result, status: "invalid" };
    errorCode = "audit_synthesis_invalid";
  }
  if (
    job.kind === "assistant" &&
    result?.status === "succeeded" &&
    !parseSuggestions(result.text)
  ) {
    result = { ...result, status: "invalid" };
    errorCode = "suggestions_invalid";
  }
  await sql.begin(async (tx) => {
    const table = tx(jobTable(job.kind)),
      usageId = tx(usageColumn(job.kind));
    const parentId = tx(
      job.kind === "assistant" ? "id" : job.kind === "site_audit" ? "audit_id" : "run_id",
    );
    const [existing] =
      await tx`select status from ${table} where id=${job.id} and org_id=${job.org_id} for update`;
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
    const cachedInput = ["kimi", "mimo"].includes(job.provider) ? (result?.cachedInput ?? 0) : 0;
    const rejectedBeforeInference =
      errorCode === "provider_http_401" ||
      errorCode === "mimo_web_search_disabled" ||
      errorCode === "credentials_missing" ||
      errorCode === "model_configuration_changed";
    const cost = rejectedBeforeInference
      ? 0
      : reported != null
        ? reported
        : result?.input != null &&
            result?.output != null &&
            (job.snapshot.parameters.search !== true ||
              (result.grounding != null && result.grounding.usageKnown !== false))
          ? Math.ceil(
              (result.input - cachedInput) * pricing[job.provider].input +
                cachedInput * (pricing[job.provider].cachedInput ?? pricing[job.provider].input) +
                result.output * pricing[job.provider].output +
                searchCost,
            )
          : null;
    await tx`update ${table} set status=${result?.status ?? "failed"}, answer=${result?.text ?? null}, returned_model=${result?.model ?? null}, raw=${result ? JSON.stringify(result.raw) : null}::jsonb, grounding=${result?.grounding ? JSON.stringify(result.grounding) : null}::jsonb, request_id=${result?.requestId ?? null}, input_tokens=${result?.input ?? null}, output_tokens=${result?.output ?? null}, cost_micros=${cost}, error_code=${errorCode ?? (result?.status === "invalid" ? "incomplete_or_refused" : null)}, finished_at=now() where id=${job.id} and org_id=${job.org_id}`;
    if (result)
      await tx`update ${table} set parameters=parameters || ${JSON.stringify({
        execution: {
          servingProvider: result.servingProvider ?? null,
          costSource:
            reported != null ? "provider_reported" : cost != null ? "token_estimate" : "unknown",
        },
      })}::jsonb where id=${job.id} and org_id=${job.org_id}`;
    if (cost != null)
      await tx`update usage_records set amount_micros=${cost}, kind='estimated' where ${usageId}=${job.id} and org_id=${job.org_id}`;
    else
      await tx`update usage_records set kind='uncertain' where ${usageId}=${job.id} and org_id=${job.org_id}`;
    if (rejectedBeforeInference) {
      // These configuration rejections cannot be repaired by repeating the request.
      // Stop only pending work for this provider in this tenant's campaign.
      const stoppedCode =
        errorCode === "mimo_web_search_disabled"
          ? "mimo_web_search_disabled_before_request"
          : errorCode === "provider_http_401"
            ? "provider_auth_failed_before_request"
            : errorCode!;
      await tx`with stopped as (
        update ${table} set status='failed',error_code=${stoppedCode},cost_micros=0,finished_at=now()
        where org_id=${job.org_id} and ${parentId}=${job.run_id} and provider=${job.provider} and status='queued' returning id
      ) update usage_records set amount_micros=0,kind='estimated' where org_id=${job.org_id} and ${usageId} in (select id from stopped)`;
    }
    if (result?.status === "succeeded" && (!job.kind || job.kind === "measurement")) {
      for (const m of detectMentions(result.text, job.snapshot.brands))
        await tx`insert into brand_mentions (org_id,response_id,brand_id,brand_name,excerpt,matched_alias,sentiment) values (${job.org_id},${job.id},${m.brandId},${m.brandName},${m.excerpt},${m.matchedAlias},${m.sentiment})`;
      for (const c of result.citations)
        await tx`insert into citations (org_id,response_id,url,domain,title,provenance) values (${job.org_id},${job.id},${c.url},${c.domain},${c.title},${c.provenance})`;
    }
  });
}
export async function workOnce(
  adapter: typeof callProvider = callProvider,
  options: { unregulatedTestOnly?: boolean } = {},
) {
  const job = await claimJob(options);
  if (!job) return false;
  let result: ProviderResult | null = null,
    error: string | null = null;
  let feedback: RateFeedback | undefined;
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
      (frozen.endpoint !==
        requestEndpoint(
          job.provider,
          job.snapshot.parameters.search === true ? "web" : "baseline",
          model,
        ) ||
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
    feedback = e instanceof ProviderError ? e.rateFeedback : undefined;
  }
  await recordExecutionFeedback(job, result?.rateFeedback ?? feedback, error);
  await settleJob(job, result, error);
  return true;
}
export async function maintenance() {
  await sql.begin(async (tx) => {
    // Reconcile earlier authentication rejections that conservatively retained reservations.
    await tx`update usage_records u set amount_micros=0,kind='estimated'
      from ai_responses a where u.response_id=a.id and u.org_id=a.org_id
      and a.status='failed' and a.error_code in ('provider_http_401','provider_auth_failed_before_request','mimo_web_search_disabled','mimo_web_search_disabled_before_request')
      and (u.amount_micros<>0 or u.kind<>'estimated')`;
    await tx`update ai_responses set cost_micros=0 where status='failed'
      and error_code in ('provider_http_401','provider_auth_failed_before_request','mimo_web_search_disabled','mimo_web_search_disabled_before_request') and cost_micros is distinct from 0`;
    const expired =
      await tx`update ai_responses set status='uncertain',error_code='worker_interrupted_no_automatic_retry',finished_at=now() where status='running' and started_at < now() - interval '2 minutes' returning id`;
    for (const row of expired)
      await tx`update usage_records set kind='uncertain' where response_id=${row.id}`;
    const expiredAudits =
      await tx`update audit_ai_jobs set status='uncertain',error_code='worker_interrupted_no_automatic_retry',finished_at=now() where status='running' and started_at<now()-interval '2 minutes' returning id`;
    for (const row of expiredAudits)
      await tx`update usage_records set kind='uncertain' where audit_ai_id=${row.id}`;
    await tx`with expired as(update assistant_jobs set status='uncertain',error_code='worker_interrupted_no_automatic_retry',finished_at=now() where status='running' and started_at<now()-interval '2 minutes' returning id)
      update usage_records set kind='uncertain' where assistant_id in(select id from expired)`;

    await tx`delete from sessions where expires_at < now()`;
    await tx`delete from rate_limits where expires_at < now()`;
    const days = Number(process.env.RETENTION_DAYS ?? 365);
    if (!Number.isInteger(days) || days < 1 || days > 3650)
      throw new Error("invalid_retention_days");
    await tx`delete from assistant_jobs where status not in ('queued','running') and created_at<now()-${Math.min(30, days)}*interval '1 day'`;
    await tx`delete from reports where created_at < now() - ${days} * interval '1 day'`;
    await tx`delete from geo_actions where created_at < now() - ${days} * interval '1 day'`;
    await tx`delete from schedule_events where created_at < now() - ${days} * interval '1 day'`;
    // Retain usage accounting separately; queued/running jobs are never purged.
    await tx`delete from measurement_runs r where r.campaign_id is null and r.created_at<now()-${days}*interval '1 day'
      and not exists(select 1 from ai_responses a join measurement_runs parent on parent.id=a.run_id and parent.org_id=a.org_id where coalesce(parent.campaign_id,parent.id)=r.id
        and (a.status in ('queued','running') or coalesce(a.finished_at,a.started_at,a.created_at)>=now()-${days}*interval '1 day'))`;
    await tx`delete from site_audits a where a.created_at<now()-${days}*interval '1 day'
      and not exists(select 1 from audit_sites s where s.audit_id=a.id and s.status in ('queued','running'))
      and not exists(select 1 from audit_ai_jobs j where j.audit_id=a.id and j.status in ('queued','running'))`;
    await tx`delete from crawl_hosts where greatest(next_at,last_at)<now()-interval '7 days'`;
    await tx`delete from usage_records where created_at < now() - ${Math.max(62, days)} * interval '1 day' and kind <> 'reserved'`;
  });
}
