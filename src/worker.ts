import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { sql } from "./db/client";
import { maintenance, workOnce } from "./lib/queue";
const id = randomUUID(); let stopping = false;
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
async function heartbeat() { await sql`insert into worker_heartbeats (id,seen_at) values (${id},now()) on conflict(id) do update set seen_at=now()`; }
const timer = setInterval(() => { heartbeat().catch(() => console.error("worker_heartbeat_failed")); }, 10_000);
console.log("Measurement worker started; official API calls only.");
try {
  await heartbeat(); let lastMaintenance = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastMaintenance > 60_000) { await maintenance(); lastMaintenance = Date.now(); }
      if (!await workOnce()) await setTimeout(2000);
      else await setTimeout(1000); // single worker <= 60 requests/minute, no implicit paid retries
    } catch { console.error("worker_iteration_failed"); await setTimeout(5000); }
  }
} finally { clearInterval(timer); await sql`delete from worker_heartbeats where id=${id}`; await sql.end(); }
