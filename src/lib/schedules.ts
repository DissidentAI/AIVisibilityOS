import { z } from "zod";
import { sql } from "../db/client";
import { digest } from "./security";
import { AppError } from "./errors";
import {
  runSchema,
  snapshotFor,
  enqueueSnapshot,
  ownedProject,
  uuidSchema,
  snapshotReservation,
  budgetStatus,
} from "./service";
import type { Snapshot, User } from "./types";
export type Schedule = {
  id: string;
  org_id: string;
  project_id: string;
  snapshot: Snapshot;
  interval_hours: number;
  enabled: boolean;
  next_run_at: string;
};
export function nextOccurrence(due: Date, intervalHours: number, now: Date) {
  const step = intervalHours * 3600_000;
  const elapsed = Math.max(0, Math.floor((now.getTime() - due.getTime()) / step));
  return { next: new Date(due.getTime() + (elapsed + 1) * step), missed: elapsed };
}
export async function saveSchedule(user: User, data: unknown) {
  const p = runSchema
    .extend({
      intervalHours: z.union([z.literal(24), z.literal(168)]),
      firstRunAt: z.iso.datetime({ offset: true }),
    })
    .parse(data);
  const first = new Date(p.firstRunAt);
  if (first.getTime() <= Date.now() || first.getTime() > Date.now() + 366 * 86400_000)
    throw new AppError("invalid_schedule_date");
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(824762)`;
    await tx`select id from organizations where id=${user.org_id} for update`;
    const snapshot = await snapshotFor(tx, user, p);
    if (p.expectedConfigHash && p.expectedConfigHash !== digest(JSON.stringify(snapshot)))
      throw new AppError("configuration_changed", 409);
    const credentials = await tx`select provider from credentials where org_id=${user.org_id}`;
    if (p.providers.some((pr) => !credentials.some((c) => c.provider === pr)))
      throw new AppError("credentials_required");
    const budget = await budgetStatus(tx, user);
    if (snapshotReservation(snapshot) > Math.min(budget.orgRemaining, budget.installationRemaining))
      throw new AppError("budget_exceeded", 409);
    const [schedule] =
      await tx`insert into measurement_schedules (org_id,project_id,snapshot,interval_hours,next_run_at)
      values (${user.org_id},${p.projectId},${JSON.stringify(snapshot)}::jsonb,${p.intervalHours},${first.toISOString()})
      on conflict (project_id,org_id) do update set snapshot=excluded.snapshot,interval_hours=excluded.interval_hours,next_run_at=excluded.next_run_at,enabled=true,updated_at=now() returning id`;
    return { id: schedule.id as string };
  });
}
export async function listSchedules(user: User, projectId: string) {
  await ownedProject(user, projectId);
  const schedules = await sql<
    Schedule[]
  >`select * from measurement_schedules where org_id=${user.org_id} and project_id=${projectId}`;
  const events =
    await sql`select e.* from schedule_events e join measurement_schedules s on s.id=e.schedule_id and s.org_id=e.org_id where e.org_id=${user.org_id} and s.project_id=${projectId} order by e.created_at desc limit 30`;
  return { schedules, events };
}
export async function setScheduleEnabled(user: User, id: string, data: unknown) {
  uuidSchema.parse(id);
  const { enabled } = z.object({ enabled: z.boolean() }).parse(data);
  // Resume starts one complete interval from now: no surprise immediate paid catch-up.
  const rows =
    await sql`update measurement_schedules set enabled=${enabled}, next_run_at=case when ${enabled} and not enabled then now()+interval_hours*interval '1 hour' else next_run_at end,updated_at=now() where id=${id} and org_id=${user.org_id} returning id`;
  if (!rows.length) throw new AppError("not_found", 404);
}
export async function dispatchSchedule(now = new Date()) {
  return sql.begin(async (tx) => {
    // Same lock/order as manual campaigns. Run + reservation + occurrence + next date commit atomically.
    await tx`select pg_advisory_xact_lock(824762)`;
    const [schedule] = await tx<
      Schedule[]
    >`select * from measurement_schedules where enabled=true and next_run_at<=${now.toISOString()} order by next_run_at,id for update skip locked limit 1`;
    if (!schedule) return false;
    const due = new Date(schedule.next_run_at),
      advance = nextOccurrence(due, schedule.interval_hours, now);
    let runId: string | null = null,
      reason: string | null = null;
    try {
      runId = (
        await enqueueSnapshot(
          tx,
          { org_id: schedule.org_id, id: "scheduler", email: "" },
          schedule.project_id,
          schedule.snapshot,
        )
      ).id;
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      reason = e.code;
    }
    await tx`insert into schedule_events(org_id,schedule_id,due_at,outcome,reason,run_id,missed_slots) values (${schedule.org_id},${schedule.id},${due.toISOString()},${runId ? "queued" : "skipped"},${reason},${runId},${advance.missed})`;
    await tx`update measurement_schedules set next_run_at=${advance.next.toISOString()},updated_at=now() where id=${schedule.id}`;
    return true;
  });
}
