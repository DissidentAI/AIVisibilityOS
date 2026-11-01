import { z } from "zod";
import { sql } from "../db/client";
import { AppError } from "./errors";
import {
  actionFieldsSchema,
  type ActionEvidence,
  type GeoAction,
  type GeoActionSummary,
} from "./geo-actions";
import { brandScopeSchema, comparisonBrands, comparisonScope } from "./brand-analysis";
import { ownedProject, getRun, uuidSchema } from "./service";
import type { User } from "./types";

export async function listGeoActions(user: User, projectId: string) {
  await ownedProject(user, projectId);
  // Do not send archived response bodies in list/polling requests.
  return sql<
    GeoActionSummary[]
  >`select id,project_id,title,status,owner,due_date,target_url,notes,version,created_at,updated_at,
    evidence->>'campaignId' as campaign_id, evidence->>'query' as query,
    jsonb_array_length(evidence->'responses') as evidence_count
    from geo_actions where project_id=${projectId} and org_id=${user.org_id} order by created_at desc,id`;
}
export async function getGeoAction(user: User, id: string) {
  uuidSchema.parse(id);
  const [action] = await sql<
    GeoAction[]
  >`select * from geo_actions where id=${id} and org_id=${user.org_id}`;
  if (!action) throw new AppError("not_found", 404);
  return action;
}
export async function createGeoAction(user: User, projectId: string, input: unknown) {
  await ownedProject(user, projectId);
  const p = actionFieldsSchema
    .extend({
      runId: z.uuid(),
      queryId: z.uuid(),
      scope: brandScopeSchema,
      requestId: z.uuid(),
    })
    .parse(input);
  const [existing] = await sql<
    GeoAction[]
  >`select * from geo_actions where org_id=${user.org_id} and request_id=${p.requestId}`;
  if (existing) {
    if (existing.project_id !== projectId) throw new AppError("not_found", 404);
    return existing;
  }
  const detail = await getRun(user, p.runId, p.scope);
  if (detail.run.project_id !== projectId) throw new AppError("not_found", 404);
  const query = detail.run.snapshot.queries.find((q) => q.id === p.queryId);
  if (!query) throw new AppError("not_found", 404);
  const rows = detail.responses.filter((r) => r.query_text === query.text);
  const responses = rows.filter((r) => r.status === "succeeded" && r.answer);
  if (!responses.length) throw new AppError("action_evidence_required");
  const ids = new Set(responses.map((r) => r.id));
  const evidence: ActionEvidence = {
    campaignId: detail.run.id,
    campaignDate: detail.run.created_at,
    configHash: detail.run.config_hash,
    methodology: detail.brandAnalysis?.methodology ?? detail.run.snapshot.methodology,
    system: detail.run.snapshot.system,
    capturedAt: new Date().toISOString(),
    scope: comparisonScope(detail),
    brands: comparisonBrands(detail),
    queryId: query.id,
    query: query.text,
    valid: responses.length,
    failed: rows.filter((r) => ["failed", "invalid", "uncertain"].includes(r.status)).length,
    pending: rows.filter((r) => ["queued", "running"].includes(r.status)).length,
    responses,
    mentions: detail.mentions.filter((m) => ids.has(m.response_id)),
    citations: detail.citations.filter((c) => ids.has(c.response_id)),
  };
  return sql.begin(async (tx) => {
    const [project] =
      await tx`select id from projects where id=${projectId} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    const [duplicate] = await tx<
      GeoAction[]
    >`select * from geo_actions where org_id=${user.org_id} and request_id=${p.requestId}`;
    if (duplicate) {
      if (duplicate.project_id !== projectId) throw new AppError("not_found", 404);
      return duplicate;
    }
    const [count] =
      await tx`select count(*)::int as n from geo_actions where project_id=${projectId} and org_id=${user.org_id}`;
    if (count.n >= 200) throw new AppError("geo_action_limit");
    const [action] = await tx<
      GeoAction[]
    >`insert into geo_actions(org_id,project_id,request_id,title,status,owner,due_date,target_url,notes,evidence)
      values(${user.org_id},${projectId},${p.requestId},${p.title},${p.status},${p.owner},${p.dueDate},${p.targetUrl},${p.notes},${JSON.stringify(evidence)}::jsonb) returning *`;
    return action;
  });
}
export async function updateGeoAction(user: User, id: string, input: unknown) {
  uuidSchema.parse(id);
  const p = actionFieldsSchema.extend({ version: z.number().int().positive() }).parse(input);
  return sql.begin(async (tx) => {
    const [existing] =
      await tx`select version from geo_actions where id=${id} and org_id=${user.org_id} for update`;
    if (!existing) throw new AppError("not_found", 404);
    if (existing.version !== p.version) throw new AppError("action_changed", 409);
    // Evidence is immutable and never accepted from the client.
    const [action] = await tx<
      GeoAction[]
    >`update geo_actions set title=${p.title},status=${p.status},owner=${p.owner},due_date=${p.dueDate},
      target_url=${p.targetUrl},notes=${p.notes},version=version+1,updated_at=now() where id=${id} and org_id=${user.org_id} returning *`;
    return action;
  });
}
export async function deleteGeoAction(user: User, id: string, input: unknown) {
  uuidSchema.parse(id);
  const p = z.object({ version: z.number().int().positive() }).parse(input);
  return sql.begin(async (tx) => {
    const [row] =
      await tx`select version from geo_actions where id=${id} and org_id=${user.org_id} for update`;
    if (!row) throw new AppError("not_found", 404);
    if (row.version !== p.version) throw new AppError("action_changed", 409);
    await tx`delete from geo_actions where id=${id} and org_id=${user.org_id}`;
  });
}
