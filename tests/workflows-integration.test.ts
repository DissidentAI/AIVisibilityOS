import { beforeAll, beforeEach, afterAll, test, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql, db } from "../src/db/client";
import {
  createProject,
  createRun,
  getRun,
  getState,
  saveCredential,
  estimateRun,
} from "../src/lib/service";
import {
  organizeQueries,
  listQueryViews,
  saveQueryView,
  deleteQueryView,
} from "../src/lib/query-organization-service";
import {
  createGeoAction,
  getGeoAction,
  listGeoActions,
  updateGeoAction,
  deleteGeoAction,
} from "../src/lib/geo-actions-service";
import { getCampaignHistory } from "../src/lib/history-service";
import { updateProject } from "../src/lib/project-settings";
import { claimJob, settleJob, maintenance } from "../src/lib/queue";
import { createRetry, estimateRetry } from "../src/lib/retries";
import { OPENROUTER_MODEL_IDS } from "../src/lib/provider-config";
import { digest } from "../src/lib/security";
import type { User } from "../src/lib/types";
import { GET, POST, DELETE } from "../src/app/api/[[...path]]/route";
const base = {
  name: "Atelier Test",
  domain: "atelier.example",
  industry: "Mobilier",
  description: "Bureaux pour agences",
  language: "fr",
  country: "FR",
  competitors: [{ name: "Concurrent Test", domain: "concurrent.example" }],
  queries: ["Quel bureau choisir ?", "Quels meubles comparer ?"],
};
const result = {
  status: "succeeded" as const,
  text: "SYNTHETIC TEST: Atelier Test et Concurrent Test.",
  model: "synthetic-model",
  requestId: "synthetic",
  input: 20,
  output: 20,
  raw: { syntheticFixture: true },
  citations: [],
};
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw Error("Unsafe");
  await migrate(db, { migrationsFolder: "drizzle" });
});
beforeEach(async () => {
  await sql`truncate organizations,rate_limits cascade`;
});
afterAll(() => sql.end());
async function owner(name = "a") {
  const [org] = await sql`insert into organizations(name) values(${name}) returning id`;
  const [user] = await sql<
    User[]
  >`insert into users(org_id,email,password_hash) values(${org.id},${name + "@example.com"},'synthetic-test') returning id,org_id,email`;
  await sql`insert into sessions(token_hash,user_id,expires_at) values(${digest(digest(name))},${user.id},now()+interval '1 day')`;
  return user;
}
async function setup() {
  const user = await owner();
  const { id } = await createProject(user, base);
  await saveCredential(user, { provider: "openai", key: "synthetic-test-key-not-production" });
  return { user, id };
}
async function measure(user: User, id: string, failLast = false, model = "synthetic-model") {
  const run = await createRun(user, { projectId: id, providers: ["openai"], samples: 1 });
  for (let i = 0; i < 2; i++) {
    const job = await claimJob({ unregulatedTestOnly: true });
    expect(job).toBeTruthy();
    await settleJob(
      job!,
      failLast && i === 1 ? null : { ...result, model },
      failLast && i === 1 ? "network_or_timeout" : null,
    );
  }
  return getRun(user, run.id);
}
function req(
  method: "GET" | "POST" | "DELETE",
  path: string,
  data?: unknown,
  user = "a",
  origin = "http://localhost:3000",
) {
  return { GET, POST, DELETE }[method](
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
test("bulk organization persists but never changes submitted questions, evidence or future configuration hashes", async () => {
  const { user, id } = await setup();
  const d = await measure(user, id);
  const project = (await getState(user)).projects[0];
  const before = await estimateRun(user, { projectId: id, providers: ["openai"], samples: 1 });
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("No network"));
  try {
    await organizeQueries(user, id, {
      ids: project.queries.map((q) => q.id),
      revision: project.revision,
      patch: { theme: "Choix & 中文", intent: "comparison", priority: "high" },
    });
    const p = (await getState(user)).projects[0];
    expect(p.queries.every((q) => q.theme === "Choix & 中文" && q.priority === "high")).toBe(true);
    expect(await getRun(user, d.run.id)).toEqual(d);
    expect(await estimateRun(user, { projectId: id, providers: ["openai"], samples: 1 })).toEqual(
      before,
    );
    await expect(
      organizeQueries(user, id, {
        ids: p.queries.map((q) => q.id),
        revision: project.revision,
        patch: { theme: "stale" },
      }),
    ).rejects.toMatchObject({ code: "project_changed" });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
test("mixed foreign query IDs roll back atomically; organization API enforces ownership and origin", async () => {
  const { user, id } = await setup();
  const other = await owner("other"),
    foreign = await createProject(other, base);
  const p = (await getState(user)).projects[0],
    fp = (await getState(other)).projects[0];
  const input = {
    ids: [p.queries[0].id, fp.queries[0].id],
    revision: p.revision,
    patch: { theme: "Injected" },
  };
  expect((await req("POST", `projects/${id}/query-organization`, input)).status).toBe(404);
  expect((await getState(user)).projects[0].queries[0].theme).toBe("");
  expect((await req("POST", `projects/${foreign.id}/query-organization`, input)).status).toBe(404);
  expect(
    (await req("POST", `projects/${id}/query-organization`, input, "a", "https://foreign.example"))
      .status,
  ).toBe(403);
});
test("saved views persist across reads, upsert by project/name, export and respect tenant isolation", async () => {
  const { user, id } = await setup(),
    other = await owner("other");
  const v = await saveQueryView(user, id, {
    name: "Intentions prioritaires",
    filters: { intent: "comparison", priority: "high" },
  });
  const updated = await saveQueryView(user, id, {
    name: "Intentions prioritaires",
    filters: { theme: "中文", search: "agence" },
  });
  expect(updated.id).toBe(v.id);
  expect(await listQueryViews(user, id)).toEqual([updated]);
  await expect(listQueryViews(other, id)).rejects.toMatchObject({ code: "not_found" });
  await expect(deleteQueryView(other, v.id)).rejects.toMatchObject({ code: "not_found" });
  const exported = await req("GET", "account/export").then((r) => r.json());
  expect(exported.queryViews).toHaveLength(1);
  await deleteQueryView(user, v.id);
  expect(await listQueryViews(user, id)).toEqual([]);
});
test("GEO actions archive server-selected evidence, remain idempotent, and survive project edits or source removal", async () => {
  const { user, id } = await setup();
  const d = await measure(user, id);
  const input = {
    title: "Publier un comparatif",
    runId: d.run.id,
    queryId: d.run.snapshot.queries[0].id,
    scope: "current",
    requestId: randomUUID(),
    evidence: { fake: true },
  };
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("No provider calls"));
  try {
    const [a, b] = await Promise.all([
      createGeoAction(user, id, input),
      createGeoAction(user, id, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.evidence.responses).toHaveLength(1);
    expect(a.evidence.mentions).toHaveLength(2);
    expect(a.evidence).not.toHaveProperty("fake");
    const project = (await getState(user)).projects[0];
    await updateProject(user, id, {
      ...base,
      queries: ["Une nouvelle question différente ?"],
      competitors: [],
      competitorIds: [],
      revision: project.revision,
      scanSettings: {
        providers: ["openai"],
        samples: 1,
        mode: "baseline",
        openrouterModel: OPENROUTER_MODEL_IDS[0],
      },
    });
    expect((await getGeoAction(user, a.id)).evidence).toEqual(a.evidence);
    await sql`delete from measurement_runs where id=${d.run.id}`;
    expect((await getGeoAction(user, a.id)).evidence).toEqual(a.evidence);
    const list = await listGeoActions(user, id);
    expect(list).toHaveLength(1);
    expect(list[0].evidence_count).toBe(1);
    expect(list[0]).not.toHaveProperty("evidence");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
test("action edits use optimistic concurrency, preserve evidence and are never accessible cross-organization", async () => {
  const { user, id } = await setup(),
    other = await owner("other");
  const d = await measure(user, id);
  const a = await createGeoAction(user, id, {
    title: "Améliorer la page",
    runId: d.run.id,
    queryId: d.run.snapshot.queries[0].id,
    scope: "original",
    requestId: randomUUID(),
  });
  const fields = {
    title: a.title,
    status: "published",
    owner: "Camille",
    dueDate: "2027-02-04",
    targetUrl: "https://atelier.example/comparatif",
    notes: "Hypothèse à vérifier",
    version: a.version,
    evidence: { fake: true },
  };
  const edited = await updateGeoAction(user, a.id, fields);
  expect(edited.evidence).toEqual(a.evidence);
  expect(edited.version).toBe(2);
  expect(edited.due_date).toBe("2027-02-04");
  await expect(updateGeoAction(user, a.id, fields)).rejects.toMatchObject({
    code: "action_changed",
  });
  for (const method of ["GET", "POST", "DELETE"] as const)
    expect(
      (await req(method, `actions/${a.id}`, method === "GET" ? undefined : fields, "other")).status,
    ).toBe(404);
  await expect(
    createGeoAction(other, id, {
      ...fields,
      runId: d.run.id,
      queryId: d.run.snapshot.queries[0].id,
      scope: "original",
      requestId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  const foreignProject = await createProject(user, base);
  await expect(
    createGeoAction(user, foreignProject.id, {
      ...fields,
      runId: d.run.id,
      queryId: d.run.snapshot.queries[0].id,
      scope: "original",
      requestId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "not_found" });
  const exported = await req("GET", "account/export").then((r) => r.json());
  expect(exported.geoActions[0].evidence).toEqual(a.evidence);
  await expect(deleteGeoAction(user, a.id, { version: 1 })).rejects.toMatchObject({
    code: "action_changed",
  });
  await deleteGeoAction(user, a.id, { version: 2 });
  await expect(getGeoAction(user, a.id)).rejects.toMatchObject({ code: "not_found" });
});
test("actions follow configured retention and project deletion cascades both actions and views", async () => {
  const { user, id } = await setup();
  const d = await measure(user, id);
  const input = {
    title: "Action conservée",
    runId: d.run.id,
    queryId: d.run.snapshot.queries[0].id,
    scope: "original",
    requestId: randomUUID(),
  };
  const a = await createGeoAction(user, id, input);
  await sql`update geo_actions set created_at=now()-interval '366 days' where id=${a.id}`;
  await maintenance();
  await expect(getGeoAction(user, a.id)).rejects.toMatchObject({ code: "not_found" });
  await createGeoAction(user, id, { ...input, requestId: randomUUID() });
  await saveQueryView(user, id, { name: "Test", filters: {} });
  expect((await req("DELETE", `projects/${id}`)).status).toBe(200);
  expect(await sql`select id from geo_actions`).toHaveLength(0);
  expect(await sql`select id from query_views`).toHaveLength(0);
});
test("history aggregates match evidence, explain partial/model exclusions, include only canonical campaigns and need zero provider calls", async () => {
  const { user, id } = await setup();
  const first = await measure(user, id);
  const same = await measure(user, id);
  const changed = await measure(user, id, false, "different-model");
  const partial = await measure(user, id, true);
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("No network"));
  try {
    const h = await getCampaignHistory(user, id, { reference: first.run.id, scope: "original" });
    expect(h.total).toBe(4);
    expect(h.entries.find((e) => e.id === same.run.id)).toMatchObject({
      mentioned: 2,
      valid: 2,
      rate: 100,
      reasons: [],
    });
    expect(h.entries.find((e) => e.id === changed.run.id)?.reasons).toContain("returned_models");
    expect(h.entries.find((e) => e.id === partial.run.id)).toMatchObject({
      mentioned: 1,
      valid: 1,
      failed: 1,
      rate: 100,
      reasons: ["incomplete"],
    });
    expect(JSON.stringify(h)).not.toContain("SYNTHETIC TEST");
    const selection = {
      responseIds: partial.responses.filter((r) => r.status === "failed").map((r) => r.id),
    };
    const quote = await estimateRetry(user, partial.run.id, selection);
    await createRetry(user, partial.run.id, { ...selection, expectedQuoteHash: quote.quoteHash });
    const job = await claimJob({ unregulatedTestOnly: true });
    await settleJob(job!, result, null);
    const after = await getCampaignHistory(user, id, { reference: first.run.id });
    expect(after.total).toBe(4);
    expect(after.entries.find((e) => e.id === partial.run.id)?.reasons).toContain("retried");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
test("current-brand history reinterprets only mentions; archived history and pagination beyond 100 remain accessible", async () => {
  const { user, id } = await setup(),
    other = await owner("other");
  const d = await measure(user, id);
  await sql`update brands set name='Marque Absente',domain='absente.example' where project_id=${id} and is_primary`;
  expect(
    (await getCampaignHistory(user, id, { reference: d.run.id, scope: "current" })).entries[0],
  ).toMatchObject({ mentioned: 0, valid: 2 });
  expect(
    (await getCampaignHistory(user, id, { reference: d.run.id, scope: "original" })).entries[0],
  ).toMatchObject({ mentioned: 2, valid: 2 });
  await sql`insert into measurement_runs(org_id,project_id,config_hash,snapshot,created_at) select ${user.org_id},${id},${d.run.config_hash},${JSON.stringify(d.run.snapshot)}::jsonb,now()+i*interval '1 second' from generate_series(1,105) as s(i)`;
  const page = await getCampaignHistory(user, id, { reference: d.run.id, offset: 100 });
  expect(page.total).toBe(106);
  expect(page.entries).toHaveLength(6);
  expect(page.entries.some((e) => e.id === d.run.id)).toBe(true);
  await expect(getCampaignHistory(other, id, { reference: d.run.id })).rejects.toMatchObject({
    code: "not_found",
  });
  const foreign = await createProject(user, base);
  expect((await req("GET", `projects/${foreign.id}/history?reference=${d.run.id}`)).status).toBe(
    404,
  );
  expect((await req("GET", `projects/${id}/history?reference=${d.run.id}&offset=-1`)).status).toBe(
    400,
  );
});
