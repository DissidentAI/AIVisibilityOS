import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql, db } from "../src/db/client";
import { createProject, createRun, getRun, getState, saveCredential } from "../src/lib/service";
import { addQuestions, updateProject, saveScanSettings } from "../src/lib/project-settings";
import { requestSuggestions, getSuggestions } from "../src/lib/suggestions";
import { claimJob, settleJob, workOnce, maintenance } from "../src/lib/queue";
import { saveSchedule, dispatchSchedule, listSchedules } from "../src/lib/schedules";
import type { User } from "../src/lib/types";
import { digest } from "../src/lib/security";
import { POST, GET } from "../src/app/api/[[...path]]/route";
import { parseSuggestions } from "../src/lib/suggestion-validation";
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
    { params: Promise.resolve({ path: path.split("/") }) },
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
