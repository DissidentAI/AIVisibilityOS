import { writeFileSync } from "node:fs";
import { createHostingerConfig } from "./hostinger-config.mjs";

const args = process.argv.slice(2);
try {
  if (args.length !== 2 || args[0] !== "--domain")
    throw new Error("Usage: node scripts/setup-hostinger.mjs --domain visibility.your-domain.com");
  const config = createHostingerConfig(args[1]);
  // Exclusive creation also refuses symlinks. An existing deployment's secrets never rotate silently.
  writeFileSync(".env.hostinger", config, { mode: 0o600, flag: "wx" });
  console.log(
    "Created .env.hostinger (0600). Keep this file private and backed up. No server was started.",
  );
} catch (error) {
  console.error(
    error.code === "EEXIST"
      ? ".env.hostinger already exists; preserved. Review it locally instead of regenerating secrets."
      : error.message,
  );
  process.exitCode = 1;
}
