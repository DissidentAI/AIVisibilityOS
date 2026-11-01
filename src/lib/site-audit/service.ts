import { z } from "zod";
import type { TransactionSql } from "postgres";
import { sql } from "../../db/client";
import { AppError } from "../errors";
import { ownedProject, uuidSchema, budgetStatus, assertSnapshotAvailable } from "../service";
import { digest } from "../security";
import { snapshotJson } from "../snapshot-json";
import {
  PROVIDERS,
  PRICE_DATE,
  SEARCH_PRICING,
  modelConfiguration,
  reserveMicros,
  requestOptions,
} from "../providers";
import { OPENROUTER_MODEL_IDS, requestEndpoint } from "../provider-config";
import type { User, Snapshot } from "../types";
import type { Brand } from "../measurement";
import {
  AUDIT_LIMITS,
  AUDIT_VERSION,
  type AuditPage,
  type AuditSite,
  type SiteAudit,
} from "./types";
import { initialCrawlState } from "./crawler";
import { compareSites } from "./analysis";
import { evidencePrompt, parseSynthesis, synthesisInstructions } from "./ai-evidence";

const createSchema = z.object({
  projectId: z.uuid(),
  competitorIds: z
    .array(z.uuid())
    .max(AUDIT_LIMITS.maxSites - 1)
    .refine((ids) => new Set(ids).size === ids.length),
  maxPages: z.number().int().min(1).max(AUDIT_LIMITS.maxPages).default(AUDIT_LIMITS.defaultPages),
});
const aiSchema = z.object({
  provider: z.enum(PROVIDERS),
  openrouterModel: z.enum(OPENROUTER_MODEL_IDS).optional(),
});
const aiLaunchSchema = aiSchema.extend({ expectedQuoteHash: z.string().regex(/^[a-f0-9]{64}$/) });
export async function createAudit(user: User, data: unknown) {
  const input = createSchema.parse(data);
  return sql.begin(async (tx) => {
    // Shared with project/account deletion and budget reservations.
    await tx`select pg_advisory_xact_lock(824762)`;
    const [project] =
      await tx`select id,language from projects where id=${input.projectId} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    const brands = await tx<
      Brand[]
    >`select id,name,domain,is_primary from brands where project_id=${input.projectId} and org_id=${user.org_id} order by is_primary desc,name`;
    if (input.competitorIds.some((id) => !brands.some((b) => b.id === id && !b.is_primary)))
      throw new AppError("not_found", 404);
    const targets = brands.filter((b) => b.is_primary || input.competitorIds.includes(b.id));
    if (!targets.some((b) => b.is_primary)) throw new AppError("audit_primary_required");
    const [active] =
      await tx`select count(*)::int as n from audit_sites where org_id=${user.org_id} and status in ('queued','running')`;
    if (active.n > 0) throw new AppError("audit_already_running", 409);
    // Keep requested-page accounting independently of deletable audit history.
    const [daily] = await tx`insert into rate_limits(key,count,expires_at)
      values(${"audit-pages:" + user.org_id},${targets.length * input.maxPages},now()+interval '24 hours')
      on conflict(key) do update set count=case when rate_limits.expires_at<=now() then excluded.count else rate_limits.count+excluded.count end,
      expires_at=case when rate_limits.expires_at<=now() then excluded.expires_at else rate_limits.expires_at end returning count`;
    if (daily.count > 2000) throw new AppError("audit_daily_limit", 429);
    const [audit] =
      await tx`insert into site_audits(org_id,project_id,language,max_pages,version) values(${user.org_id},${input.projectId},${project.language},${input.maxPages},${AUDIT_VERSION}) returning id`;
    for (const b of targets)
      await tx`insert into audit_sites(org_id,audit_id,target,state,max_pages) values(${user.org_id},${audit.id},${JSON.stringify({ brandId: b.id, name: b.name, domain: b.domain, primary: b.is_primary })}::jsonb,${JSON.stringify(initialCrawlState(b.domain))}::jsonb,${input.maxPages})`;
    return { id: audit.id as string };
  });
}
async function auditRows(tx: TransactionSql | typeof sql, user: User, id: string) {
  uuidSchema.parse(id);
  const [audit] = await tx<
    SiteAudit[]
  >`select * from site_audits where id=${id} and org_id=${user.org_id}`;
  if (!audit) throw new AppError("not_found", 404);
  const sites = await tx<
    AuditSite[]
  >`select * from audit_sites where audit_id=${id} and org_id=${user.org_id} order by (target->>'primary') desc,target->>'name',id`;
  const pages = await tx<
    AuditPage[]
  >`select p.* from audit_pages p join audit_sites s on s.id=p.site_id and s.org_id=p.org_id where s.audit_id=${id} and p.org_id=${user.org_id} order by p.fetched_at,p.id`;
  return { audit, sites, pages };
}
export async function listAudits(
  user: User,
  projectId: string,
): Promise<(SiteAudit & { sites: number; active: number; pages: number })[]> {
  await ownedProject(user, projectId);
  return sql<
    (SiteAudit & { sites: number; active: number; pages: number })[]
  >`select a.*,count(distinct s.id)::int as sites,
    count(distinct s.id) filter(where s.status in ('queued','running'))::int as active,count(p.id)::int as pages
    from site_audits a left join audit_sites s on s.audit_id=a.id and s.org_id=a.org_id
    left join audit_pages p on p.site_id=s.id and p.org_id=s.org_id
    where a.project_id=${projectId} and a.org_id=${user.org_id} group by a.id order by a.created_at desc limit 50`;
}
export type AuditAI = {
  id: string;
  audit_id: string;
  provider: z.infer<typeof aiSchema>["provider"];
  model: string;
  returned_model: string | null;
  channel: string;
  snapshot: Snapshot;
  parameters: Record<string, unknown>;
  status: string;
  answer: string | null;
  error_code: string | null;
  request_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_micros: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
export async function getAudit(user: User, id: string) {
  const data = await auditRows(sql, user, id);
  const jobs = await sql<
    AuditAI[]
  >`select id,audit_id,provider,model,returned_model,channel,snapshot,parameters,status,answer,error_code,request_id,input_tokens,output_tokens,cost_micros,created_at,started_at,finished_at from audit_ai_jobs where audit_id=${id} and org_id=${user.org_id} order by created_at desc,id`;
  return {
    ...data,
    comparison: compareSites(data.sites, data.pages),
    analyses: jobs.map((job) => ({
      ...job,
      synthesis:
        job.status === "succeeded"
          ? parseSynthesis(job.answer, (job.snapshot.parameters.auditEvidenceIds as string[]) ?? [])
          : null,
    })),
  };
}
export type AuditDetail = Awaited<ReturnType<typeof getAudit>>;
export async function cancelAudit(user: User, id: string) {
  uuidSchema.parse(id);
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    const [audit] =
      await tx`select id from site_audits where id=${id} and org_id=${user.org_id} for update`;
    if (!audit) throw new AppError("not_found", 404);
    await tx`update audit_sites set status='cancelled',reason='user_cancelled',lease_token=null,lease_until=null,finished_at=now(),updated_at=now() where audit_id=${id} and org_id=${user.org_id} and status in ('queued','running')`;
    // Only queued inference can be cancelled at zero cost. An already-started
    // request still settles normally and is never silently replayed.
    await tx`with stopped as(update audit_ai_jobs set status='failed',error_code='cancelled_before_request',cost_micros=0,finished_at=now() where audit_id=${id} and org_id=${user.org_id} and status='queued' returning id)
      update usage_records set amount_micros=0,kind='estimated' where org_id=${user.org_id} and audit_ai_id in(select id from stopped)`;
  });
}
async function prepareAI(
  tx: TransactionSql,
  user: User,
  id: string,
  input: z.infer<typeof aiSchema>,
) {
  const { audit, sites, pages } = await auditRows(tx, user, id);
  if (sites.some((s) => ["queued", "running"].includes(s.status)))
    throw new AppError("audit_not_ready", 409);
  if (!pages.some((p) => p.facts)) throw new AppError("audit_no_pages", 409);
  const provider = input.provider,
    model = modelConfiguration(
      provider,
      provider === "openrouter" ? input.openrouterModel : undefined,
    );
  if (!model) throw new AppError("model_configuration_changed", 409);
  if (provider === "openai" && new Date() >= new Date("2027-01-14T00:00:00Z"))
    throw new AppError("model_retired", 409);
  const [credential] =
    await tx`select provider from credentials where org_id=${user.org_id} and provider=${provider}`;
  if (!credential) throw new AppError("credentials_required");
  const primary = sites.find((s) => s.target.primary)!;
  const { query, evidenceIds } = evidencePrompt(sites, pages);
  const snapshot: Snapshot = {
    project: {
      name: primary.target.name,
      domain: primary.target.domain,
      language: audit.language,
      country: "",
    },
    brands: sites.map((s) => ({
      id: s.target.brandId,
      name: s.target.name,
      domain: s.target.domain,
      is_primary: s.target.primary,
    })),
    queries: [{ id: audit.id, project_id: audit.project_id, text: query }],
    providers: [provider],
    models: { [provider]: model.id },
    samples: 1,
    methodology: AUDIT_VERSION,
    system: synthesisInstructions(audit.language),
    parameters: {
      search: false,
      mode: "baseline",
      purpose: "site_audit_synthesis",
      auditEvidenceIds: evidenceIds,
      providers: {
        [provider]: {
          endpoint: requestEndpoint(provider, "baseline", model),
          request: requestOptions(provider, "baseline", model),
          channel: provider === "openrouter" ? "openrouter_api" : "official_api",
        },
      },
    },
    pricing: {
      date: PRICE_DATE,
      currency: "USD",
      models: { [provider]: model },
      search: SEARCH_PRICING,
    },
  };
  assertSnapshotAvailable(snapshot);
  const reservedMicros = reserveMicros(provider, query, snapshot.system, "baseline", model);
  const budget = await budgetStatus(tx, user);
  const quote = {
    reservedMicros,
    ...budget,
    affordable: reservedMicros <= Math.min(budget.orgRemaining, budget.installationRemaining),
    quoteHash: digest(snapshotJson(snapshot)),
    evidencePages: evidenceIds.length,
    attemptedPages: pages.length,
    provider,
    model: model.id,
  };
  return { snapshot, query, quote };
}
export async function estimateAuditAI(user: User, id: string, data: unknown) {
  const input = aiSchema.parse(data);
  return sql.begin(async (tx) => (await prepareAI(tx, user, id, input)).quote);
}
export type AuditEstimate = Awaited<ReturnType<typeof estimateAuditAI>>;
export async function createAuditAI(user: User, id: string, data: unknown) {
  const input = aiLaunchSchema.parse(data);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    const { snapshot, query, quote } = await prepareAI(tx, user, id, input);
    if (input.expectedQuoteHash !== quote.quoteHash)
      throw new AppError("configuration_changed", 409);
    if (!quote.affordable) throw new AppError("budget_exceeded", 409);
    const [pending] =
      await tx`select count(*)::int as n from audit_ai_jobs where org_id=${user.org_id} and audit_id=${id} and status in ('queued','running')`;
    if (pending.n) throw new AppError("audit_ai_running", 409);
    const [count] =
      await tx`select count(*)::int as n from audit_ai_jobs where org_id=${user.org_id} and audit_id=${id}`;
    if (count.n >= 10) throw new AppError("audit_ai_limit", 409);
    const [job] =
      await tx`insert into audit_ai_jobs(org_id,audit_id,query_text,snapshot,provider,model,channel,parameters) values(${user.org_id},${id},${query},${JSON.stringify(snapshot)}::jsonb,${input.provider},${quote.model},${input.provider === "openrouter" ? "openrouter_api" : "official_api"},${JSON.stringify(snapshot.parameters)}::jsonb) returning id`;
    await tx`insert into usage_records(org_id,audit_ai_id,amount_micros) values(${user.org_id},${job.id},${quote.reservedMicros})`;
    return { id: job.id as string, reservedMicros: quote.reservedMicros };
  });
}
