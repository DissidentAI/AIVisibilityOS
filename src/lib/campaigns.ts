import type { TransactionSql } from "postgres";
import { sql } from "../db/client";
import { AppError } from "./errors";
import { z } from "zod";
import type { User, Run, ResponseRecord } from "./types";
/** Historical retry runs are retained for provenance but have one canonical campaign. */
export async function campaignFor(tx: TransactionSql | typeof sql, user: User, id: string) {
  z.uuid().parse(id);
  const [run] = await tx<Run[]>`select root.* from measurement_runs requested
    join measurement_runs root on root.id=coalesce(requested.campaign_id,requested.id) and root.org_id=requested.org_id
    where requested.id=${id} and requested.org_id=${user.org_id}`;
  if (!run) throw new AppError("not_found", 404);
  return run;
}
export function latestAttempts(rows: ResponseRecord[]) {
  const slots = new Map<string, ResponseRecord>();
  for (const row of rows) {
    const key = row.slot_id ?? row.id,
      current = slots.get(key);
    if (!current || (row.attempt ?? 1) > (current.attempt ?? 1)) slots.set(key, row);
  }
  const current = [...slots.values()];
  const ids = new Set(current.map((r) => r.id));
  return { current, previous: rows.filter((r) => !ids.has(r.id)) };
}
