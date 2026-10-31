import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
const globalDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
export const sql =
  globalDb.sql ??
  postgres(
    process.env.DATABASE_URL ?? "postgres://visibility:visibility@127.0.0.1:55432/visibility",
    { max: 8, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} },
  );
if (process.env.NODE_ENV !== "production") globalDb.sql = sql;
export const db = drizzle(sql, { schema });
