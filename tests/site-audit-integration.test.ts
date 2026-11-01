import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "../src/db/client";
import { createProject, createRun, saveCredential, getState } from "../src/lib/service";
import { digest } from "../src/lib/security";
import type { User } from "../src/lib/types";
import { GET, POST, DELETE } from "../src/app/api/[[...path]]/route";
import {
  createAudit,
  getAudit,
  listAudits,
  cancelAudit,
  estimateAuditAI,
  createAuditAI,
} from "../src/lib/site-audit/service";
import { claimAuditSite, workAuditOnce } from "../src/lib/site-audit/worker";
import { workOnce, claimJob, settleJob, maintenance } from "../src/lib/queue";
import { saveExecutionPolicy } from "../src/lib/execution-control";
import { MODELS } from "../src/lib/provider-config";
import { auditFixtureFetcher, auditFixtureModel } from "./fixtures/site-audit";
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Unsafe database");
  await migrate(db, { migrationsFolder: "drizzle" });
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await sql`truncate organizations,rate_limits,worker_heartbeats,crawl_hosts cascade`;
});
afterAll(async () => {
  await sql.end();
});
async function owner(name = "audit") {
  const [org] = await sql`insert into organizations(name) values(${name}) returning id`;
  const [user] = await sql<
    User[]
  >`insert into users(org_id,email,password_hash) values(${org.id},${name + "@example.com"},'not-a-login-password') returning id,org_id,email`;
  const token = randomBytes(32).toString("hex");
  await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(token)},${user.id},now()+interval '1 day')`;
  const project = await createProject(user, {
    name: "Audit fixture",
    domain: "audit.example",
    industry: "Synthetic software",
    country: "FR",
    language: "fr",
    competitors: [{ name: "Other fixture", domain: "other.example" }],
    queries: ["Quelle solution choisir pour tester ?"],
  });
  const [competitor] =
    await sql`select id from brands where project_id=${project.id} and is_primary=false`;
  await saveCredential(user, {
    provider: "openai",
    key: "synthetic-key-test-only-never-production",
  });
  return {
    user,
    cookie: `avos_session=${token}`,
    projectId: project.id,
    competitorId: competitor.id as string,
  };
}
async function ready() {
  const a = await owner();
  const audit = await createAudit(a.user, {
    projectId: a.projectId,
    competitorIds: [a.competitorId],
    maxPages: 10,
  });
  let count = 0;
  while (await workAuditOnce({ fetcher: auditFixtureFetcher, skipPolitenessTestOnly: true })) {
    if (++count > 20) throw new Error("Unbounded fixture crawl");
  }
  return { ...a, auditId: audit.id };
}
function route(
  method: "GET" | "POST" | "DELETE",
  path: string,
  cookie: string,
  data?: unknown,
  origin = "http://localhost:3000",
) {
  return { GET, POST, DELETE }[method](
    new Request(`http://localhost:3000/api/${path}`, {
      method,
      headers: { cookie, origin, "content-type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    { params: Promise.resolve({ path: path.split("?")[0].split("/") }) },
  );
}
test("durable crawl compares real fixture pages without touching visibility runs", async () => {
  const a = await ready(),
    detail = await getAudit(a.user, a.auditId);
  expect(detail.sites).toHaveLength(2);
  expect(detail.pages).toHaveLength(8);
  expect(detail.comparison.map((s) => s.html)).toEqual([2, 2]);
  expect(detail.comparison.map((s) => s.brokenLinks.length)).toEqual([1, 1]);
  expect(detail.pages.filter((p) => p.error_code === "robots_disallowed")).toHaveLength(2);
  expect((await listAudits(a.user, a.projectId))[0].active).toBe(0);
  expect(await sql`select id from measurement_runs`).toHaveLength(0);
  expect((await route("GET", `audits/${a.auditId}/csv`, a.cookie)).status).toBe(200);
  const exported = await (await route("GET", `audits/${a.auditId}/export`, a.cookie)).json();
  expect(exported.comparison[0].html).toBe(2);
});
test("all audit routes enforce tenant ownership, origin and bounded selections", async () => {
  const a = await ready(),
    b = await owner("other");
  for (const suffix of ["", "/export", "/csv"]) {
    expect((await route("GET", `audits/${a.auditId}${suffix}`, "")).status).toBe(401);
    expect((await route("GET", `audits/${a.auditId}${suffix}`, b.cookie)).status).toBe(404);
  }
  for (const suffix of ["cancel", "ai", "ai/estimate"])
    expect(
      (
        await route("POST", `audits/${a.auditId}/${suffix}`, b.cookie, {
          provider: "openai",
          expectedQuoteHash: "a".repeat(64),
        })
      ).status,
    ).toBe(404);
  expect(
    (await route("POST", `audits/${a.auditId}/cancel`, a.cookie, {}, "https://evil.example"))
      .status,
  ).toBe(403);
  await expect(
    createAudit(a.user, { projectId: a.projectId, competitorIds: [b.competitorId], maxPages: 10 }),
  ).rejects.toThrow("not_found");
  await expect(
    createAudit(a.user, { projectId: a.projectId, competitorIds: [], maxPages: 101 }),
  ).rejects.toThrow();
  await expect(
    sql`insert into audit_sites(org_id,audit_id,target,state,max_pages) values(${b.user.org_id},${a.auditId},'{}','{}',10)`,
  ).rejects.toThrow();
});
test("claims are unique, cancellation fences an in-flight step and stale read-only leases resume", async () => {
  const a = await owner(),
    audit = await createAudit(a.user, { projectId: a.projectId, competitorIds: [], maxPages: 10 });
  const claims = await Promise.all([claimAuditSite(), claimAuditSite()]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  await sql`update audit_sites set lease_until=now()-interval '1 second' where audit_id=${audit.id}`;
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => {
      started = r;
    }),
    hold = new Promise<void>((r) => {
      release = r;
    });
  const task = workAuditOnce({
    skipPolitenessTestOnly: true,
    fetcher: async (url, domain, before) => {
      started();
      await hold;
      return auditFixtureFetcher(url, domain, before);
    },
  });
  await entered;
  await cancelAudit(a.user, audit.id);
  release();
  await task;
  const result = await getAudit(a.user, audit.id);
  expect(result.sites[0].status).toBe("cancelled");
  expect(result.pages).toHaveLength(0);
  expect(await claimAuditSite()).toBeUndefined();
});
test("AI reserves budget, stores validated evidence and shares model concurrency with measurements", async () => {
  const a = await ready(),
    quote = await estimateAuditAI(a.user, a.auditId, { provider: "openai" });
  const payload = { provider: "openai", expectedQuoteHash: quote.quoteHash };
  const results = await Promise.allSettled([
    createAuditAI(a.user, a.auditId, payload),
    createAuditAI(a.user, a.auditId, payload),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await sql`select * from usage_records where audit_ai_id is not null`).toHaveLength(1);
  await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
  await saveExecutionPolicy(a.user, {
    provider: "openai",
    model: MODELS.openai.id,
    rpm: 1000,
    tpm: 1_000_000,
    parallel: 1,
  });
  const job = await claimJob();
  expect(job?.kind).toBe("site_audit");
  await sql`update model_execution_limits set next_start_at=now()-interval '1 second'`;
  expect(await claimJob()).toBeUndefined();
  const result = await auditFixtureModel(
    job!.provider,
    "synthetic",
    job!.query_text,
    job!.snapshot.system,
    "baseline",
    job!.model,
  );
  await settleJob(job!, result, null);
  const done = await getAudit(a.user, a.auditId);
  expect(done.analyses[0].synthesis?.findings).toHaveLength(1);
  expect(done.analyses[0].cost_micros).toBeGreaterThan(0);
  expect(await sql`select * from brand_mentions`).toHaveLength(0);
  expect(await sql`select * from citations`).toHaveLength(0);
  expect((await claimJob())?.kind).toBe("measurement");
  expect((await getState(a.user)).usage.amount).toBeGreaterThan(0);
});
test("failed synthesis preserves cost and raw answer; interrupted calls never auto-replay", async () => {
  const a = await ready(),
    quote = await estimateAuditAI(a.user, a.auditId, { provider: "openai" });
  await createAuditAI(a.user, a.auditId, {
    provider: "openai",
    expectedQuoteHash: quote.quoteHash,
  });
  await workOnce(
    async () => ({
      status: "succeeded",
      text: '{"summary":"invented","findings":[{}]}',
      raw: { syntheticFixture: true },
      input: 100,
      output: 100,
      model: "fixture",
      requestId: "invalid-audit-fixture",
      citations: [],
    }),
    { unregulatedTestOnly: true },
  );
  let result = await getAudit(a.user, a.auditId);
  expect(result.analyses[0].status).toBe("invalid");
  expect(result.analyses[0].synthesis).toBeNull();
  expect(result.analyses[0].answer).toContain("invented");
  await createAuditAI(a.user, a.auditId, {
    provider: "openai",
    expectedQuoteHash: quote.quoteHash,
  });
  const job = await claimJob({ unregulatedTestOnly: true });
  await sql`update audit_ai_jobs set started_at=now()-interval '3 minutes' where id=${job!.id}`;
  await maintenance();
  result = await getAudit(a.user, a.auditId);
  expect(result.analyses[0].status).toBe("uncertain");
  expect(await claimJob({ unregulatedTestOnly: true })).toBeUndefined();
  await expect(
    createAuditAI(a.user, a.auditId, { provider: "openai", expectedQuoteHash: "b".repeat(64) }),
  ).rejects.toThrow("configuration_changed");
  await sql`update organizations set budget_micros=1 where id=${a.user.org_id}`;
  await expect(
    createAuditAI(a.user, a.auditId, { provider: "openai", expectedQuoteHash: quote.quoteHash }),
  ).rejects.toThrow("budget_exceeded");
});
test("deletion waits for active work and retention keeps usage after audit deletion", async () => {
  const a = await ready(),
    quote = await estimateAuditAI(a.user, a.auditId, { provider: "openai" });
  await createAuditAI(a.user, a.auditId, {
    provider: "openai",
    expectedQuoteHash: quote.quoteHash,
  });
  expect((await route("DELETE", `projects/${a.projectId}`, a.cookie)).status).toBe(409);
  await cancelAudit(a.user, a.auditId);
  expect((await getAudit(a.user, a.auditId)).analyses[0].cost_micros).toBe(0);
  await sql`update site_audits set created_at=now()-interval '400 days' where id=${a.auditId}`;
  await maintenance();
  await expect(getAudit(a.user, a.auditId)).rejects.toThrow("not_found");
  const usage = await sql`select * from usage_records where org_id=${a.user.org_id}`;
  expect(usage).toHaveLength(1);
  expect(usage[0].audit_ai_id).toBeNull();
});
test("daily requested-page quota is atomic and survives deletion of audit history", async () => {
  const a = await owner();
  await sql`insert into rate_limits(key,count,expires_at) values(${"audit-pages:" + a.user.org_id},1990,now()+interval '24 hours')`;
  const audit = await createAudit(a.user, {
    projectId: a.projectId,
    competitorIds: [],
    maxPages: 10,
  });
  await cancelAudit(a.user, audit.id);
  await sql`delete from site_audits where id=${audit.id}`;
  await expect(
    createAudit(a.user, { projectId: a.projectId, competitorIds: [], maxPages: 10 }),
  ).rejects.toThrow("audit_daily_limit");
  const [quota] =
    await sql`select count from rate_limits where key=${"audit-pages:" + a.user.org_id}`;
  expect(quota.count).toBe(2000);
});
test("ten competitors can share one audit while the 2000-page quota and selection cap still apply", async () => {
  const a = await owner();
  const project = await createProject(a.user, {
    name: "Large audit",
    domain: "large.example",
    industry: "Software",
    country: "FR",
    language: "fr",
    competitors: Array.from({ length: 11 }, (_, i) => ({
      name: `Competitor ${i}`,
      domain: `competitor${i}.example`,
    })),
    queries: ["Which business software should we compare?"],
  });
  const brands = (await getState(a.user)).projects
    .find((p) => p.id === project.id)!
    .brands.filter((b) => !b.is_primary);
  await expect(
    createAudit(a.user, {
      projectId: project.id,
      competitorIds: brands.map((b) => b.id),
      maxPages: 100,
    }),
  ).rejects.toThrow();
  const audit = await createAudit(a.user, {
    projectId: project.id,
    competitorIds: brands.slice(0, 10).map((b) => b.id),
    maxPages: 100,
  });
  expect((await getAudit(a.user, audit.id)).sites).toHaveLength(11);
  const [quota] =
    await sql`select count from rate_limits where key=${"audit-pages:" + a.user.org_id}`;
  expect(quota.count).toBe(1100);
  await cancelAudit(a.user, audit.id);
  await expect(
    createAudit(a.user, {
      projectId: project.id,
      competitorIds: brands.slice(0, 10).map((b) => b.id),
      maxPages: 100,
    }),
  ).rejects.toThrow("audit_daily_limit");
  expect(await listAudits(a.user, project.id)).toHaveLength(1);
});
