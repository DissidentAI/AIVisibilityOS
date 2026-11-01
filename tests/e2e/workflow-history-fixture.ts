// Synthetic empty campaigns for pagination tests; never execute against user data.
import { z } from "zod";
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw Error("Unsafe fixture database");
const runId = z.uuid().parse(process.argv[2]);
const { sql } = await import("../../src/db/client");
await sql`insert into measurement_runs(org_id,project_id,config_hash,snapshot,created_at)
  select r.org_id,r.project_id,r.config_hash,r.snapshot,now()+i*interval '1 second'
  from measurement_runs r cross join generate_series(1,22) s(i) where r.id=${runId}`;
await sql.end();
