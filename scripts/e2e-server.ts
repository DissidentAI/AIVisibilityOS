import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
process.env.ENCRYPTION_KEY = "12".repeat(32);
process.env.BOOTSTRAP_TOKEN = "e2e-fixture-bootstrap-not-production";
process.env.APP_URL = "http://127.0.0.1:3100";
process.env.RETENTION_DAYS = "365";
process.env.MAX_MONTHLY_BUDGET_USD = "20";
let pg: EmbeddedPostgres | undefined;
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else {
  pg = new EmbeddedPostgres({
    databaseDir: `.local/e2e-postgres-${process.pid}`,
    user: "test",
    password: "test-only",
    port: 55434,
    persistent: false,
    authMethod: "scram-sha-256",
    autoRehydrateSymlinks: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("visibility_test");
  process.env.DATABASE_URL = "postgres://test:test-only@127.0.0.1:55434/visibility_test";
}
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw new Error("Unsafe test database");
const { migrate } = await import("drizzle-orm/postgres-js/migrator");
const { db, sql } = await import("../src/db/client");
await migrate(db, { migrationsFolder: "drizzle" });
await sql`truncate organizations,rate_limits cascade`;
await sql.end();
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: "3100" },
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await pg?.stop();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", stop);
