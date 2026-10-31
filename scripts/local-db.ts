import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({ databaseDir: ".local/postgres", user: "visibility", password: "visibility", port: 55432, persistent: true, authMethod: "scram-sha-256", autoRehydrateSymlinks: true, postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
if (!existsSync(".local/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient(); await client.connect();
const result = await client.query("select 1 from pg_database where datname='visibility'");
if (!result.rowCount) await pg.createDatabase("visibility");
await client.end();
console.log("Local PostgreSQL listening on 127.0.0.1:55432. Keep this terminal open. Development only.");
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await pg.stop(); process.exit(0); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
setInterval(() => {}, 60_000);
