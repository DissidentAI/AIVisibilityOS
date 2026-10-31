import { beforeAll, beforeEach, afterAll, describe, test, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "../src/db/client";
import { createProject, createRun, getRun, getState, saveCredential } from "../src/lib/service";
import { claimJob, settleJob, workOnce, maintenance } from "../src/lib/queue";
import { digest, hashPassword } from "../src/lib/security";
import { authenticate, requireUser, sessionToken, rateLimit } from "../src/lib/auth";
import { GET, POST, DELETE } from "../src/app/api/[[...path]]/route";
import type { User } from "../src/lib/types";
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Unsafe test database");
  await migrate(db, { migrationsFolder: "drizzle" });
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await sql`truncate organizations,rate_limits,worker_heartbeats cascade`;
});
afterAll(async () => {
  await sql.end();
});
async function owner(label = "a") {
  const [org] = await sql`insert into organizations(name) values(${label}) returning id`;
  const [user] = await sql<
    User[]
  >`insert into users(org_id,email,password_hash) values(${org.id},${`${label}@example.com`},${await hashPassword("test-only-password")}) returning id,org_id,email`;
  const token = randomBytes(32).toString("hex");
  await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(token)},${user.id},now()+interval '1 day')`;
  return { user, cookie: `avos_session=${token}` };
}
const input = {
  name: "Karburo",
  domain: "karburo.example",
  industry: "Fuel price comparison",
  country: "FR",
  language: "fr",
  competitors: [
    { name: "Concurrent Test", domain: "competitor.example" },
    { name: "Alternative Test", domain: "alternative.example" },
  ],
  queries: Array.from({ length: 10 }, (_, i) => `Question de test ${i + 1} sur le carburant ?`),
};
async function prepared() {
  const a = await owner();
  const p = await createProject(a.user, input);
  await saveCredential(a.user, { provider: "openai", key: "test-only-fake-provider-key" });
  await saveCredential(a.user, { provider: "gemini", key: "test-only-fake-provider-key" });
  return { ...a, projectId: p.id };
}
async function route(
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
describe("PostgreSQL integration, authorization and durable measurements", () => {
  test("first owner registration needs bootstrap and atomically closes registration", async () => {
    await expect(
      authenticate(
        { email: "a@example.com", password: "test-only-password", bootstrapToken: "wrong" },
        true,
      ),
    ).rejects.toThrow("invalid_bootstrap_token");
    const auth = await authenticate(
      {
        email: "a@example.com",
        password: "test-only-password",
        bootstrapToken: process.env.BOOTSTRAP_TOKEN,
      },
      true,
    );
    const request = new Request("http://localhost:3000", {
      headers: { cookie: `avos_session=${auth.token}` },
    });
    expect(sessionToken(request)).toBe(auth.token);
    expect((await requireUser(request)).id).toBe(auth.user.id);
    await expect(
      authenticate(
        {
          email: "b@example.com",
          password: "test-only-password",
          bootstrapToken: process.env.BOOTSTRAP_TOKEN,
        },
        true,
      ),
    ).rejects.toThrow("registration_closed");
    await sql`update sessions set expires_at=now()-interval '1 second'`;
    await expect(requireUser(request)).rejects.toThrow("unauthenticated");
  });
  test("complete Karburo flow persists twenty fixture responses, costs and mentions", async () => {
    const a = await prepared();
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai", "gemini"],
      samples: 1,
    });
    let calls = 0;
    while (
      await workOnce(async (provider) => {
        calls++;
        return {
          status: "succeeded",
          text: calls <= 7 ? "Karburo. Concurrent Test." : "Concurrent Test.",
          model: `fixture-${provider}`,
          requestId: `fixture-${calls}`,
          input: 100,
          output: 50,
          raw: { syntheticFixture: true },
          citations: [],
        };
      })
    );
    const detail = await getRun(a.user, run.id);
    expect(calls).toBe(20);
    expect(detail.run.valid).toBe(20);
    expect(detail.mentions.filter((m) => m.brand_name === "Karburo")).toHaveLength(7);
    expect(detail.mentions.filter((m) => m.brand_name === "Concurrent Test")).toHaveLength(20);
    const state = await getState(a.user);
    expect(state.usage.reserved).toBe(0);
    expect(state.usage.amount).toBeGreaterThan(0);
    expect(JSON.stringify(state)).not.toContain("test-only-fake-provider-key");
    const csv = await route("GET", `runs/${run.id}/export`, a.cookie);
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain("official_api");
  });
  test("cross-organization reads, exports and writes fail without disclosing resources", async () => {
    const a = await prepared(),
      b = await owner("b");
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai"],
      samples: 1,
    });
    expect((await getState(b.user)).projects).toEqual([]);
    for (const path of [`runs/${run.id}`, `runs/${run.id}/export`, `runs?project=${a.projectId}`])
      expect((await route("GET", path, b.cookie)).status).toBe(404);
    expect(
      (
        await route("POST", "runs", b.cookie, {
          projectId: a.projectId,
          providers: ["openai"],
          samples: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await route("POST", `projects/${a.projectId}/queries`, b.cookie, {
          text: "Unauthorized question?",
        })
      ).status,
    ).toBe(404);
    expect((await route("DELETE", `projects/${a.projectId}`, b.cookie)).status).toBe(404);
    const [q] = await sql`select id from tracked_queries where org_id=${a.user.org_id} limit 1`;
    expect((await route("DELETE", `queries/${q.id}`, b.cookie)).status).toBe(404);
    expect((await route("POST", "runs", a.cookie, {}, "https://evil.example")).status).toBe(403);
    expect((await route("GET", "state", "")).status).toBe(401);
  });
  test("composite foreign keys prevent attaching another tenant's project", async () => {
    const a = await prepared(),
      b = await owner("b");
    await expect(
      sql`insert into brands(org_id,project_id,name,domain) values(${b.user.org_id},${a.projectId},'Intruder','intruder.example')`,
    ).rejects.toThrow();
  });
  test("budget reservation is atomic and a concurrent campaign is refused", async () => {
    const a = await prepared();
    await sql`update organizations set budget_micros=1 where id=${a.user.org_id}`;
    await expect(
      createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 }),
    ).rejects.toThrow("budget_exceeded");
    expect(await sql`select * from measurement_runs`).toHaveLength(0);
    await sql`update organizations set budget_micros=10000000 where id=${a.user.org_id}`;
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await sql`select * from usage_records`).toHaveLength(10);
  });
  test("multiple workers claim distinct jobs and settlement is idempotent", async () => {
    const a = await prepared();
    await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
    const [j1, j2] = await Promise.all([claimJob(), claimJob()]);
    expect(j1!.id).not.toBe(j2!.id);
    const fixture = {
      status: "succeeded" as const,
      text: "Karburo",
      model: "fixture",
      requestId: "fixture",
      input: 5,
      output: 5,
      raw: { synthetic: true },
      citations: [],
    };
    await Promise.all([settleJob(j1!, fixture, null), settleJob(j1!, fixture, null)]);
    expect(await sql`select * from brand_mentions where response_id=${j1!.id}`).toHaveLength(1);
  });
  test("failed and interrupted requests never become absent brand observations or automatic retries", async () => {
    const a = await prepared();
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai"],
      samples: 1,
    });
    const first = await claimJob();
    await settleJob(first!, null, "provider_http_429");
    const second = await claimJob();
    await sql`update ai_responses set started_at=now()-interval '3 minutes' where id=${second!.id}`;
    await maintenance();
    const detail = await getRun(a.user, run.id);
    expect(detail.run.valid).toBe(0);
    expect(detail.run.failed).toBe(2);
    expect(detail.mentions).toHaveLength(0);
    const [cost] =
      await sql`select kind,amount_micros from usage_records where response_id=${second!.id}`;
    expect(cost.kind).toBe("uncertain");
    expect(cost.amount_micros).toBeGreaterThan(0);
  });
  test("deleting a completed project does not reset its monthly usage", async () => {
    const a = await prepared();
    await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
    while (
      await workOnce(async () => {
        throw new Error("synthetic failure");
      })
    );
    const before = (await getState(a.user)).usage.amount;
    expect((await route("DELETE", `projects/${a.projectId}`, a.cookie)).status).toBe(200);
    expect((await getState(a.user)).usage.amount).toBe(before);
    expect(await sql`select * from ai_responses`).toHaveLength(0);
  });
  test("persistent rate limit blocks attempts across requests", async () => {
    await rateLimit("fixture", 2);
    await rateLimit("fixture", 2);
    await expect(rateLimit("fixture", 2)).rejects.toThrow("rate_limited");
  });
});
