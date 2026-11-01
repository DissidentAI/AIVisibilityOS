import {
  saveSchedule,
  dispatchSchedule,
  setScheduleEnabled,
  nextOccurrence,
} from "../src/lib/schedules";
import { estimateRun } from "../src/lib/service";
import {
  createReport,
  getReport,
  saveBranding,
  getBranding,
  reportMetrics,
} from "../src/lib/reports";
import sharp from "sharp";
import { beforeAll, beforeEach, afterEach, afterAll, describe, test, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "../src/db/client";
import { createProject, createRun, getRun, getState, saveCredential } from "../src/lib/service";
import {
  claimJob as claimQueueJob,
  settleJob,
  workOnce as processQueueJob,
  maintenance,
} from "../src/lib/queue";
import { digest, hashPassword } from "../src/lib/security";
import { authenticate, requireUser, sessionToken, rateLimit } from "../src/lib/auth";
import { GET, POST, DELETE } from "../src/app/api/[[...path]]/route";
import type { User } from "../src/lib/types";
import { parseResponse, ProviderError } from "../src/lib/providers";
import { MODELS } from "../src/lib/provider-config";
import { createRetry, estimateRetry } from "../src/lib/retries";
import { comparisonSignature } from "../src/lib/measurement";
import { costSummary, editorialOpportunities } from "../src/lib/run-insights";
const claimJob = () => claimQueueJob({ unregulatedTestOnly: true });
const workOnce = (adapter: Parameters<typeof processQueueJob>[0]) =>
  processQueueJob(adapter, { unregulatedTestOnly: true });
afterEach(() => vi.restoreAllMocks());
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
  test("MiMo Web Search disabled stops pending calls, preserves baseline choice and releases only proven rejections", async () => {
    const a = await prepared();
    await saveCredential(a.user, { provider: "mimo", key: "synthetic-private-mimo-key" });
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["mimo", "openai"],
      samples: 1,
      mode: "web",
    });
    let rejected = 0;
    while (
      await workOnce(async (provider) => {
        if (provider === "mimo") {
          rejected++;
          throw new ProviderError("mimo_web_search_disabled");
        }
        return {
          ...fixtureResult,
          grounding: {
            searched: false,
            toolCalls: 0,
            queries: [],
            links: [],
            searchEntryHtml: null,
          },
        };
      })
    ) {}
    expect(rejected).toBe(1);
    const detail = await getRun(a.user, run.id);
    expect(detail.run.valid).toBe(10);
    expect(detail.run.failed).toBe(10);
    expect(
      detail.responses.filter((r) => r.error_code === "mimo_web_search_disabled_before_request"),
    ).toHaveLength(9);
    expect(
      detail.responses.filter((r) => r.provider === "mimo").every((r) => r.cost_micros === 0),
    ).toBe(true);
    // Old generic HTTP 400s lack sufficient evidence to rewrite their reason or cost.
    const generic = detail.responses.find((r) => r.provider === "mimo")!;
    await sql`update ai_responses set error_code='provider_http_400',cost_micros=null where id=${generic.id}`;
    await sql`update usage_records set amount_micros=12345,kind='uncertain' where response_id=${generic.id}`;
    await maintenance();
    const [usage] =
      await sql`select amount_micros,kind from usage_records where response_id=${generic.id}`;
    expect(usage).toMatchObject({ amount_micros: 12345, kind: "uncertain" });
    // No silent downgrade: the user can explicitly start a new baseline series.
    await expect(
      createRun(a.user, {
        projectId: a.projectId,
        providers: ["mimo"],
        samples: 1,
        mode: "baseline",
      }),
    ).resolves.toHaveProperty("id");
  });
  test("Kimi, OpenRouter and direct MiMo web measurements keep sources and billing distinct", async () => {
    const a = await prepared();
    for (const provider of ["kimi", "openrouter", "mimo"])
      await saveCredential(a.user, { provider, key: "synthetic-web-provider-key" });
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["kimi", "openrouter", "mimo"],
      samples: 1,
      mode: "web",
      openrouterModel: "xiaomi/mimo-v2.6-pro",
    });
    while (
      await workOnce(async (provider) =>
        provider === "kimi"
          ? parseResponse("kimi", {
              id: "fixture-kimi-web",
              model: MODELS.kimi.id,
              status: "completed",
              output: [
                {
                  type: "web_search_call",
                  action: {
                    query: "synthetic",
                    sources: [
                      {
                        type: "url",
                        url: "https://example.com/retrieved",
                        title: "Retrieved fixture",
                      },
                    ],
                  },
                },
                {
                  type: "message",
                  content: [{ type: "output_text", text: "Karburo", annotations: [] }],
                },
              ],
              usage: {
                input_tokens: 200,
                output_tokens: 100,
                input_tokens_details: { cached_tokens: 50 },
              },
            })
          : parseResponse(provider, {
              id: "fixture-web",
              model: provider === "mimo" ? MODELS.mimo.id : "xiaomi/mimo-v2.6-pro",
              provider: "Synthetic host",
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: "Karburo",
                    annotations:
                      provider === "mimo"
                        ? [
                            {
                              type: "url_citation",
                              url: "https://example.com/cited",
                              title: "Citation fixture",
                            },
                          ]
                        : [
                            {
                              type: "url_citation",
                              url_citation: {
                                url: "https://example.com/cited",
                                title: "Citation fixture",
                              },
                            },
                          ],
                  },
                },
              ],
              usage: {
                prompt_tokens: 200,
                completion_tokens: 100,
                prompt_tokens_details: { cached_tokens: 50 },
                ...(provider === "mimo"
                  ? { web_search_usage: { tool_usage: 1, page_usage: 1 } }
                  : { cost: 0.009, server_tool_use_details: { web_search_requests: 1 } }),
              },
            }),
      )
    ) {}
    const detail = await getRun(a.user, run.id);
    expect(detail.run.valid).toBe(30);
    expect(detail.citations).toHaveLength(20);
    const kimi = detail.responses.find((r) => r.provider === "kimi")!;
    expect(kimi.grounding?.sources).toHaveLength(1);
    expect(kimi.cost_micros).toBe(6310);
    expect(detail.responses.find((r) => r.provider === "mimo")?.cost_micros).toBe(5153);
    expect(detail.responses.find((r) => r.provider === "openrouter")?.cost_micros).toBe(9000);
    expect(detail.run.snapshot.parameters.providers).toMatchObject({
      kimi: { endpoint: "https://api.moonshot.ai/v1/responses" },
      mimo: { endpoint: "https://api.xiaomimimo.com/v1/chat/completions" },
    });
  });
  test("one 401 stops pending calls for the same provider and tenant, releases reserves, and blocks unchanged keys", async () => {
    const a = await prepared();
    await saveCredential(a.user, { provider: "kimi", key: "synthetic-rejected-key-a" });
    await saveCredential(a.user, { provider: "mimo", key: "synthetic-valid-key-a" });
    const b = await owner("second");
    const bp = await createProject(b.user, input);
    await saveCredential(b.user, { provider: "kimi", key: "synthetic-valid-key-b" });
    const ar = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["kimi", "mimo"],
      samples: 1,
    });
    const br = await createRun(b.user, { projectId: bp.id, providers: ["kimi"], samples: 1 });
    let rejectedCalls = 0;
    while (
      await workOnce(async (provider, key) => {
        if (key === "synthetic-rejected-key-a") {
          rejectedCalls++;
          throw new ProviderError("provider_http_401");
        }
        return parseResponse(provider, {
          id: "synthetic-ok",
          model: MODELS[provider].id,
          choices: [{ finish_reason: "stop", message: { content: "Karburo" } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        });
      })
    ) {}
    expect(rejectedCalls).toBe(1);
    const detail = await getRun(a.user, ar.id);
    expect(detail.run.valid).toBe(10);
    expect(detail.run.failed).toBe(10);
    expect(
      detail.responses.filter((r) => r.provider === "kimi").every((r) => r.cost_micros === 0),
    ).toBe(true);
    expect(
      detail.responses.filter((r) => r.error_code === "provider_auth_failed_before_request"),
    ).toHaveLength(9);
    expect((await getRun(b.user, br.id)).run.valid).toBe(10);
    await expect(
      createRun(a.user, { projectId: a.projectId, providers: ["kimi"], samples: 1 }),
    ).rejects.toThrow("provider_auth_rejected_kimi");
    const failed = detail.responses.find((r) => r.error_code === "provider_http_401")!;
    await sql`update usage_records set kind='uncertain',amount_micros=12345 where response_id=${failed.id}`;
    await sql`update ai_responses set cost_micros=null where id=${failed.id}`;
    await maintenance();
    const [usage] =
      await sql`select amount_micros,kind from usage_records where response_id=${failed.id}`;
    expect(usage).toMatchObject({ amount_micros: 0, kind: "estimated" });
    await saveCredential(a.user, { provider: "kimi", key: "synthetic-replacement-key" });
    await expect(
      createRun(a.user, { projectId: a.projectId, providers: ["kimi"], samples: 1 }),
    ).resolves.toHaveProperty("id");
  });
  test("credential checks require a session, respect tenant boundaries and never return secrets", async () => {
    const a = await prepared();
    const b = await owner("second");
    await saveCredential(a.user, { provider: "kimi", key: "synthetic-private-kimi-key" });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response('{"data":[]}'));
    expect((await route("POST", "credentials/check", "", { provider: "kimi" })).status).toBe(401);
    expect((await route("POST", "credentials/check", b.cookie, { provider: "kimi" })).status).toBe(
      400,
    );
    expect(fetch).not.toHaveBeenCalled();
    const checked = await route("POST", "credentials/check", a.cookie, {
      provider: "kimi",
      endpoint: "https://attacker.example",
    });
    expect(checked.status).toBe(200);
    expect(await checked.text()).not.toContain("synthetic-private-kimi-key");
    expect(fetch.mock.calls[0][0]).toBe("https://api.moonshot.ai/v1/models");
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer synthetic-private-kimi-key",
    });
    fetch.mockResolvedValueOnce(new Response("secret upstream content", { status: 401 }));
    const denied = await route("POST", "credentials/check", a.cookie, { provider: "kimi" });
    expect(await denied.json()).toEqual({ error: "provider_auth_rejected_kimi" });
  });
  test("missing web usage keeps costs uncertain unless OpenRouter reports a total", async () => {
    const a = await prepared();
    await saveCredential(a.user, { provider: "openrouter", key: "synthetic-router-key-only" });
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openrouter"],
      samples: 1,
      mode: "web",
    });
    const job = await claimJob();
    await settleJob(
      job!,
      parseResponse("openrouter", {
        id: "synthetic",
        model: "openai/gpt-4.1-mini",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "Karburo",
              annotations: [
                { type: "url_citation", url_citation: { url: "https://example.com/cited" } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
      null,
    );
    expect(
      (await getRun(a.user, run.id)).responses.find((r) => r.id === job!.id)?.cost_micros,
    ).toBeNull();
    expect((await sql`select kind from usage_records where response_id=${job!.id}`)[0].kind).toBe(
      "uncertain",
    );
  });
  test("Kimi and selected OpenRouter models run through the durable worker with safe accounting", async () => {
    const a = await prepared();
    for (const provider of ["kimi", "openrouter"])
      await saveCredential(a.user, { provider, key: "synthetic-private-provider-key" });
    const config = {
      projectId: a.projectId,
      providers: ["kimi", "openrouter"],
      samples: 1,
      openrouterModel: "moonshotai/kimi-k3.1-pro",
    };
    const estimate = await estimateRun(a.user, config);
    expect(
      (await estimateRun(a.user, { ...config, providers: ["openrouter", "kimi"] })).configHash,
    ).toBe(estimate.configHash);
    expect(estimate.responses).toBe(20);
    expect(
      (
        await estimateRun(a.user, {
          ...config,
          providers: ["openai", "gemini", "kimi", "openrouter"],
        })
      ).responses,
    ).toBe(40);
    expect(estimate.snapshot.models.openrouter).toBe("moonshotai/kimi-k3.1-pro");
    expect(estimate.reservedMicros).toBeGreaterThan(20 * 81920);
    const run = await createRun(a.user, { ...config, expectedConfigHash: estimate.configHash });
    while (
      await workOnce(async (provider, key, _query, _system, mode, model) => {
        expect(key).toBe("synthetic-private-provider-key");
        expect(mode).toBe("baseline");
        expect(model).toBe(provider === "kimi" ? "kimi-k3.1-pro" : "moonshotai/kimi-k3.1-pro");
        return parseResponse(provider, {
          id: "synthetic-response",
          model,
          provider: "Synthetic upstream",
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "Karburo répond à cette question.",
                reasoning_content: "Synthetic unscored reasoning",
              },
            },
          ],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 100,
            prompt_tokens_details: { cached_tokens: 50 },
            cost: 0.001234,
          },
        });
      })
    ) {
      /* Drain test jobs with an explicitly synthetic adapter. */
    }
    const detail = await getRun(a.user, run.id);
    expect(detail.run.valid).toBe(20);
    expect(detail.mentions).toHaveLength(20);
    expect(detail.citations).toEqual([]);
    const routed = detail.responses.find((r) => r.provider === "openrouter")!;
    expect(routed.cost_micros).toBe(1234);
    expect(routed.channel).toBe("openrouter_api");
    expect(routed.parameters.execution).toEqual({
      servingProvider: "Synthetic upstream",
      costSource: "provider_reported",
    });
    expect(detail.responses.find((r) => r.provider === "kimi")!.cost_micros).toBe(1310);
    const b = await owner("other");
    await expect(getRun(b.user, run.id)).rejects.toThrow("not_found");
    expect(JSON.stringify(await getState(a.user))).not.toContain("synthetic-private-provider-key");
    const [credential] =
      await sql`select encrypted_key from credentials where org_id=${a.user.org_id} and provider='kimi'`;
    expect(credential.encrypted_key).not.toContain("synthetic-private-provider-key");
  });
  test("new providers retain budget limits and reject unsupported models before enqueue", async () => {
    const a = await prepared();
    await saveCredential(a.user, { provider: "kimi", key: "synthetic-private-kimi-key" });
    const config = { projectId: a.projectId, providers: ["kimi"], samples: 1 };
    expect((await estimateRun(a.user, { ...config, mode: "web" })).reservedMicros).toBeGreaterThan(
      (await estimateRun(a.user, config)).reservedMicros,
    );
    await expect(
      createRun(a.user, {
        ...config,
        providers: ["openrouter"],
        openrouterModel: "openrouter/auto",
      }),
    ).rejects.toThrow();
    await sql`update organizations set budget_micros=100 where id=${a.user.org_id}`;
    await expect(createRun(a.user, config)).rejects.toThrow("budget_exceeded");
    expect(await sql`select * from ai_responses`).toHaveLength(0);
    expect(await sql`select * from usage_records`).toHaveLength(0);
  });
  test("scheduled OpenRouter campaigns keep their selected model and request parameters", async () => {
    const a = await prepared();
    await saveCredential(a.user, { provider: "openrouter", key: "synthetic-private-router-key" });
    const estimate = await estimateRun(a.user, {
      projectId: a.projectId,
      providers: ["openrouter"],
      openrouterModel: "moonshotai/kimi-k3.1-pro",
      samples: 1,
    });
    await saveSchedule(a.user, {
      projectId: a.projectId,
      providers: ["openrouter"],
      openrouterModel: "moonshotai/kimi-k3.1-pro",
      samples: 1,
      intervalHours: 24,
      firstRunAt: new Date(Date.now() + 120000).toISOString(),
    });
    await sql`update measurement_schedules set next_run_at=now()-interval '1 minute'`;
    expect(await dispatchSchedule()).toBe(true);
    const job = await claimJob();
    expect(job?.model).toBe("moonshotai/kimi-k3.1-pro");
    expect((await getRun(a.user, job!.run_id)).run.config_hash).toBe(estimate.configHash);
    expect(job?.snapshot.parameters.providers).toMatchObject({
      openrouter: {
        channel: "openrouter_api",
        request: { model: "moonshotai/kimi-k3.1-pro", max_tokens: 8192 },
      },
    });
  });
  test("project API accepts copied page URLs and stores canonical domains", async () => {
    const a = await owner();
    const response = await route("POST", "projects", a.cookie, {
      ...input,
      domain: "HTTPS://KARBURO.EXAMPLE/fr-fr/?source=phone",
      competitors: [
        { name: "Karbu France", domain: "https://karbu-france.example/prix/" },
        { name: "Gasoil Now", domain: "https://gasoil.example/fr/" },
      ],
    });
    expect(response.status).toBe(201);
    const state = await getState(a.user);
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0].domain).toBe("karburo.example");
    expect(state.projects[0].brands.map((brand) => brand.domain)).toEqual(
      expect.arrayContaining(["karburo.example", "karbu-france.example", "gasoil.example"]),
    );
    expect(state.projects[0].queries).toHaveLength(10);
  });
  test("project API returns safe field errors without partial writes or anonymous access", async () => {
    const a = await owner();
    const invalid = {
      ...input,
      competitors: [
        { name: "Karbu France", domain: "karbu-france.example" },
        { name: "Gasoil Now", domain: "private-invalid-value" },
      ],
    };
    const response = await route("POST", "projects", a.cookie, invalid);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_input",
      issues: [{ field: "competitors.1.domain", code: "public_domain" }],
    });
    expect((await getState(a.user)).projects).toHaveLength(0);
    expect((await route("POST", "projects", "", invalid)).status).toBe(401);
  });
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
  test("a reservation queued last month is charged to the month the API attempt starts", async () => {
    const a = await prepared();
    await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
    await sql`update usage_records set created_at=now()-interval '40 days'`;
    expect((await getState(a.user)).usage.reserved).toBeGreaterThan(0);
    const job = await claimJob();
    await settleJob(
      job!,
      {
        status: "succeeded",
        text: "Karburo",
        model: "fixture",
        requestId: "fixture",
        input: 5,
        output: 5,
        raw: { synthetic: true },
        citations: [],
      },
      null,
    );
    const [record] =
      await sql`select kind, created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' as current_period from usage_records where response_id=${job!.id}`;
    expect(record.kind).toBe("estimated");
    expect(record.current_period).toBe(true);
    const state = await getState(a.user);
    expect(state.usage.amount - state.usage.reserved).toBe(10);
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

const fixtureResult = {
  status: "succeeded" as const,
  text: "Karburo et Concurrent Test.",
  model: "fixture-stable-model",
  requestId: "fixture-only",
  input: 100,
  output: 50,
  raw: { syntheticFixture: true },
  citations: [],
};
describe("traceable retries, isolated tenants and honest summaries", () => {
  async function failedCampaign() {
    const a = await prepared();
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai", "gemini"],
      samples: 2,
    });
    let n = 0;
    while (
      await workOnce(async () => {
        n++;
        if (n <= 3) throw new ProviderError("network_or_timeout");
        return fixtureResult;
      })
    ) {}
    return { ...a, run, detail: await getRun(a.user, run.id) };
  }
  test("retries exactly selected failed samples with immutable origin, additional budget and CSV lineage", async () => {
    const a = await failedCampaign();
    const target = a.detail.responses.find((r) => r.status === "failed")!;
    const before = await sql`select * from ai_responses where id=${target.id}`;
    const usageBefore =
      await sql`select amount_micros,kind from usage_records where response_id=${target.id}`;
    const quote = await estimateRetry(a.user, a.run.id, { responseIds: [target.id] });
    expect(quote.responses).toBe(1);
    expect(quote.uncertain).toBe(1);
    expect(quote.reservedMicros).toBe(Number(usageBefore[0].amount_micros));
    // Later editable project changes never rewrite the retry question/brand snapshot.
    await sql`update brands set name='Edited since the original run' where project_id=${a.projectId} and is_primary=true`;
    const retry = await createRetry(a.user, a.run.id, {
      responseIds: quote.responseIds,
      expectedQuoteHash: quote.quoteHash,
    });
    const child = await getRun(a.user, retry.id);
    expect(child.run.total).toBe(1);
    expect(child.responses[0]).toMatchObject({
      query_text: target.query_text,
      provider: target.provider,
      model: target.model,
      sample: target.sample,
      source_response_id: target.id,
    });
    expect(child.run.snapshot.brands).toEqual(a.detail.run.snapshot.brands);
    expect(child.run.snapshot.system).toBe(a.detail.run.snapshot.system);
    expect(await sql`select * from ai_responses where id=${target.id}`).toEqual(before);
    expect(
      await sql`select amount_micros,kind from usage_records where response_id=${target.id}`,
    ).toEqual(usageBefore);
    expect(
      (await getRun(a.user, a.run.id)).responses.find((r) => r.id === target.id)?.retry_run_id,
    ).toBe(retry.id);
    await workOnce(async () => fixtureResult);
    expect(comparisonSignature((await getRun(a.user, retry.id)).responses)).toBeNull();
    const csv = await (await route("GET", `runs/${retry.id}/export`, a.cookie)).text();
    expect(csv).toContain("source_response_id");
    expect(csv).toContain(target.id);
    expect(csv).toContain(a.run.id);
    const exported = await (await route("GET", "account/export", a.cookie)).json();
    expect(exported.retries).toHaveLength(1);
    const report = await createReport(a.user, { runId: retry.id, locale: "fr" });
    expect(
      (await getReport(a.user, report.id)).payload.current.run.snapshot.parameters.retry,
    ).toBeTruthy();
  });
  test("bulk retry excludes successes and duplicate concurrent launches reserve only once", async () => {
    const a = await failedCampaign();
    const quote = await estimateRetry(a.user, a.run.id, {});
    expect(quote.responses).toBe(3);
    const payload = { responseIds: quote.responseIds, expectedQuoteHash: quote.quoteHash };
    const launches = await Promise.allSettled([
      createRetry(a.user, a.run.id, payload),
      createRetry(a.user, a.run.id, payload),
    ]);
    expect(launches.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(launches.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await sql`select count(*)::int as n from response_retries`)[0].n).toBe(3);
    expect((await sql`select count(*)::int as n from measurement_runs`)[0].n).toBe(2);
    await expect(estimateRetry(a.user, a.run.id, {})).rejects.toThrow("retry_nothing_to_retry");
    // A failed new attempt can itself be retried, with its own lineage.
    while (
      await workOnce(async () => {
        throw new ProviderError("provider_http_503");
      })
    ) {}
    const childId = (await getRun(a.user, a.run.id)).responses.find(
      (r) => r.retry_run_id,
    )!.retry_run_id!;
    const next = await estimateRetry(a.user, childId, {});
    await createRetry(a.user, childId, {
      responseIds: next.responseIds,
      expectedQuoteHash: next.quoteHash,
    });
    expect((await sql`select count(*)::int as n from response_retries`)[0].n).toBe(6);
  });
  test("retry routes enforce session, origin, ownership, failed status and database organization links", async () => {
    const a = await failedCampaign(),
      b = await owner("other-retry");
    const target = a.detail.responses.find((r) => r.status === "failed")!;
    const success = a.detail.responses.find((r) => r.status === "succeeded")!;
    const quote = await estimateRetry(a.user, a.run.id, { responseIds: [target.id] });
    const payload = { responseIds: quote.responseIds, expectedQuoteHash: quote.quoteHash };
    expect((await route("POST", `runs/${a.run.id}/retry`, "", payload)).status).toBe(401);
    expect(
      (await route("POST", `runs/${a.run.id}/retry`, a.cookie, payload, "https://evil.example"))
        .status,
    ).toBe(403);
    for (const suffix of ["retry", "retry/estimate"])
      expect((await route("POST", `runs/${a.run.id}/${suffix}`, b.cookie, payload)).status).toBe(
        404,
      );
    await expect(estimateRetry(a.user, a.run.id, { responseIds: [success.id] })).rejects.toThrow(
      "retry_not_failed",
    );
    await expect(estimateRetry(a.user, a.run.id, { responseIds: [b.user.id] })).rejects.toThrow(
      "not_found",
    );
    await expect(
      sql`insert into response_retries(org_id,source_response_id,retry_response_id) values(${b.user.org_id},${target.id},${success.id})`,
    ).rejects.toThrow();
    const response = await route("POST", `runs/${a.run.id}/retry`, a.cookie, payload);
    expect(response.status).toBe(201);
    expect((await route("POST", `runs/${a.run.id}/retry`, a.cookie, payload)).status).toBe(409);
  });
  test("retry quote changes, exhausted budget, removed credentials and stale models cannot enqueue", async () => {
    const a = await failedCampaign();
    const quote = await estimateRetry(a.user, a.run.id, {});
    await expect(
      createRetry(a.user, a.run.id, {
        responseIds: quote.responseIds,
        expectedQuoteHash: "0".repeat(64),
      }),
    ).rejects.toThrow("configuration_changed");
    await sql`update organizations set budget_micros=1 where id=${a.user.org_id}`;
    expect((await estimateRetry(a.user, a.run.id, {})).affordable).toBe(false);
    await expect(
      createRetry(a.user, a.run.id, { expectedQuoteHash: quote.quoteHash }),
    ).rejects.toThrow("budget_exceeded");
    await sql`update organizations set budget_micros=20000000 where id=${a.user.org_id}`;
    await sql`delete from credentials where org_id=${a.user.org_id}`;
    await expect(
      createRetry(a.user, a.run.id, { expectedQuoteHash: quote.quoteHash }),
    ).rejects.toThrow("credentials_required");
    await sql`update measurement_runs set snapshot=jsonb_set(snapshot,'{pricing,date}','"old-catalog"'::jsonb) where id=${a.run.id}`;
    await expect(estimateRetry(a.user, a.run.id, {})).rejects.toThrow(
      "model_configuration_changed",
    );
    expect((await sql`select count(*)::int as n from measurement_runs`)[0].n).toBe(1);
  });
  test("pending campaigns cannot overlap a retry and known pre-network failures release reserves", async () => {
    const a = await prepared();
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai"],
      samples: 1,
    });
    await workOnce(async () => {
      throw new ProviderError("network_or_timeout");
    });
    const quote = await estimateRetry(a.user, run.id, {});
    await expect(
      createRetry(a.user, run.id, { expectedQuoteHash: quote.quoteHash }),
    ).rejects.toThrow("campaign_already_running");
    await sql`delete from credentials where org_id=${a.user.org_id}`;
    const adapter = vi.fn(async () => fixtureResult);
    await workOnce(adapter);
    expect(adapter).not.toHaveBeenCalled();
    const d = await getRun(a.user, run.id);
    expect(d.run.pending).toBe(0);
    const missing = d.responses.filter((r) => r.error_code === "credentials_missing");
    expect(missing).toHaveLength(9);
    expect(missing.every((r) => r.cost_micros === 0)).toBe(true);
    expect(d.responses.find((r) => r.error_code === "network_or_timeout")?.cost_micros).toBeNull();
  });
  test("cost summaries distinguish unknown, pending and proven zero; editorial leads use valid evidence only", async () => {
    const a = await failedCampaign();
    const failed = a.detail.responses.filter((r) => r.status === "failed");
    expect(costSummary(failed)).toMatchObject({ total: null, known: 0, unknown: 3, pending: 0 });
    expect(costSummary([]).total).toBeNull();
    expect(costSummary([{ ...failed[0], cost_micros: 0 }])).toMatchObject({
      total: 0,
      known: 1,
      unknown: 0,
    });
    expect(costSummary([{ ...failed[0], status: "queued" }])).toMatchObject({
      total: null,
      unknown: 0,
      pending: 1,
    });
    // Competing brand is in every valid synthetic answer, own brand removed from valid mentions only.
    const primary = a.detail.run.snapshot.brands.find((b) => b.is_primary)!;
    a.detail.mentions = a.detail.mentions.filter((m) => m.brand_id !== primary.id);
    a.detail.mentions.push({
      response_id: failed[0].id,
      brand_id: primary.id,
      brand_name: primary.name,
      excerpt: "INVALID FIXTURE",
      matched_alias: primary.name,
      sentiment: "not_classified",
    });
    const leads = editorialOpportunities(a.detail);
    expect(leads.length).toBeGreaterThan(0);
    expect(
      leads.every(
        (l) =>
          l.own === 0 &&
          l.competitorCount === l.valid &&
          l.evidence.every((r) => r.status === "succeeded"),
      ),
    ).toBe(true);
    const noValid = { ...a.detail, responses: failed };
    expect(editorialOpportunities(noValid)).toEqual([]);
  });
});
async function completed(user: User, projectId: string, mode: "baseline" | "web" = "baseline") {
  const run = await createRun(user, { projectId, providers: ["openai"], samples: 1, mode });
  while (
    await workOnce(async () => ({
      ...fixtureResult,
      grounding: {
        searched: mode === "web",
        toolCalls: mode === "web" ? 1 : 0,
        queries: [],
        searchEntryHtml: null,
        links: [],
      },
    }))
  ) {}
  return run;
}
describe("agency workflows with PostgreSQL and synthetic provider fixtures", () => {
  test("quotes are read-only, include search costs, and reject a changed configuration", async () => {
    const a = await prepared();
    const p = { projectId: a.projectId, providers: ["openai", "gemini"], samples: 1 };
    const baseline = await estimateRun(a.user, p),
      web = await estimateRun(a.user, { ...p, mode: "web" });
    expect(web.responses).toBe(20);
    expect(web.reservedMicros).toBeGreaterThan(baseline.reservedMicros);
    expect(web.configHash).not.toBe(baseline.configHash);
    expect(await sql`select * from measurement_runs`).toHaveLength(0);
    expect(await sql`select * from usage_records`).toHaveLength(0);
    await sql`update tracked_queries set text=text||' updated' where project_id=${a.projectId}`;
    await expect(
      createRun(a.user, { ...p, expectedConfigHash: baseline.configHash }),
    ).rejects.toThrow("configuration_changed");
  });
  test("web charges include tool usage and persist actual grounding metadata", async () => {
    const a = await prepared(),
      run = await completed(a.user, a.projectId, "web");
    const detail = await getRun(a.user, run.id);
    expect(detail.responses[0].grounding?.searched).toBe(true);
    // 100 input * .4 + 50 output * 1.6 + 10,000 tool + 8,000 * .4 search block.
    expect(detail.responses[0].cost_micros).toBe(13320);
    expect((await getState(a.user)).usage.reserved).toBe(0);
  });
  test("schedules freeze questions and dispatch each occurrence once across concurrent workers", async () => {
    const a = await prepared();
    const saved = await saveSchedule(a.user, {
      projectId: a.projectId,
      providers: ["openai"],
      samples: 1,
      intervalHours: 24,
      firstRunAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    await sql`update tracked_queries set text='Updated question '||id where project_id=${a.projectId}`;
    await sql`update measurement_schedules set next_run_at=now()-interval '10 days' where id=${saved.id}`;
    const result = await Promise.all([dispatchSchedule(), dispatchSchedule(), dispatchSchedule()]);
    expect(result.filter(Boolean)).toHaveLength(1);
    const events = await sql`select * from schedule_events`;
    expect(events).toHaveLength(1);
    expect(events[0].missed_slots).toBe(10);
    expect(events[0].outcome).toBe("queued");
    const detail = await getRun(a.user, events[0].run_id);
    expect(detail.run.snapshot.queries[0].text).not.toContain("Updated");
    expect(await sql`select * from usage_records`).toHaveLength(10);
    expect(await dispatchSchedule()).toBe(false);
  });
  test("budget exhaustion and overlap skip safely; pause and resume do not replay missed calls", async () => {
    const a = await prepared();
    const saved = await saveSchedule(a.user, {
      projectId: a.projectId,
      providers: ["gemini"],
      samples: 1,
      intervalHours: 168,
      firstRunAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    await sql`update organizations set budget_micros=1 where id=${a.user.org_id}`;
    await sql`update measurement_schedules set next_run_at=now()-interval '1 hour' where id=${saved.id}`;
    await dispatchSchedule();
    const [event] = await sql`select * from schedule_events`;
    expect(event.reason).toBe("budget_exceeded");
    expect(await sql`select * from measurement_runs`).toHaveLength(0);
    await setScheduleEnabled(a.user, saved.id, { enabled: false });
    await sql`update measurement_schedules set next_run_at=now()-interval '1 day' where id=${saved.id}`;
    expect(await dispatchSchedule()).toBe(false);
    await setScheduleEnabled(a.user, saved.id, { enabled: true });
    expect(await dispatchSchedule()).toBe(false);
    const [schedule] =
      await sql`select next_run_at > now()+interval '6 days' as future from measurement_schedules where id=${saved.id}`;
    expect(schedule.future).toBe(true);
  });
  test("a skipped overlapping campaign does not prevent another client's schedule", async () => {
    const a = await prepared(),
      b = await createProject(a.user, { ...input, name: "Other project", domain: "other.example" });
    for (const projectId of [a.projectId, b.id])
      await saveSchedule(a.user, {
        projectId,
        providers: ["openai"],
        samples: 1,
        intervalHours: 24,
        firstRunAt: new Date(Date.now() + 86400_000).toISOString(),
      });
    await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
    await sql`update measurement_schedules set next_run_at=now()-interval '1 hour'`;
    await dispatchSchedule();
    await dispatchSchedule();
    const events = await sql`select * from schedule_events`;
    expect(events.filter((e) => e.reason === "campaign_already_running")).toHaveLength(1);
    expect(events.filter((e) => e.outcome === "queued")).toHaveLength(1);
  });
  test("reports freeze branding/evidence, generate an actual PDF, and reject incompatible comparisons", async () => {
    const a = await prepared();
    const logo = await sharp({
      create: { width: 32, height: 16, channels: 3, background: "#0f766e" },
    })
      .png()
      .toBuffer();
    await saveBranding(a.user, {
      agencyName: "Agence Évidence",
      logoData: `data:image/png;base64,${logo.toString("base64")}`,
    });
    const one = await completed(a.user, a.projectId),
      two = await completed(a.user, a.projectId);
    const saved = await createReport(a.user, {
      runId: two.id,
      previousRunId: one.id,
      locale: "fr",
      notes: "Commentaire de test synthétique.",
    });
    const report = await getReport(a.user, saved.id);
    expect(report.payload.previous?.run.id).toBe(one.id);
    expect(reportMetrics(report.payload.current)[0].n).toBe(10);
    await saveBranding(a.user, { agencyName: "Changed", logoData: null });
    expect((await getReport(a.user, saved.id)).payload.branding.agency_name).toBe(
      "Agence Évidence",
    );
    const pdf = await route("GET", `reports/${saved.id}/pdf`, a.cookie);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(10000);
    expect(bytes.subarray(-20).toString()).toContain("%%EOF");
    const web = await completed(a.user, a.projectId, "web");
    await expect(
      createReport(a.user, { runId: web.id, previousRunId: one.id, locale: "en" }),
    ).rejects.toThrow("report_not_comparable");
    // Retention of runs must not silently modify the report's evidence bundle.
    await sql`delete from measurement_runs where id=${one.id}`;
    expect((await getReport(a.user, saved.id)).payload.previous?.responses).toHaveLength(10);
  });
  test("logo validation rejects arbitrary URLs, SVG and oversized decompressed images", async () => {
    const a = await prepared();
    for (const logoData of [
      "https://localhost/secret",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,AAAA",
    ])
      await expect(saveBranding(a.user, { agencyName: "Agency", logoData })).rejects.toThrow(
        "invalid_logo",
      );
    const huge = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await expect(
      saveBranding(a.user, {
        agencyName: "Agency",
        logoData: `data:image/png;base64,${huge.toString("base64")}`,
      }),
    ).rejects.toThrow("invalid_logo");
    expect((await getBranding(a.user)).logo_data).toBeNull();
  });
  test("schedules, budget previews, branding and PDF evidence respect tenant boundaries", async () => {
    const a = await prepared(),
      b = await owner("b");
    const run = await completed(a.user, a.projectId);
    const report = await createReport(a.user, { runId: run.id, locale: "en" });
    const schedule = await saveSchedule(a.user, {
      projectId: a.projectId,
      providers: ["openai"],
      samples: 1,
      intervalHours: 24,
      firstRunAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    for (const path of [
      `reports/${report.id}/pdf`,
      `reports/${report.id}/data`,
      `reports?project=${a.projectId}`,
      `schedules?project=${a.projectId}`,
    ])
      expect((await route("GET", path, b.cookie)).status).toBe(404);
    expect(
      (await route("POST", `schedules/${schedule.id}`, b.cookie, { enabled: false })).status,
    ).toBe(404);
    expect(
      (
        await route("POST", "runs/estimate", b.cookie, {
          projectId: a.projectId,
          providers: ["openai"],
          samples: 1,
        })
      ).status,
    ).toBe(404);
    expect((await route("POST", "reports", b.cookie, { runId: run.id, locale: "en" })).status).toBe(
      404,
    );
    expect((await route("DELETE", `reports/${report.id}`, b.cookie)).status).toBe(404);
    expect((await route("GET", `reports/${report.id}/pdf`, "")).status).toBe(401);
    expect(
      (
        await route(
          "POST",
          `schedules/${schedule.id}`,
          a.cookie,
          { enabled: false },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    await expect(
      sql`insert into measurement_schedules(org_id,project_id,snapshot,interval_hours,next_run_at) values(${b.user.org_id},${a.projectId},'{}'::jsonb,24,now())`,
    ).rejects.toThrow();
  });
  test("UTC recurrence skips arbitrarily old slots without drift or a burst", () => {
    const due = new Date("2026-03-28T09:00:00Z"),
      now = new Date("2026-03-30T10:00:00Z");
    const next = nextOccurrence(due, 24, now);
    expect(next.next.toISOString()).toBe("2026-03-31T09:00:00.000Z");
    expect(next.missed).toBe(2);
  });
});

describe("durable parallel execution", () => {
  test("runs multiple requests concurrently without exceeding the installation cap", async () => {
    const a = await prepared();
    await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai", "gemini"],
      samples: 1,
    });
    const previous = process.env.WORKER_CONCURRENCY;
    process.env.WORKER_CONCURRENCY = "2";
    let count = 0;
    const releases: (() => void)[] = [];
    const adapter = async () => {
      count++;
      await new Promise<void>((resolve) => releases.push(resolve));
      return fixtureResult;
    };
    const first = processQueueJob(adapter);
    let second: Promise<boolean> | undefined;
    try {
      await vi.waitFor(() => expect(count).toBe(1));
      second = processQueueJob(adapter);
      await vi.waitFor(() => expect(count).toBe(2));
      expect(await processQueueJob(adapter)).toBe(false);
      const running = await sql`select id from ai_responses where status='running'`;
      expect(running).toHaveLength(2);
      expect(new Set(running.map((r) => r.id)).size).toBe(2);
    } finally {
      releases.forEach((resolve) => resolve());
      await Promise.all([first, second]);
      if (previous == null) delete process.env.WORKER_CONCURRENCY;
      else process.env.WORKER_CONCURRENCY = previous;
    }
    expect(count).toBe(2);
  });

  test("serializes competing claims, smooths starts and enforces per-model parallel limits", async () => {
    const { saveExecutionPolicy } = await import("../src/lib/execution-control");
    const a = await prepared();
    await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
    await saveExecutionPolicy(a.user, {
      provider: "openai",
      model: MODELS.openai.id,
      rpm: 60,
      tpm: 100000,
      parallel: 2,
    });
    const claimed = (await Promise.all(Array.from({ length: 8 }, () => claimQueueJob()))).filter(
      Boolean,
    );
    expect(claimed).toHaveLength(1);
    await sql`update model_execution_limits set next_start_at=now()-interval '1 second'`;
    const second = await claimQueueJob();
    expect(second).toBeDefined();
    expect(second!.id).not.toBe(claimed[0]!.id);
    await sql`update model_execution_limits set next_start_at=now()-interval '1 second'`;
    expect(await claimQueueJob()).toBeUndefined();
    await settleJob(claimed[0]!, fixtureResult, null);
    expect(await claimQueueJob()).toBeDefined();
  });

  test("respects rolling RPM/TPM even after workers restart and releases blocked request reserves", async () => {
    const { saveExecutionPolicy, rateTokenReserve } = await import("../src/lib/execution-control");
    const a = await prepared();
    const run = await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai"],
      samples: 1,
    });
    await saveExecutionPolicy(a.user, {
      provider: "openai",
      model: MODELS.openai.id,
      rpm: 1,
      tpm: 100000,
      parallel: 4,
    });
    const job = (await claimQueueJob())!;
    await settleJob(job, fixtureResult, null);
    await sql`update model_execution_limits set next_start_at=null`;
    expect(await claimQueueJob()).toBeUndefined();
    await sql`update ai_responses set started_at=now()-interval '61 seconds' where id=${job.id}`;
    await saveExecutionPolicy(a.user, {
      provider: "openai",
      model: MODELS.openai.id,
      rpm: 100,
      tpm: Math.ceil(rateTokenReserve(job) * 1.5),
      parallel: 4,
    });
    const second = (await claimQueueJob())!;
    expect(second).toBeDefined();
    await settleJob(second, fixtureResult, null);
    await sql`update model_execution_limits set next_start_at=null`;
    expect(await claimQueueJob()).toBeUndefined();
    await saveExecutionPolicy(a.user, {
      provider: "openai",
      model: MODELS.openai.id,
      rpm: 100,
      tpm: 1000,
      parallel: 4,
    });
    expect(await claimQueueJob()).toBeUndefined();
    const detail = await getRun(a.user, run.id);
    const blocked = detail.responses.find(
      (r) => r.error_code === "request_exceeds_token_rate_limit",
    )!;
    expect(blocked.cost_micros).toBe(0);
    expect(blocked.started_at).toBeNull();
    const [usage] =
      await sql`select kind,amount_micros from usage_records where response_id=${blocked.id}`;
    expect(usage).toMatchObject({ kind: "estimated", amount_micros: 0 });
  });

  test("429 cools only the affected provider; late success/settings cannot erase Retry-After", async () => {
    const { recordExecutionFeedback, saveExecutionPolicy, getExecutionStatus } =
      await import("../src/lib/execution-control");
    const a = await prepared();
    await createRun(a.user, {
      projectId: a.projectId,
      providers: ["openai", "gemini"],
      samples: 1,
    });
    const job = (await claimQueueJob())!;
    await recordExecutionFeedback(job, { retryAfterMs: 120000 }, "provider_http_429");
    await settleJob(job, null, "provider_http_429");
    const [paused] =
      await sql`select paused_until from provider_cooldowns where org_id=${a.user.org_id}`;
    expect(new Date(paused.paused_until).getTime()).toBeGreaterThan(Date.now() + 119000);
    await recordExecutionFeedback(job, undefined, null);
    const initial = (await getExecutionStatus(a.user)).find((s) => s.provider === job.provider)!;
    await saveExecutionPolicy(a.user, { ...initial, rpm: 100 });
    const current = (await getExecutionStatus(a.user)).find((s) => s.provider === job.provider)!;
    expect(current.adaptiveParallel).toBe(1);
    expect(current.pausedUntil).toBe(initial.pausedUntil);
    const other = await claimQueueJob();
    expect(other?.provider).not.toBe(job.provider);
    expect(other).toBeDefined();
    const [limited] =
      await sql`select count(*)::int as n from ai_responses where provider=${job.provider} and status='running'`;
    expect(limited.n).toBe(0);
  });

  test("learns lower header limits and pauses before exhausting returned tokens", async () => {
    const { recordExecutionFeedback, getExecutionStatus } =
      await import("../src/lib/execution-control");
    const a = await prepared();
    await createRun(a.user, { projectId: a.projectId, providers: ["openai"], samples: 1 });
    const job = (await claimQueueJob())!;
    await recordExecutionFeedback(
      job,
      { requestLimit: 20, tokenLimit: 40000, remainingTokens: 0, resetTokensMs: 90000 },
      null,
    );
    const limits = (await getExecutionStatus(a.user)).find((s) => s.provider === "openai")!;
    expect(limits.effectiveRpm).toBe(17);
    expect(limits.effectiveTpm).toBe(34000);
    await recordExecutionFeedback(job, { requestLimit: 100, tokenLimit: 200000 }, null);
    const late = (await getExecutionStatus(a.user)).find((s) => s.provider === "openai")!;
    expect(late.effectiveRpm).toBe(17);
    expect(late.effectiveTpm).toBe(34000);
    await sql`update model_execution_limits set observed_at=now()-interval '16 minutes' where org_id=${a.user.org_id}`;
    await recordExecutionFeedback(job, { requestLimit: 100, tokenLimit: 200000 }, null);
    expect(
      (await getExecutionStatus(a.user)).find((s) => s.provider === "openai")!.effectiveRpm,
    ).toBe(51);
    expect(new Date(limits.pausedUntil!).getTime()).toBeGreaterThan(Date.now() + 89000);
  });

  test("limits are authorized, validated, persisted and isolated between organizations", async () => {
    const a = await prepared(),
      b = await owner("other-limit-owner");
    const data = {
      provider: "mimo",
      model: MODELS.mimo.id,
      rpm: 80,
      tpm: 500000,
      parallel: 6,
      org_id: b.user.org_id,
    };
    expect((await route("POST", "execution/limits", "", data)).status).toBe(401);
    expect(
      (await route("POST", "execution/limits", a.cookie, data, "https://untrusted.example")).status,
    ).toBe(403);
    expect(
      (await route("POST", "execution/limits", a.cookie, { ...data, parallel: 100 })).status,
    ).toBe(400);
    expect((await route("POST", "execution/limits", a.cookie, data)).status).toBe(200);
    expect((await getState(a.user)).execution?.find((r) => r.provider === "mimo")).toMatchObject({
      rpm: 80,
      configured: true,
    });
    expect((await getState(b.user)).execution?.find((r) => r.provider === "mimo")).toMatchObject({
      rpm: 100,
      configured: false,
    });
    const [row] = await sql`select org_id from model_execution_limits`;
    expect(row.org_id).toBe(a.user.org_id);
  });
});
