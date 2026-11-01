import { z } from "zod";
import { sql } from "../db/client";
import type { User } from "./types";
import { projectSchema, ProjectValidationError } from "./project-validation";
import { campaignPreferenceSchema } from "./browser-storage";
import { AppError } from "./errors";
import { ownedProject, uuidSchema } from "./service";

/** Mutable configuration for future calls. Historical snapshots are never rewritten. */
export async function updateProject(user: User, id: string, data: unknown) {
  uuidSchema.parse(id);
  const result = projectSchema.safeParse(data);
  if (!result.success) throw new ProjectValidationError(result.error);
  const p = result.data;
  const extra = z
    .object({
      revision: z.number().int().positive(),
      competitorIds: z.array(z.uuid().nullable()).max(10),
      scanSettings: campaignPreferenceSchema,
    })
    .parse(data);
  if (extra.competitorIds.length !== p.competitors.length) throw new AppError("invalid_input");
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    const [project] =
      await tx`select revision from projects where id=${id} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    if (project.revision !== extra.revision) throw new AppError("project_changed", 409);
    const brands =
      await tx`select id from brands where project_id=${id} and org_id=${user.org_id} and not is_primary`;
    const ids = extra.competitorIds.filter((x): x is string => !!x);
    if (new Set(ids).size !== ids.length || ids.some((x) => !brands.some((b) => b.id === x)))
      throw new AppError("not_found", 404);
    await tx`update projects set name=${p.name},domain=${p.domain},industry=${p.industry},description=${p.description},language=${p.language},country=${p.country},scan_settings=${JSON.stringify(extra.scanSettings)}::jsonb,revision=revision+1 where id=${id} and org_id=${user.org_id}`;
    await tx`update brands set name=${p.name},domain=${p.domain} where project_id=${id} and org_id=${user.org_id} and is_primary`;
    for (const old of brands)
      if (!ids.includes(old.id))
        await tx`delete from brands where id=${old.id} and org_id=${user.org_id}`;
    for (const [i, b] of p.competitors.entries()) {
      if (extra.competitorIds[i])
        await tx`update brands set name=${b.name},domain=${b.domain} where id=${extra.competitorIds[i]} and org_id=${user.org_id}`;
      else
        await tx`insert into brands(org_id,project_id,name,domain) values(${user.org_id},${id},${b.name},${b.domain})`;
    }
    // Keep IDs for unchanged questions; snapshots retain the text/IDs of removed questions.
    const queries =
      await tx`select id,text from tracked_queries where project_id=${id} and org_id=${user.org_id}`;
    for (const old of queries)
      if (!p.queries.includes(old.text))
        await tx`delete from tracked_queries where id=${old.id} and org_id=${user.org_id}`;
    for (const text of p.queries)
      await tx`insert into tracked_queries(org_id,project_id,text) values(${user.org_id},${id},${text}) on conflict do nothing`;
    return { id, revision: extra.revision + 1 };
  });
}
export async function saveScanSettings(user: User, id: string, data: unknown) {
  await ownedProject(user, id);
  const p = campaignPreferenceSchema.parse(data);
  await sql`update projects set scan_settings=${JSON.stringify(p)}::jsonb,revision=revision+1 where id=${id} and org_id=${user.org_id}`;
  return { ok: true };
}
export async function addQuestions(user: User, id: string, data: unknown) {
  uuidSchema.parse(id);
  const input = z
    .union([
      z.object({ texts: z.array(z.string().trim().min(5).max(1000)).min(1).max(50) }),
      z
        .object({ text: z.string().trim().min(5).max(1000) })
        .transform((p) => ({ texts: [p.text] })),
    ])
    .parse(data);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    const [project] =
      await tx`select id from projects where id=${id} and org_id=${user.org_id} for update`;
    if (!project) throw new AppError("not_found", 404);
    const existing =
      await tx`select text from tracked_queries where project_id=${id} and org_id=${user.org_id}`;
    const fresh = [...new Set(input.texts)].filter(
      (text) => !existing.some((q) => q.text === text),
    );
    if (existing.length + fresh.length > 50) throw new AppError("query_limit");
    for (const text of fresh)
      await tx`insert into tracked_queries(org_id,project_id,text) values(${user.org_id},${id},${text})`;
    if (fresh.length)
      await tx`update projects set revision=revision+1 where id=${id} and org_id=${user.org_id}`;
    return { added: fresh.length, skipped: input.texts.length - fresh.length };
  });
}
