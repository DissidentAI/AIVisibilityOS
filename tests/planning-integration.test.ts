import { beforeAll, beforeEach, afterAll, test, expect, vi } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql, db } from "../src/db/client";
import {
  createProject,
  createRun,
  estimateRun,
  getRun,
  getState,
  saveCredential,
} from "../src/lib/service";
import { addQuestions, updateProject, saveScanSettings } from "../src/lib/project-settings";
import { requestSuggestions, getSuggestions } from "../src/lib/suggestions";
import { claimJob, settleJob, workOnce, maintenance } from "../src/lib/queue";
import { saveSchedule, dispatchSchedule, listSchedules } from "../src/lib/schedules";
import type { User } from "../src/lib/types";
import { digest } from "../src/lib/security";
import { POST, GET } from "../src/app/api/[[...path]]/route";
import { parseSuggestions, suggestionContextSchema } from "../src/lib/suggestion-validation";
import { MAX_COMPETITORS, PROJECT_BODY_LIMIT_BYTES } from "../src/lib/project-limits";
import { comparisonBrands, sameBrandAnalysis } from "../src/lib/brand-analysis";
import { createReport, getReport, reportMetrics, comparable } from "../src/lib/reports";
import { createRetry, estimateRetry } from "../src/lib/retries";
const base = {
  name: "Atelier Test",
  domain: "atelier.example",
  industry: "Mobilier de bureau",
  description: "Bureaux ergonomiques pour les PME françaises",
  language: "fr",
  country: "FR",
  competitors: [{ name: "Concurrent Test", domain: "concurrent.example" }],
  queries: ["Quels bureaux choisir pour une petite entreprise ?"],
};
const settings = {
  providers: ["openai"] as ["openai"],
  samples: 1,
  mode: "baseline" as const,
  openrouterModel: "openai/gpt-4.1-mini" as const,
};
// Use the live catalog's first supported router model, without contacting a provider.
import { OPENROUTER_MODEL_IDS } from "../src/lib/provider-config";
settings.openrouterModel = OPENROUTER_MODEL_IDS[0] as typeof settings.openrouterModel;
const result = {
  status: "succeeded" as const,
  text: "Atelier Test fournit des bureaux.",
  model: "synthetic-test-model",
  requestId: "test",
  input: 40,
  output: 40,
  raw: { syntheticFixture: true },
  citations: [],
};
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw Error("unsafe");
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await sql`truncate organizations,rate_limits cascade`;
});
afterAll(() => sql.end());
async function owner(name = "a") {
  const [o] = await sql`insert into organizations(name) values(${name}) returning id`;
  const [user] = await sql<
    User[]
  >`insert into users(org_id,email,password_hash) values(${o.id},${name + "@example.com"},'synthetic-test') returning id,org_id,email`;
  await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(digest(name))},${user.id},now()+interval '1 day')`;
  return user;
}
async function setup() {
  const user = await owner();
  const p = await createProject(user, base);
  await saveCredential(user, { provider: "openai", key: "test-only-not-a-real-key" });
  return { user, id: p.id };
}
function req(
  method: "GET" | "POST",
  path: string,
  user = "a",
  data?: unknown,
  origin = "http://localhost:3000",
) {
  return { GET, POST }[method](
    new Request(`http://localhost:3000/api/${path}`, {
      method,
      headers: {
        origin,
        cookie: `avos_session=${digest(user)}`,
        "Content-Type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    { params: Promise.resolve({ path: path.split("?")[0].split("/") }) },
  );
}
async function editData(user: User) {
  const p = (await getState(user)).projects[0];
  return {
    ...base,
    revision: p.revision,
    competitorIds: p.brands.filter((b) => !b.is_primary).map((b) => b.id),
    scanSettings: settings,
  };
}
function suggestionInput(projectId: string) {
  return { projectId, provider: "openai", context: { ...base, questions: base.queries } };
}
async function measurementEvidence() {
  return Promise.all(
    [
      "measurement_runs",
      "ai_responses",
      "brand_mentions",
      "citations",
      "usage_records",
      "response_retries",
      "assistant_jobs",
      "reports",
    ].map(
      async (table) =>
        sql`select to_jsonb(t) as evidence from ${sql(table)} t order by to_jsonb(t)::text`,
    ),
  );
}
test("new rivals are detected in stored valid answers with zero network calls or measurement writes", async () => {
  const a = await setup(),
    other = await owner("other");
  const run = await createRun(a.user, { projectId: a.id, ...settings, samples: 3 });
  const texts = [
    "SYNTHETIC: Atelier Test. Nouvelle Marque, Nouvelle Marque.",
    "SYNTHETIC: see https://nouvelle.example/product",
    "SYNTHETIC: Nouvelle Marque (invalid answer)",
  ];
  for (let i = 0; i < texts.length; i++) {
    const job = await claimJob({ unregulatedTestOnly: true });
    await settleJob(
      job!,
      {
        ...result,
        status: i === 2 ? "invalid" : "succeeded",
        text: texts[i],
        citations:
          i === 0
            ? [
                {
                  url: "https://source.example/proof",
                  domain: "source.example",
                  title: "Synthetic source",
                  provenance: "openai_url_annotation",
                },
              ]
            : [],
      },
      null,
    );
  }
  const original = await getRun(a.user, run.id);
  const saved = await createReport(a.user, { runId: run.id, locale: "fr" });
  const reportBefore = await getReport(a.user, saved.id);
  expect(
    (
      await req("POST", `projects/${a.id}/brands`, "a", {
        name: "Nouvelle Marque",
        domain: "nouvelle.example",
      })
    ).status,
  ).toBe(201);
  const before = await measurementEvidence();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network allowed for reanalysis"));
  try {
    const current = await getRun(a.user, run.id, "current");
    expect(comparisonBrands(current)).toHaveLength(3);
    expect(current.run).toEqual(original.run);
    expect(current.responses).toEqual(original.responses);
    expect(current.citations).toEqual(original.citations);
    const rival = reportMetrics(current).find((b) => b.name === "Nouvelle Marque")!;
    expect(rival).toMatchObject({ mentioned: 2, n: 2, rate: 100 });
    expect(current.mentions.filter((m) => m.brand_name === rival.name)).toHaveLength(2);
    expect(current.mentions.some((m) => m.matched_alias === "nouvelle.example")).toBe(true);
    expect(current.brandAnalysis).toMatchObject({
      scope: "current",
      methodology: "explicit-mention-v1",
      brandSetHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect((await getRun(a.user, run.id)).mentions).toEqual(original.mentions);
    expect((await getRun(a.user, run.id, "current")).mentions).toEqual(current.mentions);
    const csv = await req("GET", `runs/${run.id}/export?brandScope=current`);
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain('"current"');
    expect((await req("GET", `runs/${run.id}?brandScope=current`, "other")).status).toBe(404);
    expect((await req("GET", `runs/${run.id}/export?brandScope=current`, "other")).status).toBe(
      404,
    );
    expect((await req("GET", `runs/${run.id}?brandScope=unknown`)).status).toBe(400);
    await expect(getRun(other, run.id, "current")).rejects.toThrow("not_found");
    expect(fetch).not.toHaveBeenCalled();
    expect(await measurementEvidence()).toEqual(before);
    expect(await getReport(a.user, saved.id)).toEqual(reportBefore);
  } finally {
    fetch.mockRestore();
  }
});
test("reanalysis uses the latest attempt per slot and keeps failed attempts separate", async () => {
  const a = await setup();
  const run = await createRun(a.user, { projectId: a.id, ...settings, samples: 2 });
  const first = await claimJob({ unregulatedTestOnly: true });
  await settleJob(first!, { ...result, text: "SYNTHETIC: Nouvelle Marque." }, null);
  const failed = await claimJob({ unregulatedTestOnly: true });
  await settleJob(
    failed!,
    { ...result, status: "invalid", text: "SYNTHETIC: Nouvelle Marque but invalid" },
    "empty_response",
  );
  await req("POST", `projects/${a.id}/brands`, "a", {
    name: "Nouvelle Marque",
    domain: "nouvelle.example",
  });
  const quote = await estimateRetry(a.user, run.id, {});
  const retry = await createRetry(a.user, run.id, { expectedQuoteHash: quote.quoteHash });
  expect(retry.id).toBe(run.id);
  const pending = await getRun(a.user, run.id, "current");
  expect(pending.run).toMatchObject({ valid: 1, total: 2, pending: 1 });
  expect(reportMetrics(pending).find((b) => b.name === "Nouvelle Marque")).toMatchObject({
    n: 1,
    mentioned: 1,
  });
  expect(pending.previousMentions).toEqual([]);
  const job = await claimJob({ unregulatedTestOnly: true });
  await settleJob(job!, { ...result, text: "SYNTHETIC: No tracked brand here." }, null);
  const final = await getRun(a.user, run.id, "current");
  expect(reportMetrics(final).find((b) => b.name === "Nouvelle Marque")).toMatchObject({
    n: 2,
    mentioned: 1,
    rate: 50,
  });
  expect(final.previousAttempts).toHaveLength(1);
  expect(final.responses.find((r) => r.id === first!.id)?.answer).toBe(
    "SYNTHETIC: Nouvelle Marque.",
  );
  expect((await getRun(a.user, run.id)).mentions).toEqual([]);
});
test("current-brand reports freeze the analysis, compare equal measurements and preserve the original view after edits", async () => {
  const a = await setup();
  const one = await createRun(a.user, { projectId: a.id, ...settings });
  await workOnce(
    async () => ({ ...result, text: "SYNTHETIC: Atelier Test, Concurrent Test, Nouvelle Marque." }),
    { unregulatedTestOnly: true },
  );
  const original = await getRun(a.user, one.id);
  await req("POST", `projects/${a.id}/brands`, "a", {
    name: "Nouvelle Marque",
    domain: "nouvelle.example",
  });
  const two = await createRun(a.user, { projectId: a.id, ...settings });
  await workOnce(async () => ({ ...result, text: "SYNTHETIC: Atelier Test, Nouvelle Marque." }), {
    unregulatedTestOnly: true,
  });
  const a1 = await getRun(a.user, one.id, "current"),
    a2 = await getRun(a.user, two.id, "current");
  expect(a1.run.config_hash).not.toBe(a2.run.config_hash);
  expect(comparable(a2, a1)).toBe(true);
  expect(comparable(a2, original)).toBe(false);
  const saved = await createReport(a.user, {
    runId: two.id,
    previousRunId: one.id,
    brandScope: "current",
    locale: "zh-CN",
  });
  const frozen = await getReport(a.user, saved.id);
  expect(frozen.payload.current.brandAnalysis?.brands).toHaveLength(3);
  expect(frozen.payload.previous?.brandAnalysis?.brandSetHash).toBe(
    frozen.payload.current.brandAnalysis?.brandSetHash,
  );
  expect(frozen.payload.previous?.run.snapshot.brands).toHaveLength(2);
  // Rename an existing rival, remove the old competitor, keep all historical rows intact.
  const project = (await getState(a.user)).projects[0];
  const rival = project.brands.find((b) => b.name === "Nouvelle Marque")!;
  await updateProject(a.user, a.id, {
    ...base,
    revision: project.revision,
    competitors: [{ name: "Changed Rival", domain: "changed.example" }],
    competitorIds: [rival.id],
    scanSettings: settings,
  });
  const changed = await getRun(a.user, one.id, "current");
  expect(comparisonBrands(changed).map((b) => b.name)).toEqual(
    expect.arrayContaining(["Atelier Test", "Changed Rival"]),
  );
  expect(reportMetrics(changed).find((b) => b.id === rival.id)).toMatchObject({
    n: 1,
    mentioned: 0,
    rate: 0,
  });
  expect(sameBrandAnalysis(changed, a2)).toBe(false);
  expect(await getRun(a.user, one.id)).toEqual(original);
  expect(await getReport(a.user, saved.id)).toEqual(frozen);
  const incompatible = structuredClone(a1);
  incompatible.run.snapshot.system += " different prompt";
  expect(comparable(a2, incompatible)).toBe(false);
  incompatible.run.snapshot = a1.run.snapshot;
  incompatible.responses[0].parameters.retry = { sourceRunId: one.id };
  expect(comparable(a2, incompatible)).toBe(false);
});
test("fifty competitors use one shared sample and larger settings never rewrite historical evidence", async () => {
  const a = await setup();
  const before = await estimateRun(a.user, { projectId: a.id, ...settings });
  const competitors = Array.from({ length: MAX_COMPETITORS }, (_, i) => ({
    name: `Concurrent ${i + 1}`,
    domain: `brand${i + 1}.example`,
  }));
  await updateProject(a.user, a.id, {
    ...(await editData(a.user)),
    competitors,
    competitorIds: competitors.map(() => null),
  });
  const p = (await getState(a.user)).projects[0];
  expect(p.brands).toHaveLength(51);
  expect(
    suggestionContextSchema.parse({ ...base, competitors, questions: base.queries }).competitors,
  ).toHaveLength(50);
  const after = await estimateRun(a.user, { projectId: a.id, ...settings });
  expect(after.responses).toBe(before.responses);
  expect(after.reservedMicros).toBe(before.reservedMicros);
  const run = await createRun(a.user, { projectId: a.id, ...settings });
  await workOnce(
    async () => ({ ...result, text: "SYNTHETIC TEST: Atelier Test and Concurrent 50." }),
    { unregulatedTestOnly: true },
  );
  const detail = await getRun(a.user, run.id);
  expect(detail.responses).toHaveLength(1);
  expect(detail.run.valid).toBe(1);
  expect(detail.mentions.map((m) => m.brand_name).sort()).toEqual([
    "Atelier Test",
    "Concurrent 50",
  ]);
  const addition = await req("POST", `projects/${a.id}/brands`, "a", {
    name: "Over limit",
    domain: "extra.example",
  });
  expect(addition.status).toBe(400);
  expect(await addition.json()).toEqual({ error: "brand_limit" });
  const current = (await getState(a.user)).projects[0];
  const ids = competitors.map((c) => current.brands.find((b) => b.name === c.name)!.id);
  await updateProject(a.user, a.id, {
    ...base,
    competitors: competitors.map((c, i) =>
      i === 49 ? { ...c, name: "Changed last competitor" } : c,
    ),
    competitorIds: ids,
    scanSettings: settings,
    revision: current.revision,
  });
  expect((await getRun(a.user, run.id)).run.snapshot).toEqual(detail.run.snapshot);
});
test("concurrent additions respect the fifty-competitor cap and stay tenant isolated", async () => {
  const a = await setup();
  const competitors = Array.from({ length: MAX_COMPETITORS - 1 }, (_, i) => ({
    name: `Brand ${i}`,
    domain: `brand${i}.example`,
  }));
  await updateProject(a.user, a.id, {
    ...(await editData(a.user)),
    competitors,
    competitorIds: competitors.map(() => null),
  });
  await owner("b");
  expect(
    (
      await req("POST", `projects/${a.id}/brands`, "b", {
        name: "Foreign",
        domain: "foreign.example",
      })
    ).status,
  ).toBe(404);
  const added = await Promise.all(
    ["One", "Two"].map((name) =>
      req("POST", `projects/${a.id}/brands`, "a", {
        name,
        domain: `${name.toLowerCase()}.example`,
      }),
    ),
  );
  expect(added.map((r) => r.status).sort()).toEqual([201, 400]);
  expect((await getState(a.user)).projects[0].brands).toHaveLength(51);
});
test("large Unicode projects fit the bounded request envelope with fifty competitors", async () => {
  await owner();
  const data = {
    ...base,
    competitors: Array.from({ length: MAX_COMPETITORS }, (_, i) => ({
      name: `品牌${i}`,
      domain: `brand${i}.example`,
    })),
    queries: Array.from({ length: 50 }, (_, i) => `${i} ${"测".repeat(990)}`),
  };
  expect(Buffer.byteLength(JSON.stringify(data))).toBeGreaterThan(100000);
  const response = await req("POST", "projects", "a", data);
  expect(response.status).toBe(201);
  expect(
    (await getState((await sql<User[]>`select id,org_id,email from users`)[0])).projects[0].brands,
  ).toHaveLength(51);
  expect(
    (
      await req("POST", "projects", "a", {
        ...base,
        description: "x".repeat(PROJECT_BODY_LIMIT_BYTES),
      })
    ).status,
  ).toBe(413);
});
test("bulk questions are atomic, deduplicated, bounded and tenant protected", async () => {
  const a = await setup(),
    b = await owner("b");
  expect(
    await addQuestions(a.user, a.id, {
      texts: [
        ...base.queries,
        "Quel bureau est adapté au télétravail ?",
        "Quel bureau est adapté au télétravail ?",
      ],
    }),
  ).toEqual({ added: 1, skipped: 2 });
  await expect(
    addQuestions(a.user, a.id, { texts: ["abc", "Valide mais transaction non insérée"] }),
  ).rejects.toThrow();
  expect((await getState(a.user)).projects[0].queries).toHaveLength(2);
  await expect(
    addQuestions(b, a.id, { texts: ["Question interdite à un autre espace"] }),
  ).rejects.toThrow("not_found");
  await expect(
    addQuestions(a.user, a.id, {
      texts: Array.from({ length: 50 }, (_, i) => `Question supplémentaire ${i} ?`),
    }),
  ).rejects.toThrow("query_limit");
  expect(
    (
      await req(
        "POST",
        `projects/${a.id}/queries`,
        "a",
        { texts: ["Question de test ?"] },
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
});
test("project editing preserves brand identity, completed answers and pending snapshots; stale edits conflict", async () => {
  const a = await setup();
  const run = await createRun(a.user, { projectId: a.id, ...settings });
  const before = await getRun(a.user, run.id);
  const edit = await editData(a.user);
  await updateProject(a.user, a.id, {
    ...edit,
    name: "Atelier Modifié",
    description: "Nouveaux clients",
    language: "zh-CN",
    queries: ["适合小型企业的办公家具有哪些？"],
    competitors: [{ name: "Concurrent Renommé", domain: "new.example" }],
    scanSettings: { ...settings, samples: 3 },
  });
  const p = (await getState(a.user)).projects[0];
  expect(p.brands.find((b) => !b.is_primary)?.id).toBe(edit.competitorIds[0]);
  expect(p.scan_settings?.samples).toBe(3);
  expect(p.language).toBe("zh-CN");
  expect((await getRun(a.user, run.id)).run.snapshot).toEqual(before.run.snapshot);
  await workOnce(async () => result, { unregulatedTestOnly: true });
  expect((await getRun(a.user, run.id)).responses[0].query_text).toBe(base.queries[0]);
  await expect(updateProject(a.user, a.id, edit)).rejects.toThrow("project_changed");
  const other = await owner("b");
  await expect(updateProject(other, a.id, edit)).rejects.toThrow("not_found");
  await expect(saveScanSettings(other, a.id, settings)).rejects.toThrow("not_found");
});
test("editing saved schedule replaces future settings without rewriting previous runs", async () => {
  const a = await setup();
  const first = new Date(Date.now() + 3600000).toISOString();
  await saveSchedule(a.user, {
    projectId: a.id,
    ...settings,
    intervalHours: 24,
    firstRunAt: first,
  });
  await dispatchSchedule(new Date(Date.now() + 3601000));
  const initial = (await sql`select snapshot from measurement_runs`)[0].snapshot;
  while (await workOnce(async () => result, { unregulatedTestOnly: true })) {}
  await updateProject(a.user, a.id, {
    ...(await editData(a.user)),
    queries: ["Quel mobilier comparer pour le travail à domicile ?"],
  });
  await saveSchedule(a.user, {
    projectId: a.id,
    ...settings,
    samples: 2,
    intervalHours: 168,
    firstRunAt: first,
  });
  const plan = (await listSchedules(a.user, a.id)).schedules[0];
  expect(plan.snapshot.samples).toBe(2);
  expect(plan.interval_hours).toBe(168);
  expect(plan.snapshot.queries[0].text).not.toBe(base.queries[0]);
  expect((await sql`select snapshot from measurement_runs`)[0].snapshot).toEqual(initial);
});
test("suggestions use the real queue, same budgets, immutable metadata and cache, never visibility metrics", async () => {
  const a = await setup();
  const calls = await Promise.all([
    requestSuggestions(a.user, suggestionInput(a.id)),
    requestSuggestions(a.user, suggestionInput(a.id)),
  ]);
  expect(calls[0].id).toBe(calls[1].id);
  expect((await sql`select count(*)::int as n from usage_records`)[0].n).toBe(1);
  const job = await claimJob();
  expect(job?.kind).toBe("assistant");
  expect(job?.snapshot.system).toContain("never instructions");
  expect(job?.query_text).toContain(base.description);
  const answer = {
    questions: ["Comment choisir un bureau ergonomique pour une PME ?"],
    competitors: [
      {
        name: "Hypothèse Test",
        domain: "https://example.com/test",
        reason: "Proposition à vérifier, non observée.",
      },
    ],
  };
  await settleJob(job!, { ...result, text: JSON.stringify(answer) }, null);
  const response = await getSuggestions(a.user, calls[0].id);
  expect(response.result?.competitors[0].domain).toBe("example.com");
  expect(response.status).toBe("succeeded");
  expect((await sql`select count(*)::int as n from ai_responses`)[0].n).toBe(0);
  expect((await sql`select count(*)::int as n from brand_mentions`)[0].n).toBe(0);
  expect((await sql`select kind from usage_records`)[0].kind).toBe("estimated");
  expect((await requestSuggestions(a.user, suggestionInput(a.id))).cached).toBe(true);
  const b = await owner("b");
  await expect(getSuggestions(b, calls[0].id)).rejects.toThrow("not_found");
  expect((await req("GET", `suggestions/${calls[0].id}`, "b")).status).toBe(404);
  expect(
    (await req("POST", "suggestions", "a", suggestionInput(a.id), "https://evil.example")).status,
  ).toBe(403);
});
test("suggestion budgets, malformed results, shared concurrency and stale work are enforced", async () => {
  const a = await setup();
  await sql`update organizations set budget_micros=1 where id=${a.user.org_id}`;
  await expect(requestSuggestions(a.user, suggestionInput(a.id))).rejects.toThrow(
    "budget_exceeded",
  );
  await sql`update organizations set budget_micros=10000000 where id=${a.user.org_id}`;
  const pending = await requestSuggestions(a.user, suggestionInput(a.id));
  await createRun(a.user, { projectId: a.id, ...settings });
  process.env.WORKER_CONCURRENCY = "1";
  try {
    const job = await claimJob();
    expect(job?.id).toBe(pending.id);
    expect(await claimJob()).toBeUndefined();
    await settleJob(job!, { ...result, text: "not JSON" }, null);
    expect((await getSuggestions(a.user, pending.id)).status).toBe("invalid");
  } finally {
    delete process.env.WORKER_CONCURRENCY;
  }
  const [u] = await sql`select amount_micros from usage_records where assistant_id=${pending.id}`;
  expect(u.amount_micros).toBeGreaterThan(0);
  await sql`update assistant_jobs set status='running',started_at=now()-interval '3 minutes' where id=${pending.id}`;
  await maintenance();
  expect((await getSuggestions(a.user, pending.id)).status).toBe("uncertain");
  expect((await sql`select kind from usage_records where assistant_id=${pending.id}`)[0].kind).toBe(
    "uncertain",
  );
});
test("suggestion quota cannot be bypassed by deleting cached proposals and unsafe domains are discarded", async () => {
  const a = await setup();
  await sql`insert into rate_limits(key,count,expires_at) values(${"suggestions:" + a.user.org_id},30,now()+interval '1 day')`;
  await expect(requestSuggestions(a.user, suggestionInput(a.id))).rejects.toThrow(
    "suggestions_daily_limit",
  );
  expect(
    parseSuggestions(
      JSON.stringify({
        questions: ["Question valide ?"],
        competitors: [
          { name: "Test", domain: "http://127.0.0.1/secret", reason: "Hypothèse non vérifiée" },
        ],
      }),
    )?.competitors[0].domain,
  ).toBeNull();
  expect(parseSuggestions('{"questions":[1]}')).toBeNull();
});
