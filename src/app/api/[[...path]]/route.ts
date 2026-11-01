import { requestSuggestions, getSuggestions } from "@/lib/suggestions";
import {
  organizeQueries,
  listQueryViews,
  saveQueryView,
  deleteQueryView,
} from "@/lib/query-organization-service";
import {
  listGeoActions,
  getGeoAction,
  createGeoAction,
  updateGeoAction,
  deleteGeoAction,
} from "@/lib/geo-actions-service";
import { getCampaignHistory } from "@/lib/history-service";
import { updateProject, saveScanSettings, addQuestions } from "@/lib/project-settings";
import { z } from "zod";
import { brandScopeSchema, comparisonBrands, comparisonScope } from "@/lib/brand-analysis";
import { sql } from "@/db/client";
import { AppError } from "@/lib/errors";
import { ProjectValidationError } from "@/lib/project-validation";
import { MAX_BRANDS, PROJECT_BODY_LIMIT_BYTES } from "@/lib/project-limits";
import { authenticate, rateLimit, requireUser, sessionCookie, sessionToken } from "@/lib/auth";
import { assertOrigin, digest, verifyPassword, decryptSecret } from "@/lib/security";
import { credentialCheckSchema, verifyProviderCredential } from "@/lib/provider-auth";
import {
  createProject,
  createRun,
  estimateRun,
  getState,
  listRuns,
  getRun,
  ownedProject,
  saveCredential,
  ceilingMicros,
  uuidSchema,
  brandSchema,
} from "@/lib/service";
import { toCsv } from "@/lib/measurement";
import { saveSchedule, listSchedules, setScheduleEnabled } from "@/lib/schedules";
import { getBranding, saveBranding, createReport, listReports, getReport } from "@/lib/reports";
import { renderReport } from "@/lib/report-pdf";
import { PROVIDERS } from "@/lib/providers";
import { createRetry, estimateRetry } from "@/lib/retries";
import { saveExecutionPolicy } from "@/lib/execution-control";
import { allAttempts } from "@/lib/run-insights";
import {
  createAudit,
  getAudit,
  listAudits,
  cancelAudit,
  estimateAuditAI,
  createAuditAI,
} from "@/lib/site-audit/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function body(request: Request, maxBytes = 100_000) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("json_required", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("body_required");
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) {
      await reader.cancel();
      throw new AppError("body_too_large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("invalid_json");
  }
}
function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
async function handler(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const path = (await context.params).path ?? [],
      route = path.join("/"),
      method = request.method,
      url = new URL(request.url);
    if (method !== "GET") assertOrigin(request);
    if (route === "health" && method === "GET") {
      await sql`select 1`;
      return json({ status: "ok" });
    }
    if (route === "auth/status" && method === "GET") {
      const [row] = await sql`select count(*)::int as n from users`;
      return json({ setupRequired: row.n === 0 });
    }
    if (["auth/login", "auth/register"].includes(route) && method === "POST") {
      const result = await authenticate(await body(request), route.endsWith("register"));
      return json({ user: result.user }, 200, { "Set-Cookie": sessionCookie(result.token) });
    }
    const user = await requireUser(request);
    if (method !== "GET") await rateLimit(`write:${user.id}`, 60, 60);
    if (route === "auth/logout" && method === "POST") {
      await sql`delete from sessions where token_hash=${digest(sessionToken(request))}`;
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
    }
    if (route === "state" && method === "GET") return json(await getState(user));
    if (path[0] === "projects" && path[1] && path.length === 3) {
      if (path[2] === "query-organization" && method === "POST")
        return json(await organizeQueries(user, path[1], await body(request)));
      if (path[2] === "query-views") {
        if (method === "GET") return json(await listQueryViews(user, path[1]));
        if (method === "POST")
          return json(await saveQueryView(user, path[1], await body(request)), 201);
      }
      if (path[2] === "actions") {
        if (method === "GET") return json(await listGeoActions(user, path[1]));
        if (method === "POST")
          return json(await createGeoAction(user, path[1], await body(request)), 201);
      }
      if (path[2] === "history" && method === "GET")
        return json(await getCampaignHistory(user, path[1], Object.fromEntries(url.searchParams)));
    }
    if (path[0] === "query-views" && path.length === 2 && method === "DELETE") {
      await deleteQueryView(user, path[1]);
      return json({ ok: true });
    }
    if (path[0] === "actions" && path.length === 2) {
      if (method === "GET") return json(await getGeoAction(user, path[1]));
      if (method === "POST") return json(await updateGeoAction(user, path[1], await body(request)));
      if (method === "DELETE") {
        await deleteGeoAction(user, path[1], await body(request));
        return json({ ok: true });
      }
    }
    if (route === "audits" && method === "GET")
      return json(await listAudits(user, url.searchParams.get("project") ?? ""));
    if (route === "audits" && method === "POST")
      return json(await createAudit(user, await body(request)), 201);
    if (path[0] === "audits" && path[1]) {
      if (
        method === "GET" &&
        (path.length === 2 || (path.length === 3 && ["export", "csv"].includes(path[2])))
      ) {
        const audit = await getAudit(user, path[1]);
        if (path[2] === "csv")
          return new Response(
            toCsv(
              audit.pages.map((p) => ({
                audit_id: audit.audit.id,
                version: audit.audit.version,
                site: audit.sites.find((s) => s.id === p.site_id)?.target,
                ...p,
                currency: "USD",
                limitations:
                  "Static public HTML; bounded crawl; no JavaScript or ranking measurement",
              })),
            ),
            {
              headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Disposition": `attachment; filename="site-audit-${audit.audit.id}.csv"`,
              },
            },
          );
        return json(
          audit,
          200,
          path[2] === "export"
            ? { "Content-Disposition": `attachment; filename="site-audit-${audit.audit.id}.json"` }
            : {},
        );
      }
      if (method === "POST" && path.length === 3 && path[2] === "cancel") {
        await cancelAudit(user, path[1]);
        return json({ ok: true });
      }
      if (
        method === "POST" &&
        path[2] === "ai" &&
        (path.length === 3 || (path.length === 4 && path[3] === "estimate"))
      ) {
        const data = await body(request);
        return path[3] === "estimate"
          ? json(await estimateAuditAI(user, path[1], data))
          : json(await createAuditAI(user, path[1], data), 201);
      }
    }
    if (route === "execution/limits" && method === "POST") {
      await saveExecutionPolicy(user, await body(request));
      return json({ ok: true });
    }
    if (route === "suggestions" && method === "POST")
      return json(
        await requestSuggestions(user, await body(request, PROJECT_BODY_LIMIT_BYTES)),
        202,
      );
    if (path[0] === "suggestions" && path.length === 2 && method === "GET")
      return json(await getSuggestions(user, path[1]));
    if (route === "projects" && method === "POST")
      return json(await createProject(user, await body(request, PROJECT_BODY_LIMIT_BYTES)), 201);
    if (path[0] === "projects" && path[1] && path.length === 2 && method === "POST")
      return json(
        await updateProject(user, path[1], await body(request, PROJECT_BODY_LIMIT_BYTES)),
      );
    if (
      path[0] === "projects" &&
      path[1] &&
      path.length === 3 &&
      method === "POST" &&
      path[2] === "scan-settings"
    )
      return json(await saveScanSettings(user, path[1], await body(request)));
    if (
      path[0] === "projects" &&
      path[1] &&
      path.length === 3 &&
      method === "POST" &&
      path[2] === "queries"
    )
      return json(
        await addQuestions(user, path[1], await body(request, PROJECT_BODY_LIMIT_BYTES)),
        201,
      );
    if (path[0] === "projects" && path[1] && path.length === 2 && method === "DELETE") {
      await ownedProject(user, path[1]);
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(824762)`;
        await tx`select id from projects where id=${path[1]} and org_id=${user.org_id} for update`;
        const [pending] =
          await tx`select count(*)::int as n from ai_responses a join measurement_runs r on r.id=a.run_id where r.project_id=${path[1]} and a.org_id=${user.org_id} and a.status in ('queued','running')`;
        if (pending.n) throw new AppError("campaign_already_running", 409);
        const [assistantPending] =
          await tx`select id from assistant_jobs where org_id=${user.org_id} and status in ('queued','running') limit 1`;
        if (assistantPending) throw new AppError("suggestions_running", 409);
        const [auditPending] =
          await tx`select 1 from site_audits a where a.project_id=${path[1]} and a.org_id=${user.org_id} and (
          exists(select 1 from audit_sites s where s.audit_id=a.id and s.status in ('queued','running')) or
          exists(select 1 from audit_ai_jobs j where j.audit_id=a.id and j.status in ('queued','running'))) limit 1`;
        if (auditPending) throw new AppError("audit_already_running", 409);
        await tx`delete from projects where id=${path[1]} and org_id=${user.org_id}`;
      });
      return json({ ok: true });
    }
    if (
      path[0] === "projects" &&
      path[1] &&
      path.length === 3 &&
      path[2] === "brands" &&
      method === "POST"
    ) {
      await ownedProject(user, path[1]);
      const data = await body(request);
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(824762)`;
        const [project] =
          await tx`select id from projects where id=${path[1]} and org_id=${user.org_id} for update`;
        if (!project) throw new AppError("not_found", 404);
        const p = brandSchema.parse(data);
        const [count] =
          await tx`select count(*)::int as n from brands where project_id=${path[1]} and org_id=${user.org_id}`;
        if (count.n >= MAX_BRANDS) throw new AppError("brand_limit");
        const [duplicate] =
          await tx`select id from brands where project_id=${path[1]} and org_id=${user.org_id} and lower(name)=lower(${p.name})`;
        if (duplicate) throw new AppError("duplicate_brand");
        await tx`insert into brands (org_id,project_id,name,domain) values (${user.org_id},${path[1]},${p.name},${p.domain})`;
        await tx`update projects set revision=revision+1 where id=${path[1]} and org_id=${user.org_id}`;
      });
      return json({ ok: true }, 201);
    }
    if (
      ["queries", "brands"].includes(path[0]) &&
      path[1] &&
      path.length === 2 &&
      method === "DELETE"
    ) {
      uuidSchema.parse(path[1]);
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(824762)`;
        const table = tx(path[0] === "queries" ? "tracked_queries" : "brands");
        const rows =
          path[0] === "queries"
            ? await tx`delete from ${table} where id=${path[1]} and org_id=${user.org_id} returning project_id`
            : await tx`delete from ${table} where id=${path[1]} and org_id=${user.org_id} and is_primary=false returning project_id`;
        if (!rows.length) throw new AppError("not_found", 404);
        await tx`update projects set revision=revision+1 where id=${rows[0].project_id} and org_id=${user.org_id}`;
      });
      return json({ ok: true });
    }
    if (route === "credentials/check" && method === "POST") {
      await rateLimit(`credential-check:${user.id}`, 30, 60);
      const { provider, key: candidate } = credentialCheckSchema.parse(await body(request));
      const [stored] = candidate
        ? []
        : await sql`select encrypted_key from credentials where org_id=${user.org_id} and provider=${provider}`;
      if (!candidate && !stored) throw new AppError("credentials_required");
      const key = candidate ?? decryptSecret(stored.encrypted_key, `${user.org_id}:${provider}`);
      const result = await verifyProviderCredential(provider, key);
      if (stored)
        await sql`update credentials set updated_at=now() where org_id=${user.org_id} and provider=${provider} and encrypted_key=${stored.encrypted_key}`;
      return json(result);
    }
    if (route === "credentials" && method === "POST") {
      await saveCredential(user, await body(request));
      return json({ ok: true });
    }
    if (path[0] === "credentials" && path[1] && path.length === 2 && method === "DELETE") {
      z.enum(PROVIDERS).parse(path[1]);
      await sql`delete from credentials where org_id=${user.org_id} and provider=${path[1]}`;
      return json({ ok: true });
    }
    if (route === "runs/estimate" && method === "POST")
      return json(await estimateRun(user, await body(request)));
    if (route === "schedules" && method === "GET")
      return json(await listSchedules(user, url.searchParams.get("project") ?? ""));
    if (route === "schedules" && method === "POST")
      return json(await saveSchedule(user, await body(request)), 201);
    if (path[0] === "schedules" && path[1] && path.length === 2 && method === "POST") {
      await setScheduleEnabled(user, path[1], await body(request));
      return json({ ok: true });
    }
    if (route === "branding" && method === "GET") return json(await getBranding(user));
    if (route === "branding" && method === "POST") {
      await saveBranding(user, await body(request, 360_000));
      return json({ ok: true });
    }
    if (route === "reports" && method === "GET")
      return json(await listReports(user, url.searchParams.get("project") ?? ""));
    if (route === "reports" && method === "POST") {
      await rateLimit(`report:${user.id}`, 20, 3600);
      return json(await createReport(user, await body(request)), 201);
    }
    if (
      path[0] === "reports" &&
      path[1] &&
      path.length === 3 &&
      ["pdf", "data"].includes(path[2]) &&
      method === "GET"
    ) {
      const report = await getReport(user, path[1]);
      if (path[2] === "data")
        return json(report.payload, 200, {
          "Content-Disposition": `attachment; filename="evidence-${report.id}.json"`,
        });
      await rateLimit(`pdf:${user.id}`, 30, 3600);
      const pdf = await renderReport(report.payload, report.id);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="report-${report.id}.pdf"`,
        },
      });
    }
    if (path[0] === "reports" && path[1] && path.length === 2 && method === "DELETE") {
      uuidSchema.parse(path[1]);
      const rows =
        await sql`delete from reports where id=${path[1]} and org_id=${user.org_id} returning id`;
      if (!rows.length) throw new AppError("not_found", 404);
      return json({ ok: true });
    }
    if (
      path[0] === "runs" &&
      path[1] &&
      path[2] === "retry" &&
      method === "POST" &&
      (path.length === 3 || (path.length === 4 && path[3] === "estimate"))
    ) {
      const data = await body(request);
      if (path[3] === "estimate") return json(await estimateRetry(user, path[1], data));
      await rateLimit(`campaign:${user.id}`, 10, 3600);
      return json(await createRetry(user, path[1], data), 201);
    }
    if (route === "runs" && method === "POST") {
      await rateLimit(`campaign:${user.id}`, 10, 3600);
      return json(await createRun(user, await body(request)), 201);
    }
    if (route === "runs" && method === "GET")
      return json(await listRuns(user, url.searchParams.get("project") ?? ""));
    if (
      path[0] === "runs" &&
      path[1] &&
      (path.length === 2 || (path.length === 3 && path[2] === "export")) &&
      method === "GET"
    ) {
      const scope = brandScopeSchema.parse(url.searchParams.get("brandScope") ?? "original");
      const result = await getRun(user, path[1], scope);
      if (path[2] === "export") {
        const currentIds = new Set(result.responses.map((r) => r.id));
        const rows = allAttempts(result).map((r) => ({
          ...r,
          campaign_id: result.run.id,
          is_current_attempt: currentIds.has(r.id),
          campaign_date: result.run.created_at,
          config_hash: result.run.config_hash,
          methodology: result.run.snapshot.methodology,
          brand_scope: comparisonScope(result),
          analysis_methodology:
            result.brandAnalysis?.methodology ?? result.run.snapshot.methodology,
          analysis_date: result.brandAnalysis?.evaluatedAt ?? null,
          analysis_brand_set_hash: result.brandAnalysis?.brandSetHash ?? null,
          analyzed_brands: comparisonBrands(result),
          original_brands: result.run.snapshot.brands,
          language: result.run.snapshot.project.language,
          country_context: result.run.snapshot.project.country,
          country_mode: "prompt_context_only",
          cost_currency: "USD",
          system_instruction: result.run.snapshot.system,
          mentions: [...result.mentions, ...(result.previousMentions ?? [])].filter(
            (m) => m.response_id === r.id,
          ),
          citations: [...result.citations, ...(result.previousCitations ?? [])].filter(
            (c) => c.response_id === r.id,
          ),
        }));
        return new Response(toCsv(rows), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="visibility-${result.run.id}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return json(result);
    }
    if (route === "budget" && method === "POST") {
      const p = z.object({ usd: z.number().min(0.01).max(1000) }).parse(await body(request));
      if (p.usd * 1e6 > ceilingMicros()) throw new AppError("budget_above_ceiling");
      await sql`update organizations set budget_micros=${Math.round(p.usd * 1e6)} where id=${user.org_id}`;
      return json({ ok: true });
    }
    if (route === "account/export" && method === "GET") {
      const state = await getState(user);
      const runs = await sql`select * from measurement_runs where org_id=${user.org_id}`;
      const responses = await sql`select * from ai_responses where org_id=${user.org_id}`;
      const retries = await sql`select * from response_retries where org_id=${user.org_id}`;
      const mentions = await sql`select * from brand_mentions where org_id=${user.org_id}`;
      const citations = await sql`select * from citations where org_id=${user.org_id}`;
      const usage = await sql`select * from usage_records where org_id=${user.org_id}`;
      const schedules = await sql`select * from measurement_schedules where org_id=${user.org_id}`;
      const scheduleEvents = await sql`select * from schedule_events where org_id=${user.org_id}`;
      const reports = await sql`select * from reports where org_id=${user.org_id}`;
      const branding = await getBranding(user);
      const audits = await sql`select * from site_audits where org_id=${user.org_id}`;
      const auditSites = await sql`select * from audit_sites where org_id=${user.org_id}`;
      const auditPages = await sql`select * from audit_pages where org_id=${user.org_id}`;
      const suggestions = await sql`select * from assistant_jobs where org_id=${user.org_id}`;
      const queryViews = await sql`select * from query_views where org_id=${user.org_id}`;
      const geoActions = await sql`select * from geo_actions where org_id=${user.org_id}`;
      const auditAnalyses = await sql`select * from audit_ai_jobs where org_id=${user.org_id}`;
      return json(
        {
          ...state,
          runs,
          responses,
          retries,
          mentions,
          citations,
          usageRecords: usage,
          schedules,
          scheduleEvents,
          reports,
          branding,
          audits,
          auditSites,
          auditPages,
          auditAnalyses,
          suggestions,
          queryViews,
          geoActions,
        },
        200,
        {
          "Content-Disposition": 'attachment; filename="visibility-personal-data.json"',
        },
      );
    }
    if (route === "account" && method === "DELETE") {
      const p = z
        .object({ password: z.string().min(1).max(128), confirm: z.literal("DELETE") })
        .parse(await body(request));
      await rateLimit(`delete:${user.id}`, 5, 3600);
      const [u] = await sql`select password_hash from users where id=${user.id}`;
      if (!(await verifyPassword(p.password, u.password_hash)))
        throw new AppError("invalid_credentials", 403);
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(824762)`;
        await tx`select id from organizations where id=${user.org_id} for update`;
        const [pending] =
          await tx`select count(*)::int as n from ai_responses where org_id=${user.org_id} and status in ('queued','running')`;
        if (pending.n) throw new AppError("campaign_already_running", 409);
        const [assistantPending] =
          await tx`select id from assistant_jobs where org_id=${user.org_id} and status in ('queued','running') limit 1`;
        if (assistantPending) throw new AppError("suggestions_running", 409);
        const [auditPending] =
          await tx`select 1 where exists(select 1 from audit_sites where org_id=${user.org_id} and status in ('queued','running')) or exists(select 1 from audit_ai_jobs where org_id=${user.org_id} and status in ('queued','running'))`;
        if (auditPending) throw new AppError("audit_already_running", 409);
        await tx`delete from organizations where id=${user.org_id}`;
      });
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
    }
    throw new AppError("not_found", 404);
  } catch (error) {
    if (error instanceof ProjectValidationError)
      return json({ error: error.code, issues: error.issues }, error.status);
    if (error instanceof AppError) return json({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return json({ error: "invalid_input" }, 400);
    // SQL errors may contain submitted secrets. Never log or return error objects.
    console.error("api_request_failed");
    return json({ error: "internal_error" }, 500);
  }
}
export { handler as GET, handler as POST, handler as DELETE };
