import { z } from "zod";
import { sql } from "../db/client";
import { AppError } from "./errors";
import { campaignFor } from "./campaigns";
import { brandScopeSchema } from "./brand-analysis";
import { createMentionDetector, mentionRate, type Brand } from "./measurement";
import {
  historyReasons,
  sampleReasons,
  type CampaignHistory,
  type HistoryResponse,
} from "./history-comparison";
import type { Run, User } from "./types";

/** One bounded response batch, no raw provider payloads or full answers sent to the browser. */
export async function getCampaignHistory(
  user: User,
  projectId: string,
  input: unknown,
): Promise<CampaignHistory> {
  z.uuid().parse(projectId);
  const p = z
    .object({
      reference: z.uuid(),
      scope: brandScopeSchema.default("current"),
      offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    })
    .parse(input);
  return sql.begin("isolation level repeatable read", async (tx) => {
    const reference = await campaignFor(tx, user, p.reference);
    if (reference.project_id !== projectId) throw new AppError("not_found", 404);
    const limit = 20;
    const [count] =
      await tx`select count(*)::int as n from measurement_runs where project_id=${projectId} and org_id=${user.org_id} and campaign_id is null`;
    const runs = await tx<
      Run[]
    >`select * from measurement_runs where project_id=${projectId} and org_id=${user.org_id} and campaign_id is null order by created_at desc,id desc limit ${limit} offset ${p.offset}`;
    const ids = [...new Set([...runs.map((r) => r.id), reference.id])];
    const rows = await tx<
      (HistoryResponse & { campaign_id: string })[]
    >`select distinct on (coalesce(r.campaign_id,r.id),a.slot_id)
      coalesce(r.campaign_id,r.id) as campaign_id,a.id,a.query_text,a.provider,a.returned_model,a.parameters,a.status,a.attempt,
      case when ${p.scope}='current' then a.answer else null end as answer
      from ai_responses a join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id
      where a.org_id=${user.org_id} and r.project_id=${projectId} and coalesce(r.campaign_id,r.id) in ${tx(ids)}
      order by coalesce(r.campaign_id,r.id),a.slot_id,a.attempt desc,a.created_at desc,a.id`;
    const brands =
      p.scope === "current"
        ? await tx<
            Brand[]
          >`select id,name,domain,is_primary from brands where project_id=${projectId} and org_id=${user.org_id} and is_primary`
        : [];
    const detect = createMentionDetector(brands);
    const storedMentions =
      p.scope === "original"
        ? await tx<{ response_id: string; brand_id: string }[]>`
      select m.response_id,m.brand_id from brand_mentions m join ai_responses a on a.id=m.response_id and a.org_id=m.org_id
      join measurement_runs r on r.id=a.run_id and r.org_id=a.org_id
      where m.org_id=${user.org_id} and r.project_id=${projectId} and coalesce(r.campaign_id,r.id) in ${tx(ids)}`
        : [];
    const mentionedIds = new Set(storedMentions.map((m) => `${m.response_id}:${m.brand_id}`));
    const referenceRows = rows.filter((r) => r.campaign_id === reference.id);
    return {
      referenceId: reference.id,
      referenceReasons: sampleReasons(referenceRows),
      scope: p.scope,
      total: count.n,
      offset: p.offset,
      limit,
      entries: runs.map((run) => {
        const responses = rows.filter((r) => r.campaign_id === run.id);
        const valid = responses.filter((r) => r.status === "succeeded");
        const primary = run.snapshot.brands.find((b) => b.is_primary);
        const mentioned = valid.filter((r) =>
          p.scope === "current"
            ? !!r.answer && detect(r.answer).length > 0
            : mentionedIds.has(`${r.id}:${primary?.id}`),
        ).length;
        return {
          id: run.id,
          createdAt: run.created_at,
          total: responses.length,
          valid: valid.length,
          failed: responses.filter((r) => ["failed", "invalid", "uncertain"].includes(r.status))
            .length,
          pending: responses.filter((r) => ["queued", "running"].includes(r.status)).length,
          mentioned,
          rate: mentionRate(mentioned, valid.length).rate,
          reasons: historyReasons(run, responses, reference, referenceRows, p.scope),
          models: run.snapshot.models,
          web: !!run.snapshot.parameters.search,
        };
      }),
    };
  });
}
