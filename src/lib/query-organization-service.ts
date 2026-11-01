import { z } from "zod";
import { sql } from "../db/client";
import { AppError } from "./errors";
import type { User } from "./types";
import { ownedProject, uuidSchema } from "./service";
import { queryFilterSchema, queryMetadataSchema, type QueryView } from "./query-organization";

/** Organization metadata never enters a measurement snapshot or rewrites a question. */
export async function organizeQueries(user: User, projectId: string, input: unknown) {
  uuidSchema.parse(projectId);
  const p = z
    .object({
      ids: z
        .array(z.uuid())
        .min(1)
        .max(50)
        .refine((a) => new Set(a).size === a.length),
      revision: z.number().int().positive(),
      patch: queryMetadataSchema.partial().refine((v) => Object.keys(v).length > 0),
    })
    .parse(input);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    const [project] =
      await tx`select revision from projects where id=${projectId} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    if (project.revision !== p.revision) throw new AppError("project_changed", 409);
    const rows =
      await tx`select id from tracked_queries where project_id=${projectId} and org_id=${user.org_id} and id in ${tx(p.ids)}`;
    if (rows.length !== p.ids.length) throw new AppError("not_found", 404);
    await tx`update tracked_queries set ${tx(p.patch)} where project_id=${projectId} and org_id=${user.org_id} and id in ${tx(p.ids)}`;
    await tx`update projects set revision=revision+1 where id=${projectId} and org_id=${user.org_id}`;
    return { updated: rows.length };
  });
}
export async function listQueryViews(user: User, projectId: string) {
  await ownedProject(user, projectId);
  return sql<
    QueryView[]
  >`select id,name,filters from query_views where project_id=${projectId} and org_id=${user.org_id} order by created_at,id`;
}
export async function saveQueryView(user: User, projectId: string, input: unknown) {
  uuidSchema.parse(projectId);
  const p = z
    .object({ name: z.string().trim().min(1).max(80), filters: queryFilterSchema })
    .parse(input);
  return sql.begin(async (tx) => {
    const [project] =
      await tx`select id from projects where id=${projectId} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    const [existing] =
      await tx`select id from query_views where project_id=${projectId} and org_id=${user.org_id} and name=${p.name}`;
    const [count] =
      await tx`select count(*)::int as n from query_views where project_id=${projectId} and org_id=${user.org_id}`;
    if (!existing && count.n >= 20) throw new AppError("query_view_limit");
    const [row] = await tx<
      QueryView[]
    >`insert into query_views(org_id,project_id,name,filters) values(${user.org_id},${projectId},${p.name},${JSON.stringify(p.filters)}::jsonb)
      on conflict(project_id,name) do update set filters=excluded.filters returning id,name,filters`;
    return row;
  });
}
export async function deleteQueryView(user: User, id: string) {
  uuidSchema.parse(id);
  const rows =
    await sql`delete from query_views where id=${id} and org_id=${user.org_id} returning id`;
  if (!rows.length) throw new AppError("not_found", 404);
}
