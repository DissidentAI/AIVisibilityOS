// This executable is only used by isolated browser tests, never by production.
import { auditFixtureFetcher, auditFixtureModel } from "../fixtures/site-audit";
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Fixture database required");
const { workAuditOnce } = await import("../../src/lib/site-audit/worker");
const { workOnce } = await import("../../src/lib/queue");
const { sql } = await import("../../src/db/client");
let count = 0;
while (await workAuditOnce({ fetcher: auditFixtureFetcher, skipPolitenessTestOnly: true }))
  if (++count > 400) throw new Error("Fixture crawl limit");
while (await workOnce(auditFixtureModel, { unregulatedTestOnly: true }))
  if (++count > 420) throw new Error("Fixture model limit");
await sql.end();
