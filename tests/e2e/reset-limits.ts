// Reset limits only between isolated browser scenarios, never in the application.
export {};
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Fixture reset requires a _test database");
const { sql } = await import("../../src/db/client");
await sql`delete from rate_limits`;
await sql.end();
