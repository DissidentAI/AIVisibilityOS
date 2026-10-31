import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "../src/db/client";
import { hashPassword } from "../src/lib/security";
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run account:reset -- owner@example.com");
const password = randomBytes(24).toString("base64url");
const hash = await hashPassword(password);
try {
  await sql.begin(async (tx) => {
    const [user] = await tx`select id from users where email=${email} for update`;
    if (!user) throw new Error("Owner not found");
    mkdirSync(".local", { recursive: true, mode: 0o700 });
    const destination = `.local/recovery-${Date.now()}.txt`;
    writeFileSync(destination, password + "\n", { mode: 0o600, flag: "wx" });
    await tx`update users set password_hash=${hash} where id=${user.id}`;
    await tx`delete from sessions where user_id=${user.id}`;
    console.log(
      `New password saved in ${destination}. Read it locally, store it securely, then remove the file.`,
    );
  });
} finally {
  await sql.end();
}
