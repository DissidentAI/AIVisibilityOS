import { z } from "zod";
import type { TransactionSql } from "postgres";
import { sql, db } from "../db/client";
import { eq, desc } from "drizzle-orm";
import { projects as projectTable } from "../db/schema";
import { AppError } from "./errors";
import { digest, encryptSecret } from "./security";
import {
  PROVIDERS,
  PRICE_DATE,
  SEARCH_PRICING,
  MEASUREMENT_MODES,
  reserveMicros,
  instructions,
  type Provider,
} from "./providers";
import { METHODOLOGY, type Brand } from "./measurement";
import type {
  User,
  State,
  Project,
  Query,
  Run,
  RunDetail,
  ResponseRecord,
  Mention,
  Citation,
  Snapshot,
} from "./types";
import { projectSchema, ProjectValidationError } from "./project-validation";
import {
  OPENROUTER_MODEL_IDS,
  modelConfiguration,
  supportsWebSearch,
  requestEndpoint,
} from "./provider-config";
import { requestOptions } from "./providers";
import { snapshotJson } from "./snapshot-json";
import { getExecutionStatus } from "./execution-control";
import { campaignFor, latestAttempts } from "./campaigns";
import {
  analyzeStoredBrands,
  brandSetSignature,
  brandScopeSchema,
  type BrandScope,
} from "./brand-analysis";
export { projectSchema, brandSchema } from "./project-validation";
export const uuidSchema = z.uuid();
export function ceilingMicros() {
  const n = Number(process.env.MAX_MONTHLY_BUDGET_USD ?? 20);
  if (!Number.isFinite(n) || n <= 0 || n > 1000)
    throw new AppError("invalid_budget_configuration", 503);
  return Math.floor(n * 1e6);
}
export async function ownedProject(user: User, id: string) {
  uuidSchema.parse(id);
  const [project] = await sql<
    Project[]
  >`select * from projects where id=${id} and org_id=${user.org_id}`;
  if (!project) throw new AppError("not_found", 404);
  return project;
}
export async function getState(user: User): Promise<State> {
  const ps = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.orgId, user.org_id))
    .orderBy(desc(projectTable.createdAt));
  const [bs, qs, creds, usage, org, heartbeat] = await Promise.all([
    sql<
      (Brand & { project_id: string })[]
    >`select id, project_id, name, domain, is_primary from brands where org_id=${user.org_id} order by is_primary desc, name`,
    sql<
      Query[]
    >`select id, project_id, text from tracked_queries where org_id=${user.org_id} order by created_at, id`,
    sql<
      { provider: Provider; updated_at: string }[]
    >`select provider, updated_at from credentials where org_id=${user.org_id}`,
    sql`select coalesce(sum(amount_micros),0)::int as amount, coalesce(sum(amount_micros) filter(where kind='reserved'),0)::int as reserved, coalesce(sum(amount_micros) filter(where kind='uncertain'),0)::int as uncertain from usage_records where org_id=${user.org_id} and (created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' or kind='reserved')`,
    sql`select budget_micros from organizations where id=${user.org_id}`,
    sql`select exists(select 1 from worker_heartbeats where seen_at > now() - interval '45 seconds') as online`,
  ]);
  return {
    execution: await getExecutionStatus(user),
    user,
    projects: ps.map((p) => ({
      id: p.id,
      org_id: p.orgId,
      name: p.name,
      domain: p.domain,
      industry: p.industry,
      description: p.description,
      scan_settings: p.scanSettings as Project["scan_settings"],
      revision: p.revision,
      country: p.country,
      language: p.language,
      created_at: p.createdAt.toISOString(),
      brands: bs.filter((b) => b.project_id === p.id),
      queries: qs.filter((q) => q.project_id === p.id),
    })),
    credentials: creds,
    usage: {
      ...usage[0],
      budget: org[0].budget_micros,
      ceiling: ceilingMicros(),
    } as State["usage"],
    workerOnline: heartbeat[0].online,
  };
}
export async function createProject(user: User, data: unknown) {
  const result = projectSchema.safeParse(data);
  if (!result.success) throw new ProjectValidationError(result.error);
  const p = result.data;
  return sql.begin(async (tx) => {
    await tx`select id from organizations where id=${user.org_id} for update`;
    const [count] = await tx`select count(*)::int as n from projects where org_id=${user.org_id}`;
    if (count.n >= 20) throw new AppError("project_limit");
    const [project] =
      await tx`insert into projects (org_id,name,domain,industry,description,language,country) values (${user.org_id},${p.name},${p.domain},${p.industry},${p.description},${p.language},${p.country}) returning id`;
    for (const b of [{ name: p.name, domain: p.domain }, ...p.competitors]) {
      await tx`insert into brands (org_id,project_id,name,domain,is_primary) values (${user.org_id},${project.id},${b.name},${b.domain},${b.name === p.name})`;
    }
    for (const q of p.queries)
      await tx`insert into tracked_queries (org_id,project_id,text) values (${user.org_id},${project.id},${q})`;
    return { id: project.id as string };
  });
}
export async function saveCredential(user: User, data: unknown) {
  const { provider, key } = z
    .object({ provider: z.enum(PROVIDERS), key: z.string().trim().min(20).max(512) })
    .parse(data);
  const encrypted = encryptSecret(key, `${user.org_id}:${provider}`);
  await sql`insert into credentials (org_id,provider,encrypted_key) values (${user.org_id},${provider},${encrypted}) on conflict (org_id,provider) do update set encrypted_key=excluded.encrypted_key, updated_at=now()`;
}
export const runSchema = z.object({
  projectId: z.uuid(),
  providers: z
    .array(z.enum(PROVIDERS))
    .min(1)
    .max(PROVIDERS.length)
    .refine((a) => new Set(a).size === a.length),
  samples: z.number().int().min(1).max(5),
  mode: z.enum(MEASUREMENT_MODES).default("baseline"),
  openrouterModel: z.enum(OPENROUTER_MODEL_IDS).default(OPENROUTER_MODEL_IDS[0]),
  expectedConfigHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export async function snapshotFor(
  tx: TransactionSql,
  user: User,
  p: z.infer<typeof runSchema>,
): Promise<Snapshot> {
  if (p.mode === "web" && p.providers.some((provider) => !supportsWebSearch(provider)))
    throw new AppError("web_search_unsupported");
  const providers = [...p.providers].sort();
  const models = Object.fromEntries(
    providers.map((provider) => [
      provider,
      modelConfiguration(provider, provider === "openrouter" ? p.openrouterModel : undefined)!,
    ]),
  );
  const [project] = await tx<
    Project[]
  >`select * from projects where id=${p.projectId} and org_id=${user.org_id} for share`;
  if (!project) throw new AppError("not_found", 404);
  const bs = await tx<
    Brand[]
  >`select id,name,domain,is_primary from brands where project_id=${project.id} and org_id=${user.org_id} order by id`;
  const qs = await tx<
    Query[]
  >`select id,text,project_id from tracked_queries where project_id=${project.id} and org_id=${user.org_id} order by id`;
  if (!qs.length) throw new AppError("queries_required");
  return {
    project: {
      name: project.name,
      domain: project.domain,
      language: project.language,
      country: project.country,
    },
    brands: bs,
    queries: qs,
    providers,
    models: Object.fromEntries(providers.map((pr) => [pr, models[pr].id])),
    samples: p.samples,
    methodology: METHODOLOGY,
    system: instructions(project.language, project.country),
    parameters: {
      search: p.mode === "web",
      mode: p.mode,
      countryMode: "prompt_context_only",
      channel: "official_api",
      providers: Object.fromEntries(
        providers.map((pr) => [
          pr,
          {
            endpoint: requestEndpoint(pr, p.mode, models[pr]),
            channel: pr === "openrouter" ? "openrouter_api" : "official_api",
            request: requestOptions(pr, p.mode, models[pr]),
            timeoutMs: models[pr].reasoning === "low" ? 90_000 : 60_000,
          },
        ]),
      ),
      ...(p.mode === "web"
        ? {
            openaiTool: "web_search",
            openaiMaxToolCalls: 1,
            openaiSearchContext: "low",
            geminiTool: "google_search",
          }
        : {}),
    },
    pricing: {
      date: PRICE_DATE,
      currency: "USD",
      models,
      search: SEARCH_PRICING,
      searchEstimate:
        "full_paid_rate_no_free_allowance; OpenAI fixed search-content block added conservatively to reported input usage",
    },
  };
}
export function snapshotReservation(snapshot: Snapshot) {
  return snapshot.queries.reduce(
    (sum, q) =>
      sum +
      snapshot.providers.reduce(
        (s, pr) =>
          s +
          reserveMicros(
            pr,
            q.text,
            snapshot.system,
            snapshot.parameters.search === true ? "web" : "baseline",
            modelConfiguration(pr, snapshot.models[pr]),
          ) *
            snapshot.samples,
        0,
      ),
    0,
  );
}
export async function budgetStatus(tx: TransactionSql, user: User) {
  const [org] = await tx`select budget_micros from organizations where id=${user.org_id}`;
  if (!org) throw new AppError("not_found", 404);
  const [spent] =
    await tx`select coalesce(sum(amount_micros) filter(where org_id=${user.org_id}),0)::int as org, coalesce(sum(amount_micros),0)::int as installation from usage_records where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' or kind='reserved'`;
  return {
    orgRemaining: Math.max(0, org.budget_micros - spent.org),
    installationRemaining: Math.max(0, ceilingMicros() - spent.installation),
  };
}
export async function estimateRun(user: User, data: unknown) {
  const p = runSchema.parse(data);
  return sql.begin(async (tx) => {
    const snapshot = await snapshotFor(tx, user, p);
    const budget = await budgetStatus(tx, user);
    const reservedMicros = snapshotReservation(snapshot);
    return {
      reservedMicros,
      responses: snapshot.queries.length * snapshot.samples * snapshot.providers.length,
      ...budget,
      affordable: reservedMicros <= Math.min(budget.orgRemaining, budget.installationRemaining),
      configHash: digest(snapshotJson(snapshot)),
      snapshot,
    };
  });
}
// Caller holds the installation advisory lock; scheduler and manual launches share this path.
export type MeasurementTask = {
  queryText: string;
  provider: Provider;
  sample: number;
  sourceResponseId?: string;
};
export function assertSnapshotAvailable(snapshot: Snapshot) {
  if (snapshot.pricing.date !== PRICE_DATE) throw new AppError("model_configuration_changed", 409);
  for (const provider of snapshot.providers) {
    const model = modelConfiguration(provider, snapshot.models[provider]);
    const frozen = (
      snapshot.parameters.providers as
        Record<string, { endpoint: string; request: unknown }> | undefined
    )?.[provider];
    if (
      !model ||
      (frozen &&
        (frozen.endpoint !==
          requestEndpoint(
            provider,
            snapshot.parameters.search === true ? "web" : "baseline",
            model,
          ) ||
          snapshotJson(frozen.request) !==
            snapshotJson(
              requestOptions(
                provider,
                snapshot.parameters.search === true ? "web" : "baseline",
                model,
              ),
            )))
    )
      throw new AppError("model_configuration_changed", 409);
  }
}
export async function enqueueSnapshot(
  tx: TransactionSql,
  user: User,
  projectId: string,
  snapshot: Snapshot,
  selectedTasks?: MeasurementTask[],
  existingRunId?: string,
) {
  await tx`select id from organizations where id=${user.org_id} for update`;
  const [project] =
    await tx`select id from projects where id=${projectId} and org_id=${user.org_id} for update`;
  if (!project) throw new AppError("not_found", 404);
  const [pending] =
    await tx`select count(*)::int as n from ai_responses a join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id where a.org_id=${user.org_id} and r.project_id=${projectId} and a.status in ('queued','running')`;
  if (pending.n > 0) throw new AppError("campaign_already_running", 409);
  assertSnapshotAvailable(snapshot);
  // Never silently substitute a model: its retirement starts a new measurement series.
  if (snapshot.providers.includes("openai") && new Date() >= new Date("2027-01-14T00:00:00Z"))
    throw new AppError("model_retired", 409);
  const creds = await tx`select provider from credentials where org_id=${user.org_id}`;
  if (snapshot.providers.some((provider) => !creds.some((c) => c.provider === provider)))
    throw new AppError("credentials_required");
  const rejected = await tx`select c.provider from credentials c where c.org_id=${user.org_id}
    and exists(select 1 from ai_responses a where a.org_id=c.org_id and a.provider=c.provider
      and a.error_code='provider_http_401' and a.started_at>=c.updated_at and a.finished_at>c.updated_at)`;
  const refused = snapshot.providers.find((pr) => rejected.some((c) => c.provider === pr));
  if (refused) throw new AppError(`provider_auth_rejected_${refused}`);
  const tasks: MeasurementTask[] =
    selectedTasks ??
    snapshot.queries.flatMap((q) =>
      snapshot.providers.flatMap((provider) =>
        Array.from({ length: snapshot.samples }, (_, i) => ({
          queryText: q.text,
          provider,
          sample: i + 1,
        })),
      ),
    );
  const total = tasks.reduce(
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
    ),
    budget = await budgetStatus(tx, user);
  if (total > Math.min(budget.orgRemaining, budget.installationRemaining))
    throw new AppError("budget_exceeded", 409);
  const hash = digest(snapshotJson(snapshot));
  const [run] = existingRunId
    ? await tx`select id from measurement_runs where id=${existingRunId} and org_id=${user.org_id} and project_id=${projectId} and campaign_id is null`
    : await tx`insert into measurement_runs (org_id,project_id,config_hash,snapshot) values (${user.org_id},${projectId},${hash},${JSON.stringify(snapshot)}::jsonb) returning id`;
  if (!run) throw new AppError("not_found", 404);
  for (const task of tasks) {
    const { provider, sample, queryText } = task;
    const [source] = task.sourceResponseId
      ? await tx`select a.slot_id,a.attempt from ai_responses a join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id where a.id=${task.sourceResponseId} and a.org_id=${user.org_id} and coalesce(r.campaign_id,r.id)=${run.id}`
      : [];
    if (task.sourceResponseId && !source) throw new AppError("not_found", 404);
    if (source && source.attempt >= 20) throw new AppError("retry_attempt_limit", 409);
    const parameters = source
      ? {
          ...snapshot.parameters,
          retry: {
            sourceRunId: run.id,
            sourceResponseId: task.sourceResponseId,
            attempt: source.attempt + 1,
          },
        }
      : snapshot.parameters;
    const [response] = source
      ? await tx`insert into ai_responses (org_id,run_id,query_text,provider,model,channel,sample,parameters,slot_id,attempt) values (${user.org_id},${run.id},${queryText},${provider},${snapshot.models[provider]},${provider === "openrouter" ? "openrouter_api" : "official_api"},${sample},${JSON.stringify(parameters)}::jsonb,${source.slot_id},${source.attempt + 1}) returning id`
      : await tx`insert into ai_responses (org_id,run_id,query_text,provider,model,channel,sample,parameters) values (${user.org_id},${run.id},${queryText},${provider},${snapshot.models[provider]},${provider === "openrouter" ? "openrouter_api" : "official_api"},${sample},${JSON.stringify(parameters)}::jsonb) returning id`;
    await tx`insert into usage_records (org_id,response_id,amount_micros) values (${user.org_id},${response.id},${reserveMicros(provider, queryText, snapshot.system, snapshot.parameters.search === true ? "web" : "baseline", modelConfiguration(provider, snapshot.models[provider]))})`;
    if (task.sourceResponseId)
      await tx`insert into response_retries (org_id,source_response_id,retry_response_id) values (${user.org_id},${task.sourceResponseId},${response.id})`;
  }
  return { id: run.id as string, reservedMicros: total };
}
export async function createRun(user: User, data: unknown) {
  const p = runSchema.parse(data);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    await tx`select id from organizations where id=${user.org_id} for update`;
    const snapshot = await snapshotFor(tx, user, p);
    if (p.expectedConfigHash && p.expectedConfigHash !== digest(snapshotJson(snapshot)))
      throw new AppError("configuration_changed", 409);
    const run = await enqueueSnapshot(tx, user, p.projectId, snapshot);
    await tx`update projects set scan_settings=${JSON.stringify({ providers: p.providers, samples: p.samples, mode: p.mode, openrouterModel: p.openrouterModel })}::jsonb,revision=revision+1 where id=${p.projectId} and org_id=${user.org_id}`;
    return run;
  });
}
export async function listRuns(user: User, projectId: string): Promise<Run[]> {
  await ownedProject(user, projectId);
  return sql<Run[]>`with attempts as (
    select coalesce(r.campaign_id,r.id) as campaign_id,a.* from ai_responses a join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id where r.project_id=${projectId} and r.org_id=${user.org_id}
  ), latest as (
    select distinct on(campaign_id,slot_id) * from attempts order by campaign_id,slot_id,attempt desc,created_at desc,id
  ), totals as(select campaign_id,count(*)::int as attempt_count,max(coalesce(finished_at,started_at,created_at)) as last_activity_at from attempts group by campaign_id)
  select r.*,count(a.id)::int as total,count(a.id) filter(where a.status='succeeded')::int as valid,
    count(a.id) filter(where a.status in ('queued','running'))::int as pending,
    count(a.id) filter(where a.status in ('failed','invalid','uncertain'))::int as failed,
    count(a.id) filter(where a.attempt>1)::int as retried,t.attempt_count,t.last_activity_at
  from measurement_runs r left join latest a on a.campaign_id=r.id left join totals t on t.campaign_id=r.id
  where r.project_id=${projectId} and r.org_id=${user.org_id} and r.campaign_id is null
  group by r.id,t.attempt_count,t.last_activity_at order by r.created_at desc limit 100`;
}
export async function getRun(
  user: User,
  id: string,
  scope: BrandScope = "original",
): Promise<RunDetail> {
  brandScopeSchema.parse(scope);
  const run = await campaignFor(sql, user, id);
  const [responses, mentions, citations] = await Promise.all([
    sql<
      ResponseRecord[]
    >`select a.id,a.run_id,a.query_text,a.provider,a.model,a.returned_model,a.channel,a.sample,a.slot_id,a.attempt,a.created_at,a.parameters,a.status,a.answer,a.grounding,a.error_code,a.request_id,a.input_tokens,a.output_tokens,a.cost_micros,a.started_at,a.finished_at,
    child.run_id as retry_run_id, origin.source_response_id from ai_responses a
    join measurement_runs parent on parent.id=a.run_id and parent.org_id=a.org_id
    left join response_retries next on next.source_response_id=a.id and next.org_id=a.org_id
    left join ai_responses child on child.id=next.retry_response_id and child.org_id=a.org_id
    left join response_retries origin on origin.retry_response_id=a.id and origin.org_id=a.org_id
    where coalesce(parent.campaign_id,parent.id)=${run.id} and a.org_id=${user.org_id} order by a.query_text,a.provider,a.sample,a.attempt desc`,
    sql<
      Mention[]
    >`select m.* from brand_mentions m join ai_responses a on a.id=m.response_id and a.org_id=m.org_id join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id where coalesce(r.campaign_id,r.id)=${run.id} and m.org_id=${user.org_id}`,
    sql<
      Citation[]
    >`select c.* from citations c join ai_responses a on a.id=c.response_id and a.org_id=c.org_id join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id where coalesce(r.campaign_id,r.id)=${run.id} and c.org_id=${user.org_id}`,
  ]);
  const { current, previous } = latestAttempts(responses);
  const ids = new Set(current.map((r) => r.id));
  const detail: RunDetail = {
    run: {
      ...run,
      total: current.length,
      valid: current.filter((r) => r.status === "succeeded").length,
      pending: current.filter((r) => ["queued", "running"].includes(r.status)).length,
      failed: current.filter((r) => ["failed", "invalid", "uncertain"].includes(r.status)).length,
      attempt_count: responses.length,
      retried: current.filter((r) => (r.attempt ?? 1) > 1).length,
      last_activity_at: responses
        .map((r) => r.finished_at ?? r.started_at ?? r.created_at!)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
    },
    responses: current,
    mentions: mentions.filter((m) => ids.has(m.response_id)),
    citations: citations.filter((c) => ids.has(c.response_id)),
    previousAttempts: previous,
    previousMentions: mentions.filter((m) => !ids.has(m.response_id)),
    previousCitations: citations.filter((c) => !ids.has(c.response_id)),
  };
  if (scope === "original") return detail;
  const brands = await sql<
    Brand[]
  >`select id,name,domain,is_primary from brands where project_id=${run.project_id} and org_id=${user.org_id} order by id`;
  return analyzeStoredBrands(detail, brands, digest(brandSetSignature(brands)));
}
