import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { sql } from "./db/client";
import { maintenance, workOnce } from "./lib/queue";
import { dispatchSchedule } from "./lib/schedules";
import { workerConcurrency } from "./lib/execution-control";
import { workAuditOnce } from "./lib/site-audit/worker";
const id = randomUUID();
const concurrency = workerConcurrency();
const active = new Set<Promise<unknown>>();
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function heartbeat() {
  await sql`insert into worker_heartbeats (id,seen_at) values (${id},now()) on conflict(id) do update set seen_at=now()`;
}
const timer = setInterval(() => {
  heartbeat().catch(() => console.error("worker_heartbeat_failed"));
}, 10_000);
console.log(`Measurement worker started; up to ${concurrency} regulated concurrent API calls.`);
try {
  await heartbeat();
  let lastMaintenance = 0;
  let lastSchedule = 0;
  let retryClaimsAfter = 0;
  let crawlTask: Promise<unknown> | null = null;
  let nextCrawlAt = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastMaintenance > 60_000) {
        await maintenance();
        lastMaintenance = Date.now();
      }
      if (Date.now() - lastSchedule > 5000) {
        await dispatchSchedule();
        lastSchedule = Date.now();
      }
      if (!crawlTask && Date.now() >= nextCrawlAt) {
        const task = workAuditOnce().catch(() => console.error("site_audit_step_failed"));
        crawlTask = task;
        active.add(task);
        void task.finally(() => {
          crawlTask = null;
          nextCrawlAt = Date.now() + 1000;
          active.delete(task);
        });
      }
      if (active.size - (crawlTask ? 1 : 0) < concurrency && Date.now() >= retryClaimsAfter) {
        const task = workOnce().catch(() => {
          retryClaimsAfter = Date.now() + 5000;
          console.error("worker_job_failed");
        });
        active.add(task);
        void task.finally(() => active.delete(task));
      }
      // Claiming is paced in PostgreSQL per provider/model. A pending HTTP call
      // doesn't block another eligible model, heartbeat, schedule or shutdown.
      await setTimeout(250);
    } catch {
      console.error("worker_iteration_failed");
      await setTimeout(5000);
    }
  }
} finally {
  await Promise.allSettled(active);
  clearInterval(timer);
  await sql`delete from worker_heartbeats where id=${id}`;
  await sql.end();
}
