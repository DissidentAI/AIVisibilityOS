import { z } from "zod";
import { sql, db } from "../db/client";
import { eq, desc } from "drizzle-orm";
import { projects as projectTable } from "../db/schema";
import { AppError } from "./errors";
import { digest, encryptSecret, safePublicUrl } from "./security";
import {
  MODELS,
  PROVIDERS,
  MAX_OUTPUT,
  PRICE_DATE,
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
const domain = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((s) =>
    s
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase(),
  )
  .refine(
    (s) => !!safePublicUrl(`https://${s}`) && !s.includes("/") && !s.includes("?"),
    "Invalid public domain",
  );
const name = z.string().trim().min(2).max(100);
export const brandSchema = z.object({ name, domain });
export const projectSchema = z
  .object({
    name,
    domain,
    industry: z.string().trim().min(2).max(120),
    language: z.enum(["fr", "en"]),
    country: z.string().regex(/^[A-Z]{2}$/),
    competitors: z.array(brandSchema).max(10).default([]),
    queries: z.array(z.string().trim().min(5).max(1000)).min(1).max(50),
  })
  .superRefine((p, ctx) => {
    const names = [p.name, ...p.competitors.map((c) => c.name)].map((s) => s.toLowerCase());
    if (new Set(names).size !== names.length || new Set(p.queries).size !== p.queries.length)
      ctx.addIssue({ code: "custom", message: "Duplicates are not allowed" });
  });
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
    user,
    projects: ps.map((p) => ({
      id: p.id,
      org_id: p.orgId,
      name: p.name,
      domain: p.domain,
      industry: p.industry,
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
  const p = projectSchema.parse(data);
  return sql.begin(async (tx) => {
    await tx`select id from organizations where id=${user.org_id} for update`;
    const [count] = await tx`select count(*)::int as n from projects where org_id=${user.org_id}`;
    if (count.n >= 20) throw new AppError("project_limit");
    const [project] =
      await tx`insert into projects (org_id,name,domain,industry,language,country) values (${user.org_id},${p.name},${p.domain},${p.industry},${p.language},${p.country}) returning id`;
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
export async function createRun(user: User, data: unknown) {
  const p = z
    .object({
      projectId: z.uuid(),
      providers: z
        .array(z.enum(PROVIDERS))
        .min(1)
        .max(2)
        .refine((a) => new Set(a).size === a.length),
      samples: z.number().int().min(1).max(5),
    })
    .parse(data);
  return sql.begin(async (tx) => {
    // Serializes installation and organization budget reservations across all web replicas.
    await tx`select pg_advisory_xact_lock(824762)`;
    const [org] = await tx`select * from organizations where id=${user.org_id} for update`;
    const [project] = await tx<
      Project[]
    >`select * from projects where id=${p.projectId} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    const [pending] =
      await tx`select count(*)::int as n from ai_responses where org_id=${user.org_id} and status in ('queued','running')`;
    if (pending.n > 0) throw new AppError("campaign_already_running", 409);
    const bs = await tx<
      Brand[]
    >`select id,name,domain,is_primary from brands where project_id=${project.id} and org_id=${user.org_id} order by id`;
    const qs = await tx<
      Query[]
    >`select id,text,project_id from tracked_queries where project_id=${project.id} and org_id=${user.org_id} order by id`;
    if (!qs.length) throw new AppError("queries_required");
    const creds = await tx`select provider from credentials where org_id=${user.org_id}`;
    if (p.providers.some((provider) => !creds.some((c) => c.provider === provider)))
      throw new AppError("credentials_required");
    const system = instructions(project.language, project.country);
    const total = qs.reduce(
      (sum, q) =>
        sum + p.providers.reduce((s, pr) => s + reserveMicros(pr, q.text, system) * p.samples, 0),
      0,
    );
    const [spent] =
      await tx`select coalesce(sum(amount_micros) filter(where org_id=${user.org_id}),0)::int as org, coalesce(sum(amount_micros),0)::int as installation from usage_records where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' or kind='reserved'`;
    if (spent.org + total > org.budget_micros || spent.installation + total > ceilingMicros())
      throw new AppError("budget_exceeded", 409);
    const snapshot: Snapshot = {
      project: {
        name: project.name,
        domain: project.domain,
        language: project.language,
        country: project.country,
      },
      brands: bs,
      queries: qs,
      providers: [...p.providers].sort(),
      models: Object.fromEntries(p.providers.map((pr) => [pr, MODELS[pr].id])),
      samples: p.samples,
      methodology: METHODOLOGY,
      system,
      parameters: {
        max_output_tokens: MAX_OUTPUT,
        temperature: 0.7,
        search: false,
        countryMode: "prompt_context_only",
        channel: "official_api",
        geminiThinkingBudget: 0,
      },
      pricing: { date: PRICE_DATE, currency: "USD", models: MODELS },
    };
    const hash = digest(JSON.stringify(snapshot));
    const [run] =
      await tx`insert into measurement_runs (org_id,project_id,config_hash,snapshot) values (${user.org_id},${project.id},${hash},${JSON.stringify(snapshot)}::jsonb) returning id`;
    for (const q of qs)
      for (const provider of p.providers)
        for (let sample = 1; sample <= p.samples; sample++) {
          const [response] =
            await tx`insert into ai_responses (org_id,run_id,query_text,provider,model,sample,parameters) values (${user.org_id},${run.id},${q.text},${provider},${MODELS[provider].id},${sample},${JSON.stringify(snapshot.parameters)}::jsonb) returning id`;
          await tx`insert into usage_records (org_id,response_id,amount_micros) values (${user.org_id},${response.id},${reserveMicros(provider, q.text, system)})`;
        }
    return { id: run.id as string, reservedMicros: total };
  });
}
export async function listRuns(user: User, projectId: string): Promise<Run[]> {
  await ownedProject(user, projectId);
  return sql<
    Run[]
  >`select r.*, count(a.id)::int as total, count(a.id) filter(where a.status='succeeded')::int as valid, count(a.id) filter(where a.status in ('queued','running'))::int as pending, count(a.id) filter(where a.status in ('failed','invalid','uncertain'))::int as failed from measurement_runs r left join ai_responses a on a.run_id=r.id and a.org_id=r.org_id where r.project_id=${projectId} and r.org_id=${user.org_id} group by r.id order by r.created_at desc limit 100`;
}
export async function getRun(user: User, id: string): Promise<RunDetail> {
  uuidSchema.parse(id);
  const [run] = await sql<
    Run[]
  >`select * from measurement_runs where id=${id} and org_id=${user.org_id}`;
  if (!run) throw new AppError("not_found", 404);
  const [responses, mentions, citations] = await Promise.all([
    sql<
      ResponseRecord[]
    >`select id,run_id,query_text,provider,model,returned_model,channel,sample,parameters,status,answer,error_code,request_id,input_tokens,output_tokens,cost_micros,started_at,finished_at from ai_responses where run_id=${id} and org_id=${user.org_id} order by query_text,provider,sample`,
    sql<
      Mention[]
    >`select m.* from brand_mentions m join ai_responses a on a.id=m.response_id and a.org_id=m.org_id where a.run_id=${id} and m.org_id=${user.org_id}`,
    sql<
      Citation[]
    >`select c.* from citations c join ai_responses a on a.id=c.response_id and a.org_id=c.org_id where a.run_id=${id} and c.org_id=${user.org_id}`,
  ]);
  return {
    run: {
      ...run,
      total: responses.length,
      valid: responses.filter((r) => r.status === "succeeded").length,
      pending: responses.filter((r) => ["queued", "running"].includes(r.status)).length,
      failed: responses.filter((r) => ["failed", "invalid", "uncertain"].includes(r.status)).length,
    },
    responses,
    mentions,
    citations,
  };
}
