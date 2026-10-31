import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";
try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
} finally {
  await sql.end();
}
