import "dotenv/config";
import { cp, access } from "node:fs/promises";
import { spawn } from "node:child_process";
await access(".next/standalone/server.js");
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: process.env.BIND_ADDRESS ?? "127.0.0.1",
    PORT: process.env.PORT ?? "3000",
  },
});
process.on("SIGTERM", () => server.kill("SIGTERM"));
process.on("SIGINT", () => server.kill("SIGINT"));
server.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
