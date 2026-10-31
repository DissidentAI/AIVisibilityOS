import { readdir, rm } from "node:fs/promises";
// Next standalone traces can copy local .env files. Remove only generated copies.
for (const name of await readdir(".next/standalone")) {
  if (name === ".env" || name.startsWith(".env.")) await rm(`.next/standalone/${name}`);
}
