import { sql } from "../db/client";
import { apiWork, jobTable, usageColumn } from "./api-work";
import { modelConfiguration } from "./provider-config";
import { AppError } from "./errors";
import type { Job } from "./queue";
import type { User } from "./types";
import {
  effectivePolicy,
  EXECUTION_DEFAULTS,
  executionModels,
  executionPolicySchema,
  type ExecutionPolicy,
  type ExecutionStatus,
  type RateFeedback,
} from "./execution-policy";

// Claims, feedback and policy updates share this short database lock. Network calls
// NEVER hold it. It coordinates all worker processes, not just one JavaScript loop.
export const EXECUTION_LOCK = 824763;
export function workerConcurrency() {
  const n = Number(process.env.WORKER_CONCURRENCY ?? 12);
  if (!Number.isInteger(n) || n < 1 || n > 32)
    throw new AppError("invalid_worker_concurrency", 503);
  return n;
}
type LimitRow = {
  org_id: string;
  provider: ExecutionPolicy["provider"];
  model: string;
  rpm: number | null;
  tpm: number | null;
  parallel: number | null;
  adaptive_parallel: number;
  successes: number;
  backoff: number;
  next_start_at: Date | null;
  observed: RateFeedback | null;
  observed_at: Date | null;
};
function policyFor(
  provider: ExecutionPolicy["provider"],
  model: string,
  row?: LimitRow,
): ExecutionPolicy {
  const defaults = EXECUTION_DEFAULTS[provider];
  return {
    provider,
    model,
    rpm: row?.rpm ?? defaults.rpm,
    tpm: row?.tpm ?? defaults.tpm,
    parallel: row?.parallel ?? defaults.parallel,
  };
}
function observations(row: LimitRow | undefined, now: number) {
  return row?.observed_at && now - new Date(row.observed_at).getTime() < 15 * 60_000
    ? row.observed
    : null;
}
/** Conservative scheduling estimate, separate from billing. Includes reserved output
 * (Kimi uses it for quotas) and a bounded retrieval allowance; not a provider tokenizer.
 */
export function rateTokenReserve(job: Job) {
  const output = modelConfiguration(job.provider, job.model)?.maxOutput ?? 8192;
  const web = job.snapshot.parameters.search === true;
  return (
    (Buffer.byteLength(job.query_text + job.snapshot.system, "utf8") + 256 + output) *
      (web && job.provider === "openrouter" ? 2 : 1) +
    (web ? 32_000 : 0)
  );
}

export async function getExecutionStatus(user: User): Promise<ExecutionStatus[]> {
  const [rows, pauses, active] = await Promise.all([
    sql<LimitRow[]>`select * from model_execution_limits where org_id=${user.org_id}`,
    sql`select provider,paused_until from provider_cooldowns where org_id=${user.org_id} and paused_until>now()`,
    sql`select provider,model,count(*)::int as n from ${apiWork(sql)} a where org_id=${user.org_id} and status='running' group by provider,model`,
  ]);
  return executionModels().map(({ provider, model }) => {
    const row = rows.find((r) => r.provider === provider && r.model === model);
    const policy = policyFor(provider, model, row);
    const effective = effectivePolicy(policy, observations(row, Date.now()));
    const pause = pauses.find((p) => p.provider === provider)?.paused_until;
    return {
      ...policy,
      effectiveRpm: effective.rpm,
      effectiveTpm: effective.tpm,
      active: active.find((a) => a.provider === provider && a.model === model)?.n ?? 0,
      adaptiveParallel: Math.min(policy.parallel, row?.adaptive_parallel ?? 2, workerConcurrency()),
      pausedUntil: pause ? new Date(pause).toISOString() : null,
      configured: row?.rpm != null,
    };
  });
}
export async function saveExecutionPolicy(user: User, input: unknown) {
  const p = executionPolicySchema.parse(input);
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${EXECUTION_LOCK})`;
    // Updating settings must never clear a provider's active cooldown or recent usage.
    await tx`insert into model_execution_limits(org_id,provider,model,rpm,tpm,parallel)
      values(${user.org_id},${p.provider},${p.model},${p.rpm},${p.tpm},${p.parallel})
      on conflict(org_id,provider,model) do update set rpm=excluded.rpm,tpm=excluded.tpm,parallel=excluded.parallel,
      adaptive_parallel=least(model_execution_limits.adaptive_parallel,excluded.parallel)`;
  });
}

export async function claimRegulatedJob(): Promise<Job | undefined> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${EXECUTION_LOCK})`;
    const [clock] = await tx`select now() as now`;
    const now = new Date(clock.now).getTime();
    const [global] =
      await tx`select count(*)::int as n from ${apiWork(tx)} a where status='running'`;
    if (global.n >= workerConcurrency()) return undefined;
    // One candidate per model/organization avoids head-of-line blocking by a throttled provider.
    const candidates = await tx<Job[]>`select distinct on(org_id,provider,model) * from (
      select a.id,a.org_id,a.run_id,a.query_text,a.provider,a.model,a.created_at,r.snapshot,'measurement' as kind
      from ai_responses a join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id where a.status='queued'
      union all select id,org_id,audit_id as run_id,query_text,provider,model,created_at,snapshot,'site_audit' as kind
      from audit_ai_jobs where status='queued'
    ) candidates order by org_id,provider,model,created_at,id`;
    candidates.sort(
      (a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime(),
    );
    for (const job of candidates) {
      const table = tx(jobTable(job.kind)),
        usageId = tx(usageColumn(job.kind));
      const [paused] =
        await tx`select 1 from provider_cooldowns where org_id=${job.org_id} and provider=${job.provider} and paused_until>now()`;
      if (paused) continue;
      await tx`insert into model_execution_limits(org_id,provider,model) values(${job.org_id},${job.provider},${job.model}) on conflict do nothing`;
      const [row] = await tx<
        LimitRow[]
      >`select * from model_execution_limits where org_id=${job.org_id} and provider=${job.provider} and model=${job.model}`;
      if (row.next_start_at && new Date(row.next_start_at).getTime() > now) continue;
      const policy = policyFor(job.provider, job.model, row);
      const limits = effectivePolicy(policy, observations(row, now));
      const tokens = rateTokenReserve(job);
      if (tokens > limits.tpm) {
        // No request is sent. Avoid silently stranding work whose single-request
        // reservation cannot fit the configured minute quota.
        await tx`with stopped as (
          update ${table} set status='failed',error_code='request_exceeds_token_rate_limit',cost_micros=0,finished_at=now()
          where id=${job.id} and org_id=${job.org_id} and status='queued' returning id
        ) update usage_records set amount_micros=0,kind='estimated' where ${usageId} in(select id from stopped) and org_id=${job.org_id}`;
        continue;
      }
      const [recent] = await tx`select
        count(*) filter(where status='running')::int as active,
        count(*) filter(where started_at>now()-interval '60 seconds')::int as requests,
        coalesce(sum(greatest(coalesce((parameters->'rateControl'->>'tokensReserved')::bigint,${tokens}),coalesce(input_tokens::bigint,0)+coalesce(output_tokens::bigint,0)))
          filter(where started_at>now()-interval '60 seconds'),0)::bigint as tokens
        from ${apiWork(tx)} a where org_id=${job.org_id} and provider=${job.provider}
        and (${job.provider === "kimi"} or model=${job.model})
        and (status='running' or started_at>now()-interval '60 seconds')`;
      if (
        recent.active >= Math.min(policy.parallel, row.adaptive_parallel) ||
        recent.requests >= limits.rpm ||
        Number(recent.tokens) + tokens > limits.tpm
      )
        continue;
      const [claimed] = await tx<Job[]>`update ${table} set status='running',started_at=now(),
        parameters=parameters || ${JSON.stringify({ rateControl: { tokensReserved: tokens, rpm: limits.rpm, tpm: limits.tpm, version: 1 } })}::jsonb
        where id=${job.id} and org_id=${job.org_id} and status='queued' returning *`;
      if (!claimed) continue;
      await tx`update usage_records set created_at=now() where ${usageId}=${job.id} and org_id=${job.org_id}`;
      await tx`update model_execution_limits set next_start_at=now()+${Math.ceil(60_000 / limits.rpm)}*interval '1 millisecond'
        where org_id=${job.org_id} and provider=${job.provider} and model=${job.model}`;
      return {
        ...claimed,
        run_id: job.run_id,
        kind: job.kind,
        snapshot: job.snapshot,
        rate_tokens: tokens,
      };
    }
    return undefined;
  });
}

export async function recordExecutionFeedback(
  job: Job,
  feedback: RateFeedback | undefined,
  error: string | null,
) {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${EXECUTION_LOCK})`;
    const [row] = await tx<
      LimitRow[]
    >`select * from model_execution_limits where org_id=${job.org_id} and provider=${job.provider} and model=${job.model}`;
    if (!row) return; // Explicitly unregulated test fixtures have no scheduler state.
    const policy = policyFor(job.provider, job.model, row);
    const throttled =
      error === "provider_http_429" ||
      error === "provider_http_503" ||
      (error === "provider_http_402" && feedback?.retryAfterMs != null);
    let pause = 0;
    if (throttled) {
      const backoff = Math.min(8, row.backoff + 1);
      pause =
        Math.max(feedback?.retryAfterMs ?? 0, Math.min(900_000, 15_000 * 2 ** (backoff - 1))) +
        Math.floor(Math.random() * 1000);
      await tx`update model_execution_limits set adaptive_parallel=greatest(1,adaptive_parallel/2),successes=0,backoff=${backoff}
        where org_id=${job.org_id} and provider=${job.provider} and model=${job.model}`;
    } else if (!error) {
      // Late successes from calls already in flight cannot cancel a cooldown or
      // increase parallelism during one. Five subsequent successes recover one slot.
      await tx`update model_execution_limits set
        adaptive_parallel=least(${policy.parallel},adaptive_parallel+case when successes>=4 then 1 else 0 end),
        backoff=case when successes>=4 then greatest(0,backoff-1) else backoff end,
        successes=case when successes>=4 then 0 else successes+1 end
        where org_id=${job.org_id} and provider=${job.provider} and model=${job.model}
        and not exists(select 1 from provider_cooldowns where org_id=${job.org_id} and provider=${job.provider} and paused_until>now())`;
    }
    if (feedback) {
      const cushion = job.rate_tokens ?? rateTokenReserve(job);
      const [inFlight] =
        await tx`select count(*)::int as n from ${apiWork(tx)} a where org_id=${job.org_id} and provider=${job.provider} and status='running'`;
      if (feedback.remainingRequests != null && feedback.remainingRequests <= inFlight.n)
        pause = Math.max(pause, feedback.resetRequestsMs ?? 60_000);
      if (feedback.remainingTokens != null && feedback.remainingTokens < cushion * (inFlight.n + 1))
        pause = Math.max(pause, feedback.resetTokensMs ?? 60_000);
      if (
        feedback.remainingProjectTokens != null &&
        feedback.remainingProjectTokens < cushion * (inFlight.n + 1)
      )
        pause = Math.max(pause, feedback.resetProjectTokensMs ?? 60_000);
      if (feedback.requestLimit != null || feedback.tokenLimit != null) {
        // Concurrent responses may arrive out of order. Retain the lower recently
        // observed ceiling until it expires, rather than raising it on a late response.
        const previous = observations(row, Date.now());
        const lower = (a: number | undefined, b: number | undefined) =>
          a == null ? b : b == null ? a : Math.min(a, b);
        const observed = {
          requestLimit: lower(previous?.requestLimit, feedback.requestLimit),
          tokenLimit: lower(previous?.tokenLimit, feedback.tokenLimit),
        };
        const tightened =
          !previous ||
          observed.requestLimit !== previous.requestLimit ||
          observed.tokenLimit !== previous.tokenLimit;
        const observedAt = (tightened ? new Date() : new Date(row.observed_at!)).toISOString();
        await tx`update model_execution_limits set observed=${JSON.stringify(observed)}::jsonb,observed_at=${observedAt}::timestamptz
          where org_id=${job.org_id} and provider=${job.provider} and model=${job.model}`;
      }
    }
    if (pause > 0)
      await tx`insert into provider_cooldowns(org_id,provider,paused_until)
      values(${job.org_id},${job.provider},now()+${pause}*interval '1 millisecond')
      on conflict(org_id,provider) do update set paused_until=greatest(provider_cooldowns.paused_until,excluded.paused_until)`;
  });
}
