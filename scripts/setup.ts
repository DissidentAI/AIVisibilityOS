import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env already exists; preserved. See .env.example for required variables.");
} else {
  let template = readFileSync(".env.example", "utf8");
  template = template
    .replace("ENCRYPTION_KEY=", `ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`)
    .replace("BOOTSTRAP_TOKEN=", `BOOTSTRAP_TOKEN=${randomBytes(24).toString("hex")}`)
    .replace("POSTGRES_PASSWORD=", `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}`);
  writeFileSync(".env", template, { mode: 0o600 });
  console.log(
    "Created .env (mode 0600). Read BOOTSTRAP_TOKEN locally to register the first owner. Never share this file.",
  );
}
