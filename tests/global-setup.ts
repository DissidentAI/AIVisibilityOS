import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
export default async function setup() {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.BOOTSTRAP_TOKEN = "test-only-bootstrap-token-never-deploy";
  process.env.APP_URL = "http://localhost:3000";
  process.env.MAX_MONTHLY_BUDGET_USD = "20";
  process.env.RETENTION_DAYS = "365";
  if (process.env.TEST_DATABASE_URL) {
    if (!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test"))
      throw new Error("Test database name must end with _test");
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    return;
  }
  const pg = new EmbeddedPostgres({
    databaseDir: `.local/test-postgres-${process.pid}`,
    user: "test",
    password: "test-only",
    port: 55433,
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
  process.env.DATABASE_URL = "postgres://test:test-only@127.0.0.1:55433/visibility_test";
  return async () => {
    await pg.stop();
  };
}
