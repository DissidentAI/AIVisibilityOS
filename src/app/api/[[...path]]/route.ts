import { z } from "zod";
import { sql } from "@/db/client";
import { AppError } from "@/lib/errors";
import { authenticate, rateLimit, requireUser, sessionCookie, sessionToken } from "@/lib/auth";
import { assertOrigin, digest, verifyPassword } from "@/lib/security";
import {
  createProject,
  createRun,
  getState,
  listRuns,
  getRun,
  ownedProject,
  saveCredential,
  ceilingMicros,
  uuidSchema,
  brandSchema,
} from "@/lib/service";
import { toCsv, METHODOLOGY } from "@/lib/measurement";
import { PROVIDERS } from "@/lib/providers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function body(request: Request) {
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
    if (n > 100_000) {
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
    if (route === "projects" && method === "POST")
      return json(await createProject(user, await body(request)), 201);
    if (path[0] === "projects" && path[1] && path.length === 2 && method === "DELETE") {
      await ownedProject(user, path[1]);
      await sql.begin(async (tx) => {
        await tx`select id from projects where id=${path[1]} and org_id=${user.org_id} for update`;
        const [pending] =
          await tx`select count(*)::int as n from ai_responses a join measurement_runs r on r.id=a.run_id where r.project_id=${path[1]} and a.org_id=${user.org_id} and a.status in ('queued','running')`;
        if (pending.n) throw new AppError("campaign_already_running", 409);
        await tx`delete from projects where id=${path[1]} and org_id=${user.org_id}`;
      });
      return json({ ok: true });
    }
    if (
      path[0] === "projects" &&
      path[1] &&
      path.length === 3 &&
      ["queries", "brands"].includes(path[2]) &&
      method === "POST"
    ) {
      await ownedProject(user, path[1]);
      const data = await body(request);
      await sql.begin(async (tx) => {
        await tx`select id from projects where id=${path[1]} and org_id=${user.org_id} for update`;
        if (path[2] === "queries") {
          const p = z.object({ text: z.string().trim().min(5).max(1000) }).parse(data);
          const [count] =
            await tx`select count(*)::int as n from tracked_queries where project_id=${path[1]} and org_id=${user.org_id}`;
          if (count.n >= 50) throw new AppError("query_limit");
          await tx`insert into tracked_queries (org_id,project_id,text) values (${user.org_id},${path[1]},${p.text}) on conflict do nothing`;
        } else {
          const p = brandSchema.parse(data);
          const [count] =
            await tx`select count(*)::int as n from brands where project_id=${path[1]} and org_id=${user.org_id}`;
          if (count.n >= 11) throw new AppError("brand_limit");
          const [duplicate] =
            await tx`select id from brands where project_id=${path[1]} and org_id=${user.org_id} and lower(name)=lower(${p.name})`;
          if (duplicate) throw new AppError("duplicate_brand");
          await tx`insert into brands (org_id,project_id,name,domain) values (${user.org_id},${path[1]},${p.name},${p.domain})`;
        }
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
      const rows =
        path[0] === "queries"
          ? await sql`delete from tracked_queries where id=${path[1]} and org_id=${user.org_id} returning id`
          : await sql`delete from brands where id=${path[1]} and org_id=${user.org_id} and is_primary=false returning id`;
      if (!rows.length) throw new AppError("not_found", 404);
      return json({ ok: true });
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
      const result = await getRun(user, path[1]);
      if (path[2] === "export") {
        const rows = result.responses.map((r) => ({
          ...r,
          campaign_date: result.run.created_at,
          config_hash: result.run.config_hash,
          methodology: METHODOLOGY,
          language: result.run.snapshot.project.language,
          country_context: result.run.snapshot.project.country,
          country_mode: "prompt_context_only",
          cost_currency: "USD",
          system_instruction: result.run.snapshot.system,
          mentions: result.mentions.filter((m) => m.response_id === r.id),
          citations: result.citations.filter((c) => c.response_id === r.id),
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
      const mentions = await sql`select * from brand_mentions where org_id=${user.org_id}`;
      const citations = await sql`select * from citations where org_id=${user.org_id}`;
      const usage = await sql`select * from usage_records where org_id=${user.org_id}`;
      return json({ ...state, runs, responses, mentions, citations, usageRecords: usage }, 200, {
        "Content-Disposition": 'attachment; filename="visibility-personal-data.json"',
      });
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
        await tx`select id from organizations where id=${user.org_id} for update`;
        const [pending] =
          await tx`select count(*)::int as n from ai_responses where org_id=${user.org_id} and status in ('queued','running')`;
        if (pending.n) throw new AppError("campaign_already_running", 409);
        await tx`delete from organizations where id=${user.org_id}`;
      });
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
    }
    throw new AppError("not_found", 404);
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.code }, error.status);
    if (error instanceof z.ZodError) return json({ error: "invalid_input" }, 400);
    // SQL errors may contain submitted secrets. Never log or return error objects.
    console.error("api_request_failed");
    return json({ error: "internal_error" }, 500);
  }
}
export { handler as GET, handler as POST, handler as DELETE };
